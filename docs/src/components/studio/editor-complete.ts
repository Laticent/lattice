import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { PACE_NAMES } from '@/lib/resolve-pace';
import { STUDIO_LANGUAGES } from './studio-language';

// Studio editor autocomplete — context-aware completion for the three things an
// author types most: the component on a `_class:` line, a front-matter directive
// key, and a fenced-block language. Driven by the SAME catalog the insert palette
// uses (passed in from the page), so the suggestions never drift from the engine.
// Pure factory: returns a CodeMirror CompletionSource; no DOM, unit-testable.

export type CompletionComponent = { name: string; bucket: string; description: string };

// Deck-level front-matter directives the engine honours, with a one-line hint. Values
// are left to the author (a few common ones are suggested inline below).
//
// This list was a THIRD hand-maintained enumeration of the deck's front-matter surface,
// alongside the Inspector's rows and deck-config's FIELD_DEFAULTS, and it had drifted
// furthest — it offered 15 keys where the engine reads ~35, so a register with no
// control was also invisible to autocomplete, i.e. unreachable by any route except
// knowing it exists. Filled out from the audit in
// engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2, which is where
// the full catalog + the reader for each key lives.
const FRONT_MATTER_KEYS: { key: string; info: string }[] = [
	'profile',
	// Identity + structure
	{ key: 'title', info: 'Deck name — used in the switcher, in Share, and as the export filename. Defaults to the cover heading.' },
	{ key: 'theme', info: 'Deck theme (palette) — e.g. indaco, cuoio.' },
	{ key: 'lang', info: 'Document language — overrides the workspace default (e.g. en-US). Drives <html lang> + read-aloud.' },
	{ key: 'ai-lang', info: 'AI-output language — what the AI writes in, if it should differ from the document language. Defaults to lang.' },
	{ key: 'size', info: 'Slide size — hd (16:9), standard, square, 4k, or a portrait format.' },
	{ key: 'split', info: 'How the body divides into slides — headings (default) or rule (--- only).' },
	{ key: 'form', info: 'Deck chrome — the masthead band, status bay and rail. standard (default) / off.' },
	{ key: 'glossary', info: 'Auto-glossary — append a reference slide built from the acronyms: definitions. auto / off.' },
	{ key: 'class', info: 'Default _class applied to every slide (a modifier — a component name is ignored).' },
	{ key: 'validate', info: "Inline validation in the editor — on (default) / off. Travels with the deck." },
	// Look
	{ key: 'color-mode', info: 'The mode the deck opens in — light / dark / system / inherited / print.' },
	{ key: 'mode', info: 'Rendering mode — boardroom / sketch / sketch-clean.' },
	{ key: 'finish', info: 'Finish backdrop — e.g. atrium, halo, gallery.' },
	{ key: 'finish-override', info: 'Override the applied finish — a nested map (backdrop: { strength, clearance }, wash, …).' },
	{ key: 'lift', info: 'Card lift — the "Struck" shadow on card surfaces. on / off.' },
	{ key: 'corners', info: 'Slide surface corners — square (default) / rounded.' },
	{ key: 'claim', info: 'How much frame the content sits inside — framed (default) / quiet / hero / bleed.' },
	// Chrome
	{ key: 'header', info: 'Running header text on every slide.' },
	{ key: 'footer', info: 'Running footer text on every slide.' },
	{ key: 'paginate', info: 'Page numbers — true / false.' },
	{ key: 'meta', info: 'The masthead bay\u2019s meta line — a date, a document number, a review stage.' },
	{ key: 'logo', info: 'Deck logo — a path beside the deck or a full URL, drawn into the masthead.' },
	{ key: 'logo-on', info: 'Which slides carry the logo — all (default) / title.' },
	{ key: 'logo-style', info: 'Logo treatment — auto (default) / brand.' },
	{ key: 'logo-scale', info: 'Logo size multiplier — 1 is default, clamped 0.2–3.' },
	{ key: 'logo-x', info: 'Logo center across the slide, 0–100 (%).' },
	{ key: 'logo-y', info: 'Logo center down the slide, 0–100 (%).' },
	// Accent
	{ key: 'spectrum', info: 'Brand bar — on (rainbow, default) / solid / duo / mono / off.' },
	{ key: 'spectrum-edge', info: 'Which edge the brand bar sits on — top (default) / left / right / bottom / off.' },
	{ key: 'spectrum-card', info: 'Card rail style — off (default) / auto / solid / duo / mono / rainbow.' },
	{ key: 'spectrum-card-edge', info: 'Card rail placement — left (default) / top / right / bottom.' },
	{ key: 'spectrum-trim', info: 'Flow the spectrum onto structural accents (table rails, code strips, hr). on / off.' },
	{ key: 'rule', info: 'Heading underline — auto (default) / full / short / accent / none.' },
	{ key: 'eyebrow', info: 'The mark on the mono-caps kicker — plain (default) / dot / bar / arrow / underline.' },
	{ key: 'headline', info: 'Framing-text alignment — auto (default) / left / center / right.' },
	{ key: 'stamp', info: 'Deck-wide state-badge shape — e.g. tab, notch, seal, pill.' },
	{ key: 'tone', info: 'Deck-wide review-tone shape — rail (default) / edge / glow.' },
	// Motion + speech
	{ key: 'motion', info: 'Chart motion on the live surfaces — on / off. Preview-only; the export is unchanged.' },
	{ key: 'motion-style', info: 'How a chart moves — build (default) / together / rise.' },
	{ key: 'motion-speed', info: 'How fast the build runs — auto (default) / slow / …' },
	{ key: 'pace', info: 'Presentation rhythm — how long a self-presenting deck holds on a new slide before speaking: brisk / natural / deliberate.' },
	{ key: 'lexicon', info: 'Read-aloud pronunciations — a nested map of token → spoken text.' },
	{ key: 'acronyms', info: 'Acronym registry — term → spoken expansion (and an optional glossary definition).' },
	// Marp-inherited + tooling
	{ key: 'style', info: 'Raw CSS for this deck (a YAML block scalar).' },
	{ key: 'debug', info: 'Layout debug overlay — on-hover / on-always (+ verbose). Preview-only, stripped from every export.' },
	{ key: 'present', info: 'Open the exported PDF in presentation mode — true / false.' },
];

