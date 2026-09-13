import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { editorChrome, editorChromeCoarse } from '../../lib/editor-chrome.js';
import { lintTheme, lintThemeCoarse, tooltipShell } from '../../lib/lint-theme.js';

// The shared CodeMirror 6 visual theme for every Studio code surface — the deck
// Editor (markdown) and the Component studio's CSS + skeleton fields (CodeField).
// Palette-blind: every color is a token, so it tracks the active theme/mode.
// Extracted here so the two editors share ONE look (#15 — reuse, don't fork).
//
// ONE PARAMETER SPLITS THE TWO EXPORTS, and it is the only thing that differs.
// `focusRing` decides whether the editor draws the site's focus ring itself. The deck
// Editor fills a stable pane, so it does. An embedded `CodeField` does not, for two
// measured reasons, both found by a checker on the change that added the ring:
//   · three of its five call sites sit in a rounded, bordered box that already paints
//     `focus-within:border-[var(--accent)]` (LayoutStudio x2, Fabricate's manifest
//     field) — the ring put a second, SQUARE accent line 1px inside the rounded one;
//   · CraftLab's host is `max-h-[26rem] overflow-auto` with no definite height, so
//     `.cm-editor` grows to the document's full height (measured: clientHeight 415,
//     scrollHeight 846) and an inset ring anchored to it scrolls its top and bottom
//     edges out of view — the ring-with-a-side-missing that `lib/editor-chrome.js`
//     rejects an inset outline for, reintroduced one surface over.
// Declining the ring is NOT declining the suppression: `editorChrome` always kills
// @codemirror/view's dotted `#212121` default, on every surface.
const studioTheme = (focusRing: boolean) =>
	EditorView.theme({
		// Canvas, ink, gutter, caret and the focus ring come from the shared module, so
		// this theme and the Playground's cannot drift again (HARD RULE #15). The caret
		// argument that used to live here — `--text-body`, never `--accent`, because the
		// caret must stay as legible as the text it sits in and accent carries no AA
		// guarantee — moved there with it, and now binds both editors.
		// (Coarse-pointer rules — including the 16px `.cm-content` lift that keeps iOS
		// from auto-zooming on focus — live in the `@media` block at the END of this
		// object; see the note there for why the position is load-bearing.)
		...editorChrome({ fontSize: '13px', padding: '14px 4px', lineHeight: '1.85', focusRing }),
		// FOUR RULE GROUPS WERE DELETED HERE, all of them dead. This theme's surfaces
		// install neither `highlightActiveLine()` nor `drawSelection()`, so `.cm-activeLine`,
		// `.cm-activeLineGutter`, `.cm-cursor` and `.cm-selectionBackground` never render
		// on them — measured on the real Studio: zero elements of every one of those
		// classes after a select-all. The selection rule was the worst of them: a third
		// copy of the 18% accent wash, unreachable, and unpinned by
		// `playground/editor-selection.test.ts`, which only ever compared the other two.
		// `.cm-cursor` survives, inert, inside the shared module, where one definition
		// covers any surface that later adds a drawn caret.
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
			...editorChromeCoarse,
			...lintThemeCoarse,
		},
	});

/** The Studio's deck Editor — a full pane, so it draws the site's focus ring. */
export const editorTheme = studioTheme(true);
/** An embedded `CodeField` — its HOST owns the focus affordance. See the note above. */
export const codeFieldTheme = studioTheme(false);

