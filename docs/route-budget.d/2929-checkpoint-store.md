studio: +2300
Version history moves from localStorage to IndexedDB (checkpoint-store.ts): one record per
checkpoint, read-modify-write transactions, a BroadcastChannel to other tabs, migration of legacy
lists and reported write failures. It loads with studio-store because the Studio reads the boot
deck's versions synchronously on its first render; loading it later would show an empty history.
