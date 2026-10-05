import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { PACE_NAMES } from '@/lib/resolve-pace';
import { classDirectiveCompletion, classTokenResult, deckSplit, slideBodyAfter } from '@/playground/slide-context.js';
import { FRONT_MATTER_KEYS } from './front-matter-keys';
import { MOTION_SPEED_ENTRIES, MOTION_STYLE_ENTRIES } from './motion-catalog';
import { STUDIO_LANGUAGES } from './studio-language';

// Studio editor autocomplete — context-aware completion for the three things an
// author types most: the component on a `_class:` line, a front-matter directive
// key, and a fenced-block language. Driven by the SAME catalog the insert palette
// uses (passed in from the page), so the suggestions never drift from the engine.
// Pure factory: returns a CodeMirror CompletionSource; no DOM, unit-testable.

// `variants` onward are the per-component completion data the build-time catalog
// carries (docs/src/lib/studio-catalog.mjs); a local component has none of them.
export type CompletionComponent = {
	name: string;
	bucket: string;
	description: string;
	variants?: string[];
	variantAxes?: { label: string; exclusive?: boolean; members: readonly string[] }[];
	familyModifiers?: string[];
	excludedModifiers?: string[];
	surfaces?: string[];
	variantSurfaces?: Record<string, string[]>;
	inertSurfaces?: string[];
	modifierUsage?: Record<string, number>;
};

// The slice of the lint vocab the `_class:` completion reads (lib/authoring/lint.js).
export type CompletionVocab = {
	modifierGroups?: { name: string; label: string; tokens: string[]; exclusive?: boolean; axes?: string[][]; follows?: Record<string, string[]>; offer?: boolean; surface?: string | Record<string, string> }[];
	exclusiveAxes?: Record<string, string[]>;
	universalModifiers?: string[];
	modifierUsage?: Record<string, number>;
};

// Deck-level front-matter directives the engine honors, with a one-line hint. Values
// are left to the author (a few common ones are suggested inline below).
//
export { FRONT_MATTER_KEYS };

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

// The front-matter keys whose VALUE vocabulary the engine publishes in the lint vocab
// (lib/authoring/lint.js `buildVocab`) — key → vocab field. Reading the engine's own list
// means the editor can never offer a value the linter then flags, or miss one it accepts.
export const VOCAB_VALUE_FIELDS: Record<string, string> = {
	cards: 'cardsNames',
	fit: 'fitNames',
	claim: 'claimNames',
	corners: 'cornersNames',
	mode: 'modeNames',
	'color-mode': 'colorModeNames',
	split: 'splitNames',
	spectrum: 'spectrumNames',
	'spectrum-edge': 'spectrumEdgeNames',
	'spectrum-card': 'spectrumCardNames',
	'spectrum-card-edge': 'spectrumCardEdgeNames',
	'spectrum-trim': 'spectrumTrimNames',
	rule: 'ruleNames',
	eyebrow: 'eyebrowNames',
	headline: 'headlineNames',
	lift: 'liftNames',
	backdrop: 'backdropNames',
	tag: 'tagNames',
	spark: 'sparkNames',
	venue: 'venueNames',
	'chart-finish': 'chartFinishNames',
	preset: 'presetNames',
	delivery: 'deliveryNames',
	'inline-code': 'inlineCodeNames',
	stamp: 'stampStyleNames',
	tone: 'toneStyleNames',
};

// Keys with a small fixed vocabulary that the lint vocab does not carry. Each list is the
// values its reader accepts: motion-style / motion-speed come from the Inspector's own
// catalog, and `player-motion` offers only `off` because resolve-motion.mjs reads nothing
// else (omitting the key follows `motion:`).
const ON_OFF = ['on', 'off'];
const TRUE_FALSE = ['true', 'false'];
const STATIC_VALUES: Record<string, string[]> = {
	motion: ON_OFF,
	'motion-style': MOTION_STYLE_ENTRIES.map((e) => e.name),
	'motion-speed': MOTION_SPEED_ENTRIES.map((e) => e.name),
	'player-motion': ['off'],
	paginate: TRUE_FALSE,
	glossary: ['auto', 'off'],
	validate: ON_OFF,
	'logo-on': ['all', 'title'],
	'logo-style': ['auto', 'brand'],
	present: TRUE_FALSE,
	read: TRUE_FALSE,
	fluid: TRUE_FALSE,
	player: TRUE_FALSE,
};

