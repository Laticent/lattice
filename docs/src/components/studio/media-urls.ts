// The Studio's live name → URL map for `asset:<name>` Library photos, handed to the engine as
// `opts.assetUrls` (lib/core/bg-image.js resolveAssetUrl). Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md §2.
//
// A photo's bytes live in IndexedDB, so a render needs a URL the browser can load. Each record
// gets ONE object URL, kept for the session and revoked only when the record is deleted: a
// preview, a presenter window or an export that is still painting a slide must never lose its
// picture because the shelf was re-read. A scope flip keeps the id, so it keeps the URL.
//
// WHAT THE MAP HOLDS is the assets the open deck may see: every shared asset plus that deck's
// own. Another deck's asset is deliberately absent, so a reference to it renders the missing-image
// stand-in rather than quietly working.
import type { AssetChoice } from './editor-complete';
import { listMedia, type MediaRecord, namesOf, visibleMedia } from './media-store';

const urlById = new Map<string, string>();
// The visible assets' bytes by name, kept beside the URLs so an export can read them as `data:` URIs.
const blobByName = new Map<string, { id: string; blob: Blob; mime: string; alt?: string }>();
const dataUriById = new Map<string, Promise<string>>();
// Photos whose bytes could not be read for the last export, so the Share sheet can name them.
const failedIds = new Set<string>();
let current: Record<string, string> = {};
// name → description, for the photos that have one. The engine fills an EMPTY alt from it (`opts.assetAlts`).
let currentAlts: Record<string, string> = {};
// What the editor offers when you type an image reference: the visible photos, newest first.
let choices: AssetChoice[] = [];
let activeDeckId: string | null = null;
let rev = 0;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

const signature = (m: Record<string, string>) => Object.keys(m).sort().map((k) => `${k}=${m[k]}`).join('|');

function urlFor(rec: MediaRecord): string {
	let u = urlById.get(rec.id);
	if (!u) {
		u = URL.createObjectURL(rec.blob);
		urlById.set(rec.id, u);
	}
	return u;
}

/** Re-read the shelf and rebuild the map. Bumps the revision (and tells listeners) only when the
 *  map actually changed, so an unrelated Library refresh does not re-render every preview. */
export async function refreshAssetUrls(): Promise<void> {
	const all = await listMedia();
	// Free the URL of any record that no longer exists on the shelf.
	const live = new Set(all.map((m) => m.id));
	for (const [id, u] of urlById) {
		if (!live.has(id)) {
			URL.revokeObjectURL(u);
			urlById.delete(id);
			dataUriById.delete(id);
		}
	}
	const next: Record<string, string> = {};
	const nextAlts: Record<string, string> = {};
	blobByName.clear();
	// Photos only: a deck cannot show a video through `![](asset:x)` yet, so a video name resolves to the
	// missing-image stand-in rather than a broken <img> (and is not offered by editor completion).
	const seen = visibleMedia(all, activeDeckId).filter((m) => m.kind === 'image');
	choices = seen.map((m) => ({ name: m.name, scope: m.scope, width: m.width, height: m.height, sourceName: m.sourceName }));
	for (const m of seen) {
		// Aliases resolve to the same bytes: a renamed photo keeps working under every name it has had.
		for (const n of namesOf(m)) {
			next[n] = urlFor(m);
			blobByName.set(n, { id: m.id, blob: m.blob, mime: m.mime, alt: m.caption || undefined });
			if (m.caption) nextAlts[n] = m.caption;
		}
	}
	// A description edit changes what a slide says, so it re-renders the slides like a changed photo does.
	if (signature(next) !== signature(current) || signature(nextAlts) !== signature(currentAlts)) {
		current = next;
		currentAlts = nextAlts;
		rev++;
		for (const cb of listeners) cb();
	}
}

/** The deck whose own assets the map includes. Changing it re-reads the shelf. */
export function setActiveAssetDeck(deckId: string | null): Promise<void> {
	if (deckId === activeDeckId && loaded) return loaded;
	activeDeckId = deckId;
	loaded = refreshAssetUrls().catch(() => {});
	return loaded;
}

/** The map, after the first read has finished. A render awaits this once; it is a cached promise
 *  afterwards. An unavailable store yields an empty map: every reference shows the stand-in. */
export async function ensureAssetUrls(): Promise<Record<string, string>> {
	if (!loaded) loaded = refreshAssetUrls().catch(() => {});
	await loaded;
	return current;
}

/** The descriptions the preview fills into an empty alt, after the first read. Empty for a Library with none. */
export async function ensureAssetAlts(): Promise<Record<string, string>> {
	if (!loaded) loaded = refreshAssetUrls().catch(() => {});
	await loaded;
	return currentAlts;
}

