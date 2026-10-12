// The Library's photos inside a workspace backup (workspace-backup.ts). Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md §6 and §9.
//
// A backup is the durability half of "your decks live in your browser", so a photo a deck names has
// to ride in it: without it a restore on a fresh browser brings back `asset:team-photo` and nothing to
// show. The bytes go in as binary zip entries under `media/`, indexed by `media.json`. They do NOT go
// through `refdocs.json`: that lane parses JSON under a value cap, and a photo as base64 would blow it.
//
// A backup is also a FILE FROM ANYONE, so restore reads it as untrusted: every size is checked before
// anything inflates, one photo and the total each have their own running budget, a row is a side lane
// (a refused photo is named, never a reason to lose the decks), and nothing in a row is trusted past
// what it is checked as.
//
// ONE RULE ABOVE THE REST: a restore never deletes or overwrites a photo that is already on this
// device. Names are camera-roll names (`img-0042`), so two devices routinely hold DIFFERENT photos
// under one name. An identical photo is skipped; a different one comes back under a new name, and the
// decks the restore itself wrote are rewritten to match, the way a deck that diverged comes back as a
// copy "beside, never over" (studio-store.ts `importStudioState`).
import { isMediaName, LIBRARY_SCOPE, listMedia, MAX_MEDIA_FILE_BYTES, saveMedia, uniqueName } from './media-store';
import { declaredInflatedBytes, jsonGuard, readBudget, readBytesBudget } from './zip-limits';

export const MEDIA_INDEX = 'media.json';
/** The most photo bytes a restore reads in total. A full 2560 px photo is about 1 MB, so this holds a
 *  thousand of them; it is a ceiling, and the Workspace sheet warns when a backup is over it. */
export const MAX_MEDIA_RESTORE_BYTES = 1024 * 1024 * 1024;
/** Most rows `media.json` may hold. Each is an IndexedDB write. */
export const MAX_MEDIA_ROWS = 5_000;
/** Most `media.json` may inflate to: a row is a few hundred bytes. */
const MAX_INDEX_BYTES = 16 * 1024 * 1024;

/** The image types a restore will put back, and the extension each is written under. SVG is not here:
 *  the Library no longer stores one (an SVG opened as a document runs its script on the site's origin;
 *  the importer rasterizes it), so an SVG in a backup is refused, not restored. */
const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
};
const FILE_OK = /^[a-z0-9][a-z0-9_-]*\.(jpg|png|webp|gif|avif)$/;

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

/** Write every Library photo into `zip` as `media/<file>` plus `media.json`. Resolves how many, how many
 *  bytes, and how many it could not write (a type outside what the Library stores), so a backup never
 *  drops a photo without saying so. */
export async function packMedia(zip: Zip): Promise<{ rows: number; bytes: number; skipped: number }> {
	const all = await listMedia();
	if (!all.length) return { rows: 0, bytes: 0, skipped: 0 };
	const rows: MediaRow[] = [];
	let bytes = 0;
	let skipped = 0;
	for (const m of all) {
		const ext = EXT[m.mime];
		if (!ext) {
			skipped++;
			continue;
		}
		const file = `${m.name}.${ext}`;
		// Bytes, not the Blob: JSZip reads a Blob only where the host supports it, and bytes work everywhere.
		zip.file(`media/${file}`, new Uint8Array(await m.blob.arrayBuffer()));
		bytes += m.blob.size;
		rows.push({ name: m.name, kind: 'image', scope: m.scope, mime: m.mime, bytes: m.blob.size, width: m.width, height: m.height, sourceName: m.sourceName, original: m.original, addedAt: m.addedAt, file });
	}
	if (rows.length) zip.file(MEDIA_INDEX, JSON.stringify(rows, null, 2));
	return { rows: rows.length, bytes, skipped };
}

const int = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);

/** Do two byte strings match? Sizes first, so the common "different photo" case never compares bytes. */
async function sameBytes(existing: Blob, incoming: Uint8Array): Promise<boolean> {
	if (existing.size !== incoming.length) return false;
	const a = new Uint8Array(await existing.arrayBuffer());
	for (let i = 0; i < a.length; i++) if (a[i] !== incoming[i]) return false;
	return true;
}

/** A photo that came back under a different name than the backup gave it, and which backup scope it was in. */
export type MediaRename = { from: string; to: string; scope: string };

export type RestoreContext = {
	/** The deck ids the backup itself holds. A deck-scoped photo returns only for one of these. */
	backupDeckIds: ReadonlySet<string>;
	/** Backup deck id → the new id its copy was stored under, for a deck that diverged. A photo kept to
	 *  that deck follows the copy, because the copy is the deck that names it. */
	copies: Readonly<Record<string, string>>;
};

/**
 * Put a backup's photos back. Never throws, never deletes, never overwrites. See the header: an identical
 * photo already here is skipped, a different one under the same name returns under a new name and the
 * rename is reported so the caller can rewrite the decks it just wrote.
 */
