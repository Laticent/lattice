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
// bomb before anything inflates. A dishonest archive can understate it; the asset
// import's read budget then stops the import at the first read that takes the running
// total over the cap, but that one read has already inflated in full.
// JSZip exposes no streaming read to stop it sooner.

/** Largest archive accepted, on disk. */
export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
/** Largest total the archive's entries may inflate to. */
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024;
/** Most entries an asset archive may hold. A bundle of every shipped asset is a few hundred. */
export const MAX_ZIP_ENTRIES = 2000;

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
 * A running budget for text actually read out of an archive. Each read is charged, and
 * the read that takes the total over `MAX_INFLATED_BYTES` throws, so entries that
 * understated their sizes can't add up past the cap. It can't stop the read that
 * crosses it: that read has already inflated (see the header).
 */
export function readBudget(message: string): (text: string | null | undefined) => string | null | undefined {
	let used = 0;
	return (text) => {
		used += text ? text.length : 0;
		if (used > MAX_INFLATED_BYTES) throw new Error(message);
		return text;
	};
}
