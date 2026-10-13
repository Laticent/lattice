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
// under one name. When the backup's name is already taken here, the same bytes mean the same photo and
// it is reused (so restoring one backup twice adds nothing), and shared with all decks if it was kept
// to one deck the backup's decks cannot see. A different photo under a taken name comes back under a
// new name chosen against every name on the device AND every name in the backup. A name nobody holds
// is stored as it is. The decks
// the restore itself wrote are rewritten once, from one name map, to match (studio-store.ts
// `importStudioState` does the same "beside, never over" for a deck that diverged).

import { cleanCaption } from './agent-assets';
import { scrubberFor } from './media-scrub';
import { isMediaName, LIBRARY_SCOPE, listMedia, MAX_MEDIA_FILE_BYTES, saveMedia, setMediaScope, sniffImageMime, uniqueName } from './media-store';
import { declaredInflatedBytes, jsonGuard, readBudget, readBytesBudget } from './zip-limits';

export const MEDIA_INDEX = 'media.json';
/** The most photo bytes a restore reads in total. A full 2560 px photo is about 1 MB, so this holds a
 *  thousand of them; it is a ceiling, and the Workspace sheet warns when a backup is over it. */
export const MAX_MEDIA_RESTORE_BYTES = 1024 * 1024 * 1024;
/** Most rows `media.json` may hold. Each is an IndexedDB write. */
export const MAX_MEDIA_ROWS = 5_000;
/** Most refusals a restore lists by name; the rest are counted. */
const MAX_REFUSALS_LISTED = 25;
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
};
const FILE_OK = /^[a-z0-9][a-z0-9_-]*\.(jpg|png|webp|gif)$/;

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
	/** The chat's one-line description of the photo, when it has looked at it. Optional: a backup from
	 *  before captions existed has none, and a photo nobody looked at has none. */
	caption?: string;
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
		rows.push({ name: m.name, kind: 'image', scope: m.scope, mime: m.mime, bytes: m.blob.size, width: m.width, height: m.height, sourceName: m.sourceName, original: m.original, ...(m.caption ? { caption: m.caption } : {}), addedAt: m.addedAt, file });
	}
	if (rows.length) zip.file(MEDIA_INDEX, JSON.stringify(rows, null, 2));
	return { rows: rows.length, bytes, skipped };
}

const int = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);

/** SHA-256 of some bytes, as hex. Compared instead of the bytes themselves so a restore keeps a short
 *  fingerprint per photo, not a second copy of a thousand photos in memory. */
