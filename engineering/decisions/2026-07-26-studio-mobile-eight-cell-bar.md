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
  `icons.ts` registry) and the retirement of the sub-44px `PaneBtn`. Post-launch feedback drove
  three more rounds: the drawer's Workspace zone promoted to the top as an icon row, a real
  cross-browser CSS bug (Compose's per-slide pill bleeding onto Preview) found on a live iPhone and
  fixed at the source, and the active cell's contrast swapped for legibility. A full adversarial
  trio run explicitly on the cumulative diff then caught two convergent, independently-confirmed
  regressions the reactive fixes introduced — the active cell and Share rendering identically in
  13 of 36 palette/mode combinations, and Version history becoming unreachable from the mobile
  Preview pane — plus a real AA contrast failure in a new badge; all fixed before merge.
last-updated: 2026-07-27
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
as a deterministic pre-existing failure rather than a timing flake (see
below for the fully corrected root cause, reached two passes later). A
stray unconditional screen-reader-only span (rendered even at zero issues)
was also removed.

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
case, where the swap becomes a literal solid-black/solid-white chip).

At this point the bar's bottom-accent-rule marker was dropped on the
assumption the fill itself was now marker enough — **wrong**, per the
adversarial trio pass below: on `onyx` specifically (the very palette just
used to verify legibility) the active cell's fill is byte-identical to the
Share cell's, so "verified legible" and "verified distinguishable from
Share" were silently conflated. The marker is restored, recolored, and
scoped more precisely — see that section for the fix. The rail's left-edge
rule marker was never touched and remains unchanged throughout.

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
regardless of source order. Verified live against a running build (Compose
→ tap Preview → measure the pill's computed style) at the time, plus the
full 862-test Studio suite and `build:check`/lint clean — but the repro
script itself wasn't kept, so there was no artifact anyone else could point
to afterward. An independent checker re-verified the fix from scratch,
reconstructing the pre-fix behavior by stripping `cs-paused` from the live
DOM on the same page and confirming the pill re-leaks (screenshot:
`chk-C-preview-prefix.png` in that pass) then re-appears fixed with the
class restored (`chk-B-preview-fixed.png`) — the fix holds, but the
original "verified" claim should have named a surviving artifact per HARD
RULE #23 and didn't.

## Adversarial trio, run explicitly on the cumulative diff (HARD RULE #25)

By this point four commits had shipped reactively, one user report at a
time — the process that hardened the original design (two competition
rounds, two trios, a maker-checker pass) had not touched anything after
`4f0bb4d`. On explicit request, the full trio (red team + Munger inversion
+ independent checker, all Opus) ran in parallel against the entire
`origin/main..HEAD` diff — "what will actually ship," not just the newest
commit. Two of three lenses independently found the same two high-severity
defects with concrete, measured evidence; a third finding came from the
checker alone. All were fixed before merge:

- **The active bar cell and the Share cell rendered as byte-identical
  blocks in 13 of 36 palette×mode combinations** (red team + inversion,
  independently, both with live `getComputedStyle` measurements). The
  contrast swap (above) assumed `--text-heading`/`--bg` would always read
  as visually distinct from Share's `--accent`/`--on-accent` fill — true
  for contrast *within* each pair, never checked *between* them. In every
  monochrome/accessibility palette (onyx, all four `a11y-*`, atelier,
  concrete, ardesia) `--accent` equals `--text-heading`, so "this is
  selected" and "this shares the deck" painted identically — worst on the
  a11y-safe palettes specifically, the population least able to resolve
  the ambiguity by hue. The onyx screenshot taken for the original swap
  had the collision in it; the question asked of that screenshot
  ("legible?") couldn't see it. Fixed: the bar's active-cell marker
  (dropped when the swap shipped, on the assumption the fill alone was
  enough) is restored, redrawn in `--bg` instead of `--accent` so it always
  contrasts against the cell's own fill (checked: 9.65–21:1 in all 36
  combos) and shown only on `tone="ghost"` cells, so Share/Present never
  carry it no matter what their own fill resolves to.
