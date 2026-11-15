// Defensive WAV parsing and encoding (PCM 16/24/32-bit integer and 32-bit float).
import { FieldlineError } from './crypto.js';
export const WAV_LIMIT = 200 * 1024 * 1024;
export function parseWav(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length > WAV_LIMIT) throw new FieldlineError('TOO_LARGE', 'WAV file too large');
  if (u8.length < 44) throw new FieldlineError('BAD_WAV', 'File too short to be a WAV');
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), tag = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new FieldlineError('BAD_WAV', 'Missing RIFF/WAVE signature');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= u8.length) {
    const id = tag(p); let n = v.getUint32(p + 4, true);
    if (id === 'data' && (n === 0 || n === 0xFFFFFFFF || p + 8 + n > u8.length)) n = u8.length - p - 8;
    if (p + 8 + n > u8.length) throw new FieldlineError('BAD_WAV', `Chunk '${id}' runs past end of file`);
    if (id === 'fmt ') {
      if (n < 16) throw new FieldlineError('BAD_WAV', 'fmt chunk too small');
      fmt = { format: v.getUint16(p + 8, true), channels: v.getUint16(p + 10, true), rate: v.getUint32(p + 12, true), bits: v.getUint16(p + 22, true) };
      if (fmt.format === 0xFFFE && n >= 26) fmt.format = v.getUint16(p + 32, true);
    } else if (id === 'data') { data = { off: p + 8, len: n }; break; }
    p += 8 + n + (n & 1);
  }
  if (!fmt) throw new FieldlineError('BAD_WAV', 'No fmt chunk');
  if (!data) throw new FieldlineError('BAD_WAV', 'No data chunk');
  if (fmt.channels < 1 || fmt.channels > 2) throw new FieldlineError('BAD_WAV', 'Only mono or stereo supported');
  if (fmt.rate < 8000 || fmt.rate > 192000) throw new FieldlineError('BAD_WAV', 'Sample rate out of range');
  const okFmt = (fmt.format === 1 && [16, 24, 32].includes(fmt.bits)) || (fmt.format === 3 && fmt.bits === 32);
  if (!okFmt) throw new FieldlineError('BAD_WAV', 'Unsupported encoding');
  const bps = fmt.bits / 8, frames = Math.floor(data.len / (bps * fmt.channels)), out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const o = data.off + (i * fmt.channels + c) * bps;
      s += fmt.format === 3 ? v.getFloat32(o, true) : fmt.bits === 16 ? v.getInt16(o, true) / 32768 : fmt.bits === 24 ? ((v.getUint8(o) | v.getUint8(o + 1) << 8 | (v.getInt8(o + 2) << 16)) / 8388608) : v.getInt32(o, true) / 2147483648;
    }
    out[i] = s / fmt.channels;
  }
  return { sampleRate: fmt.rate, channels: fmt.channels, bits: fmt.bits, encoding: fmt.format === 3 ? 'float' : 'pcm', frames, durationSec: frames / fmt.rate, samples: out };
}
export function encodeWav(samples, rate) {
  const n = samples.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 32768 : x * 32767, true); }
  return new Uint8Array(b);
}