// The `lang:` front-matter VALUE vocabulary — the supported document languages
// (studio-language, English-only for now). Static, so built once at module load;
// the `info` shows the human label beside each BCP-47 code.
const LANG_OPTIONS: Completion[] = STUDIO_LANGUAGES.map((l) => ({ label: l.code, type: 'constant', detail: 'language', info: l.label }));
// The `pace:` register's values, from the engine's own list — the same names the linter
// validates against, so the editor can never offer a value the linter would then flag.
const PACE_INFO: Record<string, string> = {
	brisk: 'A demo, or an audience that already knows the material.',
	natural: 'Boardroom delivery — the default.',
	deliberate: 'A technical audience, or one reading in a second language.',
};
const PACE_OPTIONS: Completion[] = PACE_NAMES.map((n: string) => ({ label: n, type: 'constant', detail: 'pace', info: PACE_INFO[n] }));

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

		// 1d. The `lang:` / `ai-lang:` front-matter VALUE — the supported language codes
		// (mirrors the deck Inspector's Language picker; both read studio-language). Same
		// vocabulary for the document language and the AI-output override.
		if (/^[ \t]*(?:ai-)?lang:[ \t]*[\w-]*$/.test(before) && inFrontMatter(context.state.doc.toString(), context.pos)) {
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options: LANG_OPTIONS, validFor: /^[\w-]*$/ };
		}

		// 1e. The `pace:` front-matter VALUE — the presentation-rhythm register.
		if (/^[ \t]*pace:[ \t]*[\w-]*$/.test(before) && inFrontMatter(context.state.doc.toString(), context.pos)) {
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options: PACE_OPTIONS, validFor: /^[\w-]*$/ };
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
