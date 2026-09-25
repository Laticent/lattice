// The Studio scene library — a thin wrapper over the SHARED Workbench asset store
// (asset-store.js, IndexedDB `lattice-workbench`), the same shelf the theme +
// component + finish libraries use. REUSE, DON'T REINVENT (HARD RULE #15): a MOTION
// scene you fabricate + save in the Motion faculty lands beside your saved themes,
// components, and finishes, survives a reload, and reloads for re-editing / placing
// via the host `scene` component (Stage 5). Degrades gracefully when IndexedDB is
// unavailable (private mode / SSR / jsdom) so a read never throws — it returns [].
//
// The SPEC is the canonical artifact (the validated Anima `Scene`); `poster`/`art` are
// derived/authored SVG strings.
//
// SECURITY (HARD RULE #22): `art` (authored line-art) and `poster` (a serialized still) are
// UNTRUSTED markup (AI-authored / bundle-shared). `saveStudioScene` sanitizes them at the
// STORE BOUNDARY (`sanitizeSlideHtml`) before they are persisted — so EVERY persistence path
// (workspace restore today; the faculty-save + Library-import paths in Stage 5/7) is covered
// by construction, and an unsanitized write is impossible (the snapshot-cache.js precedent:
// sanitize at the storage boundary, not per-caller). `sanitizeSlideHtml` is a no-op only in a
// window-less context — where there is also no IndexedDB to persist into — so the guarantee
// holds wherever a store exists. The preview-frame builder re-sanitizes as defense-in-depth;
// its #22-gate registration lands with the render sink in Stage 5/7.
//
// Decision: engineering/decisions/2026-07-18-anima-motion-faculty-modes.md §4.

import { deleteAsset, listAssets, putAsset } from '@/components/studio/library/asset-store.js';
import type { PackageCarry } from '@/components/studio/library/package-carry';
import { parseScene, type Scene } from '@/lib/anima';
import { sanitizeSlideHtml } from '@/lib/sanitize-slide-html.js';

// The remote-reference predicate loads ON DEMAND: this module is on the Studio's eager path,
// and the predicate is only needed once a scene is actually read or written, which is always
// an async step already. A DEFAULT import: it is a CommonJS leaf
// (docs/src/plugins/vite-cjs-lib-dev.mjs).
type RemoteRef = typeof import('../../../../lib/core/remote-ref.js');
let remoteRefLoad: Promise<RemoteRef> | null = null;
function loadRemoteRef(): Promise<RemoteRef> {
	if (!remoteRefLoad) remoteRefLoad = import('../../../../lib/core/remote-ref.js').then((m) => (m as unknown as { default: RemoteRef }).default ?? m);
	return remoteRefLoad;
}

/** A saved scene as the Studio uses it. The `spec` is canonical; `poster` is a
 *  regenerable, token-preserving thumbnail (kept as `var(--token)`, never theme-frozen —
 *  §4.1); `art` is the authored SVG line-art for a `source:'svg'` (Vivus) scene. */
export type StudioScene = {
	id: string;
	name: string; // lowercase slug
	label: string; // human-facing name
	description?: string;
	spec: Scene; // the validated Anima scene spec — the source of truth
	poster?: string; // serialized still SVG (token-preserving); a Library thumbnail
	art?: string; // source:'svg' line-art markup (UNTRUSTED — sanitize before preview)
	/** What an imported package carried that this record does not model (its manifest),
	 *  so exporting it again writes the same files. */
	pkg?: PackageCarry;
};

/** The spec shape a record was written under. Stamped on every save from #2071 onward.
 *  A record with NO `specVersion` was written before we counted — which is "older than the
 *  stamp", NOT "corrupt". That distinction is the whole point: it lets a future schema change
 *  MIGRATE a record instead of dropping it, which is exactly what
 *  `2026-09-02-frame-model-for-motion.md` §7c says was missing. */
export const SCENE_SPEC_VERSION = 1;

