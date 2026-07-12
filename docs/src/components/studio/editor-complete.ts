import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

// Studio editor autocomplete — context-aware completion for the three things an
// author types most: the component on a `_class:` line, a front-matter directive
// key, and a fenced-block language. Driven by the SAME catalog the insert palette
// uses (passed in from the page), so the suggestions never drift from the engine.
// Pure factory: returns a CodeMirror CompletionSource; no DOM, unit-testable.

export type CompletionComponent = { name: string; bucket: string; description: string };

// Deck-level front-matter directives the engine honours (deck-config knobs), with
// a one-line hint. Values left to the author (a few common ones suggested inline).
const FRONT_MATTER_KEYS: { key: string; info: string }[] = [
	{ key: 'theme', info: 'Deck theme (palette) — e.g. indaco, cuoio.' },
	{ key: 'size', info: 'Slide size — 16:9, standard, square, 4k.' },
	{ key: 'paginate', info: 'Page numbers — true / false.' },
	{ key: 'header', info: 'Running header text on every slide.' },
	{ key: 'footer', info: 'Running footer text on every slide.' },
	{ key: 'mode', info: 'Rendering mode — boardroom / sketch / sketch-clean.' },
	{ key: 'finish', info: 'Finish backdrop — e.g. atrium, halo, gallery.' },
	{ key: 'finish-override', info: 'Override the applied finish — a nested map (backdrop: { strength, clearance }, wash, …).' },
	{ key: 'split', info: 'Slide-splitting strategy — e.g. headings.' },
	{ key: 'autosplit', info: 'Auto-split overflowing slides — true / false.' },
	{ key: 'lift', info: 'Card lift — the "Struck" shadow on card surfaces. on / off.' },
	{ key: 'class', info: 'Default _class applied to every slide.' },
	{ key: 'lang', info: 'Document language — e.g. en.' },
	{ key: 'present', info: 'Open the exported PDF in presentation mode — true / false.' },
];

// Fenced-block languages the engine renders specially, plus common code langs.
const FENCE_LANGS: { lang: string; info: string }[] = [
	{ lang: 'mermaid', info: 'Mermaid diagram (flow, sequence, gantt…).' },
	{ lang: 'chart', info: 'Lattice chart block.' },
	{ lang: 'math', info: 'Display math (KaTeX).' },
	{ lang: 'js', info: 'JavaScript' },
	{ lang: 'ts', info: 'TypeScript' },
	{ lang: 'python', info: 'Python' },
	{ lang: 'bash', info: 'Shell' },
	{ lang: 'json', info: 'JSON' },
	{ lang: 'sql', info: 'SQL' },
];

/** True when `pos` sits inside the leading `---` front-matter block. */
function inFrontMatter(doc: string, pos: number): boolean {
	if (!/^---[ \t]*\r?\n/.test(doc)) return false;
	const close = doc.search(/\r?\n---[ \t]*(?:\r?\n|$)/);
	if (close === -1) return pos > 3; // open but unclosed: treat the rest as FM
	return pos <= close;
}

/**
 * Build a CodeMirror CompletionSource from the component catalog. Returns null
 * when nothing applies, so other sources (none, here) can take over.
 */
