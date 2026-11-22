/**
 * The vault: one storage interface for every kind of Studio data, shaped like a folder.
 * engineering/decisions/2026-11-22-local-first-drive-storage.md §6.2; how it is built: README.md here.
 *
 * Slice 1: the interface, the browser backing (OPFS + IndexedDB `lattice-vault`) and the memory backing.
 * No Studio code calls it yet.
 */
export type { BlobStore, IndexStore, LockMode, Locks, Plan } from './backing';
export { defaultLocks, memoryLocks } from './backing';
export { type BlobWriter, type BrowserVault, browserVaultSupported, openBrowserVault, opfsBlobs, VAULT_ROOT, workerWriter } from './browser';
export { type OpenOptions, openVault, VAULT_LOCK } from './core';
export { idbIndex, VAULT_DB } from './idb-index';
export { memoryBlobs, memoryIndex, openMemoryVault } from './memory';
export type { WritePath } from './opfs-write';
export { isTextPath, kindOf, normalizePath } from './path';
export type { Change, Entry, JournalRecord, Kind, ListOptions, Meta, Op, RecoveryReport, Vault, VaultErrorCode, VaultHandle } from './types';
export { VaultError } from './types';
