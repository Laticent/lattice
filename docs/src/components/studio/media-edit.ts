// Editing a Library photo's details: description, credit, date taken, name and its old names. Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md § Editing a photo's metadata.
//
// A MODULE OF ITS OWN, not part of media-store.ts. The store is on the Studio's startup path (a deck's previews and exports
// read it), and only the Library's detail view edits: this loads with the Library, not with the shell. The store keeps the
// rule every writer must obey (a name and an old name are one pool: `namesOf`, checked in `putMedia`'s transaction); this
// file applies it to a rename.
import { ASSET_STORE, openDB } from '@/components/studio/library/asset-db.js';
import { decksUsing, isMediaName, KINDS, MAX_ALIASES, MEDIA_REFUSAL_PREFIX, type MediaRecord, namesOf, readable } from './media-store';

/** `YYYY-MM-DD` that is a real calendar day. */
export function isIsoDate(v: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
	if (!m) return false;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** The metadata a person edits by hand. `undefined` leaves a field alone; an empty string clears it. */
export type MediaMetaPatch = { caption?: string; credit?: string; taken?: string };

/** A line of text a person typed, kept as typed: one line, no control or invisible characters, capped. Quotes and
 *  the middle dot stay. The chat's prompt is the only place they are unsafe, and it cleans a description on the way
 *  out (agent-assets-browser.ts `infoOf`), so the person's wording is not changed to protect it.
 *  Invisible characters ARE removed, because a file from anyone can use them to hide text that screen readers and
 *  models read: format and separator characters (bidi overrides, zero-width), the Hangul filler and braille blank,
 *  the tag characters and the variation-selector supplement. The two emoji selectors (U+FE0E, U+FE0F) stay, so an
 *  emoji keeps its look. Cut by whole characters, so an emoji at the limit is kept or dropped whole. */
export const cleanLine = (v: string, max: number): string => {
	const t = v
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
		.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
		// Three things survive, because removing them changes what a text SAYS: a subdivision-flag sequence (a black flag, tag
		// letters, a cancel tag: the flag of England), and ONE joiner between two ordinary characters (a family emoji, a Persian
		// word with its zero-width non-joiner). A run of joiners, a tag outside a flag, and every other invisible character goes:
		// those are the channels a hostile file uses to hide text.
		.replace(
			/(\u{1F3F4}[\u{E0020}-\u{E007E}]{2,6}\u{E007F})|(?<=[^\p{Cf}\s])([\u200C\u200D])(?=[^\p{Cf}\s])|(?:[\p{Cf}\p{Zl}\p{Zp}\u3164\u2800]|[\uFE00-\uFE0D]|[\u{E0000}-\u{E01EF}])+/gu,
			(_m, flag: string | undefined, joiner: string | undefined) => flag ?? joiner ?? '',
		)
		// A lone surrogate is half a character: it would print as a replacement box and fail `isWellFormed`.
		.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return Array.from(t).slice(0, max).join('').trim();
};

const cleanTaken = (v: string): string => (isIsoDate(v.trim()) ? v.trim() : '');

/** The metadata change as a pure function of the row, so a rename and a metadata edit can share one write. */
function withMeta(row: MediaRecord, patch: MediaMetaPatch): MediaRecord {
	const next: MediaRecord = { ...row };
	const set = <K extends 'caption' | 'credit' | 'taken'>(k: K, v: string) => {
		if (v) next[k] = v as MediaRecord[K];
		else delete next[k];
	};
	if (patch.caption !== undefined) set('caption', cleanLine(patch.caption, 140));
	if (patch.credit !== undefined) set('credit', cleanLine(patch.credit, 100));
	if (patch.taken !== undefined) set('taken', cleanTaken(patch.taken));
	return next;
}

/** The rename as a pure function of the row and every other record. Throws a refusal. */
function withRename(row: MediaRecord, to: string, others: MediaRecord[]): MediaRecord {
	if (!isMediaName(to)) throw new Error(`${MEDIA_REFUSAL_PREFIX} “${to}” isn't a usable asset name. Use lowercase letters, digits, - and _.`);
	if (row.name === to) return row;
	const clash = others.find((a) => namesOf(a).includes(to));
	if (clash) throw new Error(`${MEDIA_REFUSAL_PREFIX} “${to}” already belongs to another saved ${clash.kind}.`);
	const aliases = [...new Set([row.name, ...(row.aliases ?? [])])].filter((n) => n !== to);
	if (aliases.length > MAX_ALIASES) throw new Error(`${MEDIA_REFUSAL_PREFIX} this photo already has ${MAX_ALIASES} old names. Remove one first.`);
	return { ...row, name: to, aliases };
}

/** Change an image's description, credit or date taken. Resolves the updated record, or null when it
 *  no longer exists. */
export async function updateMediaMeta(id: string, patch: MediaMetaPatch): Promise<MediaRecord | null> {
	return mutateImage(id, (row) => withMeta(row, patch));
}

/** Rename an image. The old name becomes an alias, so `asset:<old>` keeps resolving. Refuses a name any
 *  other record holds as a name or alias. Renaming back to one of its own aliases takes it back. */
export async function renameMedia(id: string, to: string): Promise<MediaRecord | null> {
	return mutateImage(id, (row, others) => withRename(row, to, others), true);
}

/** A rename and a metadata edit in ONE transaction: either both land or neither does, so a refused name never
 *  leaves the edit half saved. `to` is optional; an unchanged name is not a rename. */
export async function updateMediaDetails(id: string, details: MediaMetaPatch & { name?: string }): Promise<MediaRecord | null> {
	const { name, ...patch } = details;
	return mutateImage(id, (row, others) => withMeta(name === undefined ? row : withRename(row, name, others), patch), true);
}

/** Drop one alias, freeing the name. Decks that still write it will show the missing-image stand-in. */
export async function removeMediaAlias(id: string, alias: string): Promise<MediaRecord | null> {
	return mutateImage(id, (row) => {
		const aliases = (row.aliases ?? []).filter((n) => n !== alias);
		const { aliases: _old, ...rest } = row;
		return aliases.length ? { ...rest, aliases } : rest;
	});
}

/** Read one image row, let `change` rewrite it, write it back — all in one readwrite transaction. `change`
 *  may throw a refusal. `withOthers` also reads every other media row first, for a name check. */
function mutateImage(id: string, change: (row: MediaRecord, others: MediaRecord[]) => MediaRecord, withOthers = false): Promise<MediaRecord | null> {
	return openDB().then(
		(db: IDBDatabase) =>
			new Promise<MediaRecord | null>((resolve, reject) => {
				const t = db.transaction(ASSET_STORE, 'readwrite');
				const store = t.objectStore(ASSET_STORE);
				let out: MediaRecord | null = null;
				let refusal: Error | null = null;
				t.oncomplete = () => resolve(out);
				t.onabort = () => reject(refusal || t.error || new Error('the change failed'));
				t.onerror = () => reject(t.error || new Error('the change failed'));
				const write = (row: MediaRecord & { data?: ArrayBuffer }, others: MediaRecord[]) => {
					try {
						const next = change(row, others) as MediaRecord & { data?: ArrayBuffer };
						store.put(next);
						out = readable(next);
					} catch (e) {
						refusal = e as Error;
						t.abort();
					}
				};
				const get = store.get(id);
				get.onsuccess = () => {
					const row = get.result as (MediaRecord & { data?: ArrayBuffer }) | undefined;
					if (!row || row.kind !== 'image') return;
					if (!withOthers) return write(row, []);
					const found: MediaRecord[] = [];
					const read = (i: number) => {
						const req = store.index('kind').getAll(KINDS[i]);
						req.onsuccess = () => {
							found.push(...(req.result as MediaRecord[]).filter((a) => a.id !== id));
							if (i + 1 < KINDS.length) read(i + 1);
							else write(row, found);
						};
					};
					read(0);
				};
			}),
	);
}

/** How many decks write `asset:<name>` for ANY name this record has had (its own or an alias). A deck that
 *  still uses an old name depends on the record as much as one that uses the new name. */
export function decksUsingRecord(m: Pick<MediaRecord, 'name' | 'aliases'>, sources: string[]): number {
	return sources.filter((s) => namesOf(m).some((n) => decksUsing(n, [s]))).length;
}
