---
status: shipped
summary: The Studio's lint hover popup was the last surface still wearing `@codemirror/lint`'s stock chrome — a 5px `#d11`/`orange` rail and a `#444` button — because `editor-theme.ts` themed the shared `.cm-tooltip` shell but never its interior. Three independent design tracks were judged and the human picked "Finding Card, in place": the Coach panel's meta/message/action rhythm reproduced by CSS-grid placement over the package's fixed DOM, with severity carried on glyph shape and word as well as color so the `a11y-*` palettes still separate it. Landing it uncovered three latent defects, all fixed here — the Studio and Playground each dressed the same lint DOM independently (now one shared `docs/src/lib/lint-theme.js`); `--db-sev-error`/`--db-sev-warning` were referenced in eight declarations across four groups and DEFINED NOWHERE, so hex fallbacks won on all 36 palette x mode rows and severity never tracked the theme (now `--fail`/`--warn`); and recessive ink was bare `--text-muted`, which measures 2.47:1 on magnolia light and 2.64:1 on cuoio light (now mixed 55% into `--text-body`, lifting all 36 rows past 3:1). It also uncovered a trap worth knowing: a CodeMirror theme object compiles in KEY ORDER, so an `@media (pointer: coarse)` block placed above the base rules loses to them at equal specificity — the fix pill measured 28px instead of 44px under a matching coarse-pointer media query until the block moved last, and nothing but a coarse-pointer context catches it. A maker-checker pass then caught a regression this change had CREATED: deleting the Playground's global lint block dropped the fill from its GUTTER-marker tooltip (a second @codemirror/lint path, where `.cm-tooltip` sits on the `<ul>` itself rather than a HoverTooltipHost wrapper), and exposed that the Playground never themed `.cm-tooltip` at all — its popup was CodeMirror's base `#f5f5f5` on every palette and in dark mode, 1.32:1. Fixed by sharing `tooltipShell` too; the original verification had missed it by driving only the hover path and by asserting the shell color with a check that could not fail. Now verified on the built site across Studio and Playground x light/dark x 1440/820/390, on BOTH tooltip paths, comparing the shell against the palette's --bg. The 44px touch target is confirmed via a genuinely-matching coarse-pointer media query; tap-to-open/dismiss was observed under EMULATION only and is not claimed as verified. iOS Safari is UNVERIFIED.
---

# The lint popup is the Coach finding card, rendered in place

**Date:** 2026-08-16 · **Status:** adopted · **Surface:** docs-site Studio + Playground

## What was wrong

The hover popup that reports an authoring problem was the one surface in the Studio still
wearing `@codemirror/lint`'s stock chrome: a 5px `#d11` / `orange` left rail, a `#444`
action button, a small italic rule-id line. `editor-theme.ts` themed `.cm-tooltip` — the
floating shell the popup shares with the autocomplete list — but never its interior, so
the popup read as foreign chrome sitting on top of a carefully made app. It was reported
from a phone, where the mismatch is starkest.

Underneath that were three defects nobody had noticed:

1. **Two surfaces, two definitions.** `docs/src/playground/editor.js` dressed the same
   lint DOM in its own idiom, from a global stylesheet. Same findings, same markup, two
   different-looking popups — and a fix to one silently skipped the other.
2. **`--db-sev-error` / `--db-sev-warning` are not defined anywhere in this repo.** The
   Playground referenced them in eight declarations across four groups — the squiggle,
   the gutter disc, the lint panel's rails, and the tooltip's own left rail in the
   global `TOOLTIP_CSS`. Their `#c0392b` / `#b8860b` fallbacks therefore won on all 36
   palette × mode rows: the severity colors never tracked the theme at all, despite a
   changelog entry claiming they were "token-first off `--fail`/`--warn`".
3. **Recessive ink below 3:1.** Bare `--text-muted` measures 2.47:1 against `--bg` on
   magnolia light and 2.64:1 on cuoio light.

## How the direction was chosen

