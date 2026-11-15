// Command Overview, Incident Management and Evidence Vault.
import { S } from './state.js';
import * as vault from './vault.js';
import * as db from './db.js';
import { h, notify, fmtTime, bytesFmt, download, readFile, confirmDialog, askPassphrase, bars, section, field, empty } from './ui.js';
import { sha256 } from './crypto.js';
import { appendEvent, verifyChain } from './chain.js';
import { buildPackage, openPackage, inspect, LIMITS, TIME_WARNING } from './pkg.js';
import { assessPhoto, meanRgbLuminance } from './camera-evidence.js';

export const CATEGORIES = ['Equipment fault', 'Safety', 'Communications', 'Medical', 'Logistics', 'Maintenance', 'Other'];
export const MAX_ATTACH = 25 * 1024 * 1024;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'incident';
const errMsg = e => (e && e.message) || String(e);

export async function attachBytes(incidentId, { name, type, bytes, source }) {
  if (bytes.length > MAX_ATTACH) throw new Error(`${name} is ${bytesFmt(bytes.length)}; the per-attachment limit is ${bytesFmt(MAX_ATTACH)}`);
  const rec = await vault.getEnc('incidents', incidentId); if (!rec) throw new Error('Incident not found');
  if (rec.attachments.length >= LIMITS.attachments) throw new Error('Too many attachments on this incident');
  const hash = await sha256(bytes), id = crypto.randomUUID();
  await vault.putBytes('attachments', id, bytes);
  rec.attachments.push({ id, name: String(name).slice(0, 120), type: type || 'application/octet-stream', size: bytes.length, sha256: hash, source: { ...source, addedAt: Date.now() } });
  rec.events = await appendEvent(rec.events, { type: 'attachment-added', text: `Added ${name} (${bytesFmt(bytes.length)})`, refs: [hash] });
  await vault.putEnc('incidents', incidentId, rec); return rec;
}
export function reportView(r) {
  return h('div', {}, h('div', { class: 'row' }, h('span', { class: 'tag ' + (r.ok ? 'ok' : 'bad'), id: 'verify-verdict', text: r.ok ? 'INTEGRITY VERIFIED' : 'INTEGRITY CHECK FAILED' })),
    r.checks.map(c => h('div', { class: 'check ' + (c.ok ? 'ok' : 'bad') }, h('span', { text: c.name + (c.detail ? ': ' + c.detail : '') }))),
    r.warnings.map(w => h('div', { class: 'banner', text: w })));
}

export async function overview() {
  const [inc, exps, runs, ev, sec, atts] = await Promise.all([vault.allEnc('incidents'), vault.allEnc('exports'), vault.allEnc('sop_runs'), db.count('imports'), vault.secEvents(), db.count('attachments')]);
  const cat = CATEGORIES.map(c => inc.filter(i => i.category === c).length), canvas = h('canvas', { id: 'chart-cat', 'aria-label': 'Incidents by category' });
  const el = h('div', {}, h('h1', { text: 'Command Overview' }), h('p', { class: 'sub', text: 'Live summary of what is stored on this device. Every figure is read from local storage.' }),
    h('div', { class: 'grid' },
      [['Incidents', inc.length], ['Packages exported', exps.length], ['Pending transfer', exps.filter(e => e.status === 'pending').length], ['Packages imported', ev], ['Checklists in progress', runs.filter(r => r.status === 'in-progress').length], ['Stored attachments', atts - exps.length]].map(([l, v]) => h('div', { class: 'tile' }, h('b', { text: String(Math.max(0, v)) }), h('span', { text: l })))),
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'qa-new', onclick: () => S.go('incidents', 'new'), text: 'New incident' }), h('button', { onclick: () => S.go('signal'), text: 'Open audio lab' }), h('button', { onclick: () => S.go('sop'), text: 'Start a checklist' }), h('button', { onclick: () => S.go('evidence'), text: 'Verify or import a package' })),
    h('div', { class: 'cols' },
      section('Incidents by category', inc.length ? canvas : empty('No incidents recorded yet. Create one to see this chart.')),
      section('Activity feed', sec.rows.length ? h('ul', { class: 'feed' }, sec.rows.slice(-8).reverse().map(e => h('li', {}, h('time', { text: fmtTime(e.ts) }), `${e.type}${e.text ? ': ' + e.text : ''}`))) : empty('No activity yet.'))));
  setTimeout(() => { if (inc.length) bars(canvas, CATEGORIES.map(c => c.split(' ')[0].slice(0, 7)), cat); }, 0);
  return el;
}