/** A stored record whose spec no longer validates. It is KEPT, not dropped — see
 *  `listStoredScenes`. `raw` is the record exactly as persisted, so an export can hand the
 *  user's work back byte-for-byte even though nothing can render it. */
export type UnreadableScene = {
	valid: false;
	id: string;
	name: string;
	label: string;
	description?: string;
	/** Why `parseScene` rejected it — shown to the user, never swallowed. */
	reason: string;
	/** `undefined` for a record written before the stamp existed. */
	specVersion?: number;
	raw: unknown;
};

/** Every stored scene, readable or not. The discriminant is `valid`. */
export type StoredScene = { valid: true; scene: StudioScene } | UnreadableScene;

// The asset record asset-store persists. `kind:'scene'` keeps it in its own lane
// (listAssets filters by kind), beside 'theme' / 'component' / 'finish'.
type SceneAssetRecord = { id: string; kind: 'scene'; name: string; label?: string; description?: string; spec?: unknown; poster?: string; art?: string; addedAt?: number; specVersion?: number; pkg?: PackageCarry };

/** Script-free scene markup with every REMOTE reference taken out: an attribute that
 *  fetches from another origin (`<image href>`, `<feImage href>`, `xlink:href`) or carries a
 *  remote `url()` (`style`, `fill`, `filter`) is dropped. `sanitizeSlideHtml` keeps those on
 *  purpose — a deck's own images are remote — but scene art is line-art: it never needs the
 *  network, and the Library draws it on the Studio origin, where a remote reference is a
 *  beacon to whoever sent the package. The predicate is `lib/core/remote-ref.js`, shared with
 *  the gallery gate. A window-less context has no DOM and no store, so it passes through. */
function stripRemoteRefs(svg: string, attrIsRemote: RemoteRef['attrIsRemote']): string {
	if (typeof document === 'undefined') return svg;
	const t = document.createElement('template');
	t.innerHTML = svg;
	let hit = false;
	for (const el of t.content.querySelectorAll('*')) {
		for (const a of [...el.attributes]) {
			if (attrIsRemote(el.localName.toLowerCase(), a.name.toLowerCase(), a.value)) {
				el.removeAttributeNode(a);
				hit = true;
			}
		}
	}
	return hit ? t.innerHTML : svg;
}

/** Sanitize a scene's UNTRUSTED SVG markup (`poster`/`art`) — the store-boundary chokepoint
 *  (HARD RULE #22). Applied by `saveStudioScene` so no raw markup is ever persisted, whatever
 *  the caller, and on every READ, so a record saved before the remote-reference strip is
 *  drawn without its beacon too. Exported so the boundary is directly unit-testable without
 *  the IndexedDB store. */
export async function sanitizeSceneAssets<T extends { poster?: string; art?: string }>(a: T): Promise<T> {
	if (!a.poster && !a.art) return a;
	const { attrIsRemote } = await loadRemoteRef();
	const clean = (m?: string) => (m ? stripRemoteRefs(sanitizeSlideHtml(m), attrIsRemote) : m);
	return { ...a, poster: clean(a.poster), art: clean(a.art) };
}

/** Turn arbitrary text into a valid scene slug, or '' when nothing usable remains. */
export function slugify(text: string): string {
	return String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/, '');
}

async function toStoredScene(a: SceneAssetRecord): Promise<StoredScene> {
	// The spec is still the source of truth, and a record that fails to parse still never
	// yields a renderable scene — but it is now REPORTED rather than erased. Fail-closed on
	// RENDERING, fail-open on EXISTENCE: the two are different guarantees, and conflating them
	// is what made a schema change able to delete a user's work (frame model §7c).
	const r = parseScene(a.spec);
	if (!r.ok) return { valid: false, id: a.id, name: a.name, label: a.label || a.name, description: a.description, reason: r.errors.join('; '), specVersion: a.specVersion, raw: a };
	// Re-sanitized on the way OUT as well: a record written before a guard existed keeps what
	// the guard now removes, and the Library draws `art` with `dangerouslySetInnerHTML`.
	const { poster, art } = await sanitizeSceneAssets({ poster: a.poster, art: a.art });
	return { valid: true, scene: { id: a.id, name: a.name, label: a.label || a.name, description: a.description, spec: r.scene, poster, art, ...(a.pkg ? { pkg: a.pkg } : {}) } };
}

