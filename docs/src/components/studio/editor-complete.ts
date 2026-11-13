import { type Completion, type CompletionContext, type CompletionResult, type CompletionSource, insertCompletionText, pickedCompletion, startCompletion } from '@codemirror/autocomplete';
import { altFromAssetName } from '@/lib/photo-alt';
import { PACE_NAMES } from '@/lib/resolve-pace';
import { contextSources } from '@/playground/context-sources.js';
import { DATA_SOURCE_COMPONENTS } from '@/playground/data-source-components.js';
import { classDirectiveCompletion, classTokenResult, deckSplit, recordCompletion, recordOptions, slideBodyAfter, slideClassAt } from '@/playground/slide-context.js';
import { FRONT_MATTER_KEYS, OFFERED_SETTINGS } from '../../lib/front-matter-keys';
import { MARKS_AXES } from '../../lib/marks-words';
import { AGENDA_AXIS_ORDER, agendaWords } from './agenda';
import { ALIGN_HORIZONTAL, ALIGN_VERTICAL } from './align-catalog';
import { LOGO_FINISH_AXIS_ORDER, logoFinishWords } from './logo-finish';
import { PROGRESS_RAIL_AXIS_ORDER, progressRailWords } from './progress-rail';
import { BACKDROP_MASKS, BACKDROP_STRENGTHS, CARD_TAG_AXES, IMAGE_CARD_AXIS_ORDER, imageCardWords } from './slide-provenance';
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
// (lib/authoring/lint.js `buildVocab`). The front-matter value lists live in lib/front-matter-values.ts,
// below the Studio, so the docs reference page reads the same lists without importing the editor.
export { registerValueLists, VOCAB_VALUE_FIELDS } from '../../lib/front-matter-values';

// The keys that take one word per axis on ONE line (`tag:`, `backdrop:`, `image-card:`, the plugin
// registers), so completion offers a second word after the first.
const AXIS_KEYS = new Set(OFFERED_SETTINGS.filter((r) => r.kind === 'axis').map((r) => r.key));
// The axes of the registers the Studio mirrors (slide-provenance.ts, each pinned to its kernel
// by a test). A key not listed still completes, without the filled-axis filter.
const REGISTER_AXES: Record<string, readonly (readonly string[])[]> = {
	backdrop: [BACKDROP_STRENGTHS, BACKDROP_MASKS],
	tag: Object.values(CARD_TAG_AXES),
	'image-card': IMAGE_CARD_AXIS_ORDER.map(imageCardWords),
	'logo-finish': LOGO_FINISH_AXIS_ORDER.map(logoFinishWords),
	'progress-rail': PROGRESS_RAIL_AXIS_ORDER.map(progressRailWords),
	agenda: AGENDA_AXIS_ORDER.map(agendaWords),
	'marks': MARKS_AXES,
	align: [ALIGN_VERTICAL.map((e) => e.name), ALIGN_HORIZONTAL.map((e) => e.name)],
};

/** The words still worth offering after `written` on an axis-register line. Exported for a test. */
export function nextAxisWords(key: string, written: string, words: readonly string[]): string[] {
	const used = new Set(written.toLowerCase().split(/[\s,]+/).filter(Boolean));
	const filled = (REGISTER_AXES[key] ?? []).filter((axis) => axis.some((w) => used.has(w)));
	return words.filter((w) => !used.has(w) && !filled.some((axis) => axis.includes(w)));
}


/** The top-level keys the leading front matter sets, other than on line `skip` (the line being typed). Exported for a test. */
export function frontMatterKeysSet(lineText: (n: number) => string, lines: number, skip: number): Set<string> {
	const set = new Set<string>();
	if (lines < 1 || !/^---[ \t]*$/.test(lineText(1))) return set;
	for (let n = 2; n <= lines; n++) {
		const t = lineText(n);
		if (/^---[ \t]*$/.test(t)) break;
		if (n === skip) continue;
		const m = /^([A-Za-z_][\w-]*)[ \t]*:/.exec(t);
		if (m) set.add(m[1]);
	}
	return set;
}

/** Write `key: `, then, when the key's value completes, open that menu at once: the next thing the author types is the value. */
function applyKey(key: string, opensValues: boolean): Completion['apply'] {
	return (view, completion, from, to) => {
		view.dispatch({ ...insertCompletionText(view.state, `${key}: `, from, to), annotations: pickedCompletion.of(completion) });
		if (opensValues) startCompletion(view);
	};
}

