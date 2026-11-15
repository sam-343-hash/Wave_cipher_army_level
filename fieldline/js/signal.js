// Real audio measurements. Every number is computed from supplied samples; nothing is simulated.
export const toDb = x => x > 1e-9 ? 20 * Math.log10(x) : -180;
export function metrics(s, rate) {
  const n = s.length; if (!n) return { frames: 0, durationSec: 0, peak: 0, peakDb: -180, rms: 0, rmsDb: -180, clipCount: 0, clipPct: 0, noiseFloorDb: -180, silencePct: 100 };
  let peak = 0, sum = 0, clip = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(s[i]); if (a > peak) peak = a; sum += s[i] * s[i]; if (a >= 0.999) clip++; }
  const win = Math.max(1, Math.round(rate * 0.02)), levels = [];
  for (let o = 0; o + win <= n; o += win) { let e = 0; for (let i = o; i < o + win; i++) e += s[i] * s[i]; levels.push(Math.sqrt(e / win)); }
  const sorted = levels.slice().sort((a, b) => a - b), floor = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
  const silent = levels.filter(l => toDb(l) < -50).length, rms = Math.sqrt(sum / n);
  return { frames: n, durationSec: n / rate, peak, peakDb: toDb(peak), rms, rmsDb: toDb(rms), clipCount: clip, clipPct: 100 * clip / n, noiseFloorDb: toDb(floor), silencePct: levels.length ? 100 * silent / levels.length : 0 };
}
// Recorder: collects mono float samples from a MediaStream. AudioWorklet if available, ScriptProcessor fallback.
export class Recorder {
  constructor() { this.ctx = null; this.stream = null; this.chunks = []; this.active = false; this.analyser = null; this.info = null; }
  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone API not available in this browser');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream); this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.5; src.connect(this.analyser);
    const tr = this.stream.getAudioTracks()[0], st = tr.getSettings ? tr.getSettings() : {};
    this.info = { sampleRate: this.ctx.sampleRate, channels: st.channelCount || 1, device: tr.label || 'default input' };
    this.chunks = []; this.active = true;
    const sink = this.ctx.createGain(); sink.gain.value = 0; sink.connect(this.ctx.destination);
    try {
      await this.ctx.audioWorklet.addModule('js/recorder-worklet.js');
      const node = new AudioWorkletNode(this.ctx, 'fl-recorder'); node.port.onmessage = e => { if (this.active) this.chunks.push(e.data); };
      src.connect(node); node.connect(sink); this.node = node;
    } catch {
      const p = this.ctx.createScriptProcessor(4096, 1, 1); p.onaudioprocess = e => { if (this.active) this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      src.connect(p); p.connect(sink); this.node = p;
    }
  }
  stop() {
    this.active = false; const n = this.chunks.reduce((a, c) => a + c.length, 0), out = new Float32Array(n); let p = 0;
    for (const c of this.chunks) { out.set(c, p); p += c.length; }
    this.stream?.getTracks().forEach(t => t.stop()); this.ctx?.close(); const rate = this.info?.sampleRate || 48000; this.chunks = [];
    return { samples: out, sampleRate: rate, info: this.info };
  }
}
