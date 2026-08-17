import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { lintTheme, lintThemeCoarse, tooltipShell } from '../../lib/lint-theme.js';

// The shared CodeMirror 6 visual theme for every Studio code surface — the deck
// Editor (markdown) and the Component studio's CSS + skeleton fields (CodeField).
// Palette-blind: every color is a token, so it tracks the active theme/mode.
// Extracted here so the two editors share ONE look (#15 — reuse, don't fork).
export const editorTheme = EditorView.theme({
	'&': { backgroundColor: 'var(--bg)', color: 'var(--text-body)', height: '100%', fontSize: '13px' },
	// `caretColor` themes the NATIVE contentEditable caret (this editor has no
	// drawSelection extension, so `.cm-cursor` never renders — the browser caret
	// is what you see). It tracks `--text-body`, NOT `--accent`: the caret marks
	// the insertion point among the text you're typing, so it must stay as legible
	// as that text on every theme. `--text-body` is AA against `--bg` by contract
	// (accent is a brand color with no such contrast guarantee — on a dark theme it
	// can fall below AA), so this keeps the caret light + WCAG-safe in dark mode.
	'.cm-content': {
		fontFamily: 'var(--font-mono, ui-monospace, monospace)',
		padding: '14px 4px',
		lineHeight: '1.85',
		caretColor: 'var(--text-body)',
	},
	// (Coarse-pointer rules — including the 16px `.cm-content` lift that keeps iOS
	// from auto-zooming on focus — live in the `@media` block at the END of this
	// object; see the note there for why the position is load-bearing.)
	'.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--text-muted)', border: 'none', fontFamily: 'var(--font-mono)' },
	'.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
	'.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--accent)' },
	// Inert today (no drawSelection → the native caret above is what renders), but
	// kept in sync with `caretColor` so a future drawn caret stays legible too.
	'.cm-cursor': { borderLeftColor: 'var(--text-body)', borderLeftWidth: '2px' },
	'&.cm-focused': { outline: 'none' },
	'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
		backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)',
	},
	// Every lint surface — the squiggle, the gutter disc, the hover card, the
	// panel — comes from the shared module, so this editor and the Playground's
	// cannot drift apart. It also retires the lone `#b42318` hex literal that
	// used to color the error squiggle here.
	...lintTheme,
	// The floating shell both the lint popup and the autocomplete dropdown wear —
	// now shared with the Playground so the two surfaces cannot diverge again
	// (CodeMirror's default is a fixed light chrome that clashes on dark/tinted
	// palettes). The autocomplete interior follows; every color a token, with the
	// matched substring + selected row on accent.
	...tooltipShell,
	'.cm-tooltip.cm-tooltip-autocomplete > ul': {
		fontFamily: 'var(--font-mono, ui-monospace, monospace)',
		maxHeight: '16em',
	},
	'.cm-tooltip-autocomplete > ul > li': { padding: '3px 8px', color: 'var(--text-body)' },
	'.cm-tooltip-autocomplete > ul > li[aria-selected]': {
		backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)',
		color: 'var(--text-heading)',
	},
	'.cm-completionMatchedText': { color: 'var(--accent)', textDecoration: 'none', fontWeight: '600' },
	'.cm-completionDetail': { color: 'var(--text-muted)', fontStyle: 'normal', marginLeft: '0.6em', fontSize: '0.85em' },
	'.cm-completionInfo': {
		backgroundColor: 'var(--bg)',
		color: 'var(--text-body)',
		border: '1px solid color-mix(in srgb, var(--text-heading) 18%, transparent)',
		borderRadius: '6px',
		padding: '6px 8px',
	},
	// LAST on purpose, and it must stay last. A theme object is a flat map that
	// compiles to a stylesheet in key order, and these rules target the same
	// selectors as the base ones at the same specificity — so placed earlier they
	// lose to the very rules they exist to override, and the touch sizes silently
	// never apply. (Measured: the fix pill stayed 28px on a real coarse pointer
	// until this block moved below `...lintTheme`.)
	//
	// It is also the ONE place coarse-pointer rules may live here — the lint module
	// exports its own separately rather than carrying a second `@media` key that
	// would replace this one on spread, taking the iOS zoom guard with it.
	'@media (pointer: coarse)': {
		// iOS Safari auto-zooms the page when you focus an editable surface whose
		// font computes under 16px; landing.css's global net can't reach
		// CodeMirror's contenteditable because this scoped theme out-specifies it.
		'.cm-content': { fontSize: '16px' },
		...lintThemeCoarse,
	},
});

// Palette-cohesive syntax highlighting — every color a theme token, so the code
// editors track the active studio theme + mode (no fixed light-only defaults that
// wash out in dark). Shared by CodeField (CSS / skeleton) and any future surface.
//
// WHY THE STATUS TRIO CARRIES THE STRING / NUMBER / INVALID ROLES (#1688). These
// three rows read `var(--chart-3, #2e6f00)` / `var(--chart-2, #9c3f00)` — tokens
// defined NOWHERE in the repo, so the hardcoded hex won on all 36 palette x mode
// rows and the "every color a theme token" claim above was false for exactly the
// rows that carried a hue. Three candidate homes, and why this one:
//   · `--hljs-string` / `--hljs-number` ARE the repo's real code-token colors and
//     would be the ideal fit — but the four a11y-* base palettes declare none, and
//     `resolveToken` THROWS if any base palette lacks a token on PORTAL_TOKENS
//     (engineering/gotchas/css.md). Authoring a syntax palette for the palettes
//     that deliberately collapse hue is a design decision, not a mechanical
//     fill-in, so it is logged rather than smuggled in here.
//   · `--chart-cat2` / `--chart-cat3` are the categorical MARK tier, repaired to
//     the 3:1 GRAPHICAL floor. Measured over the generated sheet, 12 of the 24
//     hex rows fall under 4.5:1 against `--bg`/`--bg-alt` (worst 3.09:1) — painting
//     them as text is the exact `--cat-N-ink` construction the no-safe-default
//     record exists to prevent.
//   · `--pass` / `--warn` / `--fail` clear AA as text on all 36 rows (worst 4.52:1),
//     and they are already the hues these rows were hand-picking: #2e6f00 IS a
//     green and #9c3f00 IS an amber. `t.invalid` is not a stretch at all — invalid
//     input is what `--fail` names. So the appearance is preserved and it now
//     tracks the palette. On a11y-achromatopsia the trio is grayscale and syntax
//     stops separating by hue, which is that palette's whole point.
export const studioHighlight = HighlightStyle.define([
	{ tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'var(--accent)' },
	{ tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], color: 'var(--text-heading)' },
	{ tag: [t.string, t.special(t.string), t.attributeValue], color: 'var(--pass)' },
	{ tag: [t.number, t.unit, t.bool, t.atom, t.color], color: 'var(--warn)' },
	{ tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
	{ tag: [t.tagName, t.heading], color: 'var(--accent)', fontWeight: '600' },
	{ tag: [t.variableName, t.className, t.typeName], color: 'var(--text-body)' },
	{ tag: [t.punctuation, t.bracket, t.brace, t.separator], color: 'var(--text-muted)' },
	{ tag: [t.link, t.url], color: 'var(--accent)', textDecoration: 'underline' },
	{ tag: t.invalid, color: 'var(--fail)' },
]);