// Palette-cohesive syntax highlighting — every color a theme token, so the code
// editors track the active studio theme + mode (no fixed light-only defaults that
// wash out in dark). Shared by CodeField (CSS / skeleton) and any future surface.
//
// THE SYNTAX INK TIER (#1688). `--syntax-keyword-ink` / `--syntax-string-ink` /
// `--syntax-number-ink` are DERIVED per palette per mode by
// `tools/build-docs-portal.js` (`deriveSyntaxInks`) and emitted onto the
// `html[data-palette][data-mode]` blocks in `lattice-tokens.generated.css`, exactly like
// the status FILL tokens. They are real code-token colors — the palette's own
// `--hljs-string` / `--hljs-number`, the same hues the deck's rendered code panel uses —
// with lightness solved until they clear AA on the EDITOR's canvas (`--bg` and
// `--bg-alt`), and then held clear of the colors these rows below already paint from
// `--text-heading` / `--text-body` / `--text-muted`. Measured over 18 base palettes x 2
// modes: worst 4.65:1 against the canvas, and worst OKLab dE 0.0350 from any neighboring role
// FOR THE TWO REPELLED ROLES (string, number). `--syntax-keyword-ink` is NOT repelled and is
// byte-identical to `--text-heading` on 13 palette-modes — a monochrome palette choosing its
// ink as its accent — so the unqualified form of that sentence is false. Why, seed choice per
// palette, and the a11y-* exception all live in that generator's docblock.
//
// WHAT THIS REPLACED, AND THE CLAIM THAT WAS WRONG. Before #1703 the string and number
// rows read `var(--chart-3, #2e6f00)` / `var(--chart-2, #9c3f00)` — tokens defined
// NOWHERE in the repo, so the hardcoded hex won on all 36 palette x mode rows and the
// "every color a theme token" claim above was false for exactly the rows that carried a
// hue. #1703 pointed them at `--pass` / `--warn`, which cleared AA and preserved the
// green/amber intent, and justified NOT using `--hljs-*` on the grounds that the four
// a11y-* base palettes declare none and `resolveToken` would throw on partial coverage.
// **That reason was false.** `a11y-base` extends `onyx`, which declares the whole syntax
// family, so all 18 base palettes resolve `--hljs-*` and PORTAL_TOKENS would not have
// thrown. The real blocker was the SURFACE: those values are tuned for `--code-bg`, a
// panel that is dark on every palette in both modes, and 21 of 36 rows put a raw
// `--hljs-*` below AA on the editor's canvas (worst 1.01:1). Hence a solved tier rather
// than a direct read.
//
// COMMENTS AND PUNCTUATION DELIBERATELY STAY ON `--text-muted`, AND THAT TOKEN IS NOW AA.
// This block said the opposite until #1715 and the correction is worth keeping, because both
// halves of the history are load-bearing.
//
// #1703 excluded these rows on a claim that was simply false — that "--text-muted is AA
// against the canvas by contract". It was not: below AA on 44 of 72 palette-mode-surface
// pairs, worst 2.11:1. #1688 then over-corrected, pulling both rows into the derived tier,
// and that was worse — the solve moves lightness AWAY from the canvas, which is where
// `--text-body` already sits, so comment-to-body separation collapsed while `.cm-gutters` and
// `.cm-completionDetail` stayed on the raw token, leaving the line numbers DIMMER than the
// comment beside them. That version was reverted.
//
// #1715 repaired the TOKEN instead, which is what §9 of that record said the honest scope was:
// `--text-muted` now clears 4.5:1 on `--bg` and `--bg-alt` across all 36 palette-modes, gated
// by `checkMutedTierFloors`, and the decoration it used to double as moved to `--muted-mark`.
// So the gutter, the completion chrome, the docs captions and this comment row all moved
// TOGETHER — the inverted hierarchy is gone.
//
// WHAT DID NOT GET FIXED, stated here because this is the surface it lands on: the MARGIN.
// On cuoio/light — the default palette and mode — the repaired `--text-muted` sits OKLab
// 0.038 from `--text-body`, so on that one palette the line numbers and the comment row are
// close to the color of the code beside them. Ordering survives everywhere (muted is never
// louder than body); the gap does not, on the palettes whose body ink is itself near the AA
// floor. That is a property of those palettes, not of this map — see the decision record's
// §3 for the distribution and why no token choice avoids it.
//
// `t.invalid` KEEPS `--fail`, and that is not residue from the same compromise — invalid
// input is precisely what a status token names.
export const studioHighlight = HighlightStyle.define([
	{ tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'var(--syntax-keyword-ink)' },
	{ tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], color: 'var(--text-heading)' },
	{ tag: [t.string, t.special(t.string), t.attributeValue], color: 'var(--syntax-string-ink)' },
	{ tag: [t.number, t.unit, t.bool, t.atom, t.color], color: 'var(--syntax-number-ink)' },
	{ tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
	// tagName / heading / link stay on the SAME value as the keyword row — they are the
	// three other places the editor spent `--accent`, and `--syntax-keyword-ink` is that
	// accent made legible (identical on 34 of 36 palette-modes; repaired on mustard/light,
	// where `--accent` #8C6A18 read at 3.89:1 on its own canvas, and burgundy/dark).
	// Keeping them together preserves the shipping look and fixes all four rows at once.
	{ tag: [t.tagName, t.heading], color: 'var(--syntax-keyword-ink)', fontWeight: '600' },
	{ tag: [t.variableName, t.className, t.typeName], color: 'var(--text-body)' },
	{ tag: [t.punctuation, t.bracket, t.brace, t.separator], color: 'var(--text-muted)' },
	{ tag: [t.link, t.url], color: 'var(--syntax-keyword-ink)', textDecoration: 'underline' },
	{ tag: t.invalid, color: 'var(--fail)' },
]);
