// Checklist engine. Built-in templates are GENERIC examples, not official procedures of any organisation.
import { FieldlineError } from './crypto.js';
export const GENERIC_NOTE = 'Generic template, not an official SOP. Replace it with your organisation\u2019s approved procedure before relying on it.';
const T = (id, name, category, steps) => ({ id, name, category, version: 1, source: 'built-in', note: GENERIC_NOTE, steps: steps.map((t, i) => ({ id: 's' + (i + 1), text: t, category })) });
export const BUILTIN = [
  T('b-equip', 'Equipment inspection', 'Equipment', ['Record equipment identifier and location', 'Inspect housing and casing for visible damage', 'Check cables, connectors and mounts for wear', 'Verify power source or battery condition', 'Run the manufacturer self-test where available', 'Record any fault, abnormal noise or odour', 'Tag equipment as serviceable or unserviceable']),
  T('b-comms', 'Communication-system readiness', 'Communications', ['Confirm batteries or power supply are charged', 'Check antennas and cables are connected and undamaged', 'Perform a local audio and signal check', 'Confirm agreed channels and fallback method', 'Record check result and time']),
  T('b-safety', 'Safety inspection', 'Safety', ['Identify hazards in the work area', 'Confirm protective equipment is available and in date', 'Confirm emergency exits and first-aid supplies are accessible', 'Confirm the communication route for emergencies', 'Record hazards that remain open']),
  T('b-incident', 'Emergency incident documentation', 'Incident', ['Record date, time and place as observed', 'Record people involved and their reported condition', 'Describe what happened in plain, factual language', 'Record actions taken and who took them', 'Capture photographs or audio where safe and permitted', 'Record who was informed and when', 'Note anything uncertain or unverified']),
  T('b-device', 'Device preparation', 'Devices', ['Charge the device and carry a spare power source', 'Confirm storage space is sufficient', 'Confirm the offline application loads without a network', 'Check microphone and camera permissions are as intended', 'Create a fresh backup of local data', 'Lock the session before transport']),
  T('b-maint', 'Maintenance reporting', 'Maintenance', ['Record equipment identifier and reported problem', 'Record work performed and parts used', 'Record tests carried out after the work', 'Record outstanding work or follow-up needed', 'Sign off with name and date'])
];
export function validateTemplate(t) {
  const bad = m => { throw new FieldlineError('BAD_TEMPLATE', m); };
  if (!t || typeof t !== 'object') bad('Not a template');
  if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 120) bad('Template name missing or too long');
  if (!Array.isArray(t.steps) || !t.steps.length || t.steps.length > 200) bad('Template needs 1 to 200 steps');
  const steps = t.steps.map((s, i) => { const text = typeof s === 'string' ? s : s?.text; if (typeof text !== 'string' || !text.trim() || text.length > 500) bad('Step ' + (i + 1) + ' invalid'); return { id: 's' + (i + 1), text: text.trim(), category: String((typeof s === 'object' && s.category) || t.category || 'General').slice(0, 40) }; });
  return { name: t.name.trim(), category: String(t.category || 'General').slice(0, 40), version: Number.isInteger(t.version) && t.version > 0 ? t.version : 1, steps };
}
export function newRun(tpl, now = Date.now()) {
  return { id: crypto.randomUUID(), templateId: tpl.id, templateName: tpl.name, templateVersion: tpl.version, templateSource: tpl.source, steps: tpl.steps, startedAt: now, updated: now, status: 'in-progress', items: Object.fromEntries(tpl.steps.map(s => [s.id, { state: 'pending', note: '', ts: null }])) };
}
export function setItem(run, stepId, patch, now = Date.now()) {
  if (!run.items[stepId]) throw new FieldlineError('NO_STEP'); run.items[stepId] = { ...run.items[stepId], ...patch, ts: now }; run.updated = now; return run;
}
export function progress(run) { const v = Object.values(run.items), c = k => v.filter(i => i.state === k).length; return { total: v.length, done: c('done'), incomplete: c('incomplete'), skipped: c('skipped'), pending: c('pending') }; }
export function reportText(run) {
  const p = progress(run), d = t => t ? new Date(t).toISOString() : 'n/a';
  const lines = [`FIELDLINE CHECKLIST COMPLETION REPORT`, `Checklist: ${run.templateName} (version ${run.templateVersion}, ${run.templateSource})`, `Started (device clock): ${d(run.startedAt)}`, `Last updated (device clock): ${d(run.updated)}`, `Status: ${run.status}`, `Done ${p.done} / ${p.total}; incomplete ${p.incomplete}; skipped ${p.skipped}; pending ${p.pending}`, ''];
  run.steps.forEach((s, i) => { const it = run.items[s.id]; lines.push(`${i + 1}. [${it.state.toUpperCase()}] ${s.text}${it.note ? '\n     Note: ' + it.note : ''}`); });
  lines.push('', 'Timestamps are from the device clock and are not independently verified.'); return lines.join('\n');
}