/** True when `pos` sits inside the leading `---` front-matter block. */
function inFrontMatter(doc: string, pos: number): boolean {
	if (!/^---[ \t]*\r?\n/.test(doc)) return false;
	const close = doc.search(/\r?\n---[ \t]*(?:\r?\n|$)/);
	if (close === -1) return pos > 3; // open but unclosed: treat the rest as FM
	return pos <= close;
}

/** What a hover over a front-matter KEY shows: the row's description, its values and its default. */
export type FrontMatterHover = { key: string; from: number; to: number; info: string; values: string[] | null; default: string };

/**
 * The front-matter key under `pos`, or null. Top-level keys only (column 0), inside the leading
 * `---` block, and only over the key itself, not its value: the value already has completion, and
 * an unknown key gets the linter's own tooltip instead. Pure, so it is unit-tested without a view.
 * `lineFrom` is the document offset of the line's first character.
 */
export function frontMatterKeyAt(doc: string, lineText: string, lineFrom: number, pos: number, registers: Record<string, string[]> = {}): FrontMatterHover | null {
	if (!inFrontMatter(doc, pos)) return null;
	const m = /^([A-Za-z_][\w-]*)[ \t]*:/.exec(lineText);
	if (!m || pos < lineFrom || pos > lineFrom + m[1].length) return null;
	const row = OFFERED_SETTINGS.find((r) => r.key === m[1]);
	if (!row) return null;
	return { key: row.key, from: lineFrom, to: lineFrom + m[1].length, info: row.info, values: registers[row.key] ?? (row.key === 'pace' ? [...PACE_NAMES] : row.values ? [...row.values] : null), default: row.default };
}

/** A Library photo the editor can offer: the part of a record completion needs, no bytes. */
export type AssetChoice = { name: string; scope: string; width: number; height: number; sourceName: string };

export { altFromAssetName };

/** Is the slide the cursor line sits on a `collage`? Reads upward to the slide's `---` (or the top) for
 *  its `_class:` directive. A collage's body is a list of photos, so a bare list item there is a photo. */
export function inCollageSlide(lineText: (n: number) => string, lineNumber: number): boolean {
	for (let n = lineNumber - 1; n >= 1; n--) {
		const t = lineText(n);
		if (/^---\s*$/.test(t)) return false;
		if (/<!--\s*_class:[^>]*\bcollage\b/.test(t)) return true;
	}
	return false;
}

