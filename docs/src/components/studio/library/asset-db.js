// The Workbench library's IndexedDB CONNECTION — the database, its schema, and the
// two primitives every store module on top of it needs.
//
// WHY THIS IS ITS OWN FILE. It used to live in `asset-store.js`, and `asset-history.js`
// imported `openDB` / `reqAsPromise` / `HISTORY_STORE` from there. That was fine while
// the dependency ran one way. It stopped being fine when `putAsset` and `deleteAsset`
// took on history themselves (see asset-store.js): the store needs the history module
// and the history module needed the store, which is a cycle. ESM would have tolerated
// it — both uses are at call time, not at module-evaluation time — but a cycle between
// two modules that persist the same user data is the wrong thing to rely on a bundler's
// good behavior for. Splitting the connection out gives a plain DAG instead:
//
//     asset-db.js  ←  asset-history.js  ←  asset-store.js
//            ↖________________________________/
//
// ONE DATABASE MEANS ONE UPGRADE HANDLER, and that is the reason this cut is here
// rather than anywhere else. Every store the database will ever hold is created in the
// single `onupgradeneeded` below, even though each consumer reads only its own — a
// second module calling `indexedDB.open` with its own version is how you get a
// VersionError on whichever tab opened first. Keeping the handler in the connection
// module makes that structural: neither consumer *can* open its own.

const DB_NAME = 'lattice-workbench';
// v2 adds `assetHistory` (asset-history.js).
const DB_VERSION = 2;
export const ASSET_STORE = 'assets';
export const HISTORY_STORE = 'assetHistory';

// Memoized at module scope: every consumer awaits the SAME open. The upgrade test
// (asset-store-upgrade.test.ts) dynamic-imports its modules for exactly this reason —
// it has to seed a v1 database before this promise is created.
let dbPromise = null;
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable (private mode?)'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // Guards, not an `if (oldVersion < N)` ladder: a browser that never saw v1
    // runs this once with both stores missing, and one upgrading from v1 runs it
    // with `assets` already present. Both paths must land on the same schema.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        const os = db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
        os.createIndex('kind', 'kind', { unique: false });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const os = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        os.createIndex('assetId', 'assetId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
