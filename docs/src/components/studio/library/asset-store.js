// The Workbench library — a small IndexedDB asset store (the persistence rail
// the two studios save into). The first concrete slice of the asset model from
// 2026-06-09-drawing-board-asset-import.md: library-scoped records of
// kind:'theme' | 'component', so a crafted theme or component survives a reload
// and can be loaded back for editing.
//
// DELIBERATELY its own database (`lattice-workbench`), separate from the Drawing
// Board's `lattice-db`: the Drawing Board store owns its own schema/version, and
// a first asset slice shouldn't risk a cross-page migration. Unifying the two
// (so the Drawing Board's palette picker reads library themes, and deck export
// materializes assets across all three render paths) is the next slice — the
// export bridge — and gets its own design pass. Record SHAPES are the pure,
// unit-tested repo core (themeAsset in lib/theme/serialize, componentAsset in
// lib/layout/scaffold); this module only persists them.

const DB_NAME = 'lattice-workbench';
const DB_VERSION = 1;
const STORE = 'assets';

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable (private mode?)'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('kind', 'kind', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}
function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** A stable-ish id when a record doesn't carry one. */
function newId(prefix = 'a') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Insert or update an asset record. A record without an `id` gets one; a record
 * whose (kind, name) already exists is UPDATED in place (re-saving a theme you
 * tweaked replaces it rather than piling up duplicates). Returns the stored
 * record.
 */
export async function putAsset(record) {
  const db = await openDB();
  let toStore = record;
  if (!toStore.id) {
    const existing = (await listAssets(record.kind)).find(a => a.name === record.name);
    toStore = { ...record, id: existing ? existing.id : newId({ theme: 't', component: 'c', finish: 'f', refdoc: 'd' }[record.kind] || 'a') };
  }
  await reqAsPromise(tx(db, 'readwrite').put(toStore));
  return toStore;
}

/** All assets, newest first; optionally filtered to one kind. */
export async function listAssets(kind) {
  const db = await openDB();
  const all = await reqAsPromise(tx(db, 'readonly').getAll());
  const rows = kind ? all.filter(a => a.kind === kind) : all;
  return rows.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/** One asset by id (or undefined). */
export async function getAsset(id) {
  const db = await openDB();
  return reqAsPromise(tx(db, 'readonly').get(id));
}

/** Delete an asset by id. */
export async function deleteAsset(id) {
  const db = await openDB();
  await reqAsPromise(tx(db, 'readwrite').delete(id));
}