/** What may come next in a spark, a pill or a check — lint-core's `inlineCodeCompletions()` shape. */
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
): { typed: string; options: Completion[]; validFor: (text: string) => boolean; filter?: false } | null {
	if (((before.match(/`/g) || []).length & 1) === 0) return null;
	const inside = before.slice(before.lastIndexOf('`') + 1);
	if (/^~\{?$/.test(inside)) return { typed: inside, options: SPARK_TEMPLATES, validFor: (t) => /^~\{?[^`]*$/.test(t) };
	// The named form (2026-10-14-plugin-inline-door.md): `@` then a kind's name lists every kind the deck can
	// call, each with its alias; `@spark{` offers the starter sparks in the named spelling.
	if (/^@spark\{$/.test(inside)) {
		const named = SPARK_TEMPLATES.map((o) => ({ ...o, label: `@spark${o.label.slice(1)}` }));
		return { typed: inside, options: named, validFor: (t) => /^@spark\{[^`]*$/.test(t) };
	}
	if (/^@[a-z0-9-]*$/.test(inside)) {
		const got = next ? next(inside) : null;
		if (!got) return null;
		const options = got.words.map((w, i): Completion => ({ label: w.label, type: 'keyword', detail: 'kind', info: w.info || undefined, boost: 99 - i }));
		return { typed: inside, options, validFor: (t) => /^@[a-z0-9-]*$/.test(t) };
	}
	// An icon NAME: `^{da`, or `icon=da` inside a pill or a chart record. The lint core answers
	// with the names that START with what is typed (aliases too: `db` offers `database`), so the
	// menu is that list exactly (`filter: false`) and is asked again on every keystroke. Each row
	// is `detail: 'icon'`, which the editor's picker (icon-preview.ts) draws.
	if (/^(?:\^|@icon)\{[\w-]*$/.test(inside) || /^(?:@pill)?\{(?:[^{}`]*,)?\s*icon\s*=\s*[\w-]*$/.test(inside)) {
		const got = next ? next(inside) : null;
		if (!got) return null;
		const typed = /[\w-]*$/.exec(inside)?.[0] ?? '';
		const options = got.words.map((w, i): Completion => ({ label: w.label, type: 'keyword', detail: 'icon', info: w.info || undefined, boost: 99 - Math.min(i, 198) }));
		return { typed, options, validFor: () => false, filter: false };
	}
	// A check's ANSWER, the first item of `@check{…}` (the checks plugin): the kernel answers with the six that match
	// what is typed, by id or by spoken word (`y` offers `pass`, whose word is "yes"), so the menu is that list exactly
	// (`filter: false`) and is asked again on every keystroke, as the icon names are.
	// Once the typed word IS a whole answer, the kernel says what comes after it (`label=`): no menu then, or Enter
	// would put `label=` in the answer's place. The comma opens the next step, below.
	const answer = /^@check\{([\w-]*)$/.exec(inside);
	if (answer) {
		const got = next ? next(inside) : null;
		if (!got || got.next !== 'answer') return null;
		const options = got.words.map((w, i): Completion => ({ label: w.label, type: 'keyword', detail: 'answer', info: w.info || undefined, boost: 99 - i }));
		return { typed: answer[1], options, validFor: () => false, filter: false };
	}
	// The record so far, up to the last comma: its first item, then complete words. The kernel
	// is asked about that record CLOSED (`{LIVE, tag}`), which is what it can judge.
	const m = /^((?:~|@spark|@pill|@check)?\{[^{}`,]+(?:,\s*[\w-]+)*),\s*([\w-]*)$/.exec(inside);
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
 * Inside an inline code span the menu comes from the lint core, which the editor imports lazily
 * (`inlineNext` is null until it lands). CodeMirror asks a source again only on the next
 * keystroke, so a span typed before the core arrived (`` `@ava ``, then a pause) opened no menu
 * at all until the author typed again. Until the core is in, a source that found nothing inside a
 * span waits for the core and asks once more, so the menu opens the moment it lands. Outside a
 * span, or once the core is in, the source answers as it always did.
 */
export function withLazyInlineCore(
	source: (context: CompletionContext) => CompletionResult | null,
	coreReady: () => boolean,
	loadCore: () => Promise<unknown>,
): CompletionSource {
	return (context) => {
		const got = source(context);
		if (got || coreReady()) return got;
		const line = context.state.doc.lineAt(context.pos);
		const before = line.text.slice(0, context.pos - line.from);
		if (((before.match(/`/g) || []).length & 1) === 0) return null;
		return loadCore().then(() => (context.aborted || !coreReady() ? null : source(context)));
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
	// The keys whose value completes: picking one of them goes straight on to its value menu.
	const hasValues = (key: string): boolean =>
		Object.hasOwn(registerOptions, key) ||
		key === 'lang' ||
		key === 'ai-lang' ||
		key === 'pace' ||
		(key === 'theme' && paletteOptions.length > 0) ||
		(key === 'finish' && finishOptions.length > 0) ||
		(key === 'class' && (modifierOptions.length > 0 || classFinishOptions.length > 0));

	return function studioComplete(context: CompletionContext): CompletionResult | null {
		const line = context.state.doc.lineAt(context.pos);
		const before = line.text.slice(0, context.pos - line.from);

		// 0. Inside a spark (`` `~{12 14 17, bar, lg` ``) or a pill (`` `{LIVE, tag, c4` ``).
		const inline = inlineCodeCompletion(before, opts.inlineNext ?? null);
		if (inline) return { from: context.pos - inline.typed.length, options: inline.options, validFor: inline.validFor, ...(inline.filter === false ? { filter: false } : {}) };

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

		// 1a. Inside a slide RECORD (`<!-- {layout=cards, footer=Q3} -->`, record note step 3): a field name after `{` or
		// `, `, a value after `field=` (a component for `layout`, its variants for `variant`, the class grammar for
		// `class`, a register's own words for the rest). The same kernel as the Playground's (slide-context.js).
		const rec = recordCompletion(before);
		if (rec) {
			if (!rec.typed && !context.explicit && rec.kind === 'value') return null;
			const doc = context.state.doc;
			const split = deckSplit(doc.sliceString(0, Math.min(doc.length, 4000)));
			const slideText = slideBodyAfter((n: number) => doc.line(n).text, doc.lines, line.number, { split });
			const options = recordOptions(rec, components, classVocab, { ...classExtra, slideText });
			if (!options.length) return null;
			return { from: line.from + rec.from, options: options as Completion[], validFor: /^[\w-]*$/ };
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
		// 1g. The NEXT word of a one-line axis register (`image-card: top-right so|`). Each takes up
		// to one word per axis on one line, so completion keeps going after the first word, leaving
		// out the words already written and, where the axes are known, the rest of a filled axis.
		const axisLine = /^([\w-]+):[ \t]*((?:[\w-]+[ \t,]+)+)[\w-]*$/.exec(before);
		if (axisLine && AXIS_KEYS.has(axisLine[1]) && Object.hasOwn(registerOptions, axisLine[1]) && inFrontMatter(context.state.doc.toString(), context.pos)) {
			const keep = new Set(nextAxisWords(axisLine[1], axisLine[2], registerOptions[axisLine[1]].map((o) => o.label)));
			const options = registerOptions[axisLine[1]].filter((o) => keep.has(o.label));
			if (!options.length) return null;
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options, validFor: /^[\w-]*$/ };
		}

		// 2. A fence's language is a shared source (context-sources.js `fenceLanguageSource`), which loads the plugin
		// registry on first use.

		// 3. Finish register value on a `finish:` line — built-ins + saved finishes.
		if (finishOptions.length && /^[ \t]*finish:[ \t]*[\w-]*$/.test(before) && inFrontMatter(context.state.doc.toString(), context.pos)) {
			const word = context.matchBefore(/[\w-]*/);
			return { from: word ? word.from : context.pos, options: finishOptions, validFor: /^[\w-]*$/ };
		}

		// 4. Front-matter directive key, at column 0 inside the `---` block. An indented line is an entry of a nested
		// map (`backdrop:` → `  strength:`), whose keys are the map's own (context-sources.js), never the deck's.
		if (inFrontMatter(context.state.doc.toString(), context.pos) && /^[\w-]*$/.test(before)) {
			const word = context.matchBefore(/[\w-]*/);
			// Don't fire on the `---` fence lines themselves.
			if (/^-+$/.test(line.text.trim())) return null;
			// A key the front matter already sets is not offered again (YAML keeps only the last one).
			const set = frontMatterKeysSet((n) => context.state.doc.line(n).text, context.state.doc.lines, line.number);
			return {
				from: word ? word.from : context.pos,
				options: FRONT_MATTER_KEYS.filter((k) => !set.has(k.key)).map((k) => ({ label: k.key, type: 'property', info: k.info, apply: applyKey(k.key, hasValues(k.key)) })),
				validFor: /^[\w-]*$/,
			};
		}

		return null;
	};
}

/**
 * A CompletionSource for Library photos, run beside `makeStudioCompletion` (CodeMirror merges the sources, and
 * the two never apply to the same spot). `loadAssets` reads the shelf on demand, so the editor pays nothing
 * until the first image reference is typed.
 *   - Inside the `(…)` of any markdown image (`![alt](`, `![bg](`, a collage's list item): `asset:<name>` for
 *     each photo this deck can see, and `sample:<name>` for Lattice's sample art (`loadSamples`, when given). A
 *     reference already written as a URL (`https:`) is left alone.
 *   - On a collage slide, a bare list item is a photo: each whole `![Alt](asset:name)` line, alt text selected.
 */
export function makeAssetCompletion(loadAssets: () => Promise<AssetChoice[]> | AssetChoice[], loadSamples?: () => Promise<string[]> | string[]) {
	const photoOption = (a: AssetChoice, kind: 'ref' | 'line'): Completion => {
		const detail = `${a.width}×${a.height}${a.scope === 'library' ? '' : ' · this deck'}`;
		if (kind === 'ref') return { label: `asset:${a.name}`, type: 'constant', detail, info: a.sourceName };
		return {
			label: a.name,
			type: 'constant',
			detail: `photo · ${detail}`,
			info: a.sourceName,
			// A whole collage line, with the alt text selected: it is the screen-reader label and the caption of the
			// enlarged view, and a name like `img-0042` is a poor one.
			apply: (view, _c, from, to) => {
				const alt = altFromAssetName(a.name);
				view.dispatch({ changes: { from, to, insert: `![${alt}](asset:${a.name})` }, selection: { anchor: from + 2, head: from + 2 + alt.length } });
			},
		};
	};

	return function assetComplete(context: CompletionContext): Promise<CompletionResult | null> | null {
		const line = context.state.doc.lineAt(context.pos);
		const before = line.text.slice(0, context.pos - line.from);
		// 00. A Library photo: inside the `(…)` of any markdown image (`![alt](`, `![bg](`, a collage's list item),
		// offer `asset:<name>` for each photo this deck can see. A reference already written as a URL
		// (`https:`, `sample:`) is left alone: the typed prefix must be a prefix of `asset:`, or `asset:` plus a name.
		// Only the end of the line is read: a 250 KB line of `![a](` repeats would otherwise cost seconds per keystroke.
		const ref = /!\[[^\]\n]*\]\(([^)\s]*)$/.exec(before.slice(-300));
		const typed = ref ? ref[1].toLowerCase() : '';
		const wantsAssets = !!ref && ('asset:'.startsWith(typed) || typed.startsWith('asset:'));
		// Lattice's sample art (`sample:<name>`, lib/samples/), so an image reference completes even with an empty Library.
		const wantsSamples = !!ref && !!loadSamples && ('sample:'.startsWith(typed) || typed.startsWith('sample:'));
		if (ref && (wantsAssets || wantsSamples)) {
			const from = context.pos - ref[1].length;
			const assets = wantsAssets ? Promise.resolve(loadAssets()).catch(() => [] as AssetChoice[]) : Promise.resolve([] as AssetChoice[]);
			const samples = wantsSamples && loadSamples ? Promise.resolve(loadSamples()).catch(() => [] as string[]) : Promise.resolve([] as string[]);
			return Promise.all([assets, samples]).then(([list, names]) => {
				const options = [...list.map((a) => photoOption(a, 'ref')), ...names.map((n): Completion => ({ label: `sample:${n}`, type: 'constant', detail: 'sample art' }))];
				return options.length ? { from, options, validFor: /^[\w:.-]*$/ } : null;
			});
		}
		// A bare list item on a collage slide is a photo: offer each whole line. Only once something is typed (or on
		// Ctrl-Space), so an Enter on an empty bullet stays a newline.
		const item = /^[ \t]*[-*][ \t]+([\w-]*)$/.exec(before);
		if (item && (item[1] || context.explicit) && inCollageSlide((n) => context.state.doc.line(n).text, line.number)) {
			const from = context.pos - item[1].length;
			return Promise.resolve(loadAssets()).then((list) => (list.length ? { from, options: list.map((a) => photoOption(a, 'line')), validFor: /^[\w-]*$/ } : null)).catch(() => null);
		}
		return null;
	};
}

/**
 * The map's body completer, loaded on first use: its basemaps are about 100 KB, and the Studio pays nothing for them
 * until the caret is on a `map` slide. The slide check runs first, synchronously, so every other line returns null at
 * once. (The Playground imports the registry statically; context-sources.js takes either.)
 */
const lazyDataSource: CompletionSource = (context) => {
	const doc = context.state.doc;
	const line = doc.lineAt(context.pos);
	const info = slideClassAt((n: number) => doc.line(n).text, line.number);
	if (!info || !DATA_SOURCE_COMPONENTS.includes(info.name)) return null;
	return import('@/playground/data-sources.js').then(({ dataSources }) => {
		if (context.aborted) return null;
		for (const source of dataSources) {
			const got = source(context);
			if (got) return got;
		}
		return null;
	});
};

/** Brings in the lint core's `flowchartCompletions` (tests pass the core directly; the site loads it on demand). */
export type FlowchartLoader = () => Promise<{ flowchartCompletions: (md: string) => { names: string[]; spanWords: { label: string; axis: string }[] } }>;

/**
 * Every source the Studio's deck editor runs: its own completer (`main`, from `makeStudioCompletion`), the Library
 * photos (`assets`), then the slide-context sources it shares with the Playground (context-sources.js). One function,
 * so the parity test reads the same list Editor.tsx installs.
 */
export function studioCompletionSources(
	main: CompletionSource,
	assets: CompletionSource,
	catalog: CompletionComponent[] = [],
	registers: Record<string, string[]> = {},
	loadFlowchart?: FlowchartLoader,
): CompletionSource[] {
	return [main, assets, ...contextSources({ catalog, dataSources: [lazyDataSource], registers, loadFlowchart })];
}
