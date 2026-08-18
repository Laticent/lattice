// The lint diagnostic surface — ONE definition, worn by every Studio code editor.
//
// WHY THIS FILE EXISTS
// Two editor surfaces render the same `@codemirror/lint` DOM and, until this
// file, each dressed it independently: the Studio deck editor
// (components/studio/editor-theme.ts) themed the tooltip SHELL and left the
// interior stock, while the Playground (playground/editor.js) themed the
// interior from a global stylesheet in its own idiom. Same findings, same DOM,
// two different-looking popups — and a fix to one silently skipped the other.
// This module is the single source both spread into their themes (HARD RULE #15).
//
// A THIRD consumer inherits these rules without rendering any of them:
// `components/studio/CodeField.tsx` also spreads `editorTheme` for the Component
// studio's CSS / skeleton / manifest boxes, and it deliberately installs no
// linter. It therefore carries lint selectors that can never match. That is inert
// rather than wrong, but note the popup geometry below is viewport-relative
// (`min(46vh, 320px)`), tuned for a full-height deck editor — if a small embedded
// field ever DOES need findings, that is the seam to revisit, and the honest fix
// is a parameter here rather than a second copy of the file.
//
// THE DESIGN — "Finding Card, in place"
// The Coach panel already renders a lint finding as a card with a fixed rhythm:
// meta line (severity + rule id), then the message, then the action on its own
// row (coach/FindingCard.tsx). A hover popup that reports the SAME finding should
// read the same way. `@codemirror/lint` hands us a fixed child order
// (text → button(s) → source); CSS grid placement re-reads it as
// meta / message / action without forking the package.
//
// It is a deliberate SECOND rendering of that rhythm, not a shared implementation,
// and nothing in the code binds the two — no import, no shared constant, no test.
// They already differ in three ways worth knowing before you assume kinship:
// FindingCard's meta slot 2 carries scope ("Slide 4") where this carries severity;
// its FILLED accent pill means "apply this drafted change" while its QUIET pill is
// the default, which is the opposite weighting to the one action here. (The third
// difference is gone: FindingCard's warning glyph used to resolve to
// `var(--chart-2, …)`, a token this repo never defined, so it painted a hardcoded
// orange while this file already used `--warn`. #1688 moved it onto `--warn` too,
// and added `checkDanglingTokenReads` so a phantom token cannot come back.)
// Restyle one and you must restyle the other by hand.
//
// THE ONE ASSUMPTION THIS CANNOT SURVIVE BEING WRONG ABOUT
// The child order and class names above are package internals with no stability
// contract, and `@codemirror/lint` is pinned `^6.9.7` inside dependabot's
// auto-merging `routine` group. `lint-dom-contract.test.ts` drives the real
// package and pins that DOM, so a bump that wraps or reorders the children fails
// a gate instead of silently misplacing every rule in this file.
//
// THE SHELL, AND WHY IT IS HERE TOO
// `.cm-tooltip` — the floating-surface shell (fill, hairline, radius, shadow) — is
// shared with the AUTOCOMPLETE popup, so the lint card deliberately styles only the
// INTERIOR and lets the shell carry both. That was originally left to each surface,
// on the assumption both already themed it. Only the Studio did: the Playground's
// popup fell through to `@codemirror/view`'s base `#f5f5f5` on every palette and in
// dark mode. `tooltipShell` below is therefore exported and spread by both, for the
// same reason the interior is.
//
// Scoped theming reaches all of this — measured, not assumed: the tooltip is a
// descendant of `.cm-editor`, because the tooltip plugin falls back to
// `container = view.dom` when no `parent` is configured and nothing in docs/src
// configures one.
//
// SEVERITY WITHOUT HUE
// Three channels carry severity — the glyph SHAPE (octagon / triangle / circle),
// the WORD ("Error" / "Warning" / "Note"), and color. Color is the only one the
// `a11y-*` palettes can flatten (on `a11y-achromatopsia` the severity tokens
// collapse toward one gray), so it is deliberately the least load-bearing.

// Lucide glyphs, verbatim from the icon set FindingCard already imports
// (OctagonAlert / TriangleAlert / Info), inlined as CSS masks. A mask uses the
// image's ALPHA, never its color, so the `stroke='%23000'` in the data URI is an
// opacity carrier and not a palette decision — the visible color is
// `background-color`, a token. Masking rather than a colored background-image is
// what lets one glyph re-tint per severity AND per palette with no second asset.
const icon = (body) =>
	`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E${body}%3C/svg%3E")`;

