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

/** What Compose's pass last linted: the text and the vocabulary it used. */
export type Linted = { text: string; vocab: unknown; extras: unknown };

/**
 * COMPOSE'S PASS, for the Studio shell (moved here so its logic is not in the startup bundle). Lints the text `read`
 * returns unless `last` already covers it, and returns the new record and counts; undefined means nothing to do.
 */
export async function composeLintPass(read: () => string, last: Linted, lintVocab: LintVocab, extras: Parameters<typeof studioVocabSets>[1]): Promise<{ linted: Linted; counts: { total: number; fixable: number } | null } | undefined> {
	const sets = studioVocabSets(lintVocab, extras);
	const text = read();
	if (sets && last.text === text && last.vocab === lintVocab && last.extras === extras) return undefined;
	const counts = sets ? await lintCounts(text, sets) : null;
	return { linted: { text, vocab: lintVocab, extras }, counts };
}

/**
 * FIX ALL IN COMPOSE, for the Studio shell: fixes the text `read` returns, hands the result to `apply` only when the
 * text has not changed meanwhile (one undo step, the caller's), and tells the author what was fixed and refused.
 */
export async function fixAllCompose(read: () => string, lintVocab: LintVocab, extras: Parameters<typeof studioVocabSets>[1], apply: (text: string) => void, notify: (msg: string) => void): Promise<void> {
	const sets = studioVocabSets(lintVocab, extras);
	const res = sets ? await fixAllText(read, sets) : null;
	if (!res) {
		notify('The checker could not load, so nothing was fixed. Try again in a moment.');
		return;
	}
	if (res.text !== res.before && read() === res.before) apply(res.text);
	(await import('@/lib/fix-all-notice')).announceFixAll({ applied: res.applied, skipped: res.skipped }, notify);
}
