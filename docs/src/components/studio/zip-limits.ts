// Size caps for a zip from someone else — shared by every Studio import that opens one.
//
// A zip is untrusted input. A few-KB archive can declare entries that inflate to
// gigabytes and take the tab down, and a large one can stall it before a byte is
// read. `.lattice` import has refused both since it shipped; the asset `.zip` import
// (`asset-bundle.ts`) had no caps at all (2026-09-23-portable-packages.md §3.5). One
// module now holds the numbers so the two can't drift apart.
//
// The inflated-size check reads the size each entry DECLARES in the archive's central
// directory. JSZip exposes it on the entry's internal `_data`. It refuses an honest
// bomb before anything inflates. A dishonest archive can understate it; the read budget
// then inflates each entry in chunks and stops at the chunk that takes the running total
// over the cap (lib/packages/zip-read.js). A liar costs the cap plus the rest of the one
// compressed chunk being inflated when it crosses (about 16 MB of work, measured on a
// 300 MB entry, and dropped rather than kept), not its true size.

// The numbers live in lib/packages/limits.js, shared with the CLI's `lattice packages add`.
// A DEFAULT import: it is a CommonJS leaf (docs/src/plugins/vite-cjs-lib-dev.mjs).
import limits from '../../../../lib/packages/limits.js';

/** A JSZip file entry. Its `internalStream`, which the capped read uses, is missing from
 *  JSZip's published types, so the entry is passed through untyped. */
type ZipEntry = object;

/** Largest archive accepted, on disk. */
export const MAX_ZIP_BYTES: number = limits.MAX_ZIP_BYTES;
/** Largest total the entries a reader opens may inflate to. */
export const MAX_INFLATED_BYTES: number = limits.MAX_INFLATED_BYTES;
/** Most entries an asset archive may hold. */
export const MAX_ZIP_ENTRIES: number = limits.MAX_ZIP_ENTRIES;

/** The uncompressed size an entry declares, or 0 when it declares none. */
export function declaredInflatedBytes(entry: unknown): number {
	return Number((entry as { _data?: { uncompressedSize?: number } })?._data?.uncompressedSize) || 0;
}

/** Every file entry in a loaded archive (directories excluded). */
function fileEntries(zip: LoadedZip): unknown[] {
	return Object.values(zip.files).filter((e) => !e.dir);
}

type LoadedZip = { files: Record<string, { dir?: boolean }> };

/**
 * Refuse an archive whose entry count or declared inflated total is over the caps.
 * Throws `Error(message)`, so the caller's toast shows the caller's own words.
 *
 * `paths` limits the size sum to the entries the caller will actually read. An asset
 * bundle carries showcase PDFs the importer never opens, and a user's own large
 * export must not be refused on re-import for bytes nobody inflates.
 */
export function assertZipWithinLimits(zip: LoadedZip, message: string, paths?: Iterable<string>): void {
	const entries = fileEntries(zip);
	if (entries.length > MAX_ZIP_ENTRIES) throw new Error(message);
	const counted = paths ? [...new Set(paths)].map((p) => zip.files[p]).filter(Boolean) : entries;
	let total = 0;
	for (const e of counted) total += declaredInflatedBytes(e);
	if (total > MAX_INFLATED_BYTES) throw new Error(message);
}

/**
 * A running budget for text read out of an archive: each read INFLATES in chunks and is
 * charged as it goes, and the chunk that takes the total over `MAX_INFLATED_BYTES` stops the
 * inflate and throws. So an entry that understates its size costs the cap plus one compressed
 * chunk's worth of inflate work, not its true size (`lib/packages/zip-read.js`, shared with the
 * CLI). Counted in UTF-16 units, as the old read was.
 */
export function readBudget(message: string, max: number = MAX_INFLATED_BYTES): (entry: ZipEntry | null | undefined) => Promise<string | undefined> {
	const budget = { used: 0, max, message };
	return async (entry) => {
		if (!entry) return undefined;
		// Loaded on the first read: this module is on the Studio's eager path, a read never is.
		const { default: zipRead } = await import('../../../../lib/packages/zip-read.js');
		return (await zipRead.readEntryCapped(entry as Parameters<typeof zipRead.readEntryCapped>[0], 'string', budget)) as string;
	};
}