/** A CSS-comment stamp that changes when the map does. It rides in the preview's extra CSS,
 *  which every preview and export cache already keys on (the code-package stamp does the same),
 *  so adding, deleting or re-scoping an image re-renders the slides that showed the old state. */
export function assetStamp(): string {
	return rev > 0 ? `/* lattice assets: ${rev} */` : '';
}

/** The id of the deck whose own assets are visible, or null. The chat reads the same shelf. */
export function activeAssetDeckId(): string | null {
	return activeDeckId;
}

/** The photos the open deck may name, for the editor's completion. Read after `ensureAssetUrls`. */
export function assetChoices(): AssetChoice[] {
	return choices;
}

/** Hear about map changes. Returns the unsubscribe. */
export function onAssetUrlsChanged(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

/** Does this source name a Library photo? The cheap test that keeps a deck without one from
 *  loading this module's data at all. */
export function sourceUsesAssets(source: string): boolean {
	return /\basset:[a-z0-9]/i.test(source);
}

/** A Blob as a `data:` URI. Reads the bytes and encodes in chunks, so it runs the same in a
 *  browser and in Node, and a multi-megabyte photo does not blow the argument limit of `btoa`. */
async function blobToDataUri(blob: Blob, mime: string): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	// The record's own type, not the Blob's: a Blob that lost its type would otherwise ship as a mystery download.
	return `data:${mime || blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

/** The names a source writes as `asset:<name>`, lowercased and de-duplicated. The kernel
 *  (lib/core/remote-ref.js `assetName`) accepts a whole reference only when it is a plain name, so
 *  `asset:team-photo.jpg` is NOT the photo `team-photo`: it renders the stand-in. This reads the whole
 *  token, dots included, so such a reference is reported as the missing photo it is rather than
 *  counted as a use of `team-photo`. A trailing dot is sentence punctuation, not part of the name. */
export function assetNamesIn(source: string): string[] {
	const out = new Set<string>();
	for (const m of source.matchAll(/\basset:([a-z0-9][a-z0-9._-]*)/gi)) out.add(m[1].replace(/\.+$/, '').toLowerCase());
	return [...out];
}

/**
 * The name → `data:` URI map an EXPORT renders with, for the photos `source` names and the open deck
 * may see. A `blob:` URL cannot be used here: it dies with the tab, so a saved file would ship a dead
 * link, and a capture frame (the PDF, PNG and PowerPoint cameras) is not allowed to fetch one. Only
 * the photos the deck names are read, and each is encoded once per session. A name the shelf does
 * not hold is left out, so the engine draws the missing-image stand-in for it.
 */
export async function dataUrlsFor(source: string): Promise<Record<string, string>> {
	// One read of the shelf per export, so a photo added in another tab a moment ago is not reported as missing.
	await refreshAssetUrls();
	const out: Record<string, string> = {};
	for (const name of assetNamesIn(source)) {
		const rec = blobByName.get(name);
		if (!rec) continue;
		let p = dataUriById.get(rec.id);
		if (!p) {
			p = blobToDataUri(rec.blob, rec.mime);
			dataUriById.set(rec.id, p);
			// A read that failed (a photo deleted mid-export, a decode out of memory) must not be remembered:
			// the next export would fail the same way for the rest of the session.
			p.catch(() => dataUriById.delete(rec.id));
		}
		// ONE photo that cannot be read costs that photo, not the whole export: it is left out of the map (the
		// engine draws the stand-in for it), and named to the Share sheet.
		try {
			out[name] = await p;
			failedIds.delete(rec.id);
		} catch {
			failedIds.add(rec.id);
		}
	}
	return out;
}

/** The descriptions an EXPORT fills into an empty alt: only the photos `source` names. Read after `dataUrlsFor`,
 *  which refreshes the shelf. */
export async function altsFor(source: string): Promise<Record<string, string>> {
	await refreshAssetUrls();
	const out: Record<string, string> = {};
	for (const name of assetNamesIn(source)) {
		const alt = blobByName.get(name)?.alt;
		if (alt) out[name] = alt;
	}
	return out;
}

/** The names `source` writes that the open deck cannot see (deleted, or another deck's). An export
 *  says so, so a stand-in in the file is never a surprise. */
export async function missingAssetNames(source: string): Promise<string[]> {
	await refreshAssetUrls();
	return assetNamesIn(source).filter((n) => {
		const rec = blobByName.get(n);
		return !rec || failedIds.has(rec.id);
	});
}

/** Test seam: forget everything. */
export function resetAssetUrlsForTests(): void {
	for (const u of urlById.values()) URL.revokeObjectURL(u);
	urlById.clear();
	blobByName.clear();
	dataUriById.clear();
	failedIds.clear();
	current = {};
	currentAlts = {};
	choices = [];
	activeDeckId = null;
	rev = 0;
	loaded = null;
	listeners.clear();
}
