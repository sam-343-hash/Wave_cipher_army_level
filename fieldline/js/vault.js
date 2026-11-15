// Vault: one passphrase-derived AES-256-GCM key held only in memory (non-extractable CryptoKey) while the session is unlocked.
// Records are stored as ciphertext with store+id authenticated as additional data, so rows cannot be swapped between records.
import { FieldlineError, deriveKey, calibrateIterations, seal, open, rand, toHex, fromHex } from './crypto.js';
import { appendEvent, verifyChain } from './chain.js';
import * as db from './db.js';
const te = new TextEncoder(), td = new TextDecoder();
let key = null, timer = null, onLock = () => {}, idleMs = 600000;
export const isUnlocked = () => !!key;
export const exists = async () => !!(await db.get('meta', 'vault'));
export const setOnLock = f => { onLock = f; };
export function setIdle(min) { idleMs = Math.max(1, min) * 60000; touch(); }
export function touch() { clearTimeout(timer); if (key) timer = setTimeout(() => lock('idle timeout'), idleMs); }
export async function secLog(type, detail = '') {
  const rows = (await db.all('secevents')).sort((a, b) => a.id < b.id ? -1 : 1), chain = rows.map(({ id, ...e }) => e);
  const next = (await appendEvent(chain, { type, text: String(detail).slice(0, 300) }));
  const e = next[next.length - 1]; await db.put('secevents', { id: String(e.seq).padStart(8, '0'), ...e });
}
export async function secEvents() { const rows = (await db.all('secevents')).sort((a, b) => a.id < b.id ? -1 : 1); return { rows, verify: await verifyChain(rows.map(({ id, ...e }) => e)) }; }
export async function create(pass) {
  if (await exists()) throw new FieldlineError('EXISTS', 'A vault already exists');
  const iter = await calibrateIterations(), salt = rand(16), k = await deriveKey(pass, salt, iter);
  const v = await seal(k, te.encode('FIELDLINE-VAULT-OK'), { purpose: 'verifier' });
  await db.put('meta', { id: 'vault', v: 1, kdf: 'PBKDF2-HMAC-SHA256', iter, salt: toHex(salt), verifier: v, created: Date.now() });
  key = k; touch(); await secLog('vault-created', `PBKDF2-HMAC-SHA256 ${iter} iterations`);
}
async function check(pass) {
  const m = await db.get('meta', 'vault'); if (!m) throw new FieldlineError('NO_VAULT', 'No vault yet');
  const k = await deriveKey(pass, fromHex(m.salt, 16), m.iter);
  const p = await open(k, m.verifier.iv, m.verifier.ct, { purpose: 'verifier' });
  if (td.decode(p) !== 'FIELDLINE-VAULT-OK') throw new FieldlineError('DECRYPT_FAILED'); return k;
}
export async function unlock(pass) {
  try { key = await check(pass); touch(); await secLog('unlock', 'session unlocked'); }
  catch (e) { await secLog('unlock-failed', 'wrong passphrase'); throw new FieldlineError('DECRYPT_FAILED', 'Wrong passphrase'); }
}
export async function reauth(pass) { try { await check(pass); return true; } catch { return false; } }
export function lock(reason = 'manual') { key = null; clearTimeout(timer); db.get('meta', 'vault').then(m => m && secLog('lock', reason)).catch(() => {}); onLock(reason); }
const need = () => { if (!key) throw new FieldlineError('LOCKED', 'Vault is locked'); touch(); };
export async function putEnc(store, id, obj) { need(); const { iv, ct } = await seal(key, te.encode(JSON.stringify(obj)), { store, id, v: 1 }); await db.put(store, { id, v: 1, iv, ct, updated: Date.now() }); }
export async function getEnc(store, id) { need(); const r = await db.get(store, id); return r ? JSON.parse(td.decode(await open(key, r.iv, r.ct, { store, id, v: 1 }))) : null; }
export async function allEnc(store) { need(); const out = []; for (const r of await db.all(store)) out.push(JSON.parse(td.decode(await open(key, r.iv, r.ct, { store, id: r.id, v: 1 })))); return out; }
export async function putBytes(store, id, bytes) { need(); const { iv, ct } = await seal(key, bytes, { store, id, v: 1 }); await db.put(store, { id, v: 1, iv, ct, updated: Date.now() }); }
export async function getBytes(store, id) { need(); const r = await db.get(store, id); return r ? open(key, r.iv, r.ct, { store, id, v: 1 }) : null; }
export async function meta() { return db.get('meta', 'vault'); }
export async function settings() { return (await db.get('meta', 'settings')) || { id: 'settings', autolockMin: 10, endpoint: '', sensitivity: 0.5 }; }
export async function saveSettings(s) { await db.put('meta', { ...s, id: 'settings' }); }
