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
// focus-ring reset; and the iOS zoom guard, which is a correctness rule rather
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
 * @param {Record<string,string>} [opts.vars]  Extra custom properties to declare on
 *   the editor root, merged into `&`. Pass your surface's tokens HERE rather than
 *   adding a second `'&'` key after the spread — see the warning below.
 */
export function editorChrome({ fontSize, padding, lineHeight, gutterDivider = false, vars = {} }) {
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
		// NO FOCUS RING, and this is a deliberate removal on the Playground rather than an
		// inherited default. Without this rule @codemirror/view's base theme paints
		// `outline: 1px dotted #212121` — a fixed near-black that the Studio has always
		// suppressed and the Playground used to show. Two reasons it goes: the ring is
		// palette-blind (on a dark palette it is near-black on near-black, so it is not
		// doing the job it looks like it is doing), and for a text field the CARET is the
		// conventional focus affordance, which is why every editor here themes
		// `caretColor` rather than an outline. If a themed ring is ever wanted, it belongs
		// here, on a token — not as CodeMirror's untokenized default coming back by
		// omission.
		'&.cm-focused': { outline: 'none' },
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
