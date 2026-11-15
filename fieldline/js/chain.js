// Append-only, hash-linked event history. Tamper-EVIDENT only: an attacker who controls the device can rebuild a whole chain.
import { sha256, canonical, FieldlineError } from './crypto.js';
const te = new TextEncoder();
export const GENESIS = '0'.repeat(64);
const MAX_TEXT = 5000;
export async function makeEvent(prev, seq, { type, text, refs = [], ts }) {
  if (typeof type !== 'string' || !type || type.length > 40) throw new FieldlineError('BAD_EVENT', 'Event type invalid');
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw new FieldlineError('BAD_EVENT', 'Event text invalid or too long');
  if (!Number.isFinite(ts)) throw new FieldlineError('BAD_EVENT', 'Event timestamp invalid');
  const body = { seq, ts, type, text, refs, prev };
  return { ...body, hash: await sha256(te.encode(canonical(body))) };
}
export async function appendEvent(chain, e) {
  const last = chain[chain.length - 1];
  return [...chain, await makeEvent(last ? last.hash : GENESIS, chain.length, { ts: Date.now(), ...e })];
}
export async function verifyChain(chain) {
  const warnings = []; let prev = GENESIS, lastTs = -Infinity;
  if (!Array.isArray(chain)) return { ok: false, breakAt: 0, reason: 'not-an-array', warnings };
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    if (!e || e.seq !== i || e.prev !== prev) return { ok: false, breakAt: i, reason: 'link', warnings };
    const { hash, ...body } = e;
    let expect; try { expect = await sha256(te.encode(canonical(body))); } catch { return { ok: false, breakAt: i, reason: 'malformed', warnings }; }
    if (expect !== hash) return { ok: false, breakAt: i, reason: 'hash', warnings };
    if (typeof e.ts !== 'number' || !Number.isFinite(e.ts)) return { ok: false, breakAt: i, reason: 'timestamp', warnings };
    if (e.ts < lastTs) warnings.push(`Event ${i} is dated earlier than event ${i - 1}: the device clock may have been changed.`);
    lastTs = e.ts; prev = hash;
  }
  return { ok: true, count: chain.length, head: prev, warnings };
}
