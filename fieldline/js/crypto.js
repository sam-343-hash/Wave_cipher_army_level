// Cryptography helpers. Only reviewed Web Crypto primitives are used: SHA-256, PBKDF2-HMAC-SHA256, AES-256-GCM.
const te = new TextEncoder();
export class FieldlineError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
export const toHex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
export function fromHex(s, bytes) {
  if (typeof s !== 'string' || s.length !== bytes * 2 || /[^0-9a-f]/.test(s)) throw new FieldlineError('BAD_HEX');
  const o = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) o[i] = parseInt(s.substr(i * 2, 2), 16); return o;
}
export const rand = n => crypto.getRandomValues(new Uint8Array(n));
export async function sha256(data) { return toHex(await crypto.subtle.digest('SHA-256', data)); }
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
export const KDF = { alg: 'PBKDF2-HMAC-SHA256', minIter: 600000, maxIter: 10000000 };
async function rawDerive(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(String(pass).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function deriveKey(pass, salt, iter) {
  if (!Number.isInteger(iter) || iter < KDF.minIter || iter > KDF.maxIter) throw new FieldlineError('KDF_PARAMS', 'Key-derivation parameters out of range');
  if (typeof pass !== 'string' || pass.length < 1) throw new FieldlineError('NO_PASSPHRASE', 'A passphrase is required');
  return rawDerive(pass, salt, iter);
}
// Device calibration: choose an iteration count that takes about `ms` on this device, never below the minimum.
export async function calibrateIterations(ms = 350) {
  const t0 = performance.now(); await rawDerive('calibration', rand(16), 100000);
  const dt = Math.max(1, performance.now() - t0);
  const n = Math.round(100000 * ms / dt / 10000) * 10000;
  return Math.min(5000000, Math.max(KDF.minIter, n));
}
export async function seal(key, plain, aad, iv = rand(12)) {
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(canonical(aad)) }, key, plain));
  return { iv, ct };
}
export async function open(key, iv, ct, aad) {
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: te.encode(canonical(aad)) }, key, ct)); }
  catch { throw new FieldlineError('DECRYPT_FAILED', 'Wrong passphrase, or the data was modified.'); }
}
const COMMON = ['password', 'passw0rd', 'qwerty', '123456', 'letmein', 'admin', 'welcome', 'iloveyou', 'abc123', 'fieldline', 'changeme'];
export function strength(p) {
  if (!p) return { score: 0, bits: 0, label: 'empty', hints: ['Enter a passphrase'] };
  const hints = [], classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
  let bits = p.length * Math.log2([26, 52, 62, 94][Math.max(0, classes - 1)]);
  const lower = p.toLowerCase();
  if (COMMON.some(c => lower.includes(c))) { bits = Math.min(bits, 20); hints.push('Contains a very common word'); }
  if (/(.)\1{3,}/.test(p)) { bits -= 15; hints.push('Repeated characters'); }
  if (/(0123|1234|2345|abcd|qwer)/i.test(p)) { bits -= 10; hints.push('Predictable sequence'); }
  if (p.length < 12) hints.push('Use at least 12 characters; a long phrase of unrelated words is best');
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 56 ? 2 : bits < 72 ? 3 : 4;
  return { score, bits: Math.max(0, Math.round(bits)), label: ['very weak', 'weak', 'fair', 'strong', 'very strong'][score], hints };
}
