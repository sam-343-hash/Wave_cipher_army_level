// Encrypted evidence package (.flpkg). Layout: 'FLP1' | u32be headerLen | header JSON | AES-256-GCM ciphertext.
// The header is authenticated as AES-GCM additional data, so editing any header field makes decryption fail.
import { FieldlineError, KDF, rand, toHex, fromHex, sha256, canonical, deriveKey, calibrateIterations } from './crypto.js';
import { verifyChain } from './chain.js';
const te = new TextEncoder(), td = new TextDecoder('utf-8', { fatal: true });
export const APP_VERSION = '1.0.1';
export const LIMITS = { file: 250 * 1024 * 1024, header: 4096, manifest: 4 * 1024 * 1024, attachments: 200, attachBytes: 100 * 1024 * 1024 };
export const TIME_WARNING = 'Timestamps come from the device clock and cannot be independently verified. Treat them as claimed, not proven, times.';
const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const concat = parts => { const n = parts.reduce((a, p) => a + p.length, 0), o = new Uint8Array(n); let p = 0; for (const x of parts) { o.set(x, p); p += x.length; } return o; };
const isId = s => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);

export async function buildManifest({ incident, events, attachments }) {
  if (attachments.length > LIMITS.attachments) throw new FieldlineError('LIMIT', 'Too many attachments');
  let offset = 0, total = 0; const entries = [], blobs = [];
  for (const a of attachments) {
    if (!(a.bytes instanceof Uint8Array)) throw new FieldlineError('BAD_ATTACHMENT');
    total += a.bytes.length; if (total > LIMITS.attachBytes) throw new FieldlineError('LIMIT', 'Attachments exceed the size limit');
    entries.push({ name: String(a.name).slice(0, 120), type: String(a.type || 'application/octet-stream').slice(0, 80), size: a.bytes.length, sha256: await sha256(a.bytes), offset, source: a.source || { method: 'unknown' } });
    blobs.push(a.bytes); offset += a.bytes.length;
  }
  const manifest = {
    format: 'FIELDLINE-MANIFEST', version: 1, packageId: crypto.randomUUID(), createdAt: Date.now(),
    capture: { app: 'FIELDLINE', appVersion: APP_VERSION, deviceTimezoneOffsetMin: new Date().getTimezoneOffset(), platform: (globalThis.navigator && navigator.platform) || 'unknown' },
    timeTrust: { source: 'device-clock', verified: false, warning: TIME_WARNING },
    incident, events, attachments: entries,
    integrity: { chainHead: events.length ? events[events.length - 1].hash : null, eventCount: events.length }
  };
  return { manifest, payload: concat(blobs) };
}
export async function assemble({ manifest, payload, passphrase, iter }) {
  const mbytes = te.encode(JSON.stringify(manifest));
  if (mbytes.length > LIMITS.manifest) throw new FieldlineError('LIMIT', 'Manifest too large');
  const inner = concat([u32(mbytes.length), mbytes, payload]);
  const salt = rand(16), iv = rand(12), key = await deriveKey(passphrase, salt, iter);
  const header = { magic: 'FIELDLINE-PKG', v: 1, id: manifest.packageId, created: manifest.createdAt, kdf: { alg: KDF.alg, iter, salt: toHex(salt) }, cipher: 'AES-256-GCM', iv: toHex(iv) };
  const hbytes = te.encode(JSON.stringify(header));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(canonical(header)) }, key, inner));
  return concat([te.encode('FLP1'), u32(hbytes.length), hbytes, ct]);
}
export async function buildPackage({ incident, events, attachments, passphrase, iter }) {
  const { manifest, payload } = await buildManifest({ incident, events, attachments });
  iter = iter || await calibrateIterations();
  return { bytes: await assemble({ manifest, payload, passphrase, iter }), packageId: manifest.packageId, manifest };
}
// Passphrase-free structural inspection. Never trusts lengths or field types.
export function inspect(buf) {
  if (!(buf instanceof Uint8Array)) throw new FieldlineError('BAD_FILE', 'Not a byte array');
  if (buf.length > LIMITS.file) throw new FieldlineError('TOO_LARGE', 'File exceeds the size limit');
  if (buf.length < 8 + 2 + 16 || buf[0] !== 0x46 || buf[1] !== 0x4c || buf[2] !== 0x50 || buf[3] !== 0x31) throw new FieldlineError('BAD_FILE', 'This is not a FIELDLINE package');
  const hl = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(4);
  if (hl < 2 || hl > LIMITS.header || 8 + hl + 16 > buf.length) throw new FieldlineError('CORRUPT', 'Package header length is invalid');
  let header; try { header = JSON.parse(td.decode(buf.subarray(8, 8 + hl))); } catch { throw new FieldlineError('CORRUPT', 'Package header is unreadable'); }
  if (!header || header.magic !== 'FIELDLINE-PKG' || header.v !== 1 || header.cipher !== 'AES-256-GCM' || !isId(header.id) || !Number.isFinite(header.created)) throw new FieldlineError('CORRUPT', 'Package header fields are invalid');
  const k = header.kdf; if (!k || k.alg !== KDF.alg || !Number.isInteger(k.iter) || k.iter < KDF.minIter || k.iter > KDF.maxIter) throw new FieldlineError('KDF_PARAMS', 'Package key-derivation parameters are outside accepted limits');
  try { fromHex(k.salt, 16); fromHex(header.iv, 12); } catch { throw new FieldlineError('CORRUPT', 'Package salt or IV is malformed'); }
  return { header, ctOffset: 8 + hl };
}
function validateManifest(m, payloadLen) {
  const bad = r => { throw new FieldlineError('CORRUPT', 'Manifest invalid: ' + r); };
  if (!m || m.format !== 'FIELDLINE-MANIFEST' || m.version !== 1) bad('format');
  if (!isId(m.packageId) || !Number.isFinite(m.createdAt)) bad('identity');
  if (!m.incident || typeof m.incident !== 'object' || !Array.isArray(m.events) || !Array.isArray(m.attachments)) bad('structure');
  if (m.attachments.length > LIMITS.attachments) bad('too many attachments');
  for (const a of m.attachments) {
    if (!a || !Number.isInteger(a.offset) || !Number.isInteger(a.size) || a.offset < 0 || a.size < 0 || a.offset + a.size > payloadLen) bad('attachment range');
    if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256)) bad('attachment hash');
  }
}
export async function openPackage(buf, passphrase) {
  const { header, ctOffset } = inspect(buf);
  const key = await deriveKey(passphrase, fromHex(header.kdf.salt, 16), header.kdf.iter);
  let inner;
  try { inner = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(header.iv, 12), additionalData: te.encode(canonical(header)) }, key, buf.subarray(ctOffset))); }
  catch { throw new FieldlineError('DECRYPT_FAILED', 'Wrong passphrase, or the package was modified.'); }
  if (inner.length < 4) throw new FieldlineError('CORRUPT', 'Package payload too short');
  const ml = new DataView(inner.buffer, inner.byteOffset, inner.byteLength).getUint32(0);
  if (ml > LIMITS.manifest || 4 + ml > inner.length) throw new FieldlineError('CORRUPT', 'Manifest length invalid');
  let manifest; try { manifest = JSON.parse(td.decode(inner.subarray(4, 4 + ml))); } catch { throw new FieldlineError('CORRUPT', 'Manifest unreadable'); }
  const payload = inner.subarray(4 + ml);
  validateManifest(manifest, payload.length);
  const checks = [];
  checks.push({ name: 'Header authenticated and decrypted (AES-256-GCM)', ok: true });
  checks.push({ name: 'Package ID matches header', ok: manifest.packageId === header.id && manifest.createdAt === header.created });
  const atts = [];
  for (const a of manifest.attachments) {
    const bytes = payload.slice(a.offset, a.offset + a.size);
    const ok = (await sha256(bytes)) === a.sha256; checks.push({ name: `Attachment hash: ${a.name}`, ok }); atts.push({ ...a, bytes, hashOk: ok });
  }
  const chain = await verifyChain(manifest.events);
  checks.push({ name: `Event hash chain (${manifest.events.length} events)`, ok: chain.ok, detail: chain.ok ? '' : `broken at event ${chain.breakAt} (${chain.reason})` });
  checks.push({ name: 'Chain head matches manifest', ok: chain.ok && (manifest.integrity?.chainHead ?? null) === (manifest.events.length ? chain.head : null) });
  const ok = checks.every(c => c.ok);
  return { header, manifest, attachments: atts, report: { ok, checks, warnings: [...chain.warnings, manifest.timeTrust?.warning || TIME_WARNING] } };
}
