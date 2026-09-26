import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { PACE_NAMES } from '@/lib/resolve-pace';
import { classDirectiveCompletion, classTokenResult, deckSplit, slideBodyAfter } from '@/playground/slide-context.js';
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
// This list was a THIRD hand-maintained enumeration of the deck's front-matter surface,
// alongside the Inspector's rows and deck-config's FIELD_DEFAULTS, and it had drifted
// furthest — it offered 15 keys where the engine reads ~35, so a register with no
// control was also invisible to autocomplete, i.e. unreachable by any route except
// knowing it exists. Filled out from the audit in
// engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2, which is where
// the full catalog + the reader for each key lives.
export const FRONT_MATTER_KEYS: { key: string; info: string }[] = [
	// Identity + structure
	{ key: 'title', info: 'Deck name — used in the switcher, in Share, and as the export filename. Defaults to the cover heading.' },
	{ key: 'theme', info: 'Deck theme (palette) — e.g. indaco, cuoio.' },
	{ key: 'lang', info: 'Document language — overrides the workspace default (e.g. en-US). Drives <html lang> + read-aloud.' },
	{ key: 'ai-lang', info: 'AI-output language — what the AI writes in, if it should differ from the document language. Defaults to lang.' },
	{ key: 'size', info: 'Slide size — hd (16:9), standard, square, 4k, or a portrait format.' },
	{ key: 'split', info: 'How the body divides into slides — headings (default) or rule (--- only).' },
	{ key: 'profile', info: 'Genre the Coach judges STYLE against — general (default), teaching, or mission. Never affects the Craft score.' },
	{ key: 'inline-code', info: 'Inline code pills and marks — rich (default: `{LABEL}` draws a pill, `[x]` a state disc) / literal (every backtick span stays plain text).' },
	{ key: 'glossary', info: 'Auto-glossary — append a reference slide built from the acronyms: definitions. auto / off.' },
	{ key: 'class', info: 'Default _class applied to every slide (a modifier — a component name is ignored).' },
	{ key: 'validate', info: "Inline validation in the editor — on (default) / off. Travels with the deck." },
	// Look
	{ key: 'preset', info: 'A named look that sets the accent + surface registers at once — classic (default) / editorial / brand / minimal. An explicit key (rule:, eyebrow:, …) overrides it.' },
	{ key: 'color-mode', info: 'The mode the deck opens in — light / dark / system / inherited / print.' },
	{ key: 'mode', info: 'Rendering mode — boardroom / sketch / sketch-clean.' },
	{ key: 'finish', info: 'Finish backdrop — e.g. atrium, halo, gallery.' },
	{ key: 'finish-override', info: 'Override the applied finish — a nested map (backdrop: { strength, clearance }, wash, …).' },
	{ key: 'backdrop', info: 'Restrain any finish — a strength (20 / 40 / 60 / 80 / full) and/or a mask (clear / open / spot-tl … spot-br). e.g. `backdrop: 40 clear`.' },
	{ key: 'lift', info: 'Card lift — the "Struck" shadow on card surfaces. on / off.' },
	{ key: 'venue', info: 'Where the deck is seen — sets the type size for the back row. laptop (default) · huddle (4–6 people) · conference (10–30) · hall (50+).' },
	{ key: 'cards', info: 'Where a card row puts spare height — center / stretch / top / spread. Omit it and the component decides.' },
	{ key: 'corners', info: 'Slide surface corners — square (default) / rounded.' },
	{ key: 'claim', info: 'How much frame the content sits inside — framed (default) / quiet / hero / bleed.' },
	{ key: 'fit', info: 'What the engine may do to make a slide fit — report (change nothing, only flag) / heal (default: split or step the font scale down, lose no words) / trim (heal, and also cut text that does not fit). Replaces guards:.' },
	// Chrome
	{ key: 'header', info: 'Running header text on every slide.' },
	{ key: 'footer', info: 'Running footer text on every slide.' },
	{ key: 'paginate', info: 'Page numbers — true / false. Anything but false, skip, hold or empty turns them on.' },
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
	{ key: 'spectrum-trim', info: 'Flow the spectrum onto structural accents (table rails, code strips, hr). off (default) / restrained / on.' },
	{ key: 'rule', info: 'Heading underline — auto (default) / full / short / accent / none.' },
	{ key: 'eyebrow', info: 'The mark on the mono-caps kicker — plain (default) / dot / bar / arrow / underline.' },
	{ key: 'headline', info: 'Framing-text alignment — auto (default) / left / center / right.' },
	{ key: 'stamp', info: 'Deck-wide state-badge shape — e.g. tab, notch, seal, pill.' },
	{ key: 'tone', info: 'Deck-wide review-tone shape — rail (default) / edge / glow.' },
	// Motion + speech
	{ key: 'motion', info: 'Chart motion on the live surfaces — on / off. Reaches the preview, Present and the exported player (see player-motion); the PDF stays still.' },
	{ key: 'motion-style', info: 'How a chart moves — build (default) / together / rise.' },
	{ key: 'motion-speed', info: 'How fast the build runs — auto (default) / slow / normal / fast.' },
	{ key: 'player-motion', info: 'off ships still charts in the exported offline player while motion stays on for presenting. Omit it to follow motion.' },
	{ key: 'pace', info: 'Presentation rhythm — how long a self-presenting deck holds on a new slide before speaking: brisk / natural / deliberate.' },
	{ key: 'delivery', info: 'How much the narrated Guide gestures — restrained (default, boardroom) / expressive (sales, talks, teaching) / somber (bad news; no cursor).' },
	{ key: 'lexicon', info: 'Read-aloud pronunciations — a nested map of token → spoken text.' },
	{ key: 'acronyms', info: 'Acronym registry — term → spoken expansion (and an optional glossary definition).' },
	{ key: 'captions', info: 'Read-aloud text per slide — a nested map of slide number → what to say. A slide\u2019s own <!-- caption: --> wins over it.' },
	// Marp-inherited + tooling
	{ key: 'style', info: 'Raw CSS for this deck (a YAML block scalar).' },
	{ key: 'color', info: 'Text color on every slide — any CSS color. Quote a hex value: "#1a1a1a".' },
	{ key: 'backgroundColor', info: 'Slide background color — any CSS color. Quote a hex value: "#ffffff".' },
	{ key: 'backgroundImage', info: 'Slide background image — a CSS value, e.g. url(./bg.png).' },
	{ key: 'backgroundPosition', info: 'Where the background image sits — a CSS value, e.g. center.' },
	{ key: 'backgroundRepeat', info: 'Whether the background image tiles — a CSS value, e.g. no-repeat.' },
	{ key: 'backgroundSize', info: 'Background image size — a CSS value, e.g. cover.' },
	{ key: 'debug', info: 'Layout debug overlay — off / on-hover / on-always (+ verbose). Preview-only, stripped from every export.' },
	// The three RENDER-TARGET keys. They get no Studio CONTROL on purpose — they name the
	// artifact a render should emit, not a property of the deck, and the Studio decides all
	// three at export time (ShareSheet). That decision is recorded in
	// engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2.3, and it is a
	// decision about PANELS, not about this list: the editor is a plain text surface, so a
	// key an author types by hand still owes them a hint and the accepted values. Offering
	// `present` while hiding its two siblings — which is what this list did until now — left
	// `fluid:` reachable only by already knowing it exists. Vocabulary: lib/core/render-target-keys.js.
	{ key: 'present', info: 'Open the exported PDF in presentation mode. On: true / yes / on. Off: false / no / off. CLI and front matter only — the Studio sets it at export.' },
	{ key: 'read', info: 'Emit the .html as the reading article — prose instead of the slide stack. On: true / yes / on. Off: false / no / off. CLI and front matter only — the Studio sets it at export.' },
	{ key: 'fluid', info: 'Emit the .html as the responsive fluid-box viewer — each slide fills the viewport and reflows to portrait on a phone. On: true / yes / on. Off: false / no / off. PDF/PPTX/PNG are unchanged.' },
	{ key: 'player', info: 'Emit the .html as the self-contained offline player (Present · Read Slides · Read Article). On: true / yes / on. Off: false / no / off. Supersedes fluid.' },
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
	venue: 'venueNames',
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
	opts: { modifiers?: string[]; palettes?: string[]; registers?: Record<string, string[]>; vocab?: CompletionVocab | null } = {},
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