/**
 * The key → value-list map the editor completes against: every fixed-vocabulary register,
 * from the lint vocab where the engine publishes one and from STATIC_VALUES otherwise.
 * Exported so the Editor builds it once per vocab and a test can assert coverage.
 */
export function registerValueLists(vocab: Record<string, unknown> | null | undefined): Record<string, string[]> {
	const out: Record<string, string[]> = { ...STATIC_VALUES };
	for (const [key, field] of Object.entries(VOCAB_VALUE_FIELDS)) {
		const names = vocab?.[field];
		if (Array.isArray(names) && names.length) out[key] = names.map(String);
	}
	return out;
}

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

/** What may come next in a spark or pill — lint-core's `inlineCodeCompletions()` shape. */
export type InlineNext = { next: string; words: { label: string; axis: string; info: string }[] };

/** Starter sparks, offered once `` `~ `` is typed. */
const SPARK_TEMPLATES: Completion[] = [
	['~{12 14 13 17 21}', 'line'],
	['~{12 14 13 17 21, bar}', 'bars'],
	['~{1 1 -1 1 -1 1, winloss}', 'win-loss'],
	['~{72%}', 'ring'],
	['~{72/80, bullet}', 'bullet'],
].map(([label, detail]) => ({ label, detail, type: 'snippet' }));

const WORD = /^[\w-]*$/;

/**
 * Completion inside a spark (`` `~{12 14, `` ``) or a pill (`` `{LABEL, `` ``) — after a comma in
 * the record still being typed, so before its closing brace — by POSITION like the
 * `_class:` line (slide-context.js classTokenResult): the menu holds only the NEXT open axis —
 * a type, then a size, then a color … — and only the words the kernel accepts there. When what
 * the author types matches none of those (`c3` while types are showing), it widens to every
 * valid word, grouped by axis; `validFor` switches on that keystroke, the same way.
 *
 * The cursor is inside a span when an odd number of backticks precede it. `next` is lint-core's
 * `inlineCodeCompletions` (null before the lazy core arrives, or for a span that is not one).
 */
