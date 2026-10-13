// The Library photos a `.lattice` carries. Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md §6.
//
// A deck names a photo as `asset:<name>`, and the bytes live in the author's browser. A `.lattice`
// that leaves them behind opens on another machine as a deck of stand-ins, so the project file takes
// the photos the deck NAMES (not the whole Library) and the importer puts them back.
//
// Both halves reuse the workspace backup's photo code (`workspace-media.ts`) rather than a second
// copy of it: the write side is `packMedia`, and the read side is `restoreMedia`, which treats the
// file as untrusted. A `.lattice` is a file from anyone, exactly as a backup is.

import type { LatticeMedia } from './lattice-file';
import { listMedia, namesOf, visibleMedia } from './media-store';
import { assetNamesIn } from './media-urls';
import { MEDIA_INDEX, packMedia, renameAssetRefs, restoreMedia } from './workspace-media';
import { MAX_LATTICE_MEDIA_BYTES } from './zip-limits';

/** Most photos one `.lattice` carries. A reader refuses an archive of more than 2000 entries outright, so the
 *  writer stops well short of it rather than make a file nobody can open. */
export const MAX_LATTICE_PHOTOS = 1000;

export type PhotoSummary = {
	/** Photos the deck names that this browser holds and the open deck can see. */
	count: number;
	/** What those photos add to the file, before compression: they are stored as they are. */
	bytes: number;
	/** Names the deck writes that the open deck cannot see (deleted, or another deck's). They stay stand-ins. */
	missing: string[];
};

/** What an export would carry, for the Share sheet to show beside its toggle. */
export async function latticePhotoSummary(source: string, deckId: string | undefined): Promise<PhotoSummary> {
	const named = assetNamesIn(source);
	if (!named.length) return { count: 0, bytes: 0, missing: [] };
	// A deck may still write a photo's OLD name (an alias): it resolves in the Studio, so the file must carry it.
	const seen = new Map(visibleMedia(await listMedia(), deckId ?? null).flatMap((m) => namesOf(m).map((n) => [n, m] as const)));
	const have = [...new Set(named.filter((n) => seen.has(n)).map((n) => seen.get(n)))];
	return { count: have.length, bytes: have.reduce((sum, m) => sum + (m?.blob.size ?? 0), 0), missing: named.filter((n) => !seen.has(n)) };
}

export type PackedPhotos = {
	media?: LatticeMedia;
	included: string[];
	/** Left out because the file would pass `MAX_LATTICE_MEDIA_BYTES`. */
	omitted: string[];
	/** Named by the deck, not visible to it. */
	missing: string[];
};

/** The photos `source` names, packed for `exportLatticeBlob`. Never throws: a Library that cannot be
 *  read yields no photos and says so through `missing`, so the export still produces the deck. */
export async function packLatticePhotos(source: string, deckId: string | undefined): Promise<PackedPhotos> {
	const named = assetNamesIn(source);
	if (!named.length) return { included: [], omitted: [], missing: [] };
	try {
		// Name or alias: a deck that still writes an old name is carried by the photo's current one.
		const canonical = new Map(visibleMedia(await listMedia(), deckId ?? null).flatMap((m) => namesOf(m).map((n) => [n, m.name] as const)));
		const names = new Set(named.filter((n) => canonical.has(n)));
		const missing = named.filter((n) => !canonical.has(n));
		const files: Record<string, Uint8Array> = {};
		let index = '';
		// A collector standing in for the zip: `buildLatticeZip` owns the archive, so the bytes are handed to it.
		const collector = {
			file(path: string, data?: unknown) {
				if (path === MEDIA_INDEX) index = String(data);
				else files[path] = data as Uint8Array;
				return {};
			},
		};
		// The count stays well under the 2000 entries a reader allows in the whole archive.
		const packed = await packMedia(collector, { names, scope: 'library', maxBytes: MAX_LATTICE_MEDIA_BYTES, maxCount: MAX_LATTICE_PHOTOS });
		const included = Object.keys(files).map((p) => p.replace(/^media\//, '').replace(/\.[a-z]+$/, ''));
		// A visible photo that is in neither list (a legacy record of a type the file cannot hold) is missing too,
		// never dropped without a word.
		const placed = new Set([...included, ...packed.omitted]);
		return { ...(index ? { media: { index, files } } : {}), included, omitted: packed.omitted, missing: [...missing, ...[...names].filter((n) => !placed.has(canonical.get(n) as string))] };
	} catch {
		return { included: [], omitted: [], missing: named };
	}
}

/** Put a `.lattice`'s photos in this browser's Library, and rewrite `source` for any that had to take a
 *  new name. Never throws and never overwrites a photo already here (workspace-media.ts says why). */
export async function restoreLatticePhotos(zip: { file: (path: string) => object | null }, source: string, now: number): Promise<{ source: string; restored: number; refused: { name: string; why: string }[] }> {
	const r = await restoreMedia(zip as Parameters<typeof restoreMedia>[0], now, { backupDeckIds: new Set(), copies: {} }, { maxTotalBytes: MAX_LATTICE_MEDIA_BYTES, only: new Set(assetNamesIn(source)) });
	const map = new Map(r.renames.map((x) => [x.from, x.to]));
	return { source: map.size ? renameAssetRefs(source, map) : source, restored: r.restored, refused: r.refused };
}