const ICON_ERROR = icon(
	"%3Cpath d='M12 16h.01'/%3E%3Cpath d='M12 8v4'/%3E%3Cpath d='M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z'/%3E",
);
const ICON_WARNING = icon(
	"%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'/%3E%3Cpath d='M12 9v4'/%3E%3Cpath d='M12 17h.01'/%3E",
);
const ICON_INFO = icon("%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E");

const mask = (img) => ({
	maskImage: img,
	WebkitMaskImage: img,
	maskRepeat: 'no-repeat',
	WebkitMaskRepeat: 'no-repeat',
	maskPosition: 'center',
	WebkitMaskPosition: 'center',
	maskSize: '100% 100%',
	WebkitMaskSize: '100% 100%',
});

// Recessive ink for the rule id and the Note glyph — the two places severity ink
// would otherwise be the palette's weakest color.
//
// This used to be `color-mix(in srgb, var(--text-muted) 55%, var(--text-body))`,
// and the mix was a WORKAROUND: `--text-muted` alone bottomed out at 2.47:1
// (magnolia light) and 2.64:1 (cuoio light) against `--bg`, so 55% of it was
// pulled toward `--text-body` to clear 3:1.
//
// #1715 removed the reason. `--text-muted` is now the AA-floored TEXT half of a
// split role — 4.5:1 against BOTH `--bg` and `--bg-alt` on all 36 palette-mode
// rows, gated by `checkMutedTierFloors` — so the token reads directly. Keeping the
// mix would now be actively worse: pulling muted 55% toward body is precisely the
// de-emphasis collapse #1720 measured and reverted a change for.
export const MUTED_INK = 'var(--text-muted)';

// A hairline drawn from the popup's OWN ink rather than `--border`: `--border` is
// tuned as a card edge against `--bg-alt`, and this surface is `--bg`, where it
// all but disappears on several palettes.
const HAIRLINE = '1px solid color-mix(in srgb, var(--text-heading) 12%, transparent)';

/**
 * The floating-surface shell every CodeMirror tooltip wears — fill, hairline,
 * radius, shadow.
 *
 * It lives here, and BOTH consumers spread it, because leaving it to each surface
 * is exactly how they drifted: the Studio themed `.cm-tooltip` and the Playground
 * never did, so the Playground's lint popup fell through to `@codemirror/view`'s
 * base theme — `&light .cm-tooltip { background:#f5f5f5 }` — in every palette AND
 * in dark mode, where `--text-body` on `#f5f5f5` measures 1.32:1.
 *
 * Two tooltip shapes matter here, and only one of them was ever covered:
 *   · the SQUIGGLE hover goes through `HoverTooltipHost`, so `.cm-tooltip` lands on
 *     a wrapper `<div>` and the `<ul>` gets `cm-tooltip-section`;
 *   · the GUTTER-MARKER tooltip goes through `showTooltip` directly, so the `<ul>`
 *     itself carries both `cm-tooltip` and `cm-tooltip-lint`.
 * A rule written as `.cm-tooltip.cm-tooltip-lint` therefore reaches the gutter path
 * only. This is a bare `.cm-tooltip` so it reaches both.
 *
 * @type {Record<string, Record<string, string>>}
 */
export const tooltipShell = {
	'.cm-tooltip': {
		backgroundColor: 'var(--bg)',
		color: 'var(--text-body)',
		border: '1px solid color-mix(in srgb, var(--text-heading) 18%, transparent)',
		borderRadius: '8px',
		boxShadow: '0 8px 28px color-mix(in srgb, var(--text-heading) 22%, transparent)',
	},
};

/**
 * The lint treatment, as a CodeMirror theme-object fragment.
 *
 * Spread into an `EditorView.theme({...})` call — NOT injected as a global
 * stylesheet. Scoped theming is what keeps these rules at the same cascade
 * weight as CodeMirror's own base theme (both compile to a single generated
 * class), so they win on load order without a single `!important`.
 *
 * Values are declaration maps, EXCEPT the `@media` key, whose value is itself a
 * map of selector -> declarations. That is why the type is a union rather than a
 * flat `Record<string, Record<string, string>>`.
 *
 * @type {Record<string, Record<string, string> | Record<string, Record<string, string>>>}
 */