export function inlineCodeCompletion(
	before: string,
	next: ((span: string) => InlineNext | null) | null,
): { typed: string; options: Completion[]; validFor: (text: string) => boolean } | null {
	if (((before.match(/`/g) || []).length & 1) === 0) return null;
	const inside = before.slice(before.lastIndexOf('`') + 1);
	if (/^~\{?$/.test(inside)) return { typed: inside, options: SPARK_TEMPLATES, validFor: (t) => /^~\{?[^`]*$/.test(t) };
	// The record so far, up to the last comma: its first item, then complete words. The kernel
	// is asked about that record CLOSED (`{LIVE, tag}`), which is what it can judge.
	const m = /^(~?\{[^{}`,]+(?:,\s*[\w-]+)*),\s*([\w-]*)$/.exec(inside);
	const got = m && next ? next(`${m[1]}}`) : null;
	if (!m || !got) return null;
	const typed = m[2];
	// `boost` keeps the kernel's order inside a step (sm md lg, c1 … c12), not the alphabet's.
	const option = (w: InlineNext['words'][number], rank: number, i: number): Completion => ({
		label: w.label,
		type: 'keyword',
		detail: w.axis,
		info: w.info,
		section: { name: w.axis, rank },
		boost: 99 - i,
	});
	const axes = [...new Set(got.words.map((w) => w.axis))];
	const primary = got.words.filter((w) => w.axis === got.next);
	const inPrimary = (t: string) => primary.some((w) => w.label.startsWith(t));
	if (inPrimary(typed)) {
		return { typed, options: primary.map((w, i) => option(w, 0, i)), validFor: (t) => WORD.test(t) && inPrimary(t) };
	}
	return {
		typed,
		options: got.words.map((w, i) => option(w, axes.indexOf(w.axis), i)),
		validFor: (t) => WORD.test(t) && !inPrimary(t),
	};
}

/**
 * Build a CodeMirror CompletionSource from the component catalog. Returns null
 * when nothing applies, so other sources (none, here) can take over.
 */
export function makeStudioCompletion(
	components: CompletionComponent[],
	finishValues: string[] = [],
	finishClasses: string[] = [],
	// Opt-in vocabularies (existing callers omit → unchanged behavior):
	//   modifiers — the universal/base modifier tokens valid on any slide (`dark`,
	//     `light`, `numbered`, `quiet`, `tone-*`, …), from the shared lint vocabulary
	//     so they can't drift; offered on `_class:` and the deck-wide `class:` value.
	//   palettes  — theme names (built-in + saved), offered as `theme:` FM values.
	//   registers — key → accepted values for every fixed-vocabulary FM key
	//     (`registerValueLists(lintVocab)`), offered on a top-level `key:` line.
	//   vocab     — the lint vocab's modifier registry; drives the positional
	//     `_class:` completion (falls back to the flat `modifiers` list).
	//   inlineNext — what may come next in a spark or pill (lint-core's
	//     `inlineCodeCompletions`, read from the kernels), offered after `` `~{…, `` or
	//     `` `{LABEL, ``. Null until the lazy lint core arrives; the menu stays closed till then.
	opts: { modifiers?: string[]; palettes?: string[]; registers?: Record<string, string[]>; vocab?: CompletionVocab | null; inlineNext?: ((span: string) => InlineNext | null) | null } = {},
) {
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
	const registerOptions: Record<string, Completion[]> = Object.fromEntries(
		Object.entries(opts.registers || {}).map(([key, values]) => [key, values.map((v) => ({ label: v, type: 'constant', detail: key }))]),
	);
	const classVocab: CompletionVocab | string[] = opts.vocab?.modifierGroups?.length ? opts.vocab : [...new Set(opts.modifiers || [])].sort();
	// How often each modifier is used after ANY component: summed from the catalog's
	// per-component counts, so the page need not ship a second copy of the numbers.
	const usage: Record<string, number> = { ...(opts.vocab?.modifierUsage || {}) };
	if (!opts.vocab?.modifierUsage) for (const c of components) for (const [t, n] of Object.entries(c.modifierUsage || {})) usage[t] = (usage[t] || 0) + n;
	const classExtra = { finishClasses, usage };

	return function studioComplete(context: CompletionContext): CompletionResult | null {
		const line = context.state.doc.lineAt(context.pos);
		const before = line.text.slice(0, context.pos - line.from);

		// 0. Inside a spark (`` `~{12 14 17, bar, lg` ``) or a pill (`` `{LIVE, tag, c4` ``).
		const inline = inlineCodeCompletion(before, opts.inlineNext ?? null);
		if (inline) return { from: context.pos - inline.typed.length, options: inline.options, validFor: inline.validFor };

		// 1. A `_class:` directive token, completed by POSITION like a shell command
		// line: the first word is a component, and every later word is only what THAT
		// component accepts — its variants, its family modifiers, the modifier groups
		// whose surface it has, finishes last — minus anything an earlier word already
		// settled (slide-context.js classTokenOptions; the manifest drives it).
		const spot = classDirectiveCompletion(before);
		if (spot) {
			// The default look is the component with nothing after it, so a bare space
			// opens NO menu: an Enter there must stay a newline, never a pick of the
			// highlighted variant. The menu opens on the first letter, or on Ctrl-Space.
			if (!spot.typed && !context.explicit) return null;
			// The slide's own content (a table, a heading, a blockquote below this line)
			// widens and reorders what is offered.
			const doc = context.state.doc;
			const split = deckSplit(doc.sliceString(0, Math.min(doc.length, 4000)));
			const slideText = slideBodyAfter((n: number) => doc.line(n).text, doc.lines, line.number, { split });
			const { options, validFor } = classTokenResult(spot, components, classVocab, { ...classExtra, slideText });
			if (!options.length) return null;
			return { from: line.from + spot.from, options: options as Completion[], validFor };
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

		// 1f. Any other fixed-vocabulary register VALUE — `guards:`, `cards:`, `claim:`, the
		// spectrum family, … Top-level keys only (column 0): an indented `key:` is an entry
		// inside a nested map such as `lexicon:`, where the word is data, not a register.
		const reg = /^([\w-]+):[ \t]*[\w-]*$/.exec(before);
		// `Object.hasOwn`: a key named `constructor` or `toString` must not hit the prototype.
		if (reg && Object.hasOwn(registerOptions, reg[1]) && inFrontMatter(context.state.doc.toString(), context.pos)) {
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options: registerOptions[reg[1]], validFor: /^[\w-]*$/ };
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
