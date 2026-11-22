# Vault

**One storage interface for every kind of Studio data, shaped like a folder.**

Design: `engineering/decisions/2026-11-22-local-first-drive-storage.md` §6.2 and §6.4. Slice 1, as built:
`engineering/decisions/2026-11-22-vault-slice-1-as-built.md`. **No Studio code calls this yet**; slices 2
and 3 move assets and decks into it.

## The interface

```ts
const vault = await openBrowserVault();              // or openMemoryVault() in a test
await vault.write('Decks/Q3 review.md', text);       // → Entry { path, id, kind, bytes, sha256, mtime, revision }
const blob = await vault.read('Decks/Q3 review.md'); // a file-backed Blob in the browser
await vault.list('Decks', { recursive: true });
await vault.move('Decks/Q3 review.md', 'Decks/Q3 final.md'); // keeps the id
await vault.remove('Decks/Q3 final.md');             // leaves a tombstone, so sync can carry the delete
const off = vault.watch((changes) => {});            // this tab's changes and other tabs'
```

| Call | Does |
|---|---|
| `write(path, data, { kind?, baseRevision? })` | Stores the bytes and returns the entry. Rewriting identical bytes is a no-op. `baseRevision` refuses the write (`conflict`) unless the path is at that revision; `0` means it must not exist |
| `read(path)` | The bytes. `not-found` for a missing or removed path, `damaged` for one the startup scan could not verify. In the browser the Blob is file-backed and read lazily: read or copy it before the path changes, because the old bytes are freed then |
| `list(dir, { recursive?, tombstones? })` | Files directly in `dir` (or beneath it), sorted by path. `''` is the root |
| `move(from, to)` | Keeps the id; leaves a tombstone at `from`; refuses (`exists`) when `to` is a live file |
| `remove(path)` | A tombstone, not a delete |
| `watch(fn)` | Every change, with `origin: 'local'` or `'remote'` (another tab, over a BroadcastChannel) |

`openBrowserVault()` and `openMemoryVault()` return a `VaultHandle`, which adds what the sync engine and
tests need: `recovery` (the startup scan's report), `recover()`, `journal(afterSeq)`, `trimJournal(seq)`,
`deviceId()`, `nextSeq()`, `settled()` and `close()`.

**Paths** have one spelling (`normalizePath`): `/`-separated, no leading or trailing slash, NFC, and only
names every desktop file system can hold: no empty, `.` or `..` segment, no control character or
`\<>:"|?*`, no Windows reserved name (`NUL.md`), and no segment ending in a dot or a space. Two paths that
differ only in case are NOT refused yet; the desktop host (slice 10) owns that rule. **Text** (the content
of a `.md`, `.markdown`, `.txt`, `.css`, `.json`, `.csv`, `.tsv` or `.yaml` path, as a string or as bytes)
is stored with LF line endings and no BOM through `normalizeSourceText`, because the vault is a markdown
ingest (`engineering/decisions/2026-08-04-line-endings-lf-boundaries.md`). Every other path is stored as
given, so a string and its bytes always make the same blob.

## How it is built

| File | What it is |
|---|---|
| `types.ts` | The interface, entries, journal records, `VaultError` |
| `backing.ts` | What a host supplies: a `BlobStore` and an `IndexStore`; the lock shape |
| `core.ts` | Every rule above storage: ids, revisions, tombstones, the journal, the change feed, the startup scan |
| `memory.ts` | The memory backing |
| `idb-index.ts` | The browser index: IndexedDB `lattice-vault` (`entries`, `journal`, `meta`) |
| `browser.ts` | The browser backing: OPFS blobs, the worker client, `openBrowserVault()` |
| `opfs.worker.ts` · `opfs-write.ts` | The dedicated worker every browser write goes through, and its write core |
| `desktop-seam.js` | The desktop host's typed seam (slice 10). Returns null until #2354 lands |

**Bytes are content-addressed.** A blob is stored under its own SHA-256 (`blobs/<2 hex>/<sha256>` in OPFS)
and never changes after it is written. A write stores the blob first and then commits the index record and
its journal line in one transaction. A crash in between leaves an orphan blob and the old record intact; a
torn write can only tear a blob no committed record names. The **startup scan** hashes the blob of every
path journaled since it last ran, compares it with the last journaled sha256, marks a mismatch `damaged`,
and deletes orphans. Two paths with the same bytes share one blob, which is freed when neither names it.

**Locks.** Writers hold `lattice-vault` shared from blob to commit; the scan and the blob sweep hold it
exclusive, so neither mistakes an uncommitted blob for an orphan. That makes a write that never settles
dangerous (it would wedge every tab), so the worker client fails every pending and later call once the
worker errors or is closed. `nextSeq()` runs under its own Web Lock, so two tabs never get the same seq for
a `<device-id>-<seq>` update file (§6.4). The browser index increments atomically anyway; the lock is for a
backing that reads, yields and writes, as the desktop's JSON index will.

**The journal's `baseRevision`** is the revision of the live file a change replaced: the file at `path`
for a write or a remove (0 when there was none, even if a tombstone sits there), the file at `from` for a
move. It is what `write`'s `baseRevision` option is checked against.

**The device id** lives in the index's `meta` store, never in a file, so a backup built from `list` and
`read` cannot carry it, and a restore on another device gets that device's own id.

**Write paths.** The worker uses `createSyncAccessHandle` where the engine has it and `createWritable`
otherwise, and counts which. `docs/e2e/vault.spec.ts` proves Chromium, Linux WebKit and Gecko all take
the sync-access-handle path. iOS Safari is UNVERIFIED until the iOS Simulator suite or a device covers it.

**No OPFS, no vault.** WebKit refuses OPFS in an ephemeral session (`getDirectory()` throws UnknownError
in Playwright's default WebKit context; IndexedDB still works), and a private window may too.
`openBrowserVault()` probes first and throws `VaultError('unavailable')`, so a host can fall back. The owner chose
the fallback (D1, 2026-11-22): an IndexedDB blob backing, which slice 2 builds.

## Tests

`vault.test.ts` runs the contract over four backings (memory; memory blobs with the IndexedDB index; OPFS
blobs through each write path with the IndexedDB index), then the crash window, the locks, the worker
client and a seeded model test. `docs/e2e/vault.spec.ts` drives `/proto/vault/` on `desktop`, `webkit-phone` and `gecko`.
