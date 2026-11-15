// Translation Centre helpers. No external network by default. Optional LOCAL translation server only (localhost).
import { FieldlineError } from './crypto.js';
export const LANGS = { en: 'English', es: 'Spanish', fr: 'French', hi: 'Hindi', de: 'German', ar: 'Arabic', bn: 'Bengali', ja: 'Japanese' };
export const GLOSSARY_NOTE = 'Bundled phrase glossary, not a translation engine. Have a qualified speaker verify critical wording.';
export const GLOSSARY = [
  { en: 'Stop', es: 'Alto', fr: 'Arrêtez', hi: 'रुकिए' },
  { en: 'Help is needed', es: 'Se necesita ayuda', fr: 'De l\u2019aide est nécessaire', hi: 'मदद की ज़रूरत है' },
  { en: 'Medical emergency', es: 'Emergencia médica', fr: 'Urgence médicale', hi: 'चिकित्सा आपातकाल' },
  { en: 'Fire', es: 'Fuego', fr: 'Feu', hi: 'आग' },
  { en: 'Is anyone injured?', es: '¿Hay alguien herido?', fr: 'Y a-t-il des blessés ?', hi: 'क्या कोई घायल है?' },
  { en: 'Stay calm', es: 'Mantenga la calma', fr: 'Restez calme', hi: 'शांत रहिए' },
  { en: 'Move away from the area', es: 'Aléjese de la zona', fr: 'Éloignez-vous de la zone', hi: 'इस क्षेत्र से दूर हटिए' },
  { en: 'The equipment is not safe', es: 'El equipo no es seguro', fr: 'L\u2019équipement n\u2019est pas sûr', hi: 'उपकरण सुरक्षित नहीं है' }
];
export function checkEndpoint(u) {
  let x; try { x = new URL(u); } catch { throw new FieldlineError('BAD_ENDPOINT', 'Not a valid URL'); }
  if (x.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)) throw new FieldlineError('BAD_ENDPOINT', 'Only http://localhost or http://127.0.0.1 servers are allowed');
  return x.origin;
}
// Expects a LibreTranslate-compatible local server: POST /translate {q,source,target,format}
export async function localTranslate(text, src, tgt, endpoint) {
  const origin = checkEndpoint(endpoint), ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(origin + '/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, source: src, target: tgt, format: 'text' }), signal: ac.signal });
    if (!r.ok) throw new FieldlineError('TRANSLATE_FAILED', 'Local server answered ' + r.status);
    const j = await r.json(); if (typeof j.translatedText !== 'string') throw new FieldlineError('TRANSLATE_FAILED', 'Unexpected reply'); return j.translatedText;
  } catch (e) { throw e instanceof FieldlineError ? e : new FieldlineError('TRANSLATE_FAILED', 'Local translation server unreachable'); } finally { clearTimeout(t); }
}
export function dictationSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
// Browser speech recognition may send audio to the browser vendor's servers. The UI requires explicit consent before this is called.
export function startDictation(lang, onFinal, onPart, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) throw new FieldlineError('NO_SPEECH', 'Speech recognition not supported in this browser');
  const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = lang;
  r.onresult = e => { let part = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) onFinal(t); else part += t; } onPart(part); };
  r.onend = onEnd; r.onerror = e => onEnd(e.error); r.start(); return () => { try { r.stop(); } catch {} };
}
export function reportFromNotes(f) {
  const v = k => (f[k] || '').trim() || '(not recorded)';
  return ['INCIDENT REPORT (generated from entered notes, not from any inference)', `What happened: ${v('what')}`, `When (as stated): ${v('when')}`, `Where: ${v('where')}`, `People involved: ${v('who')}`, `Equipment involved: ${v('equipment')}`, `Actions taken: ${v('actions')}`, `Open issues: ${v('open')}`].join('\n');
}