export const lintTheme = {
	// ── The list ────────────────────────────────────────────────────────────
	'.cm-tooltip-lint': {
		// Prose, not identifiers — so the UI voice, unlike the autocomplete list
		// (which is mono because every row IS an identifier).
		fontFamily: 'var(--font-sans, system-ui, sans-serif)',
		listStyle: 'none',
		margin: '0',
		padding: '0',
		// NOTE: no border-radius here — see the `:not(.cm-tooltip)` rule below.
		// Narrow enough to sit BESIDE the code it describes rather than blanket it,
		// and never wider than a 390px viewport can hold.
		maxWidth: 'min(340px, calc(100vw - 28px))',
		maxHeight: 'min(46vh, 320px)',
		overflowY: 'auto',
		// `overscroll-behavior: contain` was here and is deliberately gone: it blocks
		// the scroll chain once this box is exhausted, which is the wrong default for
		// a transient popup sitting over the thing the reader actually wants to move.
		//
		// HONEST LIMITATION, measured and NOT fixed by that removal: with the pointer
		// over a genuinely overflowing card (41px of internal range on a 193px box),
		// 20 wheel ticks scroll the card to its end and the editor beneath does not
		// move — in a fresh gesture either. The likely cause is that CodeMirror
		// positions this tooltip `position: fixed`, so it is not in `.cm-scroller`'s
		// scroll chain at all and `overscroll-behavior` was never the deciding
		// factor. The content stays reachable (the card scrolls), and moving the
		// pointer off the card restores editor scrolling, so this is a friction, not
		// a trap. Removing `contain` is still correct on its own terms; fixing the
		// chain properly would mean not making this box a scroll container, which
		// needs a different geometry decision than a max-height.
	},
	// The inner list's radius, and ONLY when the list is inside the shell.
	//
	// `@codemirror/lint` mounts this `<ul>` two different ways: on the SQUIGGLE
	// hover it sits inside a `.cm-tooltip` wrapper (so it needs the shell's 8px
	// less the shell's 1px border to stay flush), and on the GUTTER-MARKER path the
	// `<ul>` IS the `.cm-tooltip` (so it needs the shell's own 8px, not an inset).
	// Written unconditionally, this rule collided with `tooltipShell`'s 8px at equal
	// specificity on that second path, and the winner was decided by the order the
	// two objects happened to be spread in — which differed between the consumers,
	// so the same shared module produced a 7px popup on one surface and 8px on the
	// other. The `:not()` states the actual intent and makes the outcome
	// order-independent.
	'.cm-tooltip-lint:not(.cm-tooltip)': { borderRadius: '7px' },
	// Two findings on one span share a popup; stacked hover tooltips are separate
	// sections. Both get the popup's own divider instead of the base theme's #bbb.
	'.cm-tooltip-lint > li + li': { borderTop: HAIRLINE },
	'.cm-tooltip-section:not(:first-child)': { borderTop: HAIRLINE },

	// ── One finding: FindingCard's three rows, on a DOM we cannot reorder ────
	// The package emits `text → button(s) → source`; FindingCard reads
	// `meta → message → action`. Explicit grid placement re-orders it with no
	// fork and no JS, and actions auto-flow onto rows 3..n so 0..n buttons all
	// land cleanly on their own line rather than competing with the prose.
	'.cm-tooltip-lint > li.cm-diagnostic': {
		display: 'grid',
		gridTemplateColumns: 'auto auto minmax(0, 1fr)',
		columnGap: '6px',
		rowGap: '7px',
		alignItems: 'center',
		padding: '10px 12px',
		margin: '0',
		borderLeft: 'none', // kill the stock 5px #d11 / orange rail
		whiteSpace: 'normal',
	},

	// Row 1a — the severity GLYPH. Shape is the channel that survives a palette
	// with no usable severity hue.
	'.cm-tooltip-lint > li.cm-diagnostic::before': {
		content: "''",
		gridColumn: '1',
		gridRow: '1',
		width: '15px',
		height: '15px',
		alignSelf: 'center',
		backgroundColor: MUTED_INK,
		...mask(ICON_INFO),
	},
	// Row 1b — the severity WORD, in `--text-heading` (AA against `--bg` by
	// contract) rather than the severity hue, exactly as FindingCard sets its
	// slide number beside a tinted glyph.
	'.cm-tooltip-lint > li.cm-diagnostic::after': {
		gridColumn: '2',
		gridRow: '1',
		alignSelf: 'center',
		fontSize: '12px',
		fontWeight: '600',
		lineHeight: '1.2',
		color: 'var(--text-heading)',
		whiteSpace: 'nowrap',
	},
	'.cm-tooltip-lint > li.cm-diagnostic-error::before': { backgroundColor: 'var(--fail)', ...mask(ICON_ERROR) },
	'.cm-tooltip-lint > li.cm-diagnostic-error::after': { content: "'Error'" },
	'.cm-tooltip-lint > li.cm-diagnostic-warning::before': { backgroundColor: 'var(--warn)', ...mask(ICON_WARNING) },
	'.cm-tooltip-lint > li.cm-diagnostic-warning::after': { content: "'Warning'" },
	'.cm-tooltip-lint > li.cm-diagnostic-info::after': { content: "'Note'" },
	'.cm-tooltip-lint > li.cm-diagnostic-hint::after': { content: "'Hint'" },

	// Row 1c — the rule id. Mono + uppercase + tracking is FindingCard's meta
	// voice for an IDENTIFIER, and the editor beneath it is mono. Truncates
	// rather than wrapping, so a long rule name can never push the message down.
	'.cm-tooltip-lint .cm-diagnosticSource': {
		gridColumn: '3',
		gridRow: '1',
		justifySelf: 'start',
		alignSelf: 'center',
		minWidth: '0',
		maxWidth: '100%',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		fontFamily: 'var(--font-mono, ui-monospace, monospace)',
		fontSize: '11px',
		fontWeight: '400', // it must recede behind "Error"
		letterSpacing: '0.05em',
		textTransform: 'uppercase',
		color: MUTED_INK,
		fontStyle: 'normal',
		opacity: '1', // stock ships `font-size:70%; opacity:.7`
	},

	// Row 2 — the message. `pre-wrap` is load-bearing: lint-core composes
	// `${message}\n\nFix: ${fix}` for findings with no one-click action, and the
	// blank line is what separates the diagnosis from the remedy.
	'.cm-tooltip-lint .cm-diagnosticText': {
		gridColumn: '1 / -1',
		gridRow: '2',
		fontSize: '12.5px',
		lineHeight: '1.5',
		color: 'var(--text-body)',
		whiteSpace: 'pre-wrap',
		// Slightly more air below the prose than above it, so a filled pill reads
		// as a separate move rather than a third line of the sentence.
		paddingBottom: '2px',
	},

	// ── Row 3+ — the point of the surface ───────────────────────────────────
	// FindingCard's "Apply" pill, verbatim: filled `--accent` with `--on-accent`
	// ink. `--on-accent` is the repo's curated per-theme answer to "accent has no
	// contrast guarantee" — every theme names it against its own accent, which is
	// why the fill is safe here and a hand-picked white would not be.
	'.cm-tooltip-lint .cm-diagnosticAction': {
		gridColumn: '1 / -1',
		justifySelf: 'start',
		display: 'inline-flex',
		alignItems: 'center',
		gap: '6px',
		minHeight: '28px',
		padding: '4px 12px',
		border: '1px solid transparent',
		borderRadius: '999px',
		backgroundColor: 'var(--accent)',
		color: 'var(--on-accent)',
		font: 'inherit',
		fontSize: '12px',
		fontWeight: '600',
		lineHeight: '1.3',
		cursor: 'pointer',
		transition: 'box-shadow 120ms ease',
		margin: '0',
	},
	// Hover/press is a HALO, not a fill shift — both obvious fill shifts fail
	// somewhere across the palette set: toward `--bg` lightens a dark-gold accent
	// far enough that `--on-accent` drops below AA, and toward `--text-heading` is
	// a measured no-op on the `a11y-*` palettes where accent and heading ink are
	// the same color. A translucent accent ring composites over `--bg` (which
	// `--accent` must already contrast with to be usable at all) and leaves the
	// fill — and so the label's contrast — untouched.
	'.cm-tooltip-lint .cm-diagnosticAction:hover': {
		boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 42%, transparent)',
	},
	'.cm-tooltip-lint .cm-diagnosticAction:active': {
		boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 62%, transparent)',
	},
	// Focus is an INK outline at a gap — a different channel from the hover halo,
	// so "hovered" and "keyboard-focused" never read as the same state.
	'.cm-tooltip-lint .cm-diagnosticAction:focus-visible': {
		outline: '2px solid color-mix(in srgb, var(--text-heading) 55%, transparent)',
		outlineOffset: '2px',
	},
	// Reserved SECONDARY, for an action given `markClass: 'cm-diagnosticAction-quiet'`
	// — FindingCard's own secondary pill. Nothing sets it today; it exists so a
	// second action never has to invent one.
	'.cm-tooltip-lint .cm-diagnosticAction-quiet': {
		backgroundColor: 'var(--accent-soft)',
		borderColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
		color: 'var(--accent)',
	},
	'.cm-tooltip-lint .cm-diagnosticAction-quiet:hover': {
		backgroundColor: 'color-mix(in srgb, var(--accent) 14%, var(--bg))',
	},

	// ── The mark on the line ────────────────────────────────────────────────
	// The squiggle is the popup's anchor; if it doesn't share the severity system
	// the card reads as unrelated chrome. Stock paints an SVG squiggle with
	// #f11 / orange baked into the data URI — untintable. `text-decoration:
	// underline wavy` is the tokenizable equivalent.
	//
	// `--fail` / `--warn` are the palette's real severity tokens. The retired
	// `--db-sev-error` / `--db-sev-warning` these replace were referenced by the
	// Playground but DEFINED NOWHERE in the repo, so their `#c0392b` / `#b8860b`
	// fallbacks won on all 36 palette x mode rows — the severity colors never
	// tracked the theme at all.
	'.cm-lintRange': {
		backgroundImage: 'none',
		paddingBottom: '0',
		textDecorationLine: 'underline',
		textDecorationStyle: 'wavy',
		textDecorationThickness: '1px',
		textDecorationSkipInk: 'none',
		textUnderlineOffset: '3px',
	},
	// `backgroundImage: none` is repeated per severity because the stock squiggle
	// is declared on the SEVERITY class, not on `.cm-lintRange` — clearing only
	// the base class would leave the outcome to source order.
	'.cm-lintRange-error': { backgroundImage: 'none', textDecorationColor: 'var(--fail)' },
	'.cm-lintRange-warning': { backgroundImage: 'none', textDecorationColor: 'var(--warn)' },
	'.cm-lintRange-info': { backgroundImage: 'none', textDecorationColor: MUTED_INK },
	'.cm-lintRange-hint': { backgroundImage: 'none', textDecorationColor: MUTED_INK },
	'.cm-lintRange-active': { backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' },

	// ── The gutter marker ───────────────────────────────────────────────────
	// A brand-colored disc in place of CodeMirror's fixed-color SVG glyph, so
	// the gutter, the squiggle, and the card read as one system.
	//
	// `content: none` is the load-bearing line, NOT `backgroundImage`. The package
	// draws this marker with `content: url(<svg …>)` carrying hardcoded `#f87` /
	// `#fe8` fills (@codemirror/lint's baseTheme, `.cm-lint-marker-{error,warning,
	// info}`), which makes the div a REPLACED element — so a background paints
	// BEHIND the stock glyph rather than instead of it, and the result is a colored
	// ring around an untouched salmon circle. `backgroundImage` is the right lever
	// for `.cm-lintRange-*` (the squiggle really is a background image) and the
	// wrong one here; both are kept because each clears its own surface.
	'.cm-gutter-lint': { width: '0.9em' },
	'.cm-gutter-lint .cm-gutterElement': { padding: '0 1px' },
	'.cm-lint-marker': {
		width: '0.7em',
		height: '0.7em',
		content: 'none',
		backgroundImage: 'none',
		borderRadius: '50%',
	},
	'.cm-lint-marker-error': { content: 'none', backgroundColor: 'var(--fail)' },
	'.cm-lint-marker-warning': { content: 'none', backgroundColor: 'var(--warn)' },
	'.cm-lint-marker-info': { content: 'none', backgroundColor: MUTED_INK },

	// ── The lint panel (Ctrl-Shift-M) ───────────────────────────────────────
	// Kept for the surface that can reach it, but do NOT read these as "the third
	// view of the same stream" — measured, they largely do not render:
	//   · The STUDIO has no lint panel at all. `Editor.tsx` registers defaultKeymap
	//     + historyKeymap + completionKeymap and no `lintKeymap`, and no control
	//     calls `openLintPanel`, so every rule here is dead on that surface.
	//   · On the PLAYGROUND the panel opens, but the selected-row rule below loses:
	//     it is (0,4,0) and the package ships `&:focus [aria-selected]` at (0,5,0),
	//     while `openLintPanel` focuses the list — so the selection paints raw
	//     system Highlight blue. The panel also carries no glyph, no severity word,
	//     and the stock `#444` action button.
	// Bringing the panel up to the card's treatment is real work on a surface with
	// no entry point in the Studio; it is deliberately NOT in this change's scope,
	// and the honest state is recorded here rather than implied away.
	'.cm-panel.cm-panel-lint': {
		backgroundColor: 'var(--bg-alt)',
		borderTop: '1px solid var(--border)',
		color: 'var(--text-body)',
	},
	'.cm-panel.cm-panel-lint ul [aria-selected]': {
		backgroundColor: 'color-mix(in srgb, var(--accent) 18%, var(--bg-alt))',
	},
	'.cm-panel.cm-panel-lint .cm-diagnostic-error': { borderLeftColor: 'var(--fail)' },
	'.cm-panel.cm-panel-lint .cm-diagnostic-warning': { borderLeftColor: 'var(--warn)' },
	'.cm-panel.cm-panel-lint button[name="close"]': { color: 'var(--text-muted)' },

	// ── Forced colors / Windows High Contrast ───────────────────────────────
	// SHAPE is this design's primary severity channel, and it is carried by
	// `background-color` — on a masked pseudo-element in the card, and on the disc
	// in the gutter. Forced-colors mode overrides `background-color` to the system
	// Canvas, so both silhouettes go the same color as what they sit on and vanish.
	// The card degrades gracefully (the WORD is a third channel), but the gutter has
	// no third channel — and since the marker's stock `content:` SVG is cleared
	// above, without this block the gutter would be EMPTY under High Contrast, which
	// is worse than what the package shipped.
	//
	// System color KEYWORDS are honored in forced-colors mode (that is the escape
	// hatch the mode provides), so painting the silhouettes in `CanvasText` keeps
	// shape working as the channel the design claims it is. Severity hue is gone —
	// which is correct; under forced colors the user has asked for exactly that —
	// and the octagon / triangle / circle plus the word still separate the three.
	'@media (forced-colors: active)': {
		'.cm-tooltip-lint > li.cm-diagnostic::before': { backgroundColor: 'CanvasText' },
		'.cm-lint-marker': { backgroundColor: 'CanvasText' },
		// The pill's fill is forced to Canvas, so its transparent border is what
		// would read as the control's edge; make it explicit rather than relying on
		// the UA to promote it.
		'.cm-tooltip-lint .cm-diagnosticAction': { borderColor: 'ButtonText' },
	},
};

