// The Library's photos inside a workspace backup (workspace-backup.ts). Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md §6.
//
// A backup is the durability half of "your decks live in your browser", so a photo a deck names has
// to ride in it: without it a restore on a fresh browser brings back `asset:team-photo` and nothing to
// show. The bytes go in as binary zip entries under `media/`, indexed by `media.json`. They do NOT go
// through `refdocs.json`: that lane parses JSON under a value cap, and a photo as base64 would blow it.
//
// A backup is also a FILE FROM ANYONE, so restore reads it as untrusted: every size is checked before
// anything inflates, the total is held to one running budget, a row is a side lane (a refused photo is
// named, never a reason to lose the decks), and nothing in a row is trusted past what it is checked as.
import { deleteMedia, isMediaName, LIBRARY_SCOPE, listMedia, MAX_MEDIA_FILE_BYTES, saveMedia } from './media-store';
import { declaredInflatedBytes, jsonGuard, readBudget, readBytesBudget } from './zip-limits';

export const MEDIA_INDEX = 'media.json';
/** The most photo bytes a restore reads in total. A full 2560 px photo is about 1 MB, so this holds a
 *  thousand of them; it is a ceiling, and the Workspace sheet warns when a backup is over it. */
export const MAX_MEDIA_RESTORE_BYTES = 1024 * 1024 * 1024;
/** Most rows `media.json` may hold. Each is an IndexedDB write. */
export const MAX_MEDIA_ROWS = 5_000;
/** Most `media.json` may inflate to: a row is a few hundred bytes. */
const MAX_INDEX_BYTES = 16 * 1024 * 1024;

/** The image types a restore will put back, and the extension each is written under. Anything else
 *  in a row is refused, so a crafted backup cannot smuggle a type the Library never stores. */
const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/svg+xml': 'svg',
	'image/avif': 'avif',
};
const FILE_OK = /^[a-z0-9][a-z0-9_-]*\.(jpg|png|webp|gif|svg|avif)$/;

type Zip = { file: (path: string, data?: unknown) => object | null };
type Refusal = { name: string; why: string };

/** What a row of `media.json` says about one stored file. */
type MediaRow = {
	name: string;
	kind: 'image';
	scope: string;
	mime: string;
	bytes: number;
	width: number;
	height: number;
	sourceName: string;
	original: boolean;
	addedAt: number;
	file: string;
};

/** Write every Library photo into `zip` as `media/<file>` plus `media.json`. Resolves how many and
 *  how many bytes, for the backup's manifest and its size warning. */
export async function packMedia(zip: Zip): Promise<{ rows: number; bytes: number }> {
	const all = await listMedia();
	if (!all.length) return { rows: 0, bytes: 0 };
	const rows: MediaRow[] = [];
	let bytes = 0;
	for (const m of all) {
		const ext = EXT[m.mime];
		// Every record the importer writes has one of these types. One that does not is skipped rather
		// than written under a name a restore would refuse.
		if (!ext) continue;
		const file = `${m.name}.${ext}`;
		// Bytes, not the Blob: JSZip reads a Blob only where the host supports it, and bytes work everywhere.
		zip.file(`media/${file}`, new Uint8Array(await m.blob.arrayBuffer()));
		bytes += m.blob.size;
		rows.push({ name: m.name, kind: 'image', scope: m.scope, mime: m.mime, bytes: m.blob.size, width: m.width, height: m.height, sourceName: m.sourceName, original: m.original, addedAt: m.addedAt, file });
	}
	zip.file(MEDIA_INDEX, JSON.stringify(rows, null, 2));
	return { rows: rows.length, bytes };
}

const int = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);

/**
 * Put a backup's photos back. `deckIds` are the decks the restore just brought in: a deck-scoped photo
 * returns only if its deck did, because a photo for a deck that is not here is one nobody can reach.
 * A name already on the shelf is REPLACED by the backup's photo (a restore wins, as it does for a
 * reference doc); a name held by a different kind of asset is refused. Never throws.
 */