function incidentForm() {
  const f = { title: h('input', { id: 'f-title', maxlength: 120, placeholder: 'Short factual title' }), cat: h('select', { id: 'f-cat' }, CATEGORIES.map(c => h('option', { text: c }))), tags: h('input', { id: 'f-tags', placeholder: 'comma, separated, tags' }), eq: h('input', { id: 'f-eq', maxlength: 200, placeholder: 'Equipment identifier or description' }), rep: h('textarea', { id: 'f-rep', maxlength: 5000, placeholder: 'Describe what was observed, in plain factual language' }) }, err = h('div', { class: 'errtxt', id: 'f-err' });
  const save = async () => {
    const title = f.title.value.trim(), tags = f.tags.value.split(',').map(t => t.trim()).filter(Boolean);
    if (title.length < 3) { err.textContent = 'Title must be at least 3 characters.'; return; }
    if (tags.length > 10 || tags.some(t => t.length > 30)) { err.textContent = 'Use at most 10 tags of 30 characters or fewer.'; return; }
    const rec = { id: crypto.randomUUID(), title, category: f.cat.value, tags, equipment: f.eq.value.trim(), report: f.rep.value.trim(), created: Date.now(), events: [], attachments: [], imported: null };
    rec.events = await appendEvent([], { type: 'created', text: 'Incident created on this device' });
    await vault.putEnc('incidents', rec.id, rec); await vault.secLog('incident-created', rec.id); notify('Incident saved (encrypted)', 'ok'); S.go('incidents', rec.id);
  };
  return h('div', {}, h('h1', { text: 'New incident' }), section('Details', field('Title', f.title), field('Category', f.cat), field('Tags', f.tags), field('Equipment information', f.eq), field('Description', f.rep), err,
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'f-save', onclick: () => save().catch(e => { err.textContent = errMsg(e); }), text: 'Save incident' }), h('button', { class: 'ghost', onclick: () => S.go('incidents'), text: 'Cancel' }))));
}
async function exportIncident(rec) {
  const pass = await askPassphrase({ title: 'Encrypt evidence package', text: 'Choose a passphrase for this package. Whoever opens it needs this passphrase. It is not stored anywhere.', confirm: true, enforce: true, okText: 'Encrypt and export' });
  if (!pass) return; notify('Encrypting package. This takes a moment.');
  try {
    const atts = []; for (const a of rec.attachments) atts.push({ name: a.name, type: a.type, bytes: await vault.getBytes('attachments', a.id), source: a.source });
    const incident = { id: rec.id, title: rec.title, category: rec.category, tags: rec.tags, equipment: rec.equipment, report: rec.report, created: rec.created, imported: rec.imported };
    const p = await buildPackage({ incident, events: rec.events, attachments: atts, passphrase: pass }), name = `fieldline-${slug(rec.title)}-${p.packageId.slice(0, 8)}.flpkg`;
    await vault.putBytes('attachments', 'pkg:' + p.packageId, p.bytes);
    await vault.putEnc('exports', p.packageId, { id: p.packageId, incidentId: rec.id, title: rec.title, name, size: p.bytes.length, created: Date.now(), status: 'pending', attachments: atts.length });
    await vault.secLog('export-created', p.packageId); download(p.bytes, name); notify(`Exported ${name} (${bytesFmt(p.bytes.length)}). It is also queued under Evidence Vault.`, 'ok'); S.refreshStatus();
  } catch (e) { notify('Export failed: ' + errMsg(e), 'err'); }
}
async function incidentDetail(id) {
  let rec = await vault.getEnc('incidents', id); if (!rec) return h('div', {}, h('h1', { text: 'Incident not found' }), h('button', { onclick: () => S.go('incidents'), text: 'Back to incidents' }));
  const chain = await verifyChain(rec.events), rep = h('textarea', { id: 'd-rep', maxlength: 5000, value: rec.report }), evType = h('select', { id: 'ev-type' }, ['note', 'observation', 'action', 'communication'].map(t => h('option', { text: t }))), evText = h('input', { id: 'ev-text', maxlength: 500, placeholder: 'What happened or what was done' });
  const reload = () => S.go('incidents', id);
  const addFiles = async (input, method) => { const files = [...input.files]; input.value = ''; for (const f of files) { try { const bytes = await readFile(f, MAX_ATTACH); await attachBytes(id, { name: f.name, type: f.type, bytes, source: { method, lastModified: f.lastModified || null } }); notify('Attached ' + f.name, 'ok'); } catch (e) { notify(errMsg(e), 'err'); } } reload(); };
  const fileIn = h('input', { type: 'file', id: 'att-file', multiple: true, accept: 'image/*,audio/*,.wav,.pdf,.txt', onchange: () => addFiles(fileIn, 'file-picker') });
  const photoPurpose = h('select', { id: 'photo-purpose' }, ['Equipment condition', 'Safety hazard', 'Scene context', 'Other documentation'].map(x => h('option', { text: x })));
  const photoNotes = h('textarea', { id: 'photo-notes', maxlength: 500, placeholder: 'Describe only what you can observe; avoid names or identity details.' });
  const photoPrivacy = h('input', { id: 'photo-privacy-review', type: 'checkbox' });
  const photoQuality = h('div', { id: 'photo-quality', class: 'muted', role: 'status', text: 'Choose a purpose and review privacy before attaching a photo.' });
  const photoIn = h('input', { type: 'file', id: 'att-photo', accept: 'image/*', capture: 'environment' });
  photoIn.onchange = async () => {
    const f = photoIn.files?.[0]; photoIn.value = ''; if (!f) return;
    try {
      const bytes = await readFile(f, MAX_ATTACH), bitmap = await createImageBitmap(f);
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, c.width, c.height); const meanLuminance = meanRgbLuminance(ctx.getImageData(0, 0, c.width, c.height).data);
      const quality = assessPhoto({ width: bitmap.width, height: bitmap.height, meanLuminance }); bitmap.close?.();
      photoQuality.textContent = `${quality.width}×${quality.height}; mean brightness ${quality.meanLuminance}/255. ${quality.warnings.length ? quality.warnings.join(' ') : 'No basic lighting or resolution warning.'}`;
      if (!photoPrivacy.checked) { photoQuality.textContent = 'Photo not attached. Review the image for bystanders or sensitive details, then confirm the privacy check.'; return; }
      if (!photoNotes.value.trim()) { photoQuality.textContent = 'Photo not attached. Add a short factual condition or scene note first.'; return; }
      await attachBytes(id, { name: f.name, type: f.type || 'application/octet-stream', bytes, source: {
        method: 'guided-photo-capture', purpose: photoPurpose.value, note: photoNotes.value.trim(),
        privacyReview: 'operator-confirmed-no-unreviewed-bystander-or-sensitive-detail',
        capturedAtDeviceTime: Date.now(), width: quality.width, height: quality.height,
        meanLuminance: quality.meanLuminance, qualityWarnings: quality.warnings, lastModified: f.lastModified || null
      } });
      notify('Photo attached with quality and review metadata', 'ok'); reload();
    } catch (e) { photoQuality.textContent = 'Photo could not be checked or attached: ' + errMsg(e); notify(errMsg(e), 'err'); }
  };
  const attRows = rec.attachments.map(a => h('tr', {}, h('td', { text: a.name }), h('td', { text: bytesFmt(a.size) }), h('td', {}, h('code', { text: a.sha256.slice(0, 16) + '…' })), h('td', { text: [a.source?.method, a.source?.purpose, a.source?.note, ...(a.source?.qualityWarnings || [])].filter(Boolean).join(' · ') }),
    h('td', {}, h('button', { class: 'ghost', onclick: async () => { try { download(await vault.getBytes('attachments', a.id), a.name, a.type); } catch (e) { notify(errMsg(e), 'err'); } }, text: 'Download' }))));
  return h('div', {}, h('div', { class: 'row' }, h('button', { class: 'ghost', onclick: () => S.go('incidents'), text: '\u2190 All incidents' })), h('h1', { id: 'inc-title', text: rec.title }),
    h('p', { class: 'sub' }, h('span', { class: 'tag', text: rec.category }), rec.tags.map(t => h('span', { class: 'tag', text: t })), rec.equipment ? ' Equipment: ' + rec.equipment : '', rec.imported ? h('span', { class: 'tag warn', text: 'imported from package ' + rec.imported.packageId.slice(0, 8) }) : null),
    h('div', { class: 'banner', text: TIME_WARNING }),
    h('div', { class: 'cols' },
      section('Report', rep, h('div', { class: 'row' }, h('button', { class: 'primary', id: 'd-save', onclick: async () => { const t = rep.value.trim(); if (t === rec.report) return notify('No changes to save'); rec.report = t; rec.events = await appendEvent(rec.events, { type: 'report-updated', text: `Report updated (${t.length} characters)`, refs: [await sha256(new TextEncoder().encode(t))] }); await vault.putEnc('incidents', id, rec); notify('Report saved', 'ok'); reload(); }, text: 'Save report' }))),
      section('Add to timeline', field('Type', evType), field('Entry', evText), h('button', { id: 'ev-add', onclick: async () => { const t = evText.value.trim(); if (!t) return notify('Enter some text for the timeline entry', 'err'); rec.events = await appendEvent(rec.events, { type: evType.value, text: t }); await vault.putEnc('incidents', id, rec); reload(); }, text: 'Add entry' }))),
    section('Timeline', h('div', { class: 'row' }, h('span', { class: 'tag ' + (chain.ok ? 'ok' : 'bad'), id: 'chain-badge', text: chain.ok ? `hash chain intact (${rec.events.length} events)` : `chain broken at event ${chain.breakAt}` }), h('small', { text: 'A hash chain is tamper-evident, not tamper-proof: someone controlling this device could rebuild it.' })),
      h('table', {}, h('thead', {}, h('tr', {}, ['#', 'Device time', 'Type', 'Entry', 'Hash'].map(t => h('th', { text: t })))), h('tbody', { id: 'timeline' }, rec.events.map(e => h('tr', {}, h('td', { text: String(e.seq) }), h('td', { text: fmtTime(e.ts) }), h('td', { text: e.type }), h('td', { text: e.text }), h('td', {}, h('code', { text: e.hash.slice(0, 10) }))))))),
    section('Attachments', rec.attachments.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Name', 'Size', 'SHA-256', 'Source', ''].map(t => h('th', { text: t })))), h('tbody', { id: 'atts' }, attRows)) : empty('No attachments yet.'),
      field('Attach files (photos, audio, documents; max 25 MB each)', fileIn),
      section('Guided camera evidence', h('p', { class: 'muted', text: 'Capture stays on this device. FIELDLINE checks image dimensions and average brightness, then stores the original bytes with a SHA-256 hash. It does not blur bystanders automatically; inspect the photo and redact externally before attaching if needed.' }), field('Photo purpose', photoPurpose), field('Observed condition or context', photoNotes), field('Privacy review', h('label', { class: 'row' }, photoPrivacy, 'I reviewed this image and handled visible bystanders or sensitive details appropriately.')), photoIn, photoQuality)),
    section('Evidence package', h('p', { class: 'muted', text: 'Creates an encrypted .flpkg file with a manifest, attachment hashes and the hash-chained timeline.' }), h('div', { class: 'row' }, h('button', { class: 'primary', id: 'd-export', onclick: () => exportIncident(rec), text: 'Encrypt and export package' }), h('button', { class: 'danger', id: 'd-delete', onclick: async () => { if (!(await confirmDialog({ title: 'Delete incident?', text: 'This permanently deletes the incident and its attachments from this device. Exported packages are not affected.', confirmText: 'Delete permanently', danger: true }))) return; for (const a of rec.attachments) await db.del('attachments', a.id); await db.del('incidents', id); await vault.secLog('incident-deleted', id); notify('Incident deleted'); S.go('incidents'); }, text: 'Delete incident' }))));
}
export async function incidents(arg) {
  if (arg === 'new') return incidentForm(); if (arg) return incidentDetail(arg);
  const list = (await vault.allEnc('incidents')).sort((a, b) => b.created - a.created);
  return h('div', {}, h('h1', { text: 'Incident Management' }), h('p', { class: 'sub', text: 'Create and maintain incident records. Everything is encrypted before it is written to this device.' }),
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'inc-new', onclick: () => S.go('incidents', 'new'), text: 'New incident' })),
    list.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Title', 'Category', 'Events', 'Attachments', 'Created'].map(t => h('th', { text: t })))), h('tbody', { id: 'inc-list' }, list.map(i => h('tr', { class: 'click', tabindex: 0, onclick: () => S.go('incidents', i.id), onkeydown: e => { if (e.key === 'Enter') S.go('incidents', i.id); } }, h('td', { text: i.title }), h('td', { text: i.category }), h('td', { text: String(i.events.length) }), h('td', { text: String(i.attachments.length) }), h('td', { text: fmtTime(i.created) }))))) : empty('No incidents yet. Press New incident to create the first one.'));
}