/**
 * Save a fabricated scene to the shared library. Re-saving the same name UPDATES in
 * place (asset-store keys on kind+name) rather than piling up duplicates. The spec is
 * VALIDATED before it is stored (a scene the schema rejects can't silently land).
 * Resolves to the stored Studio scene; rejects on an invalid spec or an unavailable store.
 */
export async function saveStudioScene(input: { id?: string; name: string; label?: string; description?: string; spec: Scene; poster?: string; art?: string; pkg?: PackageCarry }): Promise<StudioScene> {
	const r = parseScene(input.spec);
	if (!r.ok) throw new Error(`Invalid scene spec — not saved: ${r.errors.join('; ')}`);
	const name = slugify(input.name) || `scene-${Date.now().toString(36)}`;
	// Sanitize the untrusted SVG markup HERE, at the store boundary — so no caller (restore,
	// faculty save, Library import) can persist raw markup (HARD RULE #22, snapshot-cache pattern).
	const { poster, art } = await sanitizeSceneAssets({ poster: input.poster, art: input.art });
	const record: SceneAssetRecord = {
		id: '', // asset-store assigns one (or reuses the existing id for kind+name)
		kind: 'scene',
		name,
		label: input.label || name,
		description: input.description,
		spec: r.scene,
		poster,
		art,
		addedAt: Date.now(),
		specVersion: SCENE_SPEC_VERSION,
		...(input.pkg ? { pkg: input.pkg } : {}),
	};
	const { id: _drop, ...rest } = record;
	const stored = (await putAsset((input.id ? { ...rest, id: input.id } : rest) as unknown as SceneAssetRecord)) as SceneAssetRecord;
	// The spec was validated above (parseScene returns it by reference), so build the Studio
	// scene directly from the already-valid `r.scene` + the store-assigned id — no re-parse.
	return { id: stored.id, name: stored.name, label: stored.label || stored.name, description: stored.description, spec: r.scene, poster: stored.poster, art: stored.art, ...(stored.pkg ? { pkg: stored.pkg } : {}) };
}

/**
 * Every stored scene, newest first — READABLE OR NOT, and it THROWS when the store fails.
 *
 * Both halves are the fix for the data-loss defect in
 * `2026-09-02-frame-model-for-motion.md` §7c, and each closes a different silent failure:
 *
 *  1. **Nothing is filtered away.** `listStudioScenes` used to drop every record whose spec no
 *     longer validated. Because `workspace-backup.ts` builds the backup FROM that list, a
 *     tightened schema deleted the user's scenes from the Library *and* from the only copy they
 *     had — with no message. A caller that needs renderable scenes filters at its own call site,
 *     where the drop is visible and countable.
 *  2. **A failed read is not an empty shelf.** The old `catch { return [] }` let a transient
 *     IndexedDB failure at backup time produce a backup that cheerfully reported `0 scene(s)`.
 *     A backup is the one caller that must never confuse "I could not read" with "there is
 *     nothing there", so this one rejects and the caller decides.
 *
 * `listStudioScenes` keeps the old forgiving contract for the UI callers that want it.
 */
export async function listStoredScenes(): Promise<StoredScene[]> {
	const rows = (await listAssets('scene')) as SceneAssetRecord[];
	return Promise.all(rows.map(toStoredScene));
}

/** Every RENDERABLE saved scene, newest first. Returns [] when the store is unavailable — the
 *  module's long-standing "a read never throws" contract. It has no production caller today (the
 *  backup and the Studio both read `listStoredScenes`, which reports what it could not parse);
 *  it is kept as the narrow, forgiving read for a surface that only ever wants renderable scenes. */
