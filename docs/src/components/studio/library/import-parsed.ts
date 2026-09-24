// ONE import funnel for packages from someone else — the Library's `.zip` import and the
// packages a `.lattice` project carries (engineering/decisions/2026-09-23-portable-packages.md
// §4). Every item passes the same gates, is renamed the same way when it takes a shipped
// name, and is refused the same way; a second copy of this loop would be a second place for
// a gate to be forgotten.
//
// Per ITEM, not per bundle: one refused asset never skips the ones after it.
//
// TWO POSTURES, because the two doors differ in who asked for what.
//   - The Library's import is a deliberate act on a file the user chose, so a same-name
//     record is REPLACED (with a history snapshot) — the behavior that door always had.
//   - Opening a `.lattice` is not a request to change your Library. `keepMine` never
//     overwrites: an item identical to a saved one is skipped, and one that differs is
//     saved under a FREE name. The caller rewrites the opened deck to that name
//     (`renames`), so the deck renders what its author sent and every other deck keeps
//     rendering yours. Before this, a stranger's `.lattice` carrying `brand` silently
//     re-skinned every deck of yours that said `theme: brand`.

import type { ParsedBundle } from '../asset-bundle';
import { type ImportRename, renameAssetInSource } from '../asset-rename';

export { applyImportRenames, type ImportRename } from '../asset-rename';

import { listStudioComponents, saveStudioComponent, toMeta } from '../component-library';
import { listStudioFinishes, safeSaveSlug, saveStudioFinish } from '../finish-library';
import { type ImportRefusal, refuseImportedComponent, refuseImportedTheme } from '../import-gate';
import { saveStudioScene } from '../scene-library';
import { listStudioThemes, loadThemeCore, saveStudioTheme } from '../theme-library';
import { unreservedComponentName } from './reserved-classes';
import { RESERVED_COMPONENT_NAMES, RESERVED_THEME_NAMES, renameComponentSelectors, unreservedName } from './reserved-names';


export type ImportTally = {
	themes: number;
	components: number;
	finishes: number;
	scenes: number;
	/** Items identical to one already saved, so nothing was written (keepMine only). */
	unchanged: number;
	/** Items not imported, each with the reason. */
	refused: NonNullable<ImportRefusal>[];
	/** Items saved under a name other than the one they carried — a shipped name, or
	 *  (keepMine) a name you already use for something different. */
	renames: ImportRename[];
	/** Human-readable form of `renames`, for the toast. */
	renamed: string[];
	/** What the reader changed or left out (a renamed file, a dropped README). */
	notes: string[];
};