// ---------- Evidence Vault ----------
async function isDuplicate(id) { return (await db.get('imports', id)) || (await db.get('exports', id)); }
async function importResult(res, bytesHash) {
  const m = res.manifest, id = crypto.randomUUID(), attachments = [];
  for (const a of res.attachments) { const aid = crypto.randomUUID(); await vault.putBytes('attachments', aid, a.bytes); attachments.push({ id: aid, name: a.name, type: a.type, size: a.size, sha256: a.sha256, source: a.source }); }
  const events = await appendEvent(m.events, { type: 'imported', text: `Imported from package ${m.packageId}`, refs: [bytesHash] });
  const inc = { ...m.incident, id, events, attachments, imported: { packageId: m.packageId, importedAt: Date.now(), sourceCreatedAt: m.createdAt } };
  await vault.putEnc('incidents', id, inc); await db.put('imports', { id: m.packageId, ts: Date.now() }); await vault.secLog('package-imported', m.packageId); return id;
}
export async function evidence() {
  const out = h('div', { id: 'verify-out' }), file = h('input', { type: 'file', id: 'pkg-file', accept: '.flpkg,application/octet-stream' });
  const run = async mode => {
    out.replaceChildren(); const f = file.files[0]; if (!f) { out.append(h('div', { class: 'errtxt', text: 'Choose a .flpkg file first.' })); return; }
    try {
      const bytes = await readFile(f, LIMITS.file), { header } = inspect(bytes);
      if (mode === 'import' && await isDuplicate(header.id)) { await vault.secLog('import-rejected', 'duplicate ' + header.id); out.append(h('div', { class: 'banner', id: 'dup-msg', text: `Duplicate: package ${header.id} is already in this vault (imported earlier or exported from here). Nothing was imported.` })); return; }
      const pass = await askPassphrase({ title: 'Package passphrase', text: 'Enter the passphrase this package was encrypted with.' }); if (!pass) return;
      out.append(h('p', { class: 'muted', text: 'Verifying. Deriving the key takes a moment.' }));
      const res = await openPackage(bytes, pass); out.replaceChildren(reportView(res.report), h('p', { class: 'muted', text: `Package ${res.manifest.packageId} created ${fmtTime(res.manifest.createdAt)} (device clock of the creator). Incident: ${res.manifest.incident.title}. ${res.attachments.length} attachment(s), ${res.manifest.events.length} event(s).` }));
      await db.put('meta', { id: 'lastVerify', ts: Date.now(), packageId: res.manifest.packageId, ok: res.report.ok }); await vault.secLog(res.report.ok ? 'package-verified' : 'package-failed', res.manifest.packageId); S.refreshSide();
      if (mode === 'import') { if (!res.report.ok) { out.append(h('div', { class: 'banner', text: 'Import refused because integrity checks failed.' })); return; } const hash = await sha256(bytes), nid = await importResult(res, hash); out.append(h('div', { class: 'row' }, h('span', { class: 'tag ok', id: 'import-ok', text: 'Imported as a new incident' }), h('button', { class: 'primary', onclick: () => S.go('incidents', nid), text: 'Open incident' }))); S.refreshSide(); S.refreshStatus(); }
    } catch (e) { await vault.secLog('package-rejected', e.code || 'error'); out.replaceChildren(h('div', { class: 'banner', id: 'reject-msg', text: 'Rejected: ' + errMsg(e) })); S.refreshSide(); }
  };
  const exps = (await vault.allEnc('exports')).sort((a, b) => b.created - a.created), imps = (await db.all('imports')).sort((a, b) => b.ts - a.ts);
  return h('div', {}, h('h1', { text: 'Evidence Vault' }), h('p', { class: 'sub', text: 'Verify, import and queue encrypted evidence packages. Nothing is uploaded: transfer files yourself.' }),
    section('Verify or import a package', file, h('div', { class: 'row' }, h('button', { id: 'pkg-verify', onclick: () => run('verify'), text: 'Verify only' }), h('button', { class: 'primary', id: 'pkg-import', onclick: () => run('import'), text: 'Verify and import' })), out),
    section('Export queue (for manual transfer)', exps.length ? h('table', {}, h('thead', {}, h('tr', {}, ['File', 'Incident', 'Size', 'Created', 'Status', ''].map(t => h('th', { text: t })))), h('tbody', { id: 'exp-list' }, exps.map(e => h('tr', {}, h('td', { text: e.name }), h('td', { text: e.title }), h('td', { text: bytesFmt(e.size) }), h('td', { text: fmtTime(e.created) }), h('td', {}, h('span', { class: 'tag ' + (e.status === 'pending' ? 'warn' : 'ok'), text: e.status })),
      h('td', {}, h('button', { class: 'ghost', onclick: async () => { download(await vault.getBytes('attachments', 'pkg:' + e.id), e.name); }, text: 'Download' }), h('button', { class: 'ghost', onclick: async () => { e.status = e.status === 'pending' ? 'transferred' : 'pending'; await vault.putEnc('exports', e.id, e); S.go('evidence'); S.refreshStatus(); }, text: e.status === 'pending' ? 'Mark transferred' : 'Mark pending' }),
        h('button', { class: 'ghost', onclick: async () => { if (!(await confirmDialog({ title: 'Remove from queue?', text: 'The stored copy of this package is deleted from this device. Files you already downloaded are not affected.', confirmText: 'Remove', danger: true }))) return; await db.del('exports', e.id); await db.del('attachments', 'pkg:' + e.id); S.go('evidence'); S.refreshStatus(); }, text: 'Remove' })))))) : empty('No packages exported yet.')),
    section('Import history', imps.length ? h('ul', { class: 'feed' }, imps.map(i => h('li', {}, h('time', { text: fmtTime(i.ts) }), 'package ' + i.id))) : empty('No packages imported yet.')));
}