export async function listStudioScenes(): Promise<StudioScene[]> {
	try {
		const rows = await listStoredScenes();
		return rows.filter((r): r is { valid: true; scene: StudioScene } => r.valid).map((r) => r.scene);
	} catch {
		return [];
	}
}

/**
 * Put an UNREADABLE record back exactly as it was — the restore half of the §7c fix.
 *
 * `saveStudioScene` validates, and must: it is the path a fabricated or AI-authored scene takes,
 * and an invalid spec there is a bug to refuse. But a record that was already on the user's shelf
 * before a schema tightened is not a bug to refuse — it is their work, and a restore that silently
 * declined to put it back would re-open the same hole from the other end.
 *
 * The one thing that is NOT preserved verbatim is the untrusted markup: `poster`/`art` still go
 * through `sanitizeSceneAssets`, because HARD RULE #22's store-boundary guarantee has to hold on
 * EVERY write, and a backup file is exactly the hand-editable input that guarantee exists for.
 *
 * Returns whether it wrote: `false` for a junk row, and for a name a working scene already holds.
 */
export async function putUnreadableScene(raw: unknown, shelf?: Map<string, SceneAssetRecord>): Promise<boolean> {
	if (!raw || typeof raw !== 'object') return false;
	const rec = raw as SceneAssetRecord;
	// The name becomes a folder and file name in every later backup and export, so it must be one
	// this store could have written: a slug (`slugify`). An object, or a name with a slash, from a
	// hand-edited backup is declined, not saved to re-fire as `motion/[object Object]/` or `/`.
	if (typeof rec.name !== 'string' || !rec.name || slugify(rec.name) !== rec.name) return false;
	// KEYED BY NAME, never by the backup's own `id` (followups.d/2336 item 16). The id is whatever
	// the file says, and `putAsset`'s id path is a blind put: a row carrying the id of one of your
	// saved THEMES replaced that theme with a scene record, and scenes keep no version history.
	// Looking the name up among scenes can only ever touch a scene. Two cases, both from the
	// §7c fix: a WORKING scene of this name is kept and the unreadable copy declined (a restore
	// must not replace a scene that renders with one that does not), and an unreadable one of
	// this name is updated in place, so a repeated restore stays idempotent.
	const { id: _fromFile, ...body } = rec;
	// The spec is kept verbatim (that is the point of this lane); the markup and text fields are
	// kept only as strings, which is all the store ever writes.
	const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
	// `shelf` is the caller's one read of the scene shelf, kept current here, so a restore of N rows
	// reads the shelf once rather than N times (`unreadableSceneShelf`).
	const same = shelf ? shelf.get(rec.name) : ((await listAssets('scene')) as SceneAssetRecord[]).find((s) => s.name === rec.name);
	if (same && parseScene(same.spec).ok) return false;
	const stored = (await putAsset({ ...body, label: str(rec.label), description: str(rec.description), ...(await sanitizeSceneAssets({ poster: str(rec.poster), art: str(rec.art) })), kind: 'scene', ...(same ? { id: same.id } : {}) } as unknown as SceneAssetRecord)) as SceneAssetRecord;
	shelf?.set(rec.name, stored);
	return true;
}

/** The scene shelf keyed by name, read once, for a batch of `putUnreadableScene` calls. */
export async function unreadableSceneShelf(): Promise<Map<string, SceneAssetRecord>> {
	const rows = (await listAssets('scene')) as SceneAssetRecord[];
	const shelf = new Map<string, SceneAssetRecord>();
	for (const r of rows) if (!shelf.has(r.name)) shelf.set(r.name, r);
	return shelf;
}

/** Remove a saved scene by id (no-op if the store is unavailable). */
export async function deleteStudioScene(id: string): Promise<void> {
	try {
		await deleteAsset(id);
	} catch {
		/* unavailable — non-fatal */
	}
}