/** `<base>-2`, `-3`, … — the first name nobody uses. */
function freeName(base: string, taken: Set<string>): string {
	for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function importParsedBundle(parsed: ParsedBundle, opts: { keepMine?: boolean } = {}): Promise<ImportTally> {
	const t: ImportTally = { themes: 0, components: 0, finishes: 0, scenes: 0, unchanged: 0, refused: [...parsed.refused], renames: [], renamed: [], notes: [...parsed.notes] };
	const keepMine = !!opts.keepMine;
	const [mineThemes, mineComps, mineFinishes] = keepMine ? await Promise.all([listStudioThemes(), listStudioComponents(), listStudioFinishes()]) : [[], [], []];
	const rename = (r: ImportRename) => {
		t.renames.push(r);
		const shown = r.kind === 'component' ? (n: string) => `.${n}` : (n: string) => n;
		t.renamed.push(`${r.kind} “${shown(r.from)}” → “${shown(r.to)}”${r.why === 'yours' ? ' (your Library already had a different one)' : ''}`);
	};
	// `historyLabel` — an import that lands on a name you already use REPLACES that record
	// (the store dedupes by kind+name when no id is passed), so the version it snapshots is
	// the one thing between a stranger's file and your own work. keepMine never gets there.
	const history = { historyLabel: 'Before import' };

	const usedThemeNames = new Set([...RESERVED_THEME_NAMES, ...mineThemes.map((x) => x.name)]);
	for (const th of parsed.themes) {
		const no = await refuseImportedTheme(th.css, th.label || th.name);
		if (no) {
			t.refused.push(no);
			continue;
		}
		let name = unreservedName(RESERVED_THEME_NAMES, th.name);
		let why: ImportRename['why'] = 'shipped';
		const core = keepMine ? await loadThemeCore() : null;
		if (core) {
			const mine = mineThemes.find((x) => x.name === name);
			if (mine && mine.css === core.renameThemeDirective(th.css, name)) {
				t.unchanged++;
				if (name !== th.name) rename({ kind: 'theme', from: th.name, to: name, why });
				continue;
			}
			if (mine) {
				name = freeName(name, usedThemeNames);
				why = 'yours';
			}
			usedThemeNames.add(name);
		}
		const css = core && name !== th.name ? core.renameThemeDirective(th.css, name) : th.css;
		const st = await saveStudioTheme({ name, label: th.label, essentials: th.essentials ?? {}, css, ...(th.overrides ? { overrides: th.overrides } : {}), ...(th.rampStrategy ? { rampStrategy: th.rampStrategy } : {}), ...(th.pkg && name === th.name ? { pkg: th.pkg } : {}) }, keepMine ? undefined : history);
		if (st.name !== th.name) rename({ kind: 'theme', from: th.name, to: st.name, why: st.name === unreservedName(RESERVED_THEME_NAMES, th.name) ? 'shipped' : why });
		t.themes++;
	}

	const usedComponentNames = new Set([...RESERVED_COMPONENT_NAMES, ...mineComps.map((x) => x.name)]);
	for (const c of parsed.components) {
		const no = await refuseImportedComponent(c.css, c.name);
		if (no) {
			t.refused.push(no);
			continue;
		}
		let name = unreservedComponentName(c.name);
		let why: ImportRename['why'] = 'shipped';
		if (keepMine) {
			const mine = mineComps.find((x) => x.name === name);
			if (mine && mine.css === renameComponentSelectors(c.css, c.name, name)) {
				t.unchanged++;
				if (name !== c.name) rename({ kind: 'component', from: c.name, to: name, why });
				continue;
			}
			if (mine) {
				name = freeName(name, usedComponentNames);
				why = 'yours';
			}
			usedComponentNames.add(name);
		}
		const moved = name !== c.name;
		// A package carries the full manifest, so a component imported from one keeps its
		// function/form/substance/description and can be re-saved; a legacy zip carried only
		// the bucket.
		const sc = await saveStudioComponent(
			{
				name,
				css: moved ? renameComponentSelectors(c.css, c.name, name) : c.css,
				skeleton: moved ? renameAssetInSource(c.skeleton, 'component', c.name, name).source : c.skeleton,
				meta: c.manifest ? toMeta(c.manifest) : { bucket: c.bucket || undefined },
				...(c.pkg && !moved ? { pkg: c.pkg } : {}),
			},
			keepMine ? undefined : history,
		);
		if (sc.name !== c.name) rename({ kind: 'component', from: c.name, to: sc.name, why: sc.name === unreservedComponentName(c.name) ? 'shipped' : why });
		t.components++;
	}

	// A finish needs no CSS gate: `saveStudioFinish` DISCARDS any CSS and regenerates it from
	// the recipe, and `coerceRecipe` clamps every number and enum-checks every keyword on the
	// way in. Safe by construction, not by a scan.
	const usedFinishNames = new Set(mineFinishes.map((x) => x.name));
	for (const fin of parsed.finishes) {
		let name = safeSaveSlug(fin.name) || fin.name;
		let why: ImportRename['why'] = 'shipped';
		if (keepMine) {
			const mine = mineFinishes.find((x) => x.name === name);
			if (mine && JSON.stringify(mine.recipe) === JSON.stringify(fin.recipe)) {
				t.unchanged++;
				if (name !== fin.name) rename({ kind: 'finish', from: fin.name, to: name, why });
				continue;
			}
			if (mine) {
				name = freeName(name, usedFinishNames);
				why = 'yours';
			}
			usedFinishNames.add(name);
		}
		const sf = await saveStudioFinish({ name, label: fin.label, css: fin.css, recipe: fin.recipe, ...(fin.pkg && name === fin.name ? { pkg: fin.pkg } : {}) }, keepMine ? undefined : history);
		if (sf.name !== fin.name) rename({ kind: 'finish', from: fin.name, to: sf.name, why: sf.name === safeSaveSlug(fin.name) ? 'shipped' : why });
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

/**
 * The renames a workspace BACKUP's saved assets will take on restore, for the backed-up decks
 * to follow. A backup made before shipped names and engine classes were reserved can hold a
 * saved `indaco` or `finish`; the save stores it as `<name>-custom`, and a deck still saying
 * `theme: indaco` would quietly render the shipped theme instead. Lives here, loaded by
 * `import()`, because the restore is rare and the Studio's eager bundle has a byte budget.
 */
export async function backupRenames(parsed: ParsedBundle): Promise<ImportRename[]> {
	const { unreservedComponentName } = await import('./reserved-classes');
	return [
		...parsed.themes.filter((t) => RESERVED_THEME_NAMES.has(t.name)).map((t) => ({ kind: 'theme' as const, from: t.name, to: unreservedName(RESERVED_THEME_NAMES, t.name), why: 'shipped' as const })),
		...parsed.components.filter((c) => unreservedComponentName(c.name) !== c.name).map((c) => ({ kind: 'component' as const, from: c.name, to: unreservedComponentName(c.name), why: 'shipped' as const })),
		...parsed.finishes.filter((f) => safeSaveSlug(f.name) !== f.name).map((f) => ({ kind: 'finish' as const, from: f.name, to: safeSaveSlug(f.name), why: 'shipped' as const })),
	];
}