export async function restoreMedia(zip: Zip, now: number, ctx: RestoreContext): Promise<{ restored: number; refused: Refusal[]; renames: MediaRename[] }> {
	const refused: Refusal[] = [];
	const renames: MediaRename[] = [];
	const index = zip.file(MEDIA_INDEX);
	if (!index) return { restored: 0, refused, renames };
	const skipAll = (why: string) => {
		refused.push({ name: 'photos', why });
		return { restored: 0, refused, renames };
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

	const overTotal = `over the ${Math.floor(MAX_MEDIA_RESTORE_BYTES / 1_048_576)} MB of photos a restore reads`;
	const overFile = `over the ${Math.floor(MAX_MEDIA_FILE_BYTES / 1_048_576)} MB one photo may be`;
	// The shelf is read ONCE and kept current by hand: a restore of N photos is N saves, not N full reads.
	const shelf = await listMedia();
	const byName = new Map(shelf.map((m) => [m.name, m]));
	const taken = new Set(byName.keys());
	let totalRead = 0;
	let restored = 0;
	let exhausted = false;

	for (const raw of rows as Partial<MediaRow>[]) {
		const label = typeof raw?.name === 'string' ? raw.name : '(unnamed)';
		const skip = (why: string) => refused.push({ name: `photo ${label.slice(0, 60)}`, why });
		if (exhausted) {
			skip(overTotal);
			continue;
		}
		if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !isMediaName(raw.name)) {
			skip('its name is not one Lattice writes');
			continue;
		}
		const mime = typeof raw.mime === 'string' ? raw.mime.toLowerCase() : '';
		// The type is judged first, so an SVG gets its own reason rather than a file-name one.
		if (mime === 'image/svg+xml') {
			skip('an SVG can carry script, so the Library does not store one');
			continue;
		}
		const ext = typeof raw.file === 'string' ? raw.file.split('.').pop() : '';
		if (typeof raw.file !== 'string' || !FILE_OK.test(raw.file) || raw.file !== `${raw.name}.${ext}`) {
			skip('its file is not one Lattice writes');
			continue;
		}
		if (!EXT[mime] || EXT[mime] !== ext) {
			skip('its type is not an image Lattice stores');
			continue;
		}
		const backupScope = typeof raw.scope === 'string' ? raw.scope : '';
		if (backupScope !== LIBRARY_SCOPE && !ctx.backupDeckIds.has(backupScope)) {
			skip('the deck it belonged to is not in this backup');
			continue;
		}
		// A photo kept to a deck that came back as a copy goes with the copy.
		const scope = backupScope === LIBRARY_SCOPE ? LIBRARY_SCOPE : (ctx.copies[backupScope] ?? backupScope);
		const entry = zip.file(`media/${raw.file}`);
		if (!entry) {
			skip('its file is missing from the backup');
			continue;
		}
		const declared = declaredInflatedBytes(entry);
		if (declared > MAX_MEDIA_FILE_BYTES) {
			skip(overFile);
			continue;
		}
		if (totalRead + declared > MAX_MEDIA_RESTORE_BYTES) {
			exhausted = true;
			skip(overTotal);
			continue;
		}
		// Each photo gets its OWN reader, capped at one photo's size, so an entry that understates its size
		// stops at 50 MB rather than inflating toward the total; the total is counted here from what was read.
		let bytes: Uint8Array<ArrayBuffer> | undefined;
		try {
			bytes = await readBytesBudget(overFile, MAX_MEDIA_FILE_BYTES)(entry);
		} catch (e) {
			// Only the cap's own message means "too big". A lying header or a truncated entry is a bad
			// photo, and says so, and the photos after it are still read.
			skip(String((e as Error)?.message) === overFile ? overFile : 'its file could not be read from the backup');
			continue;
		}
		if (!bytes?.length) {
			skip('its file is empty');
			continue;
		}
		totalRead += bytes.length;
		if (totalRead > MAX_MEDIA_RESTORE_BYTES) {
			exhausted = true;
			skip(overTotal);
			continue;
		}

		let name = raw.name;
		const existing = byName.get(name);
		if (existing) {
			// The same photo already here: nothing to do, and nothing to touch.
			if (await sameBytes(existing.blob, bytes)) continue;
			// A different photo under the same name: keep both. The incoming one comes back under a new name.
			name = uniqueName(name, taken);
			renames.push({ from: raw.name, to: name, scope: backupScope });
		}
		try {
			const saved = await saveMedia(
				{
					kind: 'image',
					name,
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
			byName.set(name, saved);
			taken.add(name);
			restored++;
		} catch (e) {
			// A rename that did not land is not a rename.
			if (name !== raw.name) renames.pop();
			skip(String((e as Error)?.message || 'it could not be saved').replace(/^Can't add — /, '').slice(0, 120));
		}
	}
	return { restored, refused, renames };
}

/** `asset:from` → `asset:to` wherever a deck writes the whole name, leaving `asset:from-2` and the like. */
export function renameAssetRefs(source: string, from: string, to: string): string {
	const esc = from.replace(/[-_]/g, (c) => `\\${c}`);
	return source.replace(new RegExp(`\\basset:${esc}(?![A-Za-z0-9_-])`, 'gi'), `asset:${to}`);
}