async function digest(data: Blob | Uint8Array): Promise<string> {
	const buf = data instanceof Blob ? await data.arrayBuffer() : (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** A photo on the shelf, as the restore tracks it: the blob only for what was already here. */
type Held = { id: string; name: string; scope: string; size: number; blob?: Blob; hash?: string };

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
export async function restoreMedia(zip: Zip, now: number, ctx: RestoreContext): Promise<{ restored: number; shared: number; refused: Refusal[]; renames: MediaRename[] }> {
	const refused: Refusal[] = [];
	const renames: MediaRename[] = [];
	const index = zip.file(MEDIA_INDEX);
	if (!index) return { restored: 0, shared: 0, refused, renames };
	const skipAll = (why: string) => {
		refused.push({ name: 'photos', why });
		return { restored: 0, shared: 0, refused, renames };
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
	const bySize = new Map<number, Held[]>();
	const hold = (h: Held) => {
		const list = bySize.get(h.size) ?? [];
		list.push(h);
		bySize.set(h.size, list);
	};
	for (const m of shelf) hold({ id: m.id, name: m.name, scope: m.scope, size: m.blob.size, blob: m.blob });
	const local = new Set(shelf.map((m) => m.name));
	// Every name a new photo must not take: what is on the device, and every name the BACKUP uses, so a
	// photo renamed to dodge a local clash cannot land on a name a later row of the same backup owns.
	const reserved = new Set(local);
	for (const raw of rows as Partial<MediaRow>[]) if (typeof raw?.name === 'string' && isMediaName(raw.name)) reserved.add(raw.name);
	let totalRead = 0;
	let restored = 0;
	let shared = 0;
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
		// A photo kept to a deck that came back as a copy goes with the copy. `hasOwn`: a deck id is text
		// from the backup, and `__proto__` or `constructor` must not read off the object's prototype.
		const scope = backupScope === LIBRARY_SCOPE ? LIBRARY_SCOPE : Object.hasOwn(ctx.copies, backupScope) ? ctx.copies[backupScope] : backupScope;
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
		// A backup is a file from anyone, and the zip's own type label is only a label: a row that says PNG
		// over 49 MB of zeros, or over a JPEG with its GPS, is not stored under that name.
		if (sniffImageMime(bytes) !== mime) {
			skip(`its bytes are not ${mime.replace('image/', '').toUpperCase()} image data`);
			continue;
		}
		// And the bytes get the same cleaning the importer gives a new photo: a backup from another person's
		// workspace must not bring their photo's location into the decks this person sends out. A file the
		// scrubber cannot read is refused rather than stored with a block nobody could inspect.
		const scrub = scrubberFor(mime);
		const cleaned = scrub ? scrub(bytes) : null;
		if (!cleaned) {
			skip('its image data could not be read');
			continue;
		}
		bytes = cleaned as Uint8Array<ArrayBuffer>;

		// A name nobody holds is stored as it is, even when the same bytes sit under another name: the decks
		// that name it may be ones this restore does not rewrite, so it must exist under its own name.
		// A name that IS held decides it: identical bytes mean the same photo (reuse it), otherwise this is a
		// different photo that needs a new name, unless a photo with these bytes already came back under one.
		let name = raw.name;
		if (local.has(name)) {
			const candidates = bySize.get(bytes.length) ?? [];
			let match: Held | undefined;
			if (candidates.length) {
				// A photo that cannot be read back (a lost backing file) or a browser with no `crypto.subtle` (an
				// insecure origin) means "not provably the same": the incoming one is stored under a new name, never
				// matched, and never an error that would leave the decks written and the photos not.
				try {
					const mine = await digest(bytes);
					for (const c of candidates) c.hash ??= c.blob ? await digest(c.blob) : undefined;
					const same = candidates.filter((c) => c.hash === mine);
					match = same.find((c) => c.name === raw.name) ?? same[0];
				} catch {
					match = undefined;
				}
			}
			if (match) {
				// Reused as is. If it is kept to one deck that this backup's decks cannot see, share it with all
				// decks: widening visibility never deletes anything, and the alternative is a restored deck that
				// names a photo it cannot see.
				if (match.scope !== LIBRARY_SCOPE && match.scope !== scope) {
					const moved = await setMediaScope(match.id, LIBRARY_SCOPE).catch(() => null);
					if (moved) {
						match.scope = LIBRARY_SCOPE;
						shared++;
					}
				}
				if (match.name !== raw.name) renames.push({ from: raw.name, to: match.name, scope: backupScope });
				continue;
			}
			// A different photo under a taken name: keep both. The incoming one comes back under a new name.
			name = uniqueName(name, reserved);
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
					// A backup file is untrusted and the caption goes back into the chat's prompt, so it takes the
					// same cleaning a model-written one does (agent-assets.ts `cleanCaption`).
					...(cleanCaption(raw.caption) ? { caption: cleanCaption(raw.caption) } : {}),
				},
				int(raw.addedAt, Number.MAX_SAFE_INTEGER) || now,
			);
			hold({ id: saved.id, name, scope, size: bytes.length, hash: await digest(bytes).catch(() => undefined) });
			local.add(name);
			reserved.add(name);
			restored++;
		} catch (e) {
			// A rename that did not land is not a rename.
			if (name !== raw.name) renames.pop();
			skip(String((e as Error)?.message || 'it could not be saved').replace(/^Can't add — /, '').slice(0, 120));
		}
	}
	// A backup of thousands of bad rows must not become a toast of thousands of lines.
	if (refused.length > MAX_REFUSALS_LISTED) {
		const more = refused.length - MAX_REFUSALS_LISTED;
		refused.length = MAX_REFUSALS_LISTED;
		refused.push({ name: 'photos', why: `${more} more were refused for the same kinds of reasons` });
	}
	return { restored, shared, refused, renames };
}

/** Rename `asset:<name>` references in one pass. `map` is the whole from → to set at once, so a rename
 *  can never be renamed again (`hero → hero-2` followed by `hero-2 → hero-2-2` would send a deck to the
 *  wrong photo). Matches whole names only and leaves `asset:hero-2` alone when renaming `hero`. */
export function renameAssetRefs(source: string, from: string | ReadonlyMap<string, string>, to?: string): string {
	const map = typeof from === 'string' ? new Map([[from.toLowerCase(), to as string]]) : new Map([...from].map(([k, v]) => [k.toLowerCase(), v]));
	if (!map.size) return source;
	return source.replace(/\basset:([A-Za-z0-9][A-Za-z0-9_-]*)(?![A-Za-z0-9_-])/gi, (whole, name: string) => {
		const next = map.get(name.toLowerCase());
		return next === undefined ? whole : `asset:${next}`;
	});
}
