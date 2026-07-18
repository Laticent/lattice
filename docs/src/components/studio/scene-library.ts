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

import { parseScene, type Scene } from '@/lib/anima';
import { sanitizeSlideHtml } from '@/lib/sanitize-slide-html.js';
import { deleteAsset, listAssets, putAsset } from '@/playground/asset-store.js';

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
};

// The asset record asset-store persists. `kind:'scene'` keeps it in its own lane
// (listAssets filters by kind), beside 'theme' / 'component' / 'finish'.
type SceneAssetRecord = { id: string; kind: 'scene'; name: string; label?: string; description?: string; spec?: unknown; poster?: string; art?: string; addedAt?: number };

/** The engine a scene targets, derived from its source (built→Zdog, svg→Vivus). */
export function sceneEngine(spec: Scene): 'zdog' | 'vivus' {
	return spec.source === 'svg' ? 'vivus' : 'zdog';
}

/** Sanitize a scene's UNTRUSTED SVG markup (`poster`/`art`) — the store-boundary chokepoint
 *  (HARD RULE #22). Applied by `saveStudioScene` so no raw markup is ever persisted, whatever
 *  the caller. Exported so the boundary is directly unit-testable without the IndexedDB store. */
export function sanitizeSceneAssets<T extends { poster?: string; art?: string }>(a: T): T {
	return { ...a, poster: a.poster ? sanitizeSlideHtml(a.poster) : a.poster, art: a.art ? sanitizeSlideHtml(a.art) : a.art };
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

function toStudioScene(a: SceneAssetRecord): StudioScene | null {
	// The spec is the source of truth — a record whose spec no longer validates is
	// dropped (fail-closed), so a corrupt/old record never yields an unrenderable scene.
	const r = parseScene(a.spec);
	if (!r.ok) return null;
	return { id: a.id, name: a.name, label: a.label || a.name, description: a.description, spec: r.scene, poster: a.poster, art: a.art };
}

/**
 * Save a fabricated scene to the shared library. Re-saving the same name UPDATES in
 * place (asset-store keys on kind+name) rather than piling up duplicates. The spec is
 * VALIDATED before it is stored (a scene the schema rejects can't silently land).
 * Resolves to the stored Studio scene; rejects on an invalid spec or an unavailable store.
 */
export async function saveStudioScene(input: { name: string; label?: string; description?: string; spec: Scene; poster?: string; art?: string }): Promise<StudioScene> {
	const r = parseScene(input.spec);
	if (!r.ok) throw new Error(`Invalid scene spec — not saved: ${r.errors.join('; ')}`);
	const name = slugify(input.name) || `scene-${Date.now().toString(36)}`;
	// Sanitize the untrusted SVG markup HERE, at the store boundary — so no caller (restore,
	// faculty save, Library import) can persist raw markup (HARD RULE #22, snapshot-cache pattern).
	const { poster, art } = sanitizeSceneAssets({ poster: input.poster, art: input.art });
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
	};
	const { id: _drop, ...rest } = record;
	const stored = (await putAsset(rest as unknown as SceneAssetRecord)) as SceneAssetRecord;
	// The spec was validated above (parseScene returns it by reference), so build the Studio
	// scene directly from the already-valid `r.scene` + the store-assigned id — no re-parse.
	return { id: stored.id, name: stored.name, label: stored.label || stored.name, description: stored.description, spec: r.scene, poster: stored.poster, art: stored.art };
}

/** Every saved scene, newest first. Returns [] when the store is unavailable. */
export async function listStudioScenes(): Promise<StudioScene[]> {
	try {
		const rows = (await listAssets('scene')) as SceneAssetRecord[];
		return rows.map(toStudioScene).filter((s): s is StudioScene => s != null);
	} catch {
		return [];
	}
}

/** Remove a saved scene by id (no-op if the store is unavailable). */
export async function deleteStudioScene(id: string): Promise<void> {
	try {
		await deleteAsset(id);
	} catch {
		/* unavailable — non-fatal */
	}
}