/**
 * Coarse-pointer overrides, kept OUT of `lintTheme` on purpose.
 *
 * Both consuming themes already own a `'@media (pointer: coarse)'` key (they lift
 * `.cm-content` to 16px so iOS Safari doesn't auto-zoom on focus). A theme object
 * is a flat map, so spreading a second object that also carries that key would
 * silently REPLACE the existing block and drop the zoom guard. Exporting the
 * coarse rules separately forces each consumer to merge them explicitly:
 *
 *   '@media (pointer: coarse)': { '.cm-content': { fontSize: '16px' }, ...lintThemeCoarse },
 *
 * On a phone the card gets reading sizes and the fix becomes a full-width 44px
 * target instead of a 28px pill.
 *
 * These are POINTER rules, not width rules, and the distinction matters: a coarse
 * pointer means fingers, which is a target-size and type-size argument at any
 * width. It is NOT a licence to widen the card — an earlier cut also relaxed
 * `max-width` to `calc(100vw - 24px)` here, which on every touchscreen laptop,
 * Surface and landscape tablet produced an 893px full-bleed banner with a
 * half-screen-wide fix button, the exact opposite of the 340px "sit beside the
 * code, don't blanket it" rule it was meant to serve. The narrow cap already has
 * `calc(100vw - 28px)` in it, so a real phone is handled without any override.
 * Anything genuinely width-conditional belongs in a width media query.
 *
 * @type {Record<string, Record<string, string>>}
 */
export const lintThemeCoarse = {
	'.cm-tooltip-lint > li.cm-diagnostic': { padding: '12px 14px', rowGap: '9px' },
	'.cm-tooltip-lint > li.cm-diagnostic::before': { width: '17px', height: '17px' },
	'.cm-tooltip-lint > li.cm-diagnostic::after': { fontSize: '13px' },
	'.cm-tooltip-lint .cm-diagnosticSource': { fontSize: '12px' },
	'.cm-tooltip-lint .cm-diagnosticText': { fontSize: '14px' },
	'.cm-tooltip-lint .cm-diagnosticAction': {
		justifySelf: 'stretch',
		justifyContent: 'center',
		minHeight: '44px',
		fontSize: '14px',
	},
};
