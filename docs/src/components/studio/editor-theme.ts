import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

// The shared CodeMirror 6 visual theme for every Studio code surface — the deck
// Editor (markdown) and the Component studio's CSS + skeleton fields (CodeField).
// Palette-blind: every colour is a token, so it tracks the active theme/mode.
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
	// iOS Safari auto-zooms the page when you focus an editable surface whose
	// font computes under 16px. The landing.css global net can't reach
	// CodeMirror's contenteditable (this scoped theme out-specifies it), so bump
	// the content to 16px on coarse pointers, matching playground/editor.js;
	// desktop keeps the denser 13px set on `&` above.
	'@media (pointer: coarse)': {
		'.cm-content': { fontSize: '16px' },
	},
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
	'.cm-lintRange-error': { textDecorationColor: '#b42318' },
	// Autocomplete popup — palette-aware so the dropdown tracks the active theme +
	// mode (CodeMirror's default is a fixed light chrome that clashes on dark/tinted
	// palettes). Every color a token; the matched substring + selected row use accent.
	'.cm-tooltip': {
		backgroundColor: 'var(--bg)',
		color: 'var(--text-body)',
		border: '1px solid color-mix(in srgb, var(--text-heading) 18%, transparent)',
		borderRadius: '8px',
		boxShadow: '0 8px 28px color-mix(in srgb, var(--text-heading) 22%, transparent)',
	},
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
});

// Palette-cohesive syntax highlighting — every colour a theme token, so the code
// editors track the active studio theme + mode (no fixed light-only defaults that
// wash out in dark). Shared by CodeField (CSS / skeleton) and any future surface.
export const studioHighlight = HighlightStyle.define([
	{ tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'var(--accent)' },
	{ tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], color: 'var(--text-heading)' },
	{ tag: [t.string, t.special(t.string), t.attributeValue], color: 'var(--chart-3, #2e6f00)' },
	{ tag: [t.number, t.unit, t.bool, t.atom, t.color], color: 'var(--chart-2, #9c3f00)' },
	{ tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
	{ tag: [t.tagName, t.heading], color: 'var(--accent)', fontWeight: '600' },
	{ tag: [t.variableName, t.className, t.typeName], color: 'var(--text-body)' },
	{ tag: [t.punctuation, t.bracket, t.brace, t.separator], color: 'var(--text-muted)' },
	{ tag: [t.link, t.url], color: 'var(--accent)', textDecoration: 'underline' },
	{ tag: t.invalid, color: 'var(--chart-2, #9c3f00)' },
]);
