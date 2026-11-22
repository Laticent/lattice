// The desktop vault's seam: what the Lattice Studio desktop app (Tauri) must supply to back a vault with
// the real `Lattice/` folder on disk (engineering/decisions/2026-11-22-local-first-drive-storage.md §6.1,
// §6.2, slice 10).
//
// NOT BUILT IN SLICE 1. The desktop app and its platform seam (`docs/src/lib/platform.js`, `host.js`)
// arrive with #2354, which has not merged, so this file imports nothing from them. It fixes the SHAPE the
// desktop host will implement, in the platform seam's style: plain JavaScript typed with JSDoc, no
// load-time side effects, one function per capability. When #2354 lands, `vaultHost()` moves into
// platform.js as a capability and asks `tauri()` for these commands; Studio code keeps calling the vault
// interface (`./types.ts`) and never this file.
//
// On the desktop the folder IS the truth: a file a person edits in Finder is a vault write. So the
// desktop host is not a BlobStore under the browser's content-addressed core; it implements the vault
// interface itself, with a JSON index in the app's data folder (§6.2 table) and these commands below it.

/** @typedef {import('./types').Entry} Entry */
/** @typedef {import('./types').Vault} Vault */

/**
 * The Tauri commands a desktop vault calls. Paths are vault paths (`Decks/Q3.md`), resolved by Rust under
 * the folder the user chose (`~/Documents/Lattice/` by default); Rust refuses any path that escapes it.
 *
 * @typedef {object} DesktopVaultCommands
 * @property {(dir: string) => Promise<Array<{ path: string, bytes: number, mtime: number }>>} list_dir
 * @property {(path: string) => Promise<Uint8Array>} read_file
 *   Raw IPC body back, no base64 (the platform seam's `save_file` rule).
 * @property {(path: string, bytes: Uint8Array) => Promise<void>} write_file
 *   Writes a temporary sibling and renames it over the target, so a crash never leaves a torn file.
 * @property {(from: string, to: string) => Promise<void>} move_file
 * @property {(path: string) => Promise<void>} trash_file
 *   To the OS trash, never an unlink; the index keeps the tombstone sync needs.
 * @property {(onChange: (paths: string[]) => void) => Promise<() => void>} watch_dir
 *   A file-system watcher, so an edit made outside the app reaches `watch()`.
 */

/**
 * The desktop host's vault commands, or null when this is not the desktop app. Always null in slice 1.
 *
 * @returns {DesktopVaultCommands | null}
 */
export function vaultHost() {
	return null;
}
