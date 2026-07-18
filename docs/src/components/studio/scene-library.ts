// The Studio scene library — a thin wrapper over the SHARED Workbench asset store
// (asset-store.js, IndexedDB `lattice-workbench`), the same shelf the theme +
// component + finish libraries use. REUSE, DON'T REINVENT (HARD RULE #15): a MOTION
// scene you fabricate + save in the Motion faculty lands beside your saved themes,
// components, and finishes, survives a reload, and reloads for re-editing / placing
// via the host `scene` component (Stage 5). Degrades gracefully when IndexedDB is
// unavailable (private mode / SSR / jsdom) so a read never throws — it returns [].
//
// The SPEC is the canonical artifact (the validated Anima `Scene`); `poster`/`art` are
// derived/authored SVG strings. SECURITY (HARD RULE #22): `art` (authored line-art) and
// `poster` (a serialized still) are UNTRUSTED markup — a consumer that renders them into
// a preview frame MUST run them through `sanitizeSlideHtml` first (the same contract the
// Vivus backend + AssetMap document). This module only PERSISTS strings; it never injects
// them into the DOM, so it is not itself a sink.
//
// Decision: engineering/decisions/2026-07-18-anima-motion-faculty-modes.md §4.

import { parseScene, type Scene } from '@/lib/anima';
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
	const record: SceneAssetRecord = {
		id: '', // asset-store assigns one (or reuses the existing id for kind+name)
		kind: 'scene',
		name,
		label: input.label || name,
		description: input.description,
		spec: r.scene,
		poster: input.poster,
		art: input.art,
		addedAt: Date.now(),
	};
	const { id: _drop, ...rest } = record;
	const stored = (await putAsset(rest as unknown as SceneAssetRecord)) as SceneAssetRecord;
	const studio = toStudioScene(stored);
	if (!studio) throw new Error('Saved scene failed to reload — spec did not re-validate.');
	return studio;
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
