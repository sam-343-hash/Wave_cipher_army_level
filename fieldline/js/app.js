// Application shell: lock screen, navigation, status bar, situation panel, service worker, gestures.
import { S, VIEWS } from './state.js';
import * as vault from './vault.js';
import * as db from './db.js';
import { h, $, notify, fmtTime, bytesFmt, closeModal, section, field } from './ui.js';
import { strength } from './crypto.js';
import { overview, incidents, evidence } from './views_core.js';
import { signal, sop, translate, gesture, training, security, settings, stopCamera } from './views_tools.js';

S.views = VIEWS;
const REG = { overview, evidence, incidents, signal, sop, translate, gesture, training, security, settings };
const mic = { state: 'unknown' };
let current = 0;

async function go(view, arg) {
  if (!REG[view]) view = 'overview';
  if (!vault.isUnlocked()) return showLock();
  const my = ++current; if (S.cleanup) { try { S.cleanup(); } catch {} S.cleanup = null; }
  S.view = view; closeModal(); renderNav();
  const main = $('main');
  try { const el = await REG[view](arg); if (my !== current) return; main.replaceChildren(el); }
  catch (e) { if (my === current) main.replaceChildren(h('div', { class: 'banner', id: 'view-error', text: 'This page could not be shown: ' + (e.message || e) })); }
  main.scrollTop = 0; renderSide(); refreshStatus();
}
S.go = go;

function renderNav() {
  const nav = $('sidebar'); nav.replaceChildren(...VIEWS.map(([id, label], i) => h('button', { id: 'nav-' + id, 'aria-current': S.view === id && vault.isUnlocked() ? 'page' : null, onclick: () => go(id) }, label, h('kbd', { text: 'Alt+' + ((i + 1) % 10) }))));
}

// ---------- status bar ----------
async function refreshStatus() {
  let pending = null; if (vault.isUnlocked()) { try { pending = (await vault.allEnc('exports')).filter(e => e.status === 'pending').length; } catch {} }
  S.pendingCount = pending; drawStatus();
}
S.refreshStatus = refreshStatus;
function pill(text, cls, id) { return h('span', { class: 'pill ' + (cls || ''), id }, text); }
function drawStatus(est) {
  const un = vault.isUnlocked(), s = $('status'), e = est || S.est;
  s.replaceChildren(...[
    pill('App ready', 'ok', 'st-app'), pill(navigator.onLine ? 'Online (no uploads)' : 'Offline', navigator.onLine ? '' : 'warn', 'st-net'),
    pill(un ? 'Vault unlocked: AES-256-GCM' : 'Vault locked', un ? 'ok' : 'warn', 'st-enc'),
    pill('Mic: ' + (S.stopRecording ? 'recording' : mic.state), S.stopRecording ? 'rec' : mic.state === 'granted' ? 'ok' : mic.state === 'denied' ? 'bad' : '', 'st-mic'),
    S.gesture.on ? pill('CAMERA ON', 'rec', 'st-cam') : null,
    pill(e ? `Storage ${bytesFmt(e.usage || 0)}${e.quota ? ' / ' + bytesFmt(e.quota) : ''}` : 'Storage n/a', '', 'st-store'),
    pill(un ? `Pending exports: ${S.pendingCount ?? 0}` : 'Pending exports: locked', S.pendingCount ? 'warn' : '', 'st-pend'),
    pill(S.sw === 'cached' ? 'Offline cache ready' : 'Offline cache: ' + S.sw, S.sw === 'cached' ? 'ok' : 'warn', 'st-cache'), pill(new Date().toLocaleTimeString(), '', 'st-time')].filter(Boolean));
}
async function probe() {
  if (navigator.storage?.estimate) { try { S.est = await navigator.storage.estimate(); } catch {} }
  try { const p = await navigator.permissions.query({ name: 'microphone' }); mic.state = p.state; p.onchange = () => { mic.state = p.state; drawStatus(); }; } catch { mic.state = 'unknown'; }
  drawStatus();
}

