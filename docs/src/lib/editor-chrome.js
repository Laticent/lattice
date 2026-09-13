// The CodeMirror 6 editor CHROME — one definition, worn by every code surface.
//
// WHY THIS FILE EXISTS
// Three surfaces render a CodeMirror editor: the Playground's deck editor
// (playground/editor.js), the Studio's deck Editor and the Component studio's
// CodeField (both via components/studio/editor-theme.ts). The lint surface and the
// tooltip shell were extracted into lib/lint-theme.js for exactly this reason; the
// editor's own chrome never was, so the two theme objects each declared `&`,
// `.cm-content`, `.cm-gutters`, `&.cm-focused` and the coarse-pointer guard
// independently — and the values drifted. This is the same fix, one level up
// (HARD RULE #15).
//
// WHAT IS SHARED AND WHAT IS A PARAMETER — the split is the whole point.
// Shared are the things that must NEVER differ between two editors of the same
// product: which token paints the canvas, the ink, the gutter, and the caret; the
// focus ring; and the iOS zoom guard, which is a correctness rule rather
// than taste. Parameters are the things that legitimately differ because the
// surfaces differ — a full-page editor and a small embedded field do not want the
// same type size or gutter divider. Passing those in means a difference is
// DECLARED at the call site instead of being two forks nobody is comparing.
//
// THE CARET IS `--text-body`, NOT `--accent`, AND THAT IS LOAD-BEARING.
// `caretColor` themes the native contentEditable caret. It marks the insertion
// point among the text you are typing, so it has to stay as legible as that text
// on every palette. `--text-body` is AA against `--bg` by contract; `--accent` is a
// brand color with no such guarantee and falls below AA on several dark palettes.
// The Studio's theme already argued this and used `--text-body`; the Playground
// used `--accent` on a surface where, until drawSelection() was dropped, the native
// caret did not even render.
//
// DO NOT WRITE A SECOND `'&'` KEY AFTER THE SPREAD. A theme spec is a plain object
// literal, so a later duplicate key REPLACES the spread's value outright rather than
// merging into it — silently, with no lint error, because a spread and a literal key
// are not "duplicate keys" to a linter. Doing exactly that cost the Playground its
// `height`, `fontSize`, `color` and `backgroundColor` in one edit: the editor
// rendered at 16px instead of 13.5px and only a computed-style read on the real page
// caught it. That is why surface tokens go through the `vars` parameter.
//
// ONE BEHAVIOR CHANGE COMES WITH NATIVE SELECTION, and it is worth knowing before you
// read it as a bug: on WebKit/Safari the native highlight does NOT survive the editor
// losing focus. Select text in the Playground, click a toolbar control, and the
// highlight disappears — measured, real WebKit: focused `213,203,178`, blurred
// `234,228,214`. Chromium keeps painting it. `drawSelection()` used to paint DOM that
// persisted on both, which is why this changed when it was dropped. The Studio's editor
// has always behaved this way, so this is convergence rather than regression — but it
// IS a change on the Playground and nobody should rediscover it as a defect.
//
// THE COARSE-POINTER RULES ARE A SEPARATE EXPORT, deliberately. A theme object is a
// flat map, so a spread module carrying its own `@media (pointer: coarse)` key
// REPLACES the consumer's — taking that consumer's other coarse rules with it.
// lib/lint-theme.js hit this first and exports `lintThemeCoarse` for the same
// reason. Spread `editorChromeCoarse` INSIDE your own `@media` block, and keep that
// block LAST in the theme object (both consumers document why: same-specificity
// rules resolve in key order, so an earlier block loses to the rules it exists to
// override).