export async function restoreMedia(zip: Zip, now: number, deckIds: ReadonlySet<string>): Promise<{ restored: number; refused: Refusal[] }> {
	const refused: Refusal[] = [];
	const index = zip.file(MEDIA_INDEX);
	if (!index) return { restored: 0, refused };
	const skipAll = (why: string) => {
		refused.push({ name: 'photos', why });
		return { restored: 0, refused };
	};
	if (declaredInflatedBytes(index) > MAX_INDEX_BYTES) return skipAll('the index is over what a restore reads');
	let rows: unknown;
	try {
		const { parseJsonCapped } = await jsonGuard();
		rows = parseJsonCapped((await readBudget('the index is over what a restore reads', MAX_INDEX_BYTES)(index)) as string, 'more values than a Library holds');
	} catch {
		return skipAll('the index is not readable');
	}
	if (!Array.isArray(rows)) return skipAll('the index is not readable');
	if (rows.length > MAX_MEDIA_ROWS) return skipAll(`more than ${MAX_MEDIA_ROWS.toLocaleString('en-US')} photos, more than a restore reads`);

	// ONE reader for every photo, so the running budget caps the total, not each file.
	const over = `over the ${Math.floor(MAX_MEDIA_RESTORE_BYTES / 1_048_576)} MB of photos a restore reads`;
	const read = readBytesBudget(over, MAX_MEDIA_RESTORE_BYTES);
	let restored = 0;
	let exhausted = false;
	for (const raw of rows as Partial<MediaRow>[]) {
		const name = typeof raw?.name === 'string' ? raw.name : '(unnamed)';
		const skip = (why: string) => refused.push({ name: `photo ${name.slice(0, 60)}`, why });
		if (exhausted) {
			skip(over);
			continue;
		}
		if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !isMediaName(raw.name)) {
			skip('its name is not one Lattice writes');
			continue;
		}
		if (typeof raw.file !== 'string' || !FILE_OK.test(raw.file) || raw.file !== `${raw.name}.${raw.file.split('.').pop()}`) {
			skip('its file is not one Lattice writes');
			continue;
		}
		const mime = typeof raw.mime === 'string' ? raw.mime.toLowerCase() : '';
		if (!EXT[mime] || EXT[mime] !== raw.file.split('.').pop()) {
			skip('its type is not an image Lattice stores');
			continue;
		}
		const scope = typeof raw.scope === 'string' ? raw.scope : '';
		if (scope !== LIBRARY_SCOPE && !deckIds.has(scope)) {
			skip('the deck it belonged to is not in this backup');
			continue;
		}
		const entry = zip.file(`media/${raw.file}`);
		if (!entry) {
			skip('its file is missing from the backup');
			continue;
		}
		if (declaredInflatedBytes(entry) > MAX_MEDIA_FILE_BYTES) {
			skip(`over the ${Math.floor(MAX_MEDIA_FILE_BYTES / 1_048_576)} MB one photo may be`);
			continue;
		}
		let bytes: Uint8Array<ArrayBuffer> | undefined;
		try {
			bytes = await read(entry);
		} catch {
			// The running budget is spent: this photo and every one after it is over what a restore reads.
			exhausted = true;
			skip(over);
			continue;
		}
		if (!bytes?.length) {
			skip('its file is empty');
			continue;
		}
		let clash: Awaited<ReturnType<typeof listMedia>>[number] | undefined;
		try {
			clash = (await listMedia()).find((a) => a.name === raw.name);
			if (clash) await deleteMedia(clash.id);
			await saveMedia(
				{
					kind: 'image',
					name: raw.name,
					scope,
					blob: new Blob([bytes], { type: mime }),
					mime,
					bytes: bytes.length,
					width: int(raw.width, 100_000),
					height: int(raw.height, 100_000),
					sourceName: typeof raw.sourceName === 'string' ? raw.sourceName.slice(0, 200) : raw.name,
					original: raw.original === true,
				},
				int(raw.addedAt, Number.MAX_SAFE_INTEGER) || now,
			);
			restored++;
		} catch (e) {
			// The replacement did not land after the photo it replaces was deleted: put that one back, so
			// a failed restore of one photo never costs the photo that was already here.
			if (clash) {
				const { id: _id, addedAt, ...keep } = clash;
				await saveMedia(keep, addedAt).catch(() => {});
			}
			skip(String((e as Error)?.message || 'it could not be saved').replace(/^Can't add — /, '').slice(0, 120));
		}
	}
	return { restored, refused };
}
