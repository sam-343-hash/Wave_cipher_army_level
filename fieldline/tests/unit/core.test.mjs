import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, deriveKey, rand, sha256, strength, KDF, calibrateIterations, canonical } from '../../js/crypto.js';
import { appendEvent, verifyChain } from '../../js/chain.js';
import { buildPackage, openPackage, inspect, buildManifest, assemble, LIMITS } from '../../js/pkg.js';
import { parseWav, encodeWav } from '../../js/wav.js';
import { metrics } from '../../js/signal.js';

const ITER = KDF.minIter, PASS = 'correct horse battery staple 42!';
const mkEvents = async n => { let c = []; for (let i = 0; i < n; i++) c = await appendEvent(c, { type: 'note', text: 'event ' + i, ts: 1700000000000 + i * 1000 }); return c; };
const mkPkg = async (atts = [], pass = PASS) => buildPackage({ incident: { id: 'i1', title: 'Pump check', category: 'equipment', tags: ['a'], report: 'Report text' }, events: await mkEvents(3), attachments: atts, passphrase: pass, iter: ITER });
const flip = (u8, i) => { const c = u8.slice(); c[i] ^= 1; return c; };

test('1 encryption/decryption round trip (AES-256-GCM)', async () => {
  const key = await deriveKey(PASS, rand(16), ITER), aad = { store: 't', id: 'x' };
  const { iv, ct } = await seal(key, new TextEncoder().encode('hello field'), aad);
  assert.equal(new TextDecoder().decode(await open(key, iv, ct, aad)), 'hello field');
  const again = await seal(key, new TextEncoder().encode('hello field'), aad);
  assert.notDeepEqual(iv, again.iv, 'fresh random IV every time');
});
test('2 wrong passphrase rejected', async () => {
  const p = await mkPkg();
  await assert.rejects(openPackage(p.bytes, 'wrong passphrase value'), { code: 'DECRYPT_FAILED' });
});
test('3 ciphertext tampering detected', async () => {
  const p = await mkPkg();
  for (const off of [p.bytes.length - 1, p.bytes.length - 20, p.bytes.length - 200]) await assert.rejects(openPackage(flip(p.bytes, off), PASS), { code: 'DECRYPT_FAILED' });
});
test('4 metadata (header) tampering detected', async () => {
  const p = await mkPkg(), td = new TextDecoder(), te = new TextEncoder();
  const hl = new DataView(p.bytes.buffer).getUint32(4), header = JSON.parse(td.decode(p.bytes.subarray(8, 8 + hl)));
  // change the (unauthenticated-looking) created timestamp but keep the same length
  const forged = { ...header, created: header.created + 1 }, fb = te.encode(JSON.stringify(forged));
  assert.equal(fb.length, hl, 'same length forgery');
  const out = p.bytes.slice(); out.set(fb, 8);
  await assert.rejects(openPackage(out, PASS), { code: 'DECRYPT_FAILED' });
  const forged2 = { ...header, id: header.id.replace(/.$/, c => c === '0' ? '1' : '0') }; const out2 = p.bytes.slice(); out2.set(te.encode(JSON.stringify(forged2)), 8);
  await assert.rejects(openPackage(out2, PASS), { code: 'DECRYPT_FAILED' });
});
test('5 large evidence package (40 MB attachment) round trip', async () => {
  const big = new Uint8Array(40 * 1024 * 1024); for (let i = 0; i < big.length; i += 4096) big[i] = i & 255;
  const small = new TextEncoder().encode('photo-bytes');
  const p = await mkPkg([{ name: 'big.bin', type: 'application/octet-stream', bytes: big, source: { method: 'file' } }, { name: 's.jpg', type: 'image/jpeg', bytes: small, source: { method: 'file' } }]);
  const r = await openPackage(p.bytes, PASS);
  assert.ok(r.report.ok); assert.equal(r.attachments[0].bytes.length, big.length); assert.deepEqual(r.attachments[1].bytes, small);
});
test('5b size limits enforced', async () => {
  await assert.rejects(buildManifest({ incident: {}, events: [], attachments: [{ name: 'x', bytes: { length: 1 } }] }), { code: 'BAD_ATTACHMENT' });
  assert.throws(() => inspect(new Uint8Array(LIMITS.file + 1)), { code: 'TOO_LARGE' });
});
test('6 corrupted files rejected', async () => {
  const p = await mkPkg();
  assert.throws(() => inspect(new Uint8Array(5)), { code: 'BAD_FILE' });
  assert.throws(() => inspect(new TextEncoder().encode('NOPE'.repeat(20))), { code: 'BAD_FILE' });
  assert.throws(() => inspect(p.bytes.subarray(0, 60)), { code: 'CORRUPT' });
  const lie = p.bytes.slice(); new DataView(lie.buffer).setUint32(4, 0x7fffffff); assert.throws(() => inspect(lie), { code: 'CORRUPT' });
  const junk = p.bytes.slice(); junk.fill(0x41, 9, 40); assert.throws(() => inspect(junk), { code: 'CORRUPT' });
  await assert.rejects(openPackage(p.bytes.subarray(0, p.bytes.length - 30), PASS), { code: 'DECRYPT_FAILED' });
  // absurd KDF cost (denial of service) and weak KDF both refused before any derivation
  const hdr = JSON.parse(new TextDecoder().decode(p.bytes.subarray(8, 8 + new DataView(p.bytes.buffer).getUint32(4))));
  for (const iter of [1000, 2e9]) { const h = { ...hdr, kdf: { ...hdr.kdf, iter } }, hb = new TextEncoder().encode(JSON.stringify(h)); const b = new Uint8Array(8 + hb.length + 40); b.set(p.bytes.subarray(0, 4)); new DataView(b.buffer).setUint32(4, hb.length); b.set(hb, 8); assert.throws(() => inspect(b), { code: 'KDF_PARAMS' }); }
});
test('7 WAV parsing and validation', () => {
  const s = new Float32Array(8000).map((_, i) => Math.sin(i / 10) * 0.5), w = encodeWav(s, 8000), r = parseWav(w);
  assert.equal(r.sampleRate, 8000); assert.equal(r.frames, 8000); assert.ok(Math.abs(r.samples[100] - s[100]) < 1e-3);
  assert.throws(() => parseWav(new Uint8Array(10)), { code: 'BAD_WAV' });
  const bad = w.slice(); bad[0] = 0x58; assert.throws(() => parseWav(bad), { code: 'BAD_WAV' });
  const rate = w.slice(); new DataView(rate.buffer).setUint32(24, 5, true); assert.throws(() => parseWav(rate), { code: 'BAD_WAV' });
  const trunc = w.slice(0, 30); assert.throws(() => parseWav(trunc), { code: 'BAD_WAV' });
  const nodata = w.slice(0, 36); assert.throws(() => parseWav(nodata), { code: 'BAD_WAV' });
  const fmtOver = w.slice(); new DataView(fmtOver.buffer).setUint32(16, 0x7fffff, true); assert.throws(() => parseWav(fmtOver), { code: 'BAD_WAV' });
});
test('8 hash verification catches a swapped attachment', async () => {
  const a = new TextEncoder().encode('original evidence bytes'), b = new TextEncoder().encode('forged evidence bytes!!');
  assert.equal(a.length, b.length, 'forged bytes have the same length, only the content differs');
  const { manifest } = await buildManifest({ incident: { id: 'i' }, events: await mkEvents(1), attachments: [{ name: 'e.txt', bytes: a }] });
  const pkg = await assemble({ manifest, payload: b, passphrase: PASS, iter: ITER }); // payload no longer matches manifest hash
  const r = await openPackage(pkg, PASS);
  assert.equal(r.report.ok, false); assert.equal(r.attachments[0].hashOk, false);
  assert.ok(r.report.checks.some(c => /Attachment hash/.test(c.name) && !c.ok));
});
test('8b out-of-range attachment offsets rejected', async () => {
  const { manifest } = await buildManifest({ incident: { id: 'i' }, events: [], attachments: [{ name: 'e', bytes: new Uint8Array(10) }] });
  manifest.attachments[0].offset = 999999;
  await assert.rejects(openPackage(await assemble({ manifest, payload: new Uint8Array(10), passphrase: PASS, iter: ITER }), PASS), { code: 'CORRUPT' });
});
test('9 hash-linked chain detects edits, deletion, reordering and clock regression', async () => {
  const c = await mkEvents(5); assert.equal((await verifyChain(c)).ok, true);
  const edited = c.map(e => ({ ...e })); edited[2].text = 'changed'; assert.deepEqual([(await verifyChain(edited)).ok, (await verifyChain(edited)).breakAt], [false, 2]);
  const deleted = c.filter((_, i) => i !== 2); assert.equal((await verifyChain(deleted)).ok, false);
  const swapped = [c[0], c[2], c[1], c[3], c[4]]; assert.equal((await verifyChain(swapped)).ok, false);
  let back = await mkEvents(2); back = await appendEvent(back, { type: 'note', text: 'later but earlier clock', ts: 1 });
  const v = await verifyChain(back); assert.equal(v.ok, true); assert.ok(v.warnings.length === 1, 'clock regression warned');
});
test('10 package carries explicit timestamp-trust warning and capture info', async () => {
  const r = await openPackage((await mkPkg()).bytes, PASS);
  assert.equal(r.manifest.timeTrust.verified, false); assert.match(r.manifest.timeTrust.warning, /cannot be independently verified/); assert.equal(r.manifest.capture.app, 'FIELDLINE');
});
test('11 signal metrics are computed from samples', () => {
  const rate = 8000, tone = new Float32Array(rate).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / rate));
  const m = metrics(tone, rate); assert.ok(Math.abs(m.peak - 0.5) < 1e-3); assert.ok(Math.abs(m.rms - 0.3535) < 5e-3); assert.equal(m.clipCount, 0); assert.ok(m.silencePct < 1);
  const clip = tone.map(x => Math.max(-1, Math.min(1, x * 4))), c = metrics(clip, rate); assert.ok(c.clipCount > 0);
  const sil = metrics(new Float32Array(rate), rate); assert.equal(sil.silencePct, 100); assert.equal(sil.peakDb, -180);
});
test('12 passphrase strength guidance and KDF calibration floor', async () => {
  assert.ok(strength('password123').score <= 1); assert.ok(strength('amber-lantern-orbit-quiet-harbor-7').score >= 3);
  assert.ok(await calibrateIterations(1) >= KDF.minIter);
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
});

test('6b random and non-UTF-8 bytes give a clean BAD_FILE error (never an internal exception)', () => {
  const junk = new Uint8Array(5000); for (let i = 0; i < junk.length; i++) junk[i] = (i * 197 + 131) & 255; junk[0] = 0xff;
  assert.throws(() => inspect(junk), e => e.code === 'BAD_FILE' && /not a FIELDLINE package/.test(e.message));
  const almost = new Uint8Array(100); almost.set([0x46, 0x4c, 0x50, 0x31]); almost[4] = 0xff; assert.throws(() => inspect(almost), { code: 'CORRUPT' });
});
