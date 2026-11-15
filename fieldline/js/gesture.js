// Gesture Assist. Colour-based hand silhouette tracking, computed on-device from a 96x72 downscaled frame. Frames are never stored or sent.
// NOT biometric authentication and not a security control. A trained landmark model could not be bundled offline in this build.
export const AW = 96, AH = 72, ROI = { x0: 8, x1: 88, y0: 22, y1: 70 }, GN = 20;
export function skinMask(d, m) {
  for (let i = 0, n = AW * AH; i < n; i++) { const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2], Y = .299 * R + .587 * G + .114 * B, cr = (R - Y) * .713 + 128, cb = (B - Y) * .564 + 128; m[i] = (Y > 45 && cr > 136 && cr < 174 && cb > 80 && cb < 124 && R > G && R > B && R - G > 12) ? 1 : 0; }
}
const lab = new Int32Array(AW * AH), stk = new Int32Array(AW * AH);
export function findHand(m, sel, minFrac = .02) {
  lab.fill(0); sel.fill(0); const comps = []; let id = 0;
  const roiA = (ROI.x1 - ROI.x0 + 1) * (ROI.y1 - ROI.y0 + 1), minA = Math.max(20, roiA * minFrac);
  for (let y = ROI.y0; y <= ROI.y1; y++) for (let x = ROI.x0; x <= ROI.x1; x++) {
    const i = y * AW + x; if (!m[i] || lab[i]) continue; id++; let sp = 0, a = 0; stk[sp++] = i; lab[i] = id;
    while (sp) { const p = stk[--sp], px = p % AW, py = (p / AW) | 0; a++; let q;
      if (px > ROI.x0) { q = p - 1; if (m[q] && !lab[q]) { lab[q] = id; stk[sp++] = q; } }
      if (px < ROI.x1) { q = p + 1; if (m[q] && !lab[q]) { lab[q] = id; stk[sp++] = q; } }
      if (py > ROI.y0) { q = p - AW; if (m[q] && !lab[q]) { lab[q] = id; stk[sp++] = q; } }
      if (py < ROI.y1) { q = p + AW; if (m[q] && !lab[q]) { lab[q] = id; stk[sp++] = q; } } }
    if (a >= minA) comps.push({ id, a });
  }
  if (!comps.length) return null;
  comps.sort((p, q) => q.a - p.a); const keep = {}; comps.slice(0, 2).forEach(c => keep[c.id] = 1);
  let x0 = AW, x1 = 0, y0 = AH, y1 = 0, n = 0, sx = 0, sy = 0;
  for (let y = ROI.y0; y <= ROI.y1; y++) for (let x = ROI.x0; x <= ROI.x1; x++) { const i = y * AW + x; if (keep[lab[i]]) { sel[i] = 1; n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1; if (bw < 4 || bh < 4) return null;
  const runsAt = fy => { const y = Math.min(y1, y0 + Math.round(bh * fy)); let r = 0, inRun = false, gap = 0; for (let x = x0; x <= x1; x++) { if (sel[y * AW + x]) { if (!inRun && gap >= 1) r++; if (!inRun && r === 0) r = 1; inRun = true; gap = 0; } else { inRun = false; gap++; } } return r; };
  const runs = Math.max(runsAt(.1), runsAt(.2), runsAt(.3)), fill = n / (bw * bh);
  const shape = runs >= 3 ? 'open' : (fill > .72 && runs <= 1 ? 'fist' : 'hand');
  return { cx: sx / n, cy: sy / n, x0, x1, y0, y1, bw, bh, area: n, fill, runs, shape };
}
// Turns per-frame hand observations into discrete gestures with debouncing.
export class GestureEngine {
  constructor(onGesture, sensitivity = .5) { this.on = onGesture; this.setSensitivity(sensitivity); this.hist = []; this.cur = null; this.since = 0; this.last = -1e9; this.fired = {}; this.skin = new Uint8Array(AW * AH); this.sel = new Uint8Array(AW * AH); }
  setSensitivity(s) { this.sens = Math.min(1, Math.max(0, s)); this.minFrac = .035 - .025 * this.sens; this.swipeDist = 52 - 28 * this.sens; this.openMs = 900 - 400 * this.sens; this.fistMs = 700 - 300 * this.sens; }
  push(rgba, now) {
    skinMask(rgba, this.skin); const h = findHand(this.skin, this.sel, this.minFrac), out = { hand: h, shape: h ? h.shape : null, hold: 0 };
    if (!h) { this.cur = null; this.hist = []; return out; }
    if (h.shape !== this.cur) { this.cur = h.shape; this.since = now; this.fired = {}; }
    const stable = now - this.since; out.hold = Math.min(1, stable / 2000);
    this.hist.push({ t: now, x: h.cx, y: h.cy }); this.hist = this.hist.filter(p => now - p.t < 600);
    const ready = now - this.last > 1200, fire = g => { this.last = now; this.hist = []; this.on(g); };
    if (ready && this.hist.length > 5) { const a = this.hist[0], b = this.hist[this.hist.length - 1], dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) > this.swipeDist && Math.abs(dy) < Math.abs(dx) * .5) { fire(dx < 0 ? 'swipe-left' : 'swipe-right'); this.since = now; return out; } }
    if (h.shape === 'open') { if (stable >= 2000 && !this.fired.hold) { this.fired.hold = 1; this.fired.open = 1; this.last = now; this.on('hold'); } else if (stable >= this.openMs && !this.fired.open && ready) { this.fired.open = 1; fire('open'); } }
    else if (h.shape === 'fist' && stable >= this.fistMs && !this.fired.fist && ready) { this.fired.fist = 1; fire('fist'); }
    return out;
  }
}