- **Version history became unreachable from the mobile Preview pane**
  (inversion + red team + checker — all three, independently). `main`'s
  mobile Preview pane carried a one-tap Version history button; `4f0bb4d`
  deleted it and re-homed the action only in the drawer's Edit zone, gated
  `effPane === 'edit'` — so from Preview, deck-level snapshot recovery had
  no entry point at all, and the CHANGELOG's "moves into the drawer's Edit
  zone" read as a relocation when it was a removal-from-Preview. This is
  the sharpest HARD RULE #18 case in the whole pass: a surface that worked
  before this change didn't after, self-inflicted, and described as a move
  rather than disclosed as a loss. Fixed: Version history moved out of the
  pane-gated Edit zone into the always-rendered Views zone (it's a
  deck-level action, not a slide-editing one — the same distinction the
  Edit zone's own comment already draws).
- **The drawer's "Fix all issues" badge failed AA in every dark palette**
  (red team, with live measurements; inversion flagged the same undefined
  token as a minor note). `var(--chart-2, #9c3f00)` always fell back to the
  literal hex — `--chart-2` is defined nowhere in this codebase (palettes
  define `--chart-cat2`, a different name) — as bare text with no
  background compensation, measuring 2.55–2.95:1 against the drawer's own
  background in every dark palette (AA needs 4.5:1). This pattern is
  repo-wide and pre-existing elsewhere (seven other instances, all
  `color-mix`'d against a background rather than bare text, which is
  probably why none of those were flagged) — but this specific instance is
  new, in the new `StudioDrawer.tsx`, so it's on-path. Fixed: swapped to the
  real `--warn` token.

Also folded in, lower severity: `icons.ts`'s "structural" framing overclaimed
— `CommandPalette.tsx` still imported raw `MessageSquareHeart` for Send
Feedback, and `LensesPanel.tsx` still imported raw `Eye` for its
Preview/Previewing chip (not itself a collision, since Eye there already
meant "preview," but inconsistent with the registry that exists to make
that meaning explicit); both now import from `icons.ts`. There is still no
lint gate enforcing the registry — logged as a follow-up, not fixed here,
since building one is a larger tooling investment than this PR's scope. A
defensive one-line effect (`if (!visible) setSelBar(null)`) was added so
Compose's floating selection toolbar — a `document.body` portal, invisible
to the mobile pane-swap wrapper the same way `.cs-sb-pill` was — can never
survive its pane going inactive; red team tried hard to reproduce a live
leak through this path and could not (it's gated behind `hover:hover` +
`pointer:fine`, mutually exclusive with every touch-only pane-swap path),
so this closes the *class* of bug structurally without there being a
demonstrated instance of it. The e2e test titled "all six protected
controls" (it asserts eight) was renamed to match. The CHANGELOG's Lenses
site count was corrected from six to seven (the actual count).

All three lenses also independently re-ran the real gates and confirmed
green: `npm run lint`, `docs` `npm run typecheck`, `npm run build:check`,
the full 862-test Studio suite, and the mobile `responsive.spec.ts` +
`ios-zoom.spec.ts` e2e specs (production `astro preview` build, not a dev
server). Findings NOT acted on, with reasoning: iOS Safari and real touch
remain UNVERIFIED from this sandbox (unchanged from before); the drawer's
own touch targets (jump-strip chips, theme swatches) are a known, disclosed
exception to the 44px floor, not revisited; 320px-and-below degrades
(cells drop under 44px) but is outside this repo's stated ~390px mobile
target, so left as a documented boundary rather than a bug.

## Fifth round: settings placement and a real navigation bug

More direct feedback against the live PR, this time on information
architecture and navigation rather than color/contrast:

- **Workspace settings promoted from the drawer to the header** (between
  the mode toggle and "More controls") — "shouldn't be buried," and it
  was: drawer-open, then a tap, for a workspace-level setting used often
  enough to want one tap. It's dropped from the drawer's Workspace row in
  the same move, so it isn't a setting with two homes — precisely the
  "duplicate Settings" complaint this round raised about Slide settings,
  applied consistently to the thing that was itself just promoted.
- **Slide settings dropped from the drawer** — it duplicated the toolbar's
  own Settings cell (deck/slide scope, one tap, always present); the
  drawer copy added a second path to the same surface for no reason. The
  toolbar cell is now the sole entry point.
- **Reader views and Version history merged into one icon row** in the
  Views zone — both are deck-level actions, neither is tied to editing the
  current slide, and stacking them as two vertical `Row`s (the pre-#1
  pattern this whole redesign was supposed to move past) never reflected
  a real distinction between them. They now use the same `IconAction`
  idiom as Workspace.
- **A real navigation bug**: tapping a drawer row that opens a further
  sheet (Library, Reader views, Version history, Search, Send feedback,
  Insert component) closed the drawer and opened the sheet — correct so
  far — but dismissing THAT sheet just closed it, dropping the user back
  at the bare toolbar instead of the drawer they'd been navigating from.
  Every one of these sheets has other entry points too (the activity bar,
  the command palette, the tablet dropdown), so the fix couldn't just
  make them always reopen the drawer on close. `StudioShell.tsx` gained a
  one-shot `drawerPendingReturn` flag: `closeDrawerAndOpen` (passed to
  `StudioDrawer` as a new `onNavigate` prop, replacing the drawer's old
  `onOpenChange(false); fn()` inline) closes the drawer, arms the flag,
  then opens the target; `withDrawerReturn` wraps that target's own
  `onOpenChange` so closing it re-opens the drawer only when the flag is
  armed, then disarms it. Six sheets got the wrapper (Library, Lenses,
  Version history, Search/CommandPalette, Send feedback, Insert
  component/SlidePicker); every other way of opening any of them —
  including the new header Workspace-settings button — never arms the
  flag, so those paths are unaffected by construction, not by a per-site
  special case.

Verified live against a real build: the header button opens Workspace
settings and closing it does NOT reopen the drawer (correct — it wasn't
opened from there); opening the drawer confirms Slide settings and
Workspace settings are both gone and Reader views + Version history sit
on one row; tapping Reader views from the drawer, then dismissing the
Lenses sheet, DOES reopen the drawer (the actual bug, now fixed). Full
Studio suite (862/862), `responsive.spec.ts` + `ios-zoom.spec.ts` (8/8),
`build:check`, typecheck, and lint all re-run clean.

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
  assertion — **deterministically, not a timing flake, and not a missing
  toast**: a second-pass independent checker corrected the root cause once
  more. `docs/e2e/studio-fixture.ts`'s `toastText()` locator
  (`[role="status"].fixed.inset-x-0`) is stale for the sonner-based toast
  system Studio actually uses (`docs/src/components/ui/sonner.tsx`) — sonner
  renders `aria-live="polite"`, never `role="status"`, and no element in
  `docs/src` carries `fixed inset-x-0` with `role="status"`. The locator
  cannot match ANY toast, on any spec. Confirmed on the untouched **desktop**
  `demo.spec.ts` (this change does not touch it) and on `decks.spec.ts` (also
  untouched) — both fail the identical way. Grep counted **24 assertions
  across 13 e2e files** using this dead locator; fixing the fixture itself is
  a separate, repo-wide e2e-tier fix, well outside this PR's scope (#17) —
  logged here as the follow-up this finding actually calls for, rather than
  the narrower "one flaky toast" framing an earlier pass gave it.

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
  Safari specifically, and — at this point in the timeline — no dark-mode
  pass had been run on the new drawer; only Chromium/Playwright light-mode
  emulation was exercised. (The later contrast-swap and trio passes did
  cover dark mode for the bar and the drawer's badge specifically — see
  those sections — but a full dark-mode sweep of the whole drawer still
  hasn't happened.) Marked
  **UNVERIFIED** per HARD RULE #23 rather than claimed.
