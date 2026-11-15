import test from 'node:test';
import assert from 'node:assert/strict';
import { AW, AH, GestureEngine } from '../../js/gesture.js';
import { strength } from '../../js/crypto.js';
import { validateTemplate, newRun, setItem, progress, reportText, BUILTIN } from '../../js/sop.js';
import { checkEndpoint, reportFromNotes } from '../../js/translate.js';

const BG = [35, 40, 52], SK = [224, 172, 140];
function frame(rects) { const d = new Uint8ClampedArray(AW * AH * 4); for (let i = 0; i < AW * AH; i++) { d[i * 4] = BG[0]; d[i * 4 + 1] = BG[1]; d[i * 4 + 2] = BG[2]; d[i * 4 + 3] = 255; }
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * AW + x; d[i * 4] = SK[0]; d[i * 4 + 1] = SK[1]; d[i * 4 + 2] = SK[2]; } return d; }
const palm = dx => frame([[30 + dx, 50, 62 + dx, 68], ...[0, 6, 12, 18, 24].map(o => [30 + dx + o, 30, 33 + dx + o, 50])]);
const fist = dx => frame([[30 + dx, 38, 60 + dx, 68]]);
const run = (mk, frames, step = 66) => { const got = [], e = new GestureEngine(g => got.push(g), .5); let last; for (let i = 0; i < frames; i++) last = e.push(mk(i), i * step); return { got, last }; };

test('13 gesture: open hand classified as open and fires open then hold', () => {
  const r = run(() => palm(0), 36); assert.equal(r.last.shape, 'open'); assert.deepEqual(r.got, ['open', 'hold']);
});
test('13 gesture: fist classified as fist and fires once', () => {
  const r = run(() => fist(0), 30); assert.equal(r.last.shape, 'fist'); assert.deepEqual(r.got, ['fist']);
});
test('13 gesture: swipe right and left detected', () => {
  assert.deepEqual(run(i => palm(-20 + i * 5), 10, 50).got.filter(g => g.startsWith('swipe')), ['swipe-right']);
  assert.deepEqual(run(i => palm(25 - i * 5), 10, 50).got.filter(g => g.startsWith('swipe')), ['swipe-left']);
});
test('13 gesture: no hand and empty frame fire nothing', () => {
  const r = run(() => frame([]), 40); assert.deepEqual(r.got, []); assert.equal(r.last.hand, null);
});
test('13 gesture: brief or unstable shapes do not fire', () => {
  const r = run(i => i % 2 ? palm(0) : fist(0), 40); assert.deepEqual(r.got, []);
});
test('14 SOP engine: validation, run progress, report, version', () => {
  assert.throws(() => validateTemplate({ name: '', steps: ['a'] }), { code: 'BAD_TEMPLATE' }); assert.throws(() => validateTemplate({ name: 'x', steps: [] }), { code: 'BAD_TEMPLATE' }); assert.throws(() => validateTemplate({ name: 'x', steps: ['a'.repeat(501)] }), { code: 'BAD_TEMPLATE' });
  const t = BUILTIN[0], r = newRun(t, 1000); setItem(r, 's1', { state: 'done', note: 'ok' }, 2000); setItem(r, 's2', { state: 'incomplete' }, 3000);
  const p = progress(r); assert.equal(p.done, 1); assert.equal(p.incomplete, 1); assert.equal(p.pending, t.steps.length - 2);
  assert.match(reportText(r), /version 1/); assert.match(reportText(r), /\[DONE\]/); assert.throws(() => setItem(r, 'nope', {}), { code: 'NO_STEP' });
  assert.ok(BUILTIN.every(b => /not an official SOP/.test(b.note)), 'built-ins labelled generic');
});
test('15 translation: only localhost endpoints accepted; reports contain only supplied facts', () => {
  assert.equal(checkEndpoint('http://localhost:5000/x'), 'http://localhost:5000'); assert.equal(checkEndpoint('http://127.0.0.1:5000'), 'http://127.0.0.1:5000');
  for (const bad of ['https://api.mymemory.translated.net', 'http://example.com', 'ftp://localhost', 'localhost:5000', 'javascript:alert(1)']) assert.throws(() => checkEndpoint(bad), { code: 'BAD_ENDPOINT' });
  const r = reportFromNotes({ what: 'pump leak' }); assert.match(r, /pump leak/); assert.match(r, /Where: \(not recorded\)/);
});
test('16 weak passphrases are flagged', () => { assert.ok(strength('Password1').score <= 1); assert.ok(strength('').score === 0); });
