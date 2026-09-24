// ONE import funnel for packages from someone else — the Library's `.zip` import and the
// packages a `.lattice` project carries (engineering/decisions/2026-09-23-portable-packages.md
// §4). Every item passes the same gates, is renamed the same way when it takes a shipped
// name, and is refused the same way; a second copy of this loop would be a second place for
// a gate to be forgotten.
//
// Per ITEM, not per bundle: one refused asset never skips the ones after it.

import type { ParsedBundle } from '../asset-bundle';
import { saveStudioComponent, toMeta } from '../component-library';
import { saveStudioFinish } from '../finish-library';
import { type ImportRefusal, refuseImportedComponent, refuseImportedTheme } from '../import-gate';
import { saveStudioScene } from '../scene-library';
import { saveStudioTheme } from '../theme-library';
import { RESERVED_COMPONENT_NAMES, RESERVED_THEME_NAMES } from './reserved-names';

export type ImportTally = {
	themes: number;
	components: number;
	finishes: number;
	scenes: number;
	/** Items not imported, each with the reason. */
	refused: NonNullable<ImportRefusal>[];
	/** Items saved under `<name>-custom` because they took a shipped name. */
	renamed: string[];
	/** What the reader changed or left out (a renamed file, a dropped README). */
	notes: string[];
};

export async function importParsedBundle(parsed: ParsedBundle): Promise<ImportTally> {
	const t: ImportTally = { themes: 0, components: 0, finishes: 0, scenes: 0, refused: [...parsed.refused], renamed: [], notes: [...parsed.notes] };
	// `historyLabel` — an import that lands on a name you already use REPLACES that record
	// (the store dedupes by kind+name when no id is passed), so the version it snapshots is
	// the one thing between a stranger's file and your own work.
	for (const th of parsed.themes) {
		const no = await refuseImportedTheme(th.css, th.label || th.name);
		if (no) {
			t.refused.push(no);
			continue;
		}
		const st = await saveStudioTheme({ name: th.name, label: th.label, essentials: th.essentials ?? {}, css: th.css, ...(th.overrides ? { overrides: th.overrides } : {}), ...(th.rampStrategy ? { rampStrategy: th.rampStrategy } : {}), ...(th.pkg ? { pkg: th.pkg } : {}) }, { historyLabel: 'Before import' });
		if (RESERVED_THEME_NAMES.has(th.name)) t.renamed.push(`theme “${th.name}” → “${st.name}”`);
		t.themes++;
	}
	for (const c of parsed.components) {
		const no = await refuseImportedComponent(c.css, c.name);
		if (no) {
			t.refused.push(no);
			continue;
		}
		// A package carries the full manifest, so a component imported from one keeps its
		// function/form/substance/description and can be re-saved; a legacy zip carried only
		// the bucket.
		const sc = await saveStudioComponent({ name: c.name, css: c.css, skeleton: c.skeleton, meta: c.manifest ? toMeta(c.manifest) : { bucket: c.bucket || undefined }, ...(c.pkg ? { pkg: c.pkg } : {}) }, { historyLabel: 'Before import' });
		if (RESERVED_COMPONENT_NAMES.has(c.name)) t.renamed.push(`component “.${c.name}” → “.${sc.name}”`);
		t.components++;
	}
	// A finish needs no CSS gate: `saveStudioFinish` DISCARDS any CSS and regenerates it from
	// the recipe, and `coerceRecipe` clamps every number and enum-checks every keyword on the
	// way in. Safe by construction, not by a scan.
	for (const fin of parsed.finishes) {
		await saveStudioFinish({ name: fin.name, label: fin.label, css: fin.css, recipe: fin.recipe, ...(fin.pkg ? { pkg: fin.pkg } : {}) }, { historyLabel: 'Before import' });
		t.finishes++;
	}
	// The art goes back through `saveStudioScene`, which re-sanitizes at the store boundary.
	for (const m of parsed.scenes) {
		try {
			await saveStudioScene({ name: m.name, label: m.label, description: m.description, spec: m.spec, art: m.art, poster: m.poster, ...(m.pkg ? { pkg: m.pkg } : {}) });
			t.scenes++;
		} catch {
			t.refused.push({ name: m.label || m.name, why: 'its motion plan is not valid' });
		}
	}
	return t;
}
