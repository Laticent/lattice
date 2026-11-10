// DECK LINT — the authoring linter run on the deck TEXT, for the mode that has no CodeMirror.
//
// The Source editor (Editor.tsx) lints inside CodeMirror and owns Fix all there. Compose has no
// such pass, so before 2026-11-10 the Studio's Fix all button did nothing in Compose and the
// count behind it fell back to the unknown-component estimate. Compose is now the default
// (2026-11-10-compose-first.md), so this module gives the Studio the same two answers from the
// text: how many findings, how many fixable, and the text with every fix applied. It runs the
// same kernel (lib/authoring/lint-core through the authoring door, HARD RULE #7) with the same
// vocabulary the Editor builds, through `studioVocabSets`, which both callers share.
//
// Loaded on demand (StudioShell imports it with `import()`): the lint core is 256 KB the first
// slide does not need.

import { buildVocabSets } from '@/lib/editor-diagnostics.js';
import type { FixRefusal } from '@/lib/fix-all-notice';
import { followDeckAdmission } from '@/lib/plugin-admission';

// biome-ignore lint/suspicious/noExplicitAny: the bundled CJS lint kernel.
type LintCore = any;
// biome-ignore lint/suspicious/noExplicitAny: the lint vocabulary is the kernel's own JSON shape.
type LintVocab = any;
// biome-ignore lint/suspicious/noExplicitAny: the kernel's vocabulary sets.
export type VocabSets = any;

let core: LintCore = null;
let loading: Promise<LintCore> | null = null;

/** The lint core once it has loaded, else null (a synchronous peek, for the Editor's completions). */
export const lintCoreNow = (): LintCore => core;

/** Load the lint core once; every caller shares the one promise. Resolves null if it cannot load. */
export function loadLintCore(): Promise<LintCore> {
	if (core) return Promise.resolve(core);
	loading ??= import('@/playground/authoring-door.js')
		.then((door) => door.loadAuthoring())
		.then((m) => {
			core = m.lintCore;
			return core;
		})
		.catch(() => {
			loading = null;
			return null;
		});
	return loading;
}

/**
 * The vocabulary the Studio lints against: the shipped lint vocab, plus the author's saved components,
 * finishes and palettes, so none of those is flagged unknown. ONE builder for both editors' passes.
 */
export function studioVocabSets(lintVocab: LintVocab, extra: { names?: readonly string[]; finishValues?: readonly string[]; palettes?: readonly string[] }): VocabSets | null {
	if (!lintVocab?.names) return null;
	const sets = buildVocabSets(lintVocab);
	// Your saved local components are first-class names, not unknown ones. (Built-in `names` stays authoritative.)
	for (const n of extra.names ?? []) sets.names.add(n);
	// The finish VALUE vocabulary (built-ins + saved, already prefixed), so `finish: <value>` is not flagged
	// `unknown-finish`. The bare slug of a prefixed saved value (`finish-shu` → `shu`) is accepted too, so a deck
	// authored before the prefix convention does not false-warn.
	const finishes = extra.finishValues ?? [];
	if (finishes.length) {
		const more = finishes.flatMap((v) => (v.startsWith('finish-') ? [v, v.slice('finish-'.length)] : [v]));
		sets.finishNames = [...(sets.finishNames || []), ...more];
	}
	// A palette the author saved is a theme this deck can name; the lint vocab carries only the shipped ones.
	const palettes = extra.palettes ?? [];
	if (palettes.length) sets.themeNames = [...(sets.themeNames || []), ...palettes];
	return sets;
}

/** Findings and fixable findings in `text`, or null when the pass could not run (never a made-up zero). */
export async function lintCounts(text: string, sets: VocabSets): Promise<{ total: number; fixable: number } | null> {
	const c = await loadLintCore();
	if (!c) return null;
	try {
		followDeckAdmission(text);
		const findings: Array<{ autofixable?: boolean }> = c.lintTextWith(text, sets);
		return { total: findings.length, fixable: findings.filter((f) => f?.autofixable).length };
	} catch {
		return null;
	}
}

/**
 * The deck with every autofixable finding applied, plus what was applied and refused; null if the core cannot
 * load. `read` is called AFTER the loads, so a keystroke typed while the kernel arrived is kept (as Editor.fixAll).
 */
export async function fixAllText(read: () => string, sets: VocabSets): Promise<{ before: string; text: string; applied: number; skipped: FixRefusal[] } | null> {
	const c = await loadLintCore();
	if (!c) return null;
	// The fix driver is a chunk of its own, fetched on the first press (lint-core `loadFixDriver`).
	await c.loadFixDriver();
	const before = read();
	const res = c.fixAllDetailed(before, sets);
	return { before, text: res.text, applied: res.applied.length, skipped: res.skipped };
}