export function makeStudioCompletion(
	components: CompletionComponent[],
	finishValues: string[] = [],
	finishClasses: string[] = [],
	// Opt-in vocabularies (existing callers omit → unchanged behaviour):
	//   modifiers — the universal/base modifier tokens valid on any slide (`dark`,
	//     `light`, `numbered`, `quiet`, `tone-*`, …), from the shared lint vocabulary
	//     so they can't drift; offered on `_class:` and the deck-wide `class:` value.
	//   palettes  — theme names (built-in + saved), offered as `theme:` FM values.
	opts: { modifiers?: string[]; palettes?: string[] } = {},
) {
	const componentOptions: Completion[] = components.map((c) => ({ label: c.name, type: 'class', detail: c.bucket, info: c.description, boost: 1 }));
	// The `finish:` front-matter VALUE vocabulary — built-in presets (bare, e.g.
	// `atrium`; the engine adds the prefix) PLUS the user's saved finishes, which
	// carry their `finish-<slug>` prefix so the deck names them consistently.
	const finishOptions: Completion[] = finishValues.map((f) => ({ label: f, type: 'constant', detail: 'finish' }));
	// The `_class:` slide-level CLASS vocabulary — every finish as its `finish-<x>`
	// class (`_class: closing finish-brand`). Built-ins gain the prefix upstream;
	// saved finishes already carry it. Offered alongside the component names.
	const classFinishOptions: Completion[] = finishClasses.map((f) => ({ label: f, type: 'constant', detail: 'finish' }));
	// Universal/base modifiers offered on any `_class:` / `class:` line — `dark`,
	// `light`, and the rest of the cross-component vocabulary. Deduped + sorted so
	// the menu is stable regardless of the source order.
	const modifierOptions: Completion[] = [...new Set(opts.modifiers || [])].sort().map((m) => ({ label: m, type: 'keyword', detail: 'modifier' }));
	// The `theme:` front-matter VALUE vocabulary — the palettes a deck can name.
	const paletteOptions: Completion[] = (opts.palettes || []).map((p) => ({ label: p, type: 'constant', detail: 'theme' }));
	const classOptions = [...componentOptions, ...classFinishOptions, ...modifierOptions];

	return function studioComplete(context: CompletionContext): CompletionResult | null {
		const line = context.state.doc.lineAt(context.pos);
		const before = line.text.slice(0, context.pos - line.from);

		// 1. A `_class:` directive token — component name, `finish-<name>` class, or a
		// universal modifier. Fires on ANY space-separated token (not just the first),
		// so a modifier appended after a component (`_class: statement dark`) completes.
		if (/<!--\s*_class:[\w\s-]*$/.test(before) && classOptions.length) {
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options: classOptions, validFor: /^[\w-]*$/ };
		}

		// 1b. The deck-wide `class:` front-matter VALUE — the same modifier vocabulary
		// (+ finish classes), so `class: dark` / `class: light` / `class: no-progress`
		// complete deck-wide, mirroring the per-slide `_class:` line above.
		if ((modifierOptions.length || classFinishOptions.length) && /^[ \t]*class:[ \t]*[\w\s-]*$/.test(before) && inFrontMatter(context.state.doc.toString(), context.pos)) {
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options: [...modifierOptions, ...classFinishOptions], validFor: /^[\w-]*$/ };
		}

		// 1c. The `theme:` front-matter VALUE — the deck's own palette.
		if (paletteOptions.length && /^[ \t]*theme:[ \t]*[\w-]*$/.test(before) && inFrontMatter(context.state.doc.toString(), context.pos)) {
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options: paletteOptions, validFor: /^[\w-]*$/ };
		}

		// 2. Fenced-block language right after the opening ``` .
		const fence = context.matchBefore(/^[ \t]*`{3,}[\w-]*/);
		if (fence && /`{3,}[\w-]*$/.test(before)) {
			const tick = context.matchBefore(/[\w-]*/);
			return {
				from: tick ? tick.from : context.pos,
				options: FENCE_LANGS.map((f) => ({ label: f.lang, type: 'keyword', info: f.info })),
				validFor: /^[\w-]*$/,
			};
		}

		// 3. Finish register value on a `finish:` line — built-ins + saved finishes.
		if (finishOptions.length && /^[ \t]*finish:[ \t]*[\w-]*$/.test(before) && inFrontMatter(context.state.doc.toString(), context.pos)) {
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options: finishOptions, validFor: /^[\w-]*$/ };
		}

		// 4. Front-matter directive key (start of a line inside the `---` block).
		if (inFrontMatter(context.state.doc.toString(), context.pos) && /^[ \t]*[\w-]*$/.test(before)) {
			const word = context.matchBefore(/[\w-]*/);
			// Don't fire on the `---` fence lines themselves.
			if (/^-+$/.test(line.text.trim())) return null;
			return {
				from: word ? word.from : context.pos,
				options: FRONT_MATTER_KEYS.map((k) => ({ label: k.key, type: 'property', info: k.info, apply: `${k.key}: ` })),
				validFor: /^[\w-]*$/,
			};
		}

		return null;
	};
}
