// The Studio finish library — a thin wrapper over the SHARED Workbench asset store
// (asset-store.js, IndexedDB `lattice-workbench`), the same shelf the theme +
// component libraries use. REUSE, DON'T REINVENT (HARD RULE #15): a finish you
// design + save in the Finish faculty lands beside your saved themes and
// components, survives a reload, and becomes pickable in the Inspector Finish menu
// (where its CSS is injected into the deck preview + its class applied — the
// consumption loop). Degrades gracefully when IndexedDB is unavailable (private
// mode / SSR / jsdom) so a read never throws — it just returns an empty shelf.

import { deleteAsset, listAssets, putAsset } from '@/components/studio/library/asset-store.js';
import { coerceRecipe, type FinishRecipe, generateFinishCss } from './finish-generate';

/** A saved finish as the Studio uses it (render with its CSS via DeckPreview's
 *  extraCss + the `finish finish-<name>` class). */
export type StudioFinish = {
	id: string;
	name: string; // lowercase slug — the `finish-<name>` class fragment
	label: string; // human-facing name
	css: string; // the generated `section.finish.finish-<name> { … }` rule
	recipe: FinishRecipe; // the structured layer recipe (for re-editing)
};

// The asset record asset-store persists. `kind:'finish'` keeps it in its own lane
// (listAssets filters by kind), beside 'theme' and 'component'.
type FinishAssetRecord = { id: string; kind: 'finish'; name: string; label?: string; text?: string; recipe?: unknown; addedAt?: number };

function toStudioFinish(a: FinishAssetRecord): StudioFinish {
	return { id: a.id, name: a.name, label: a.label || a.name, css: a.text || '', recipe: coerceRecipe(a.recipe) };
}

// Names a saved finish must NOT shadow: the 5 shipped presets + the other
// `finish:`-register / engine reserved words. A saved finish that resolved to one
// of these would collide with a built-in `section.finish-<name>` rule (or the
// `finish-preview` specimen / `finish-none` opt-out) — so we namespace it instead.
// Mirrors resolve-finish.js FINISH_REGISTER + base.finish.css's reserved selectors.
export const RESERVED_FINISH_NAMES: ReadonlySet<string> = new Set([
	'atrium', 'meridian', 'strata', 'halo', 'ledger', // the 5 shipped presets
	'boardroom', 'sketch', 'sketch-clean', 'none', 'preview', // register + engine reserved
]);

/** Turn arbitrary text into a valid finish slug, or '' when nothing usable remains. */
export function slugify(text: string): string {
	return String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/, '');
}

/** A slug guaranteed not to shadow a built-in: a reserved collision is namespaced
 *  with a `-custom` suffix (so `atrium` saves as `atrium-custom`), keeping a user
 *  finish from masking a shipped preset's `section.finish-<name>` rule. */
export function safeSaveSlug(text: string): string {
	const s = slugify(text);
	if (!s) return '';
	return RESERVED_FINISH_NAMES.has(s) ? `${s}-custom` : s;
}

/**
 * Save a designed finish to the shared library. Re-saving the same name UPDATES in
 * place (asset-store keys on kind+name) rather than piling up duplicates. The
 * recipe is persisted so a saved finish reloads with its layer stack intact for
 * re-editing. Resolves to the stored Studio finish; rejects if the store is
 * unavailable.
 */
export async function saveStudioFinish(input: { name: string; label?: string; css: string; recipe: FinishRecipe }): Promise<StudioFinish> {
	// safeSaveSlug namespaces a reserved-name collision so a saved finish can never
	// shadow a built-in preset (e.g. `atrium` → `atrium-custom`); empty → a timestamp.
	const name = safeSaveSlug(input.name) || `finish-${Date.now().toString(36)}`;
	// REGENERATE the CSS for the final slug so the `section.finish.finish-<name>`
	// selector always matches the stored `name` — even when the slug was namespaced
	// (a caller's pre-generated CSS would carry the unsafe slug and never resolve).
	const css = generateFinishCss(name, input.recipe);
	const record: FinishAssetRecord = {
		id: '', // asset-store assigns one (or reuses the existing id for kind+name)
		kind: 'finish',
		name,
		label: input.label || name,
		text: css,
		recipe: input.recipe,
		addedAt: Date.now(),
	};
	// asset-store's putAsset replaces the empty id with a generated/looked-up one.
	const { id: _drop, ...rest } = record;
	const stored = (await putAsset(rest as unknown as FinishAssetRecord)) as FinishAssetRecord;
	return toStudioFinish(stored);
}

/** Every saved finish, newest first. Returns [] when the store is unavailable. */
export async function listStudioFinishes(): Promise<StudioFinish[]> {
	try {
		const rows = (await listAssets('finish')) as FinishAssetRecord[];
		return rows.map(toStudioFinish);
	} catch {
		return [];
	}
}

/** Remove a saved finish by id (no-op if the store is unavailable). */
export async function deleteStudioFinish(id: string): Promise<void> {
	try {
		await deleteAsset(id);
	} catch {
		/* unavailable — non-fatal */
	}
}
