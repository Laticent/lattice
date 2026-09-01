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

// Names a saved finish must NOT shadow: every shipped preset + the other
// `finish:`-register / engine reserved words. A saved finish that resolved to one
// of these would collide with a built-in `section.finish-<name>` rule (or the
// `finish-preview` specimen / `finish-none` opt-out) — so we namespace it instead.
//
// THE HARM, because it is not cosmetic. `StudioShell` injects a saved finish's CSS
// whenever a deck's `finish:` matches its name, and the saved rule is
// `section.finish.finish-<name>` (0,2,1) against the shipped `section.finish-<name>`
// (0,1,1) — so the user's finish OUTSPECIFIES the built-in. Name one "Nimbus" and every
// deck in the workspace saying `finish: nimbus` — an ordinary use of the SHIPPED
// preset — silently renders your finish instead.
//
// This list carried five presets while nine ship. `nimbus`, `loom`, `savile` and
// `gallery` are all in `resolve-finish.js`'s FINISH_REGISTER, all have a
// `section.finish-<name>` rule in `base.finish.css`, and all four are offered in the
// faculty's own "Start from preset" row — so the likeliest way to hit this was to start
// from one and keep its name. `finish-preset-parity.test.ts` now derives the preset half
// from the engine so the two cannot drift again.
export const RESERVED_FINISH_NAMES: ReadonlySet<string> = new Set([
	// the 9 shipped presets — keep in step with resolve-finish.js FINISH_REGISTER
	'atrium', 'meridian', 'strata', 'halo', 'ledger', 'nimbus', 'loom', 'savile', 'gallery',
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
 *
 * `id` PINS THE RECORD, and is what makes editing a saved asset safe: without it
 * the store finds the record to update by NAME, so renaming while editing lands the
 * edit as a SECOND record and leaves every deck pointing at the untouched first one.
 * Pass the id you loaded and the same record is rewritten whatever the name becomes.
 * Omit it and the name-keyed behavior above is unchanged.
 */
export async function saveStudioFinish(input: { id?: string; name: string; label?: string; css: string; recipe: FinishRecipe }, opts?: { historyLabel?: string }): Promise<StudioFinish> {
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
	const stored = (await putAsset((input.id ? { ...rest, id: input.id } : rest) as unknown as FinishAssetRecord, opts)) as FinishAssetRecord;
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