Three independent design tracks, a fresh critic each, a shared fact-checker, and
comparative judging (the `design-competition` workflow; HARD RULE #25). The winner —
"Finding Card, in place", 8.5/10, 43/43 load-bearing claims confirmed — was picked by the
human from rendered candidates. The other two contributed findings that were grafted onto
it rather than discarded: the 36-cell contrast sheet that surfaced defect 3, and the
severity-without-hue argument.

## The design

The Coach panel already renders a lint finding as a card with a fixed rhythm — meta line,
message, action (`coach/FindingCard.tsx`). A popup reporting the SAME finding should read
the same way, so nothing new is minted. `@codemirror/lint` emits a fixed child order
(`text → button(s) → source`); CSS grid placement re-reads it as meta / message / action
without forking the package. Actions carry no explicit row so they auto-flow to rows 3..n,
which is what lets 0..n buttons land cleanly.

The card styles only the popup's **interior** and lets `.cm-tooltip` — the shell it
shares with the autocomplete popup — carry the fill, so the two cannot drift apart. That
only works if every surface themes that shell, and one did not: `tooltipShell` is now
exported from the same module and spread by both. See "The shell that only one surface
had" below.

Severity is carried on three channels — glyph shape (octagon / triangle / circle), the
word, and color — because color is the one channel the `a11y-*` palettes can flatten.
The glyphs are lucide icons applied as CSS **masks**, so one asset re-tints per severity
and per palette; a mask uses the image's alpha, never its color, which is why the
`stroke='%23000'` inside the data URI is not a palette decision.

## The trap this uncovered — coarse-pointer rules must come LAST

A CodeMirror theme object is a flat map that compiles to a stylesheet **in key order**.
`lintThemeCoarse` targets the same selectors as `lintTheme` at the same specificity, so
placing the `@media (pointer: coarse)` block before the `...lintTheme` spread makes the
touch rules lose to the very rules they exist to override.

Nothing catches this cheaply: the object is valid, both surfaces build, every unit test
passes, and only a real coarse pointer shows the defect. It was found by measuring the
built site in a touch context — the fix pill computed **28px** where the design calls for
44px — and it is now pinned by a test asserting the block appears after the spread in
both consuming files.

For the same reason `lintThemeCoarse` is exported **separately** rather than living inside
`lintTheme`: both consumers already own an `'@media (pointer: coarse)'` key for the 16px
`.cm-content` lift that keeps iOS from auto-zooming on focus, and a spread carrying a
second copy of that key would replace theirs, taking the zoom guard with it.

## The shell that only one surface had — caught by the checker, not by me

The first cut of this change left `.cm-tooltip` to each surface on the assumption both
already themed it. Only the Studio did. The Playground's popup therefore fell through to
`@codemirror/view`'s base `&light .cm-tooltip { background:#f5f5f5 }` — in every palette
**and in dark mode**, where `--text-body` on `#f5f5f5` measures **1.32:1** and the
severity word measures **1.09:1**.

Worse, deleting the Playground's global lint block made part of that a **new** break
rather than an inherited one. `@codemirror/lint` renders two tooltips over the same
markup:

- the **squiggle hover** goes through `HoverTooltipHost`, so `.cm-tooltip` lands on a
  wrapper `<div>` and the `<ul>` only gets `cm-tooltip-section`;
- the **gutter-marker** tooltip goes through `showTooltip` directly, so the `<ul>` itself
  carries both `cm-tooltip` and `cm-tooltip-lint`.

The deleted rule was written `.cm-tooltip.cm-tooltip-lint`, so it never matched the hover
path — but it *did* match the gutter path, and nothing replaced it. Fixed by exporting
`tooltipShell` (a bare `.cm-tooltip`, which reaches both paths) and spreading it in both
consumers.

**The verification that missed it drove only the hover path.** The harness now opens the
popup by gutter marker as well, and compares the computed shell against the palette's
`--bg` instead of merely asserting it is some color — the original check was
`shellBg.startsWith('rgb')`, which cannot fail. The raw data had recorded
`rgb(245,245,245)` against a `--bg` of `#15110d` on six of twelve rows the whole time.

## A claim in the code that turned out to be false

`playground/editor.js` justified its global stylesheet by asserting that CodeMirror
renders tooltips "in a fixed/detached layer that can fall OUTSIDE" `.cm-editor`, "notably
on iOS Safari". The installed `@codemirror/view` disagrees: `tooltipPlugin.createContainer()`
falls back to `this.container = this.view.dom` whenever no `parent` is configured, and
nothing in `docs/src` configures one. Measured on the built site, `.cm-tooltip-lint` is a
descendant of `.cm-editor` on every case tested. Scoped theming reaches it, which is why
this lands as a theme object and not a global sheet. The autocomplete popup's global
duplication was left alone — a separate surface with its own history.

## Verification

Twelve cases on the **built** site (HARD RULE #23): Studio and Playground × light and dark
× 1440 / 820 / 390, each driven to a real hover over a real squiggle **and** to the gutter
marker, reporting computed styles. All twelve, on both paths: tooltip inside `.cm-editor`,
shell fill equal to the palette's `--bg` (compared, not merely non-empty), stock rail
cleared to `0px`, card renders as a grid, `pre-wrap` preserved, glyph mask applied, popup
never overflows its viewport, fix pill present at `999px` radius on the `--accent` /
`--on-accent` pair.

**Touch — read this precisely.** The context is Chromium with `hasTouch`, which is
**emulation**, so the two halves carry different weight:

- The **CSS** conclusion is sound: `matchMedia('(pointer: coarse)')` genuinely matches, so
  the coarse branch really is exercised, and the fix pill computes 44px at 14px type
  (28px before the key-order fix). A media query does not care whether the finger is real.
- The **interaction** conclusion is NOT verification under HARD RULE #23. Tap-to-open and
  tap-to-dismiss were observed under emulation only; a physical device is unproven. The
  same run also recorded `openedByGutterTap: false` — a tap on the gutter marker did not
  open the popup even in emulation.

**iOS Safari is UNVERIFIED** — unreachable from this sandbox.

## What this change does NOT do

The popup still shows the fix as prose *and* as a button, and the button still reads
"Quick fix". Both are `editor-diagnostics.js`'s concern and are fixed on the branch for
issue #1658 (PR #1671) — a separate change, kept separate under HARD RULE #17.
