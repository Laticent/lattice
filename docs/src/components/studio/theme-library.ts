// The Studio theme library — a thin wrapper over the SHARED Workbench asset
// store (asset-store.js, IndexedDB `lattice-workbench`) and the canonical
// `themeAsset` record shape (theme-core). REUSE, DON'T REINVENT (HARD RULE #15):
// a theme you derive + save in the Studio's Fabricate lands in the SAME library
// the Workbench's Theme Studio saves into, so the two surfaces share one shelf
// rather than each keeping a private silo.
//
// The persistence + record shapes are the trusted cores; this module only maps
// between the asset record and the Studio's view model, and degrades gracefully
// when IndexedDB is unavailable (private mode / SSR / jsdom) so a read never
// throws — it just returns an empty shelf.

import { deleteAsset, listAssets, putAsset } from '@/components/studio/library/asset-store.js';
import { themeAsset } from '@/playground/theme-core.generated.js';

/** A saved theme as the Studio uses it (render with `extraTheme={name,css}`). */
export type StudioTheme = {
	id: string;
	name: string; // lowercase slug — the engine theme name
	label: string; // human-facing name
	css: string; // the serialized themes/*.css
	essentials: Record<string, string> | null; // the 10 picked colors (for re-editing)
};

// The asset record as asset-store persists it (themeAsset shape).
type ThemeAssetRecord = { id: string; name: string; label?: string; text?: string; essentials?: Record<string, string> | null };

/**
 * Turn arbitrary text into a valid engine theme slug (`^[a-z][a-z0-9-]*$`), or
 * '' when nothing usable remains (caller falls back to a derived name). Mirrors
 * the Workbench's slugify so the two libraries agree on naming.
 */
export function slugify(text: string): string {
	const s = String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/^[^a-z]+/, ''); // a theme name must START with a letter
	// Trim again AFTER truncation so a cut that lands on a hyphen can't leave a
	// trailing '-'.
	return s.slice(0, 40).replace(/-+$/, '');
}

function toStudioTheme(a: ThemeAssetRecord): StudioTheme {
	return { id: a.id, name: a.name, label: a.label || a.name, css: a.text || '', essentials: a.essentials ?? null };
}

/**
 * Save a derived theme to the shared library. `name` is preferred when it's
 * already a valid slug (Fabricate's content-hash name always is); otherwise we
 * slug the label, then fall back to the given name. Re-saving the same name
 * UPDATES in place (asset-store keys on kind+name) rather than piling up dupes.
 * Resolves to the stored Studio theme; rejects if the store is unavailable.
 */
export async function saveStudioTheme(input: { name: string; label: string; essentials: Record<string, string>; css: string }): Promise<StudioTheme> {
	// The invariant the feature rests on: the stored record name MUST equal the
	// name the CSS was serialized under (its `@theme <name>`), or the engine
	// registers the theme under the CSS name while the deck renders by record name
	// → a blank, unthemed render. The caller already serialized `css` under
	// `input.name`, so TRUST it when it's a valid slug; only fall back (to the
	// label slug, then a stamped form) when it isn't.
	const name = /^[a-z][a-z0-9-]*$/.test(input.name) ? input.name : slugify(input.label) || `theme-${slugify(input.name) || 'studio'}`;
	const asset = themeAsset({ name, label: input.label, essentials: input.essentials, css: input.css });
	const stored = (await putAsset(asset)) as ThemeAssetRecord;
	return toStudioTheme(stored);
}

/** Every saved theme, newest first. Returns [] when the store is unavailable. */
export async function listStudioThemes(): Promise<StudioTheme[]> {
	try {
		const rows = (await listAssets('theme')) as ThemeAssetRecord[];
		return rows.map(toStudioTheme);
	} catch {
		return [];
	}
}

/** Remove a saved theme by id (no-op if the store is unavailable). */
export async function deleteStudioTheme(id: string): Promise<void> {
	try {
		await deleteAsset(id);
	} catch {
		/* unavailable — non-fatal */
	}
}
