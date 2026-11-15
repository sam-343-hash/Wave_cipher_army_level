// IndexedDB access. Sensitive stores hold only AES-GCM ciphertext (see vault.js).
const NAME = 'fieldline', VER = 1;
export const STORES = ['meta', 'incidents', 'attachments', 'sop_templates', 'sop_runs', 'secevents', 'imports', 'exports', 'training'];
let dbp = null;
export function openDB() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => { const t = db.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
}
export const put = (s, v) => tx(s, 'readwrite', st => st.put(v));
export const get = (s, id) => tx(s, 'readonly', st => st.get(id));
export const all = s => tx(s, 'readonly', st => st.getAll());
export const del = (s, id) => tx(s, 'readwrite', st => st.delete(id));
export const clear = s => tx(s, 'readwrite', st => st.clear());
export const count = s => tx(s, 'readonly', st => st.count());
export async function wipeAll() {
  const db = await openDB(); db.close(); dbp = null;
  await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(NAME); r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res(); });
}
export async function dumpAll() { const o = {}; for (const s of STORES) o[s] = await all(s); return o; }
export async function restoreAll(data) { for (const s of STORES) { await clear(s); for (const row of (data[s] || [])) await put(s, row); } }
