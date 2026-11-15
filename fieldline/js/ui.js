// Safe DOM helpers: text is always inserted as text nodes, never as HTML.
import { S } from './state.js';
import { strength } from './crypto.js';
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export const $ = id => document.getElementById(id);
export const fmtTime = t => t ? new Date(t).toLocaleString() : 'n/a';
export const bytesFmt = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
export function notify(msg, kind = 'info') { const t = h('div', { class: 'toast ' + kind, role: kind === 'err' ? 'alert' : 'status' }, msg); $('toasts').append(t); setTimeout(() => t.remove(), kind === 'err' ? 8000 : 3800); }
export function download(bytes, name, type = 'application/octet-stream') {
  const u = URL.createObjectURL(new Blob([bytes], { type })), a = h('a', { href: u, download: name }); document.body.append(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 1500);
}
export function readFile(file, max) {
  return new Promise((res, rej) => {
    if (file.size > max) return rej(new Error(`File is ${bytesFmt(file.size)}; the limit is ${bytesFmt(max)}`));
    const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(new Error('Could not read file')); r.readAsArrayBuffer(file);
  });
}
function openModal(title, body, actions, { allowGesture = false, onCancel } = {}) {
  const ov = $('overlay'), box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h3', { text: title }), body, h('div', { class: 'row end' }, actions));
  ov.replaceChildren(box); ov.hidden = false;
  const close = () => { ov.hidden = true; ov.replaceChildren(); S.pending = null; document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') { close(); onCancel && onCancel(); } };
  document.addEventListener('keydown', esc);
  setTimeout(() => (box.querySelector('input,textarea,button.primary') || box.querySelector('button'))?.focus(), 30);
  return { close, box };
}
export function closeModal() { const ov = $('overlay'); ov.hidden = true; ov.replaceChildren(); S.pending = null; }
export function confirmDialog({ title, text, confirmText = 'Confirm', danger = false, allowGesture = false }) {
  return new Promise(res => {
    const done = v => { m.close(); res(v); };
    const m = openModal(title, [h('p', { text }), allowGesture ? h('p', { class: 'muted', text: 'Not sensitive: you can also confirm by holding an open hand for 2 seconds (Gesture Controls must be on).' }) : h('p', { class: 'muted', text: 'This action needs a button press. Gestures cannot confirm it.' })],
      [h('button', { class: 'ghost', onclick: () => done(false), text: 'Cancel' }), h('button', { class: danger ? 'danger' : 'primary', id: 'confirm-ok', onclick: () => done(true), text: confirmText })], { allowGesture, onCancel: () => res(false) });
    S.pending = { allowGesture, resolve: done };
  });
}
export function askPassphrase({ title, text, confirm = false, enforce = false, okText = 'Continue' }) {
  return new Promise(res => {
    const p1 = h('input', { type: 'password', id: 'pp1', autocomplete: 'off', 'aria-label': 'Passphrase' }), p2 = confirm ? h('input', { type: 'password', id: 'pp2', autocomplete: 'off', placeholder: 'Repeat passphrase', 'aria-label': 'Repeat passphrase' }) : null;
    const meter = h('div', { class: 'meter' }, h('i')), hint = h('div', { class: 'muted', id: 'pp-hint' }), err = h('div', { class: 'errtxt', id: 'pp-err' });
    const upd = () => { const s = strength(p1.value); meter.firstChild.style.width = (s.score + 1) * 20 + '%'; meter.className = 'meter s' + s.score; hint.textContent = confirm || enforce ? `Strength: ${s.label}${s.hints.length ? '. ' + s.hints[0] : ''}` : ''; };
    p1.addEventListener('input', upd);
    const go = () => {
      if (!p1.value) { err.textContent = 'Enter a passphrase'; return; }
      if (confirm && p1.value !== p2.value) { err.textContent = 'The two passphrases do not match'; return; }
      if (enforce && (p1.value.length < 10 || strength(p1.value).score < 2)) { err.textContent = 'Too weak. Use at least 10 characters, ideally a long phrase of unrelated words.'; return; }
      m.close(); res(p1.value);
    };
    const m = openModal(title, [h('p', { text }), p1, p2, confirm || enforce ? meter : null, hint, err], [h('button', { class: 'ghost', onclick: () => { m.close(); res(null); }, text: 'Cancel' }), h('button', { class: 'primary', id: 'pp-ok', onclick: go, text: okText })], { onCancel: () => res(null) });
    [p1, p2].forEach(i => i && i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
  });
}
export function askText({ title, text, placeholder = '', okText = 'Continue', danger = false, inputId = 'ask-text', okId = 'ask-ok' }) {
  return new Promise(res => {
    const i = h('input', { id: inputId, placeholder, autocomplete: 'off', 'aria-label': title }), done = v => { m.close(); res(v); };
    const m = openModal(title, [h('p', { text }), i], [h('button', { class: 'ghost', onclick: () => done(null), text: 'Cancel' }), h('button', { class: danger ? 'danger' : 'primary', id: okId, onclick: () => done(i.value), text: okText })], { onCancel: () => res(null) });
    i.addEventListener('keydown', e => { if (e.key === 'Enter') done(i.value); });
  });
}
export function fitCanvas(c, hpx) { const d = window.devicePixelRatio || 1, w = c.clientWidth || 300; if (hpx) c.style.height = hpx + 'px'; const H = c.clientHeight || hpx || 150; if (c.width !== Math.round(w * d) || c.height !== Math.round(H * d)) { c.width = Math.round(w * d); c.height = Math.round(H * d); } const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, w, h: H }; }
export function bars(canvas, labels, values) {
  const { x, w, h: H } = fitCanvas(canvas, 170); x.clearRect(0, 0, w, H);
  const max = Math.max(1, ...values), bw = w / Math.max(1, labels.length);
  x.font = '11px system-ui'; labels.forEach((l, i) => { const bh = (H - 38) * values[i] / max; x.fillStyle = '#2b9bb5'; x.fillRect(i * bw + 10, H - 22 - bh, bw - 20, bh); x.fillStyle = '#cfe3ee'; x.textAlign = 'center'; x.fillText(String(values[i]), i * bw + bw / 2, H - 26 - bh); x.fillStyle = '#8fa3b8'; x.fillText(l.slice(0, 12), i * bw + bw / 2, H - 6); });
}
export const section = (title, ...kids) => h('section', { class: 'panel' }, h('h2', { text: title }), kids);
export const field = (label, input, hintTxt) => h('label', { class: 'field' }, h('span', { text: label }), input, hintTxt ? h('small', { class: 'muted', text: hintTxt }) : null);
export const empty = t => h('p', { class: 'empty', text: t });