// ---------- situation panel ----------
async function renderSide() {
  const side = $('side'), un = vault.isUnlocked(); let rows = [], lv = null, pend = [], runs = [];
  if (un) { try { rows = (await vault.secEvents()).rows.slice(-6).reverse(); lv = await db.get('meta', 'lastVerify'); pend = (await vault.allEnc('exports')).filter(e => e.status === 'pending'); runs = (await vault.allEnc('sop_runs')).filter(r => r.status === 'in-progress'); } catch {} }
  const dev = (ok, t) => h('div', {}, h('span', { class: 'dot ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'warn') }), t);
  side.replaceChildren(
    h('div', { class: 'side-h', text: 'Recent events' }), rows.length ? h('ul', { class: 'feed' }, rows.map(e => h('li', {}, h('time', { text: fmtTime(e.ts) }), e.type))) : h('p', { class: 'muted', text: un ? 'No events yet.' : 'Unlock to see events.' }),
    h('div', { class: 'side-h', text: 'Evidence verification' }), h('p', { class: 'muted', id: 'side-verify', text: lv ? `${lv.ok ? 'Passed' : 'FAILED'} at ${fmtTime(lv.ts)} (package ${lv.packageId.slice(0, 8)})` : 'No package verified yet.' }),
    h('div', { class: 'side-h', text: 'Pending tasks' }), pend.length || runs.length ? h('ul', { class: 'feed' }, pend.map(p => h('li', { text: 'Transfer ' + p.name })), runs.map(r => h('li', { text: 'Finish checklist: ' + r.templateName }))) : h('p', { class: 'muted', text: un ? 'Nothing pending.' : 'Unlock to see tasks.' }),
    h('div', { class: 'side-h', text: 'Device readiness' }), dev(!!navigator.mediaDevices?.getUserMedia ? (mic.state === 'denied' ? false : true) : false, 'Microphone: ' + (navigator.mediaDevices?.getUserMedia ? mic.state : 'API unavailable')), dev(!!navigator.mediaDevices?.getUserMedia, 'Camera API: ' + (navigator.mediaDevices?.getUserMedia ? 'available' : 'unavailable')),
    dev(S.sw === 'cached', 'Offline cache: ' + S.sw), dev(!!(crypto && crypto.subtle), 'Web Crypto: ' + (crypto?.subtle ? 'available' : 'unavailable')), dev(null, 'Clock: device time, unverified'));
}
S.refreshSide = renderSide;

// ---------- lock screen ----------
async function showLock(reason) {
  stopCamera(); closeModal(); if (S.cleanup) { try { S.cleanup(); } catch {} S.cleanup = null; }
  S.view = 'overview'; renderNav(); drawStatus(); const main = $('main'), exists = await vault.exists();
  const p1 = h('input', { type: 'password', id: 'vault-pass', autocomplete: exists ? 'current-password' : 'new-password', 'aria-label': 'Vault passphrase' }), p2 = exists ? null : h('input', { type: 'password', id: 'vault-pass2', autocomplete: 'new-password', placeholder: 'Repeat passphrase', 'aria-label': 'Repeat passphrase' });
  const meter = h('div', { class: 'meter' }, h('i')), hint = h('div', { class: 'muted', id: 'vault-hint' }), err = h('div', { class: 'errtxt', id: 'vault-err' }), btn = h('button', { class: 'primary', id: 'vault-go', text: exists ? 'Unlock' : 'Create vault' });
  p1.addEventListener('input', () => { if (exists) return; const s = strength(p1.value); meter.firstChild.style.width = (s.score + 1) * 20 + '%'; meter.className = 'meter s' + s.score; hint.textContent = `Strength: ${s.label}${s.hints.length ? '. ' + s.hints[0] : ''}`; });
  const submit = async () => {
    err.textContent = ''; btn.disabled = true;
    try {
      if (!exists) { if (p1.value.length < 10 || strength(p1.value).score < 2) throw new Error('Passphrase too weak: use at least 10 characters, ideally 4 unrelated words.'); if (p1.value !== p2.value) throw new Error('The two passphrases do not match.'); btn.textContent = 'Creating...'; await vault.create(p1.value); }
      else { btn.textContent = 'Unlocking...'; await vault.unlock(p1.value); }
      const st = await vault.settings(); vault.setIdle(st.autolockMin); S.sensitivity = st.sensitivity ?? .5; p1.value = ''; if (p2) p2.value = ''; go('overview');
    } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = exists ? 'Unlock' : 'Create vault'; }
  };
  btn.onclick = submit; [p1, p2].forEach(i => i && i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
  main.replaceChildren(h('div', { class: 'lock panel' }, h('h1', { text: exists ? 'Vault locked' : 'Create your vault' }), reason ? h('p', { class: 'muted', id: 'lock-reason', text: 'Locked: ' + reason }) : null,
    h('p', { class: 'sub', text: exists ? 'Enter your passphrase to unlock FIELDLINE.' : 'Your passphrase encrypts everything stored on this device. It is never saved, and it cannot be recovered. If you lose it, the data is lost.' }), p1, p2, exists ? null : meter, exists ? null : hint, err, h('div', { class: 'row' }, btn)));
  p1.focus(); renderSide();
}
vault.setOnLock(r => showLock(r));

// ---------- gestures ----------
S.onGesture = g => {
  if (g === 'hold') { if (S.pending?.allowGesture) S.pending.resolve(true); return; }
  if (g === 'fist') { if (S.pending) { S.pending.resolve(false); return; } if (S.stopRecording) { S.stopRecording(); return; } closeModal(); return; }
  if (S.pending) return; notify('Gesture: ' + g.replace('-', ' '));
  if (g === 'open') go('overview'); else { const i = VIEWS.findIndex(v => v[0] === S.view), d = g === 'swipe-left' ? -1 : 1; go(VIEWS[(i + d + VIEWS.length) % VIEWS.length][0]); }
};
document.addEventListener('keydown', e => { if (e.altKey && /^[0-9]$/.test(e.key)) { e.preventDefault(); const i = (+e.key + 9) % 10; if (VIEWS[i]) go(VIEWS[i][0]); } });
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => vault.touch(), { passive: true }));

// ---------- service worker ----------
async function registerSW() {
  if (!('serviceWorker' in navigator)) { S.sw = 'unsupported'; return; }
  try {
    const reg = await navigator.serviceWorker.register('sw.js'); S.sw = 'installing';
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) notify('An app update is ready. Reload to use it.'); }); });
    await navigator.serviceWorker.ready; const keys = await caches.keys(); S.sw = keys.some(k => k.startsWith('fieldline-')) ? 'cached' : 'not cached'; drawStatus(); renderSide();
  } catch (e) { S.sw = 'failed'; drawStatus(); }
}
window.addEventListener('online', () => { notify('Network connection restored. FIELDLINE still sends nothing.'); drawStatus(); });
window.addEventListener('offline', () => { notify('You are offline. FIELDLINE keeps working.'); drawStatus(); });

renderNav(); drawStatus(); setInterval(() => { const t = $('st-time'); if (t) t.textContent = new Date().toLocaleTimeString(); }, 1000);
probe(); registerSW(); showLock();
