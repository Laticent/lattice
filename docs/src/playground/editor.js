// CodeMirror 6 editor for the Lattice playground.
//
// Lightweight, on-brand replacement for the plain <textarea>: markdown syntax
// highlighting with basic Mermaid highlighting inside ```mermaid fences, themed
// entirely through the page's CSS custom properties (--bg / --accent / …) so it
// recolours with the palette + light/dark toggle like everything else.
//
// Astro/Vite bundles this (imported from playground.astro), so no separate
// esbuild step — the CodeMirror packages live in docs/package.json.

import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { bracketMatching, HighlightStyle, indentOnInput, LanguageDescription, LanguageSupport, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { linter, lintGutter, lintKeymap } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { lintTheme, lintThemeCoarse, tooltipShell } from '../lib/lint-theme.js';
import { latticeAutocomplete } from './complete.js';
import { readFrontMatter } from './deck-config.js';
import { buildVocabSets, findingsToDiagnostics } from './editor-diagnostics.js';
import { MERMAID_KEYWORDS } from './grammar-vocab.js';
import { typeaheadContext } from './slide-context.js';

// Proactive "type-ahead" trigger — which grammar context kinds auto-open the
// completion popup on ENTRY (before a character is typed), per workspace mode.
// 'class' (the default) limits proactive open to the `_class:` directive — the
// component name, then its modifiers (so picking a component and hitting space
// cascades you straight into the modifier list). 'all' extends it to every
// grammar context with a pure detector (directives, fence languages, the
// front-matter value lines). 'off' disables proactive open entirely — the popup
// then opens only on typing / Ctrl-Space, the legacy behaviour. The map/data
// and Mermaid sources are never proactive (their sources need a typed prefix).
const TYPEAHEAD_KINDS = {
	class: new Set(['class', 'modifier']),
	all: new Set(['class', 'modifier', 'directive', 'paginate', 'fence', 'theme', 'finish', 'form', 'split']),
};
function normalizeTypeahead(mode) {
	return mode === 'all' || mode === 'off' ? mode : 'class';
}

// ── Mermaid: StreamLanguage ported from PrismJS's prism-mermaid grammar ──────
// (prismjs/components/prism-mermaid.js). Prism's regexes are whole-document with
// one lookbehind each; StreamLanguage tokenizes left-to-right per line, so each
// pattern is anchored with `\G` semantics (sticky from stream.pos) and the
// Prism "lookbehind" prev-char guard is checked against the char before the
// match. Token names are the CodeMirror legacy-mode names that resolve to
// highlight tags (keyword/operator/string/propertyName/comment/number/
// variableName/meta/punctuation/labelName); latticeHighlight styles them.
//
// Covered (matching Prism): %% comments; classDef/style/linkStyle style lines
// (property:value); inter-arrow labels (text on -- / == links with arrowheads);
// the four arrow families (ER, flowchart, sequence, class); |edge labels|;
// (node)/[text]/{shapes}; "strings"; <<interface>>/[[fork]] annotations; both
// case-sensitive and case-insensitive keyword sets; #entity; & : ::: operators;
// (){};  punctuation.
// KW_DECLARE is built from the shared MERMAID_KEYWORDS.declare list (one source
// of truth with the in-fence keyword completion in complete.js) — the generated
// source is byte-identical to the prior literal. KW_FLOW stays hand-written: its
// `end note` / `note over|left of|right of` multi-word forms don't reduce to a
// flat list (its single-word members mirror MERMAID_KEYWORDS.flow minus those).
const KW_DECLARE = new RegExp(`^(?:${MERMAID_KEYWORDS.declare.join('|')})(?![\\w$-])`);
const KW_FLOW =
	/^(?:activate|alt|and|as|autonumber|deactivate|else|end(?:[ \t]+note)?|loop|opt|par|participant|rect|state|note[ \t]+(?:over|(?:left|right)[ \t]+of))(?![\w$-])/i;
const ANNOTATION = /^(?:<<(?:abstract|choice|enumeration|fork|interface|join|service)>>|\[\[(?:choice|fork|join)\]\])/i;
// Arrow families (Prism's four `arrow` patterns), anchored; prev-char guard
// applied separately so the leading negated class isn't consumed.
const ARROWS = [
	/^[|}][|o](?:--|\.\.)[|o][|{]/, // ER
	/^(?:[<ox](?:==+|--+|-\.*-)[>ox]?|(?:==+|--+|-\.*-)[>ox]|===+|---+|-\.+-)/, // flowchart
	/^(?:--?(?:>>|[x>)])|(?:<<|[x<(])--?(?!-))/, // sequence
	/^(?:[*o]--|--[*o]|<\|?(?:--|\.\.)|(?:--|\.\.)\|?>|--|\.\.)/, // class
];
const ARROW_PREV = [/[{}|o.-]/, /[<>ox.=-]/, /[<>()x-]/, /[<>|*o.-]/];

const mermaidParser = {
	startState: () => ({ lineStart: true }),
	token(stream, state) {
		// Logical line start = beginning of line after any indent. Set it on sol,
		// keep it across the indent-eating call, THEN read it — so a non-indented
		// keyword line isn't misjudged from the previous line's trailing state.
		if (stream.sol()) state.lineStart = true;
		if (stream.eatSpace()) return null;
		const atLineStart = state.lineStart;
		const prev = stream.string.charAt(stream.start - 1);
		const emit = (tok) => {
			state.lineStart = false;
			return tok;
		};

		// comment
		if (stream.match(/^%%.*/)) return emit('comment');

		// "string"
		if (stream.match(/^"[^"\r\n]*"/)) return emit('string');

		// annotation  <<interface>>  [[fork]]
		if (stream.match(ANNOTATION)) return emit('meta');

		// arrows — try each family, honoring Prism's prev-char guard. Run before
		// the node-id matcher so a bare id (e.g. `A`) can't swallow the dashes of
		// `A-->B`; the id matcher below also refuses to eat `--` runs.
		for (let i = 0; i < ARROWS.length; i++) {
			if (prev && ARROW_PREV[i].test(prev)) continue;
			if (stream.match(ARROWS[i])) return emit('operator');
		}

		// |edge label|
		if (prev !== '|' && prev !== '<' && stream.match(/^\|(?:[^\r\n"|]|"[^"\r\n]*")+\|/)) {
			return emit('labelName');
		}

		// node text:  [text]  (text)  {shape}  >flag
		if (stream.match(/^(?:[([{]+|\b>)(?:[^\r\n"()[\]{}]|"[^"\r\n]*")+(?:[)\]}]+|>)/)) {
			return emit('string');
		}

		// keywords — Prism anchors these to line start (lookbehind on ^[ \t]*), so
		// match only at logical line start. This avoids colouring node ids that
		// happen to be keyword words mid-line (`A --> end`, a node called `state`).
		// KW_DECLARE includes classDef/linkStyle/style, so style lines are covered.
		if (atLineStart && (stream.match(KW_DECLARE) || stream.match(KW_FLOW))) {
			return emit('keyword');
		}

		// entity  #1f2c3d;  #amp;
		if (stream.match(/^#[a-z0-9]+;/i)) return emit('meta');

		// operators  :::  :  &
		if (stream.match(/^(?::::|:|&)/)) return emit('operator');

		// numbers
		if (stream.match(/^\b\d+\b/)) return emit('number');

		// punctuation (`,` included for classDef/style value lists, per Prism)
		if (stream.match(/^[(){};,]/)) return emit('punctuation');

		// style-line property:value — colour `prop:` identifiers as properties
		// (Prism's style.inside.property).
		if (stream.match(/^\w[\w-]*(?=[ \t]*:)/)) return emit('propertyName');

		// default: a node id (variableName). Allow internal hyphens (mermaid ids
		// may contain them) but NOT a `--` run, so arrows like `A-->B` tokenize as
		// id + arrow + id rather than the id eating `A--`.
		if (stream.match(/^[\w$]+(?:-[\w$]+)*/)) return emit('variableName');

		stream.next();
		return emit(null);
	},
};
const mermaidLang = StreamLanguage.define(mermaidParser);

// Fenced-code highlighting. The languages Lattice authors actually use (per the
// component samples: js, python, sql, plus mermaid and the common config/markup
// formats) are bundled EAGERLY as ready LanguageDescriptions, so ```fences
// highlight immediately — no first-use lag while a lazy chunk loads. Everything
// else falls back to @codemirror/language-data's full lazy-loaded set. lang-
// markdown matches a fence's info string against these by name/alias in order,
// so the eager entries win for the languages we care about.
const EAGER_LANGUAGES = [
	LanguageDescription.of({ name: 'mermaid', alias: ['mmd'], support: new LanguageSupport(mermaidLang) }),
	LanguageDescription.of({ name: 'javascript', alias: ['js', 'jsx', 'node'], support: javascript() }),
	LanguageDescription.of({ name: 'typescript', alias: ['ts'], support: javascript({ typescript: true }) }),
	LanguageDescription.of({ name: 'tsx', support: javascript({ typescript: true, jsx: true }) }),
	LanguageDescription.of({ name: 'python', alias: ['py'], support: python() }),
	LanguageDescription.of({ name: 'sql', support: sql() }),
	LanguageDescription.of({ name: 'json', alias: ['json5'], support: json() }),
	LanguageDescription.of({ name: 'yaml', alias: ['yml'], support: yaml() }),
	LanguageDescription.of({ name: 'css', support: css() }),
	LanguageDescription.of({ name: 'html', alias: ['htm'], support: html() }),
];

// Highlight palette mapped onto Lattice CSS tokens. CodeMirror needs concrete
// colours per tag, but we point them at var(--token) so they track the palette.
// CONTRAST-REPAIRED VIA THE SHARED SYNTAX INK TIER (#1688). Every row that used to read
// `var(--accent)` or `var(--text-muted)` now reads the derived `--syntax-*-ink` token instead,
// for one measured reason: neither of those carries an AA guarantee against the canvas. Over the
// emitted per-palette sheet, `--accent` bottoms out at 3.89:1 (mustard/light) and `--text-muted`
// at 2.11:1 (magnolia/light) — and `--text-muted` is below AA on 44 of 72 palette-mode-surface
// pairs. This is the PUBLIC Playground editor, a larger surface than the Studio's CodeField, and
// it carried the same defect; a checker caught that the first cut of #1688 repaired only the
// smaller one. The tier is emitted onto the same `html[data-palette][data-mode]` blocks this page
// already resolves its tokens from (docs/src/styles/lattice-tokens.generated.css), so this is a
// re-point, not a new mechanism. `--text-heading` and `--text-body` stay: both ARE AA by
// contract, and repointing them would be a redesign rather than a repair.
//
// `t.number` goes to `--syntax-number-ink` rather than the keyword ink — it was on `--accent`
// only because nothing better existed. Rows are otherwise mapped to preserve exactly which ones
// read alike today.
// Exported for `syntax-highlight-parity.test.ts`, which pins every row to a token that is AA
// against the canvas. Nothing else imports it — the export exists so the gate can see it, the
// same reason Fabricate's audit reduction was extracted.
export const latticeHighlight = HighlightStyle.define([
	{ tag: t.heading, color: 'var(--text-heading)', fontWeight: '700' },
	{ tag: [t.strong], color: 'var(--text-heading)', fontWeight: '700' },
	{ tag: [t.emphasis], fontStyle: 'italic' },
	{ tag: [t.link, t.url], color: 'var(--syntax-keyword-ink)', textDecoration: 'underline' },
	{ tag: [t.monospace], color: 'var(--syntax-keyword-ink)' },
	{ tag: [t.comment], color: 'var(--text-muted)', fontStyle: 'italic' },
	{ tag: [t.keyword], color: 'var(--syntax-keyword-ink)', fontWeight: '600' },
	{ tag: [t.operator], color: 'var(--text-muted)' },
	{ tag: [t.bracket], color: 'var(--text-muted)' },
	{ tag: [t.string], color: 'var(--text-body)' },
	{ tag: [t.number], color: 'var(--syntax-number-ink)' },
	{ tag: [t.processingInstruction, t.meta], color: 'var(--text-muted)' },
	{ tag: [t.list], color: 'var(--syntax-keyword-ink)' },
	{ tag: [t.quote], color: 'var(--text-muted)', fontStyle: 'italic' },
	// Mermaid token tags (ported from Prism): node ids, edge labels, style props,
	// annotations, punctuation. Distinct hues so a diagram reads structurally.
	{ tag: [t.variableName], color: 'var(--text-heading)' },
	{ tag: [t.propertyName], color: 'var(--syntax-keyword-ink)' },
	{ tag: [t.labelName], color: 'var(--text-body)', fontStyle: 'italic' },
	{ tag: [t.punctuation, t.separator], color: 'var(--text-muted)' },
]);

// Editor chrome themed off the page tokens so it matches the playground shell
// and recolours with the palette/mode (CSS vars resolve live on every paint).
const latticeTheme = EditorView.theme({
	'&': {
		height: '100%',
		fontSize: '13.5px',
		color: 'var(--text-body)',
		backgroundColor: 'var(--bg)',
		// ── Editor contrast tokens ───────────────────────────────────────────────
		// The cursor-line and text-selection highlights were both a flat low-alpha
		// wash of --accent (active line 6%, selection 22%). That left the active
		// line near-invisible on every palette (WCAG band-contrast ~1.06–1.16) and
		// the selection faint on the low-chroma / warm light palettes. These named
		// tokens are the single tunable contract: the active line bumps to a clearly
		// visible band (free — alpha too low to touch text legibility), while the
		// selection keeps its existing 22% fill (so body text stays legible on the
		// worst low-contrast palette, cuoio-light — no accessibility regression) and
		// gains a defining 1px accent edge: the definition a heavier fill can't buy
		// without hurting legibility. A downstream theme can override any of them.
		'--cm-active-line': 'color-mix(in srgb, var(--accent) 12%, transparent)',
		'--cm-active-gutter': 'color-mix(in srgb, var(--accent) 18%, transparent)',
		'--cm-selection': 'color-mix(in srgb, var(--accent) 22%, transparent)',
		'--cm-selection-edge': 'color-mix(in srgb, var(--accent) 45%, transparent)',
		'--cm-match': 'color-mix(in srgb, var(--accent) 26%, transparent)',
		// Autocomplete popup. The panel reused --bg (identical to the editor) with a
		// plain --border edge, so in light mode it floated with no visible boundary
		// (border-vs-bg ~1.21 on indaco-light), and the detail/type hint reused
		// --text-muted, which drops to WCAG ~2.5 on the warm light palettes. A
		// muted-blended border lifts the panel edge to ~1.87; a body-blended detail
		// colour lifts the hint to ~3.85 while staying secondary to the label.
		'--cm-pop-border': 'color-mix(in srgb, var(--border) 45%, var(--text-muted))',
		'--cm-detail': 'color-mix(in srgb, var(--text-muted) 50%, var(--text-body))',
	},
	// On touch devices, iOS Safari auto-zooms the page when you focus an input
	// whose font is under 16px. Bump the editable surface to 16px on coarse
	// pointers so tapping in doesn't zoom; desktop keeps the denser 13.5px.
	// (Coarse-pointer rules live in the `@media` block at the END of this object —
	// its position is load-bearing; see the note there.)
	'.cm-scroller': {
		fontFamily: 'var(--font-mono)',
		lineHeight: '1.6',
		overflow: 'auto',
	},
	'.cm-content': { padding: '14px 0', caretColor: 'var(--accent)' },
	'.cm-gutters': {
		backgroundColor: 'var(--bg)',
		color: 'var(--text-muted)',
		border: 'none',
		borderRight: '1px solid var(--border)',
	},
	'.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
	'.cm-activeLineGutter': { backgroundColor: 'var(--cm-active-gutter)', color: 'var(--accent)' },
	'&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
	// The fill stays moderate (legibility-safe); the inset edge gives the band the
	// crisp definition a heavier fill would cost in text contrast. ::selection (the
	// native fallback before drawSelection paints) keeps the plain fill.
	'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
		backgroundColor: 'var(--cm-selection)',
		boxShadow: 'inset 0 0 0 1px var(--cm-selection-edge)',
	},
	'::selection': { backgroundColor: 'var(--cm-selection)' },
	'.cm-matchingBracket': { backgroundColor: 'var(--cm-match)', outline: 'none' },
	// The floating shell every tooltip wears. This surface never had one: its lint
	// popup fell through to @codemirror/view's base theme (`#f5f5f5`) in every
	// palette AND in dark mode, where `--text-body` on that fill measures 1.32:1.
	// The Studio themed `.cm-tooltip` and this editor did not — precisely the drift
	// this module exists to end, so the rule is shared rather than copied.
	...tooltipShell,
	// Every lint surface — squiggle, gutter disc, hover card, panel — comes from
	// the shared module, so this editor and the Studio's deck editor cannot drift
	// apart. It replaces a local copy that painted severity with
	// `--db-sev-error` / `--db-sev-warning`: tokens referenced here but DEFINED
	// NOWHERE in the repo, so their `#c0392b` / `#b8860b` fallbacks won on every
	// palette and the severity colors never tracked the theme at all.
	...lintTheme,
	// NOTE: the autocomplete popup (.cm-tooltip-autocomplete / .cm-completionInfo)
	// is ALSO themed in a global stylesheet (ensureTooltipTheme below). The lint
	// tooltip needs no such treatment: measured on the built site, `.cm-tooltip-lint`
	// is a descendant of `.cm-editor` (the tooltip plugin sets
	// `container = view.dom` whenever no `parent` is configured, and nothing here
	// configures one), so these scoped rules reach it. The autocomplete duplication
	// is left alone deliberately — it is a separate surface with its own history,
	// and unpicking it is not this change's job.
	//
	// LAST on purpose, and it must stay last. A theme object compiles to a
	// stylesheet in key order, and these rules target the same selectors as the
	// base ones at the same specificity — so placed earlier they lose to the very
	// rules they exist to override and the touch sizes silently never apply.
	// (Measured: the fix pill stayed 28px on a real coarse pointer until this
	// block moved below `...lintTheme`.)
	'@media (pointer: coarse)': {
		// iOS Safari auto-zooms the page when focusing an editable surface whose
		// font computes under 16px.
		'.cm-content': { fontSize: '16px' },
		...lintThemeCoarse,
	},
});

// Global autocomplete-popup theme. Injected once into <head> (not via
// EditorView.theme). Backgrounds use !important to beat CM's dynamically-injected
// base theme regardless of stylesheet order.
//
// WHY GLOBAL, HONESTLY: this block predates the shared lint theme and was written
// on the belief that CodeMirror places tooltips "in a detached/fixed layer outside
// .cm-editor", said to be the cause of an unthemed white box on iOS Safari. That
// belief does NOT hold for the installed version: tooltipPlugin.createContainer()
// falls back to `container = view.dom` whenever no `parent` is configured, nothing
// in docs/src configures one, and the lint tooltip measures as a descendant of
// .cm-editor on the built site in every case tested. The lint popup is therefore
// themed with SCOPED rules (lib/lint-theme.js) and needs nothing here.
//
// This block stays global anyway, deliberately: the original iOS report was never
// reproduced or refuted on a real iOS Safari — that platform is unreachable from
// this sandbox — so removing the belt while the brace is untested would trade a
// verified-harmless duplication for an unverifiable risk on the one platform the
// complaint came from. Retire it when someone can drive real iOS Safari and show
// the autocomplete popup stays themed without it.
//
// Note the coupling this leaves: `.cm-tooltip.cm-tooltip-autocomplete` below sets
// its own fill with !important, so it does NOT inherit `tooltipShell`. The two
// agree today only because both resolve to var(--bg); retuning the shared shell
// would move the lint popup and leave the autocomplete popup behind.
const TOOLTIP_CSS = `
.cm-tooltip.cm-tooltip-autocomplete {
	border: 1px solid color-mix(in srgb, var(--border) 45%, var(--text-muted));
	border-radius: 8px;
	background-color: var(--bg) !important;
	color: var(--text-body);
	box-shadow: 0 12px 30px color-mix(in srgb, var(--text-heading) 30%, transparent);
	overflow: hidden;
}
.cm-tooltip-autocomplete > ul { font-family: var(--font-mono); font-size: 13px; max-height: 15em; }
.cm-tooltip-autocomplete > ul > li { padding: 3px 10px; color: var(--text-body); }
.cm-tooltip-autocomplete > ul > li[aria-selected] { background-color: var(--accent); color: var(--on-accent); }
.cm-completionMatchedText { text-decoration: none; font-weight: 700; color: var(--accent); }
.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionMatchedText { color: var(--on-accent); }
.cm-completionDetail { color: color-mix(in srgb, var(--text-muted) 50%, var(--text-body)); font-style: italic; }
.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail { color: var(--on-accent); opacity: 0.8; }
.cm-tooltip.cm-completionInfo {
	border: 1px solid color-mix(in srgb, var(--border) 45%, var(--text-muted));
	border-radius: 8px;
	background-color: var(--bg-alt) !important;
	color: var(--text-body);
	padding: 8px 10px;
	font-family: var(--font-body, inherit);
	font-size: 12.5px;
	line-height: 1.45;
	max-width: 22em;
	box-shadow: 0 10px 28px color-mix(in srgb, var(--text-heading) 22%, transparent);
}
/* The lint tooltip is NOT themed here — it lives inside .cm-editor, so the scoped
   rules from lib/lint-theme.js reach it, and one definition dresses both this
   editor and the Studio's. Its shell comes from the tooltipShell spread in the
   theme OBJECT above, not from this sheet; what is in this sheet is the
   autocomplete-specific chrome. (No backticks in here — this is inside a template
   literal, and one would end it.) */`;

function ensureTooltipTheme() {
	if (typeof document === 'undefined' || document.getElementById('lattice-cm-tooltip-theme')) return;
	const style = document.createElement('style');
	style.id = 'lattice-cm-tooltip-theme';
	style.textContent = TOOLTIP_CSS;
	document.head.appendChild(style);
}

// Editor chrome variant that grows to fit its content instead of filling a
// fixed-height pane — no inner scrollbar, so the whole markdown is visible at
// once. Used by the component-page Specimen ("see the full source without
// scrolling"); the playground keeps the fixed-pane default.
const autoHeightTheme = EditorView.theme({
	'&': { height: 'auto' },
	'.cm-scroller': { overflow: 'visible' },
});

// Create the editor in `parent`. `onChange(value)` fires (debounced by caller)
// on every doc change. `autoHeight` grows the editor to its content (no inner
// scroll) rather than filling the parent. `onCursor` (optional) fires with the
// 1-based line number of the primary selection head whenever the selection or
// doc changes — the Drawing Board uses it to sync the preview filmstrip to the
// slide under the cursor. Returns
// { getValue, setValue, focus, destroy, goToLine }.
//
// `vocab` (the Drawing Board's lintVocab), `catalog` (the compact component
// catalog), and `themes` (the registered theme-name list) power deck-grammar
// autocompletion — component names + modifiers inside `<!-- _class: … -->`,
// theme names in front matter, and more. All optional; without them only the
// map region completer (self-sufficient from the baked basemaps) is live, so
// the playground / Specimen editors keep working unchanged. `autocomplete`
// (default true) sets the initial state; `setAutocomplete(bool)` toggles it live
// — the Drawing Board wires both to a workspace preference.
//
// `typeahead` ('class' | 'all' | 'off', default 'class') governs whether the
// popup opens PROACTIVELY on entering a grammar context (vs. only on typing).
// `setTypeahead(mode)` switches it live; the Drawing Board wires both to a
// workspace preference. It is inert when autocomplete is off.
//
// INLINE validation — the editor's view of the SAME deterministic lint-core the
// Architect panel runs: layout/component grammar findings drawn as wavy underlines
// with a hover tooltip (message + fix) and a one-click quick-fix for the mechanical
// footguns. It activates whenever `vocab` is supplied (the Drawing Board AND the
// Playground), and is governed PER DECK by the `validate:` front-matter key (default
// on) — so the setting travels with the deck and is toggled from the deck-setup
// drawer, not a per-user preference. An editor with no `vocab` (e.g. a fragment
// sub-editor) never validates.
/**
 * @param {{
 *   parent: HTMLElement,
 *   doc?: string,
 *   onChange: (value: string) => void,
 *   onCursor?: (line: number) => void,
 *   autoHeight?: boolean,
 *   vocab?: unknown,
 *   catalog?: unknown,
 *   themes?: unknown,
 *   finishes?: unknown,
 *   autocomplete?: boolean,
 *   typeahead?: string,
 * }} opts
 */
export function createEditor({ parent, doc = '', onChange, onCursor, autoHeight = false, vocab, catalog, themes, finishes, autocomplete = true, typeahead = 'class' }) {
	ensureTooltipTheme(); // global popup theme (reaches CM's detached tooltip layer)
	// The autocomplete extension lives in a Compartment so the on/off preference
	// can reconfigure it live (built once with the vocab; toggled to [] when off).
	const autocompleteExt = latticeAutocomplete({ vocab, catalog, themes, finishes });
	const autocompleteComp = new Compartment();

	// Inline validation source — runs the SAME pure lint-core the Architect panel
	// runs and maps its findings onto the document as CodeMirror diagnostics. Active
	// only with a deck-grammar `vocab`, and self-gated PER DECK by the `validate:`
	// front-matter key (default on) read from the document itself — so the toggle
	// travels with the deck (set from the deck-setup drawer) with no extra wiring: a
	// `validate: off` write re-lints to zero findings through the normal edit path.
	// The vocab Sets are rebuilt each run so component names bridged into `vocab` live
	// (the author's saved local components) are recognised. lintCore is imported on
	// demand so editor surfaces that never validate don't pull the authoring-core
	// bundle. The source is async — CodeMirror's linter awaits the returned promise.
	let lintCoreMod = null;
	const lintSource = async (view) => {
		if (!vocab) return [];
		const src = view.state.doc.toString();
		if (!readFrontMatter(src).validate) return []; // deck opted out via front matter
		if (!lintCoreMod) {
			try {
				lintCoreMod = (await import('./authoring-core.generated.js')).lintCore;
			} catch {
				return [];
			}
		}
		let findings;
		try {
			findings = lintCoreMod.lintTextWith(src, buildVocabSets(vocab));
		} catch {
			return [];
		}
		return findingsToDiagnostics(view.state.doc, findings, {
			// Quick fix for the autofixable footguns — lint-core computes the rewrite,
			// applied as one undoable change (which re-renders + re-lints).
			onFix: (v, f) => {
				const out = lintCoreMod.applyFix(v.state.doc.toString(), f);
				if (out != null) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: out } });
			},
		});
	};
	// Fix-all command (Alt-Shift-F) — apply every autofixable finding in the deck
	// in one undoable pass, via the SAME lint-core the panel's "Fix all" uses.
	// Returns true so the key is consumed only when validation is live for this deck.
	const fixAllCommand = (view) => {
		if (!vocab) return false;
		if (!readFrontMatter(view.state.doc.toString()).validate) return false;
		(async () => {
			if (!lintCoreMod) {
				try {
					lintCoreMod = (await import('./authoring-core.generated.js')).lintCore;
				} catch {
					return;
				}
			}
			// Re-read AFTER the (possibly cold) import — the user may have typed during
			// the await, so compute the fix against the CURRENT document, not a stale one.
			const cur = view.state.doc.toString();
			if (!readFrontMatter(cur).validate) return;
			const out = lintCoreMod.applyAllFixes(cur, buildVocabSets(vocab));
			if (out != null && out !== cur) {
				view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: out } });
			}
		})();
		return true;
	};
	const listener = EditorView.updateListener.of((u) => {
		if (u.docChanged && onChange) onChange(u.state.doc.toString());
		if (onCursor && (u.docChanged || u.selectionSet)) {
			onCursor(u.state.doc.lineAt(u.state.selection.main.head).number);
		}
	});

	// Proactive type-ahead. On entering a completable grammar context, open the
	// popup without waiting for a keystroke. We fire on a TRANSITION into an
	// allowed kind (tracking the previous kind) — so it opens once on entry and
	// again when the kind changes (component → modifier on the space), but stays
	// quiet while you keep typing within the same kind (CodeMirror keeps the open
	// popup filtered via validFor) and after Esc (no fresh transition). The popup
	// itself is opened with startCompletion, which runs an EXPLICIT completion —
	// the same flag Ctrl-Space sets — so each source's "quiet on a bare position
	// unless explicit" guard lets the full list through with nothing typed.
	let typeaheadMode = normalizeTypeahead(typeahead);
	let prevKind = null;
	let pending = false;
	const kindAt = (state) => {
		const sel = state.selection.main;
		if (!sel.empty) return null; // a range selection isn't a type-ahead entry point
		const line = state.doc.lineAt(sel.head);
		const before = state.sliceDoc(line.from, sel.head);
		return typeaheadContext((n) => state.doc.line(n).text, line.number, before);
	};
	const typeaheadListener = EditorView.updateListener.of((u) => {
		if (!u.docChanged && !u.selectionSet) return;
		if (typeaheadMode === 'off') {
			prevKind = null;
			return;
		}
		const allowed = TYPEAHEAD_KINDS[typeaheadMode] || TYPEAHEAD_KINDS.class;
		const kind = kindAt(u.state);
		// Fire only on a fresh transition into an allowed kind, and never on top of
		// an already-open popup for the same context.
		if (kind && kind !== prevKind && allowed.has(kind) && !pending && completionStatus(u.state) !== 'active') {
			pending = true;
			// Defer past this update — startCompletion dispatches, and a nested
			// dispatch inside an update listener is illegal. Re-verify the context
			// still holds on the next microtask (the caret may have moved on).
			Promise.resolve().then(() => {
				pending = false;
				const view = u.view;
				if (typeaheadMode === 'off') return;
				const live = kindAt(view.state);
				if (live && (TYPEAHEAD_KINDS[typeaheadMode] || TYPEAHEAD_KINDS.class).has(live)) {
					startCompletion(view);
				}
			});
		}
		prevKind = kind;
	});
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc,
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				highlightActiveLineGutter(),
				history(),
				drawSelection(),
				indentOnInput(),
				bracketMatching(),
				syntaxHighlighting(latticeHighlight),
				markdown({
					base: markdownLanguage,
					// Eager (immediate) languages first, then the full lazy-loaded set
					// from language-data as a fallback for anything else.
					codeLanguages: [...EAGER_LANGUAGES, ...languages],
				}),
				EditorView.lineWrapping,
				// Deck-grammar autocomplete — component names + modifiers inside
				// `_class:` directives, theme names in front matter, slot skeletons,
				// and region names inside map slides (static vocab, from the page's
				// catalog/vocab/themes or the baked basemaps). All deterministic, no
				// model call; inert outside its context. In a Compartment so the
				// workspace preference can switch it off/on live.
				autocompleteComp.of(autocomplete ? autocompleteExt : []),
				// Inline validation (deck-grammar findings as underlines + hover) + a
				// severity gutter (click a marker for the same tooltip + quick-fix). Inert
				// without a vocab; self-gated per deck by the `validate:` front-matter key.
				vocab ? [linter(lintSource, { delay: 350 }), lintGutter()] : [],
				latticeTheme,
				...(autoHeight ? [autoHeightTheme] : []),
				// lintKeymap: F8 / Shift-F8 cycle findings, Ctrl-Shift-M opens the lint
				// panel (where each finding's Quick fix is one click). Alt-Shift-F applies
				// every autofixable finding at once. Harmless when validation is off.
				keymap.of([
					{ key: 'Alt-Shift-f', run: fixAllCommand },
					indentWithTab,
					...defaultKeymap,
					...historyKeymap,
					...lintKeymap,
				]),
				listener,
				typeaheadListener,
			],
		}),
	});
	// iOS Safari can paint the native selection highlight before it applies
	// CodeMirror's injected theme — so the FIRST text selection shows the system
	// (lavender) tint instead of the themed `--cm-selection`, and only corrects
	// after a style recalc (e.g. a palette/mode toggle). Force one reflow on the
	// next frame so the theme is applied up front, not only after a manual toggle.
	if (typeof requestAnimationFrame === 'function') {
		requestAnimationFrame(() => {
			try {
				view.requestMeasure();
				void view.scrollDOM.offsetHeight; // force a style/layout flush
			} catch {}
		});
	}
	return {
		getValue: () => view.state.doc.toString(),
		setValue: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
		focus: () => view.focus(),
		destroy: () => view.destroy(),
		// Toggle deck-grammar autocomplete live (workspace preference). Reconfigures
		// the compartment to the built extension or nothing.
		setAutocomplete: (on) => view.dispatch({ effects: autocompleteComp.reconfigure(on ? autocompleteExt : []) }),
		// Switch the proactive type-ahead mode live ('class' | 'all' | 'off').
		// Imperative (no state extension) — the listener reads the closure variable.
		setTypeahead: (mode) => {
			typeaheadMode = normalizeTypeahead(mode);
			prevKind = null; // re-arm: the next entry into a context fires fresh
		},
		// Move the cursor to (1-based) line `n` and scroll it into view. Clamped
		// to the document. Used by the Drawing Board's preview->editor sync.
		goToLine: (n) => {
			const total = view.state.doc.lines;
			const line = view.state.doc.line(Math.max(1, Math.min(total, n)));
			view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
			view.focus();
		},
		// 1-based line of the primary cursor — used by focus edit modes to find the
		// fenced/math block under the caret.
		getCursorLine: () => view.state.doc.lineAt(view.state.selection.main.head).number,
		// The primary selection (refine actions operate on it). `empty` is true for
		// a bare caret. Offsets are character positions in the doc.
		getSelection: () => {
			const s = view.state.selection.main;
			return { text: view.state.sliceDoc(s.from, s.to), from: s.from, to: s.to, empty: s.empty };
		},
		// Replace the current selection (one undoable transaction → re-render +
		// re-lint). Used by refine actions to apply a model rewrite.
		replaceSelection: (text) => {
			const s = view.state.selection.main;
			view.dispatch({ changes: { from: s.from, to: s.to, insert: text }, selection: { anchor: s.from, head: s.from + text.length } });
			view.focus();
		},
		// Replace an inclusive 1-based line range with `text`, as one undoable
		// transaction (fires onChange → re-render + re-lint). Focus modes write the
		// edited fragment back through this so it stays in the editor's history.
		replaceLines: (fromLine, toLine, text) => {
			const total = view.state.doc.lines;
			const a = view.state.doc.line(Math.max(1, Math.min(total, fromLine)));
			const b = view.state.doc.line(Math.max(1, Math.min(total, toLine)));
			view.dispatch({ changes: { from: a.from, to: b.to, insert: text }, selection: { anchor: a.from } });
			view.focus();
		},
	};
}
