---
status: shipped
summary: >
  Redesigned Studio's mobile toolbar and "···" overflow. Round 1 of a design competition
  ("The Dial & the Cabinet") was rejected by the mandatory adversarial trio (HARD RULE #25) for
  reopening a twice-settled product decision, breaking the Vetrina tour engine's selector
  resolution, and a mathematically false tiebreaker. Round 2, re-run with all of round 1's failure
  modes encoded as constraints, produced "The Eight-Cell Bar": 8 edge-to-edge labeled-icon cells
  replacing the old 9 icon-only controls, and a new `StudioDrawer` (a 5-zone bottom Sheet) replacing
  the flat scrolling "···" menu. Ships with two structural icon-collision fixes (a semantic
  `icons.ts` registry) and the retirement of the sub-44px `PaneBtn`.
last-updated: 2026-07-26
companion:
  - ../../docs/src/components/studio/StudioShell.tsx
  - ../../docs/src/components/studio/StudioDrawer.tsx
  - ../../docs/src/components/studio/icons.ts
  - ../orchestration.md
---

# Studio mobile — the Eight-Cell Bar

## What was wrong

Studio's mobile toolbar had grown to 9 icon-only controls with no persistent
labels, plus a "···" overflow that was a flat, unsorted scrolling list. Two
icons were reused for unrelated actions (`MessageSquareHeart` served both Chat
and Feedback; `Eye` served both Preview and Lenses, and doubled as the
screen-reader-description glyph elsewhere). The lowest-traffic pane switcher
(`PaneBtn`) rendered at 32px — under the 44px touch-target floor the rest of
the chrome respects.

## Process — two-round design competition, per HARD RULE #25

Round 1 ran a 6-agent competition (5 design tracks + 1 combined fact-check/
judge — a deliberately lean shape given the user's "keep the agents to less
than 7" cap) and picked "The Dial & the Cabinet." Before implementing, the
mandatory adversarial trio (red team + Munger inversion + independent
checker) reviewed the winner and killed it:

- It reopened whether Preview should be a persistent pane vs. a toggle — a
  question the product had already settled twice.
- Its "cabinet" put every further-surface control behind a Radix
  `DropdownMenu`/`Sheet` portal to `document.body`. The Vetrina tour engine
  (`docs/src/lib/vetrina/stage.ts`) resolves string selectors via
  `root.querySelector` scoped to `[data-studio-root]`, not `document.body` —
  so anything inside an unmodified portal is invisible to a running tour.
- The round-1 judge's tiebreaker argument for the Dial was arithmetically
  false (double-counted a shared constraint).

Round 2 re-ran the competition with all three failures encoded as
non-negotiable constraints (no persistent-pane reopening; no un-thunked
portal content a tour can reach; a checkable tiebreaker), across 11 total
constraints. The winner, "The Eight-Cell Bar," was reviewed by a second
adversarial trio and cleared with mandatory corrections (below), then
prototyped and shown to the user, who picked it directly: **"go with the
eight-cell bar."**

## What shipped

**Toolbar** — 8 edge-to-edge `BarIcon variant="bar"` cells (icon + persistent
caption, not a hover tooltip), each ≥44px tall:

`Source · Compose · Preview │ Coach · Chat · Settings │ Present · Share`

Source and Compose merge the old markdown/compose pane toggle with the
Read→Write posture switch: tapping either sets `editMode`, switches to the
edit pane, and — if the user is in the calm Read posture — dismisses the read
hint and moves them to Write. Preview, Present, and Share keep their existing
one-tap behavior; Present and Share get a visual `tone` (outline / solid) to
read as the two "leave the editor" actions. Coach, Chat, and Settings are
unchanged one-tap panel toggles, just relabeled with persistent captions.

**Overflow** — `StudioDrawer.tsx`, a new component: the "···" trigger now
opens a `Sheet side="bottom" h-[85dvh]` with a sticky jump-strip over 5 fixed
zones (Workspace, Edit, Views, Show me, Look) instead of one flat scroll.
Rows that open a further surface (Version history, Slide settings, Lenses,
Library, Workspace settings, Feedback) close the drawer first
(`onOpenChange(false)` then the action) to avoid overlay focus races. Theme
switching is inline in the drawer's Look zone via `themeSelectGroups()` (data
only — not the `ThemeMenuItems` component, which emits Radix
`DropdownMenu` primitives that can't render inside a `Sheet`, a trap every
prior round hit).

**Post-open refinement, from direct user feedback on the shipped design**:
Workspace (Library, Workspace settings, Search, Send Feedback) moved from
the LAST zone to the FIRST, and its four rows changed from a vertical `Row`
list to a horizontal icon-button row (`IconAction` — icon on top, a short
caption below, same visual idiom as the toolbar's `BarIcon`). The user's
ask, read literally against a screenshot of the shipped drawer: "move them
from the bottom to the top of this component and turn them into icon
button row with labels below them." An earlier draft of this response
mis-scoped the ask as promoting Library/Workspace settings into the main
toolbar itself (a much bigger, riskier change reopening how many cells the
Eight-Cell Bar holds) — a mockup was built and shown before any code
changed, the user corrected the scope, and the actual (much smaller, purely
intra-drawer) change shipped instead. `IconAction` keeps `label` (the full
accessible name — "Workspace settings", "Search / commands", "Send
feedback" — unchanged from the prior `Row` markup, so no existing test or
e2e assertion targeting those names broke) separate from `caption` (the
short visual text the icon-row layout has room for), the same label/caption
split `BarIcon` already uses.

**Icon collisions fixed structurally** — a new `docs/src/components/studio/
icons.ts` re-exports each shared icon under its semantic name
(`ChatIcon`, `FeedbackIcon`, `PreviewIcon`, `LensIcon`, `SrDescriptionIcon`),
so Chat/Feedback and Preview/Lenses can no longer silently collide again; all
call sites (`StudioShell.tsx`, `lens-picker.tsx`, `LensesPanel.tsx`,
`WorkspaceSheet.tsx`, `SlideContext.tsx`) import from it.

**`PaneBtn` retired** — its 32px target is gone; every mobile toolbar control
is now a `BarIcon` at ≥44px. (The drawer's own `Row`s are a separate,
lower-frequency surface — see the checker findings below — and are not held
to the toolbar's 44px floor.)

**Tablet is unchanged** — the "···" trigger keeps its existing flat
`DropdownMenu`; only mobile gets the new `StudioDrawer`. `docs/e2e/
studio-fixture.ts`'s `moreControls` selector documents that the same trigger
name now fronts two different surfaces (`role="menuitem"` rows on tablet,
plain `role="button"` rows on mobile) — a spec targeting a row inside it must
pick the role for the tier under test.

## Maker-checker pass found a real regression (HARD RULE #25 / #18)

Before opening the PR, an independent checker agent reviewed the
implementation diff (not the design, already competed and adversarially
reviewed above). It found the drawer did not actually scroll:
`ScrollFade`'s `className` prop landed on the *inner* scrolling div, not the
outer wrapper that is the flex child of the drawer's flex column — so
`flex-1 min-h-0` never reached the element that needed to size to the
available space, the wrapper sized to content instead, and `overflow-y-auto`
on an auto-height block scrolled nothing. On a real phone this made Library,
Workspace settings, Search/commands, and Send feedback unreachable (sliced by
the viewport edge or below the fold entirely) — a regression this change
introduced, not a pre-existing condition, so it was fixed before merge per
HARD RULE #18:

- `ScrollFade` now takes a separate `wrapperClassName` prop for sizing
  classes that must land on the flex-child wrapper, keeping `className` for
  the inner scroller's own styling (`scroll-fade.tsx`).
- The drawer's main scroll region and the "Show me" tour rail and "Look"
  theme rail now correctly use the split props; the tour rail (which
  genuinely overflows at mobile widths) now shows the same fade-and-chevron
  "there's more" cue the theme rails do.

The same pass also caught two documentation overclaims, corrected in place:
the CHANGELOG's "every mobile control is now ≥44×44" scoped to the eight bar
cells (the drawer's own rows are a separate, lower-frequency surface, not
held to that floor); and the demo-completion toast issue below re-described
as a deterministic pre-existing failure rather than a timing flake (the
toast was confirmed to never fire at all on the untouched desktop
`demo.spec.ts` path either — see below). A stray unconditional
screen-reader-only span (rendered even at zero issues) was also removed.

## Selected-state contrast — swap the mode pair, don't tint

Follow-up feedback: the active bar cell's `--accent-soft` tint (the same
low-contrast treatment the rail uses) was too subtle to register at a
glance on the bar specifically. Rather than introduce a new token, `BarIcon`
now paints the active **bar** cell (not rail — scope confirmed with the
user) with `bg-[var(--text-heading)] text-[var(--bg)]`: swapping the
theme's own primary text/background pair. Since that pair is *already*
tuned for maximum contrast in every palette (it's the base text-on-surface
relationship every theme is built around), the swap reads as "the other
mode's look" for free — a dark, high-contrast chip in light mode, a light
one in dark mode — with zero new tokens, zero palette-specific casing, and
guaranteed-legible contrast by construction. Verified with real screenshots
in both modes on `indaco` and on `onyx` (the palette's monochrome edge
case, where the swap becomes a literal solid-black/solid-white chip). The
bar's redundant bottom-accent-rule marker is dropped for this state (the
fill itself is now the marker); the rail's left-edge rule marker is
unchanged.

## A real-device report found a second, cross-browser bug

After the PR opened, the user tapped Source → Compose → Preview on a real
iPhone (via the Cloudflare Pages preview deploy) and reported Compose's
per-slide formatting pill still visible, painted on top of the Preview
pane's header. Reproduced identically in Chromium via Playwright — this is
a plain CSS bug, not a Safari-specific compositing quirk.

Root cause: the mobile pane-swap wrapper (`StudioShell.tsx`, pre-existing
from the 2026-07-21 preview-reframe work, unrelated to this PR) sets the
inactive pane's wrapper to `visibility:hidden` via a Tailwind `invisible`
class. `ComposeView.tsx`'s `.cs-sb-pill` (the insert/table/settings pill
shown on Compose's active slide) carries `.cs-slide-active > .cs-slide-bar
> .cs-sb-pill{visibility:visible}` — a completely ordinary descendant
selector, but CSS `visibility` is only *inherited*, so an explicit
`visibility:visible` on a descendant overrides an ancestor's hidden value
regardless of that ancestor's computed state. The pill kept rendering,
z-order'd beneath the Preview pane's own header (hence "painted behind the
Full-deck pill" in the report) but still visibly on top of the slide canvas.

This predates the Eight-Cell Bar — the pane-swap wrapper and the pill CSS
are both untouched by this PR's diff — but the redesign made Compose →
Preview a trivial one-tap-then-one-tap sequence for the first time on
mobile (Compose was previously one of nine unlabeled icons), which is very
likely why nobody had hit it before. Fixed at the source: `ComposeView`
now adds a `cs-paused` class to its root when its existing `visible` prop
(already threaded from `StudioShell`, previously unused for this) is
false, and a higher-specificity selector
(`.cs-surface.cs-paused .cs-slide-active > .cs-slide-bar >
.cs-sb-pill{visibility:hidden;opacity:0}` — 5 classes vs. the original
rule's 3) forces the pill hidden while its pane is inactive, deterministically,
regardless of source order. Verified via a Playwright repro script that
reproduced the leak pre-fix and confirmed it gone post-fix, plus the full
862-test Studio suite and `build:check`/lint clean.

## Pre-existing gaps found, not fixed (HARD RULE #18 — off-path)

- `SEL.theme` (`tour-kit.ts`) was already unresolvable on mobile before this
  change — the Settings sheet's theme picker portals to `document.body`, out
  of the tour engine's `[data-studio-root]` scope. No shipped tour currently
  drives it; logged in a comment at the selector rather than fixed here (it
  predates this change and touching it is a separate, non-trivial portal-scope
  fix).
- `SEL.slideSettings` would hit the same gap once Slide settings lives only in
  the drawer, but no tour references it today; same disposition.
- `demo-mobile.spec.ts`'s 4-slide completion test fails a `toastText`
  assertion — **deterministically, not a timing flake**: the checker
  instrumented a full run with a `MutationObserver` on every `role="status"`
  node and the "Demo complete" toast never appeared at all. It reproduces
  identically on the untouched **desktop** `demo.spec.ts` path (5/5), which
  this change does not touch, confirming it predates this change even though
  the original "timing flake" characterization was wrong.

## Verification (HARD RULE #23)

- Unit: 46/46 passing in `StudioShell.test.tsx` (updated for the new
  accessible names/roles + 3 new tests for posture-switching and the tablet
  H4 breakpoint reset).
- e2e: 10/11 passing (`responsive.spec.ts`, `ios-zoom.spec.ts`,
  `demo-mobile.spec.ts`); the 1 failure is the pre-existing flake above.
  `responsive.spec.ts` gained a geometric-oracle test asserting all 8 toolbar
  cells hold a ≥44×44 bounding box at 390/375/360px.
- Visual: real Playwright/Chromium screenshots at 390, 375, 360, 820, and
  1440px, plus the desktop Build-posture activity bar, satisfying the
  round-2 judge's hard merge gate on caption-density legibility at the
  narrowest width. The drawer-open screenshot from the first verification
  pass predates the scroll-region fix above and was not sufficient to catch
  it (F1) — the checker's own Playwright measurements (scroll offsets,
  element positions, a screenshot at 375×667) are the artifact that actually
  covers the fixed drawer; a fresh drawer screenshot at 390px post-fix is in
  the PR.
- **Not verified from this sandbox**: real touch/gesture behavior and iOS
  Safari specifically, and no dark-mode pass was run on the new drawer —
  only Chromium/Playwright light-mode emulation was exercised. Marked
  **UNVERIFIED** per HARD RULE #23 rather than claimed.