/**
 * The chrome every CodeMirror surface shares.
 *
 * @param {object} opts
 * @param {string} opts.fontSize      Editor type size, e.g. `'13px'`. Per-surface.
 * @param {string} opts.padding       `.cm-content` padding. Per-surface.
 * @param {string} opts.lineHeight    `.cm-content` line-height. Per-surface.
 * @param {boolean} [opts.gutterDivider=false]  Draw a `--border` rule down the
 *   gutter's right edge. The Playground shows one; the Studio does not.
 * @param {boolean} [opts.focusRing=true]  Draw the site's focus ring on the editor.
 *   Pass `false` where the editor's HOST owns the focus affordance instead — an
 *   embedded field inside a bordered box that already paints `focus-within`, or one
 *   whose host SCROLLS the editor (an inset ring is anchored to `.cm-editor`, so on a
 *   scrolling host its top and bottom edges scroll out of view). The base theme's
 *   dotted ring stays suppressed either way; this switches OUR ring, not both.
 * @param {Record<string,string>} [opts.vars]  Extra custom properties to declare on
 *   the editor root, merged into `&`. Pass your surface's tokens HERE rather than
 *   adding a second `'&'` key after the spread — see the warning below.
 */
export function editorChrome({ fontSize, padding, lineHeight, gutterDivider = false, focusRing = true, vars = {} }) {
	return {
		'&': {
			height: '100%',
			fontSize,
			color: 'var(--text-body)',
			backgroundColor: 'var(--bg)',
			...vars,
		},
		'.cm-content': {
			fontFamily: 'var(--font-mono, ui-monospace, monospace)',
			padding,
			lineHeight,
			// See "THE CARET IS --text-body" above before changing this.
			caretColor: 'var(--text-body)',
		},
		'.cm-gutters': {
			backgroundColor: 'var(--bg)',
			color: 'var(--text-muted)',
			border: 'none',
			fontFamily: 'var(--font-mono, ui-monospace, monospace)',
			// THE GUTTER NEEDS ITS OWN line-height, and this is the whole reason the
			// declaration cannot simply live on `.cm-content`. `.cm-gutters` is a SIBLING
			// of `.cm-content` inside `.cm-scroller`, not a child of it — so it inherits
			// nothing from the content box. Without this it falls back to
			// @codemirror/view's base `.cm-scroller { line-height: 1.4 }`, and because
			// `GutterElement.update` still gives each gutter BOX an explicit pixel height,
			// the boxes stay aligned while the number GLYPH inside each one drifts up.
			// Measured on the real Playground when this was missing: gutters 18.9px
			// against content 21.6px, every line number sitting ~1.35px above the line it
			// labels, all the way down the file. The Playground used to get this by
			// accident, from a `lineHeight` on `.cm-scroller` that the gutters inherited.
			lineHeight,
			...(gutterDivider ? { borderRight: '1px solid var(--border)' } : {}),
		},
		// TWO CHANNELS, AND MISSING EITHER ONE IS A DEFECT THAT SHIPPED HERE.
		// `outline: 'none'` SUPPRESSES @codemirror/view's base `&.cm-focused
		// { outline: 1px dotted #212121 }`; the `::after` below DRAWS ours. A first cut
		// replaced the suppression with the ring and left the base rule to come back — two
		// rings, the site's accent with a near-black dotted one 1px outside it. It was
		// invisible on the Playground and the Studio, whose panes clip it, and PAINTED on
		// the component-page Specimen, whose host is `overflow: visible` (measured: pixel
		// row `33,33,33 | 143,136,125 | 33,33,33 …` above the accent row). An independent
		// checker found it. Never write one without the other.
		'&.cm-editor.cm-focused': { outline: 'none' },
		// THE RING IS THE SITE'S OWN, and `focusRing: false` is how a surface declines it.
		//
		// Three measured facts settle drawing one at all; the record is
		// engineering/decisions/2026-09-13-editor-focus-ring.md.
		// 1. The site has ONE focus language — `outline: 2px solid var(--accent)` in
		//    styles/native-widgets.css — and it selects
		//    `:where(a, button, input, select, textarea, summary, [tabindex])`.
		//    `.cm-content` is a `contenteditable` div with NO tabindex, so it matches none
		//    of them: the editors were outside that language by an accident of selector
		//    shape, not by a decision. Measured on the real Playground, nothing in our CSS
		//    matched either `.cm-editor` or `.cm-content` with an outline at all.
		// 2. What painted instead was @codemirror/view's base `.cm-content { outline: none }`
		//    plus the dotted near-black above — a third-party default, never ours.
		// 3. The caret alone DOES satisfy WCAG 2.4.7 (AA) — W3C's own Understanding text
		//    names a text field's vertical bar as the indicator — and CodeMirror scrolls it
		//    back into view on refocus (measured: scrollTop 0 → 1266 on a document taller
		//    than its pane). So this is not a conformance repair. It is the consistency
		//    one: every other focusable on this site says "focus is here" the same way, and
		//    a 13.5px blinking bar is the weakest member of that set on the largest surface.
		//
		// IT IS A PSEUDO-ELEMENT, NOT AN `outline`, AND THAT IS FORCED BY PAINT ORDER.
		// `outline-offset: -2px` draws the ring inside the border box — where CodeMirror's
		// own DOM paints over it. `.cm-scroller` is `position: relative; z-index: 0`, so it
		// opens a stacking context that paints after `.cm-editor`'s outline, and inside it
		// `.cm-gutters` is `position: sticky; z-index: 200` with an opaque `var(--bg)`.
		// Measured on the real Playground with a red test outline: the right and bottom
		// edges survive (the scroller itself is transparent) and the gutter erases the
		// whole 37px left band INCLUDING both left corners — a ring with a side missing,
		// which reads as a rendering bug rather than a focus affordance. An outward
		// `outline-offset: 2px` is no escape either: `.pg-editor-host` is
		// `overflow: hidden`, so it is clipped on the pane-adjacent sides instead.
		// So the ring is a positioned child that can be ordered ABOVE the scroller.
		// `z-index: 1` is enough — the competitor in `.cm-editor`'s stacking context is the
		// scroller's `0`, not the gutter's `200`, whose number is scoped to the context the
		// scroller opens. It stays UNDER `.cm-panels` (300) and `.cm-tooltip` (500), so
		// search and lint still paint over it. `pointerEvents: 'none'` keeps it out of
		// clicks and drags. The painted pixels are identical to an inset outline; only the
		// paint order differs. `.cm-editor` is `position: relative !important` in the base
		// theme, so `inset: 0` is anchored, not surface-dependent.
		//
		// THERE IS NO `:focus-visible` ARM, because it would change nothing. Browsers treat
		// a text-editing surface as always focus-visible — measured: `.cm-content` matches
		// `:focus-visible` after a plain mouse click — so a `:focus-visible` gate draws on
		// click too. A native `<textarea>` on this site already rings on click for exactly
		// that reason, so ringing on click IS the site's behavior, not a deviation from it.
		//
		// The selector carries THREE classes (`&` compiles to this theme's own generated
		// class) against the base theme's two, so it wins on specificity rather than on
		// stylesheet order — the trap that took the select-all slab and the bracket marks.
		// Winning the base theme is not the same as being the only owner, though:
		// `styles/playground.css` and `styles/components.css` each carried their own
		// `.pg-editor-host .cm-editor.cm-focused { outline: none }` /
		// `.specimen-editor-host …` — three classes too, but in a linked site stylesheet,
		// and style-mod injects a theme's `<style>` at the TOP of head, so at equal
		// specificity the page CSS was later and won. The tell was precise:
		// `outline-offset` computed as `-2px` (ours) while `outline` computed as `none`
		// (theirs). Both are deleted. If a focus ring ever stops painting again, grep
		// `cm-focused` across `docs/src/styles/` BEFORE re-reading this file.
		...(focusRing
			? {
					'&.cm-editor.cm-focused::after': {
						content: '""',
						position: 'absolute',
						inset: '0',
						zIndex: '1',
						border: '2px solid var(--accent)',
						pointerEvents: 'none',
					},
				}
			: {}),
		// INERT on both surfaces today — `.cm-cursor` is drawn by `drawSelection()`,
		// which neither installs, so the native caret above is what renders. Kept,
		// and kept in step with `caretColor`, so a surface that adds drawSelection()
		// later does not get CodeMirror's base caret color by default.
		'.cm-cursor': { borderLeftColor: 'var(--text-body)', borderLeftWidth: '2px' },
	};
}

/** Coarse-pointer chrome. Spread INSIDE the consumer's own `@media (pointer: coarse)`. */
export const editorChromeCoarse = {
	// iOS Safari auto-zooms the page when you focus an editable surface whose font
	// computes under 16px. landing.css's global net cannot reach CodeMirror's
	// contenteditable because these scoped themes out-specify it.
	'.cm-content': { fontSize: '16px' },
};
