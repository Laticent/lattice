---
status: shipped
summary: Two mobile defects in the Deck-setup drawer, reported from a real iPhone with screenshots. (1) The drawer shipped TWO row geometries — `Field` (label left, control right, help line below) for every dropdown and toggle, and `TextRow` (label, help line, then a full-width input) for Deck name, Header and Footer. Nothing distinguished them, so the difference read as an accident, and the stacked form cost three lines of height per field. `TextRow` now routes through `Field`: one geometry, right edges aligned across every row, and the input's height raised 32px → 36px to match `Control`. The Deck name input moves 107px up the panel, measured at 390px. (2) `useKeyboardInset` shortens the mobile sheet and lifts it clear of the keyboard, and that is only half the job — the sheet's SCROLL POSITION does not move, so a field two-thirds down a full-height sheet is below the bottom of the shortened one. The browser's own scroll-on-focus does not save it: that runs against the geometry BEFORE the keyboard opened, and the resize invalidates it. Tapping Deck name left the field, its label and its help text entirely behind the keyboard. New shared hook `useKeyboardFieldReveal`, registered by `PanelSheet` so every mobile panel inherits it, scrolls the focused field's own scroll container (never `scrollIntoView`, which walks the document and moves a fixed sheet on iOS) and does nothing when the field is already in the safe zone. Its FIRST cut shipped, and on the device did nothing at all: it compared the field's `getBoundingClientRect()` against its container's and got "the field is inside the sheet — fine", because `getBoundingClientRect()` is relative to the LAYOUT viewport, which iOS neither shrinks nor moves for the keyboard. With the body scroll-locked under a modal sheet iOS instead shifts the VISUAL viewport down (`offsetTop` > 0) — a shift `ViewportDebugOverlay` already documented as invisible to `position:fixed` and `getBoundingClientRect`. The visible band now comes from `visualViewport` (`[offsetTop, offsetTop + height]`, intersected with the container), the field lands at the TOP of that band rather than barely inside its bottom edge, a `visualViewport.scroll` listener catches the shift-without-resize case a resize-only listener misses, and a 56px bottom gap clears the iOS accessory bar that `visualViewport.height` does not include. Filter panels got this free by putting their field at the top of the sheet; a settings drawer cannot, so the behavior is made explicit and shared. Real-iOS behavior is UNVERIFIED from this sandbox — the branch that fixes the reported bug is precisely the one headless Chromium cannot execute — and marked as such.
---

# Deck setup on a phone: one row geometry, and a field you can still see

**Date:** 2026-07-29 · **Status:** shipped · **Area:** docs-site Studio
(`docs/src/components/ui/panel.tsx`, `StudioShell.tsx`) · **Follows:**
[2026-07-28-one-panel-height.md](./2026-07-28-one-panel-height.md)

Both defects were reported from a real iPhone, with screenshots, against the deployed
site. Both are only visible there.

## 1. The drawer had two row geometries and no rule

Every dropdown and toggle in Deck setup is a `Field`: **label left, control right, help
line below.** Deck name, Header and Footer were a `TextRow`: **label, help line, then a
full-width input.** Three rows in the Look tab, read top to bottom, changed shape twice.

The old shape was not arbitrary — a text field is where an author states real copy, and
giving it the full row width is a defensible instinct. What makes it wrong here is that
nothing on screen says so. Near-identical is worse than plainly different: with no visible
rule, the difference reads as an accident rather than a signal — the same argument
`PanelSection` already made about four near-miss subhead styles.

**`TextRow` now routes through `Field`.** Not "matches" — routes through, so the two cannot
drift again. `Field` gained an optional `htmlFor`/`descId` pair, which makes its label a real
`<label>` (tapping it focuses the field) and names the help line for `aria-describedby`. The
dropdown rows pass neither and render exactly the markup they did before.

Measured on the built site, all three widths (390 / 820 / 1440): label and input on one row,
and the input's right edge within 1px of the Language and Theme controls' — so the column has
one right margin instead of two. The input's height went **32px → 36px**, which is
`Control`'s own height; at 32 it missed the dropdowns' baseline by 4px on every row.

The point of the change is consistency, but the payoff is vertical: **the Deck name input
sits 107px higher** (measured, 390px). Which is the other half of this note.

### The one place the label branch differs

`shrink-0` is applied to the label only on the `htmlFor` branch. A text field is a growing
flex child, so without it the flex algorithm takes the space out of the label and "Deck name"
wraps. The dropdown rows have no growing child, so adding it there would change nothing
except their overflow behavior at the narrowest widths — left alone rather than swept in.

## 2. Lifting the sheet is not the same as showing the field

[One panel height](./2026-07-28-one-panel-height.md) established `--kb`: the mobile sheet
shortens to the visible viewport and is **lifted** to `bottom: var(--kb)`, so it sits above
the keyboard instead of behind it. That note's own hard-won lesson was that shortening alone
is not enough — the sheet has to be lifted too.

It is still not enough, and the missing third piece is the one the screenshot shows: **the
sheet's scroll position does not move.** A field that sat two-thirds down an 844px sheet is
below the bottom of the 330px one. The panel was showing its tabs and its description, and
the field being typed into was not on screen at all.

The browser's own scroll-on-focus does not cover this. It runs at focus time, against the
geometry *before* the keyboard opened; the resize that follows invalidates it.

`useKeyboardFieldReveal` (in `panel.tsx`, registered by `PanelSheet`) scrolls the focused
field back into its scroll container.

### The first cut shipped and did nothing, which is the interesting part

It compared two `getBoundingClientRect()`s — the field's against its scroll container's —
and asked "is the field inside the container". On the device the answer was **yes**, and it
correctly did nothing, with the field behind the keyboard the whole time. A second
screenshot from the same iPhone 15 Pro is what surfaced it.

`getBoundingClientRect()` is relative to the **layout** viewport, and on iOS the layout
viewport neither shrinks nor moves when the keyboard opens — the **visual** viewport does.
With the body scroll-locked under a modal sheet the document cannot scroll, so iOS reveals
the focused field by shifting the visual viewport DOWN inside the layout viewport
(`offsetTop` > 0). A rect-only comparison cannot see any of that.

This was already written down. `ViewportDebugOverlay`'s `offset` metric says, verbatim:

> position:fixed and getBoundingClientRect() are blind to this shift.

The repo had the diagnosis before the bug was written. The lesson is not "read
visualViewport" — it is that a hook whose whole job is *"is this on screen"* had no business
being built out of the one API that cannot answer that question on the platform it was
written for.

### What it does now

The visible band is `[visualViewport.offsetTop, offsetTop + height]`, in the same coordinate
space the rects already report in, intersected with the container. Five decisions are
load-bearing:

- **The band comes from `visualViewport`, the geometry from the rects.** Above.
- **It lands the field at the TOP of the band**, not just inside its bottom edge. With the
  band as short as a keyboard leaves it, and the accessory bar's height a guess, "barely in
  view" is not a safe target. The label sits on the same row as the field now (part 1 of
  this note), so aligning the field's top brings its name with it.
- **It sets `scrollTop`, not `scrollIntoView`.** `scrollIntoView` walks every scrollable
  ancestor including the document, and on iOS scrolling the document under a
  `position: fixed` sheet moves the sheet's idea of where it is. One container, one axis.
- **It listens to `focusin`, `visualViewport.resize` AND `visualViewport.scroll`,** and
  re-checks at 150ms and 350ms. Focus alone covers only "the keyboard is already up and you
  tapped a second field". Resize covers the first tap. **Scroll is the one that fires when
  iOS shifts the band without changing its height** — the case a resize-only listener misses
  entirely. The settle re-checks exist because iOS applies its own scroll adjustment on a
  cadence of its own, sometimes after the event that announced the keyboard.
- **It does nothing when the field is already in the safe zone,** which is what keeps the
  re-checks free, stops a later viewport event yanking the panel, and prevents a tug of war
  with iOS's own adjustment.

It ignores controls that raise no keyboard (checkbox, radio, button, range, …) — scrolling
the panel for a tap that needed no room is a worse bug than the one being fixed.

**The bottom gap is 56px while the keyboard is up** (16px otherwise). iOS draws its accessory
bar — the ‹ › chevrons and Done — above the keyboard and does **not** count it in
`visualViewport.height`, so a field sitting just inside the computed band is still under real
chrome; the reported screenshot shows those controls overlapping the panel. 56 is read off a
photograph of a phone, which is evidence and not a measurement. **If it proves too tight,
this is the number.**

### Why this is not the filter panels' problem

The command palette, the Library and Add a slide never hit this: their field is at the top
of the sheet (or in a `PanelDock` at the bottom), so it is always in view and there is
nothing to scroll to. That is the "search panel behavior" this change generalizes. A settings
drawer cannot adopt it — its fields are wherever the setting belongs — so the behavior is
made explicit and shared instead of remaining a property of one layout.

Registered on `PanelSheet` rather than per drawer, which is what makes it true for all
eleven mobile panels at once — the same reasoning `useOverlayBack` and `useKeyboardInset`
already use, and the trap a body-level fix fell into one PR ago.

## Verified

- **Layout, on the real built Studio** (`astro build` + `astro preview` + real Chromium) at
  **390 / 820 / 1440**. At every width: label and input on one row, input height 36px, right
  edge within 1px of the Language and Theme controls'. The Marks tab (Header, Footer) checked
  the same way — its four rows now share one geometry with the Page numbers and Section rail
  switches. Screenshots taken and reviewed at each width.
- **The reveal, exercised on the built Studio at 390px:** with the sheet shrunk to a 336px
  keyboard's geometry and the focused Deck name field scrolled 433px above the visible box,
  a `visualViewport` resize pulled it back to 16px inside the top edge — `scrollTop` 527 → 74.
- **Mechanism, in unit tests** (`panel-keyboard.test.tsx`, 7 new cases): the reveal
  arithmetic, the band read from `visualViewport` rather than the container rect, the
  band-SHIFT (`offsetTop`) path, the accessory-bar clearance, the already-in-view no-op, the
  checkbox exclusion, and the listener lifecycle. The stub's field rect **moves with
  `scrollTop`** — not decoration: the reveal re-runs as the keyboard settles, and a frozen
  rect let a bug that applied the same delta three times pass the first cut of these tests.
  Mutation-tested: reverting to rect-only measurement kills **2**, dropping the accessory-bar
  gap kills **1**, dropping the `scroll` listener kills **1**.
- **A structural shell test** asserts the Deck name label and its input share a row
  container, so a revert to the stacked form fails rather than passing quietly.

### UNVERIFIED — stated, not glossed (HARD RULE #23)

**Real iOS Safari is not reachable from this sandbox.** Headless Chromium has no software
keyboard, so `visualViewport` never shrinks on its own and `--kb` is always 0; every
keyboard number here is *injected*. What that means concretely:

- The reveal was driven against a **synthetically** shortened viewport. It exercises the
  shipped hook against real layout in a real browser — it is not evidence about how iOS
  sequences focus, resize, band shifts and its own scroll-on-focus. **The first cut passed
  exactly this bar and did nothing on the device**, which is the honest measure of what this
  kind of verification is worth here.
- Whether 56px clears the iOS accessory bar is **untested on a device**, and neither is the
  `offsetTop` path — headless Chromium never shifts the band, so the branch that fixes the
  reported bug is the one the sandbox cannot execute. `?vvdebug` (`ViewportDebugOverlay`)
  prints `inner`, `visual` and `offset` on the real phone; if this needs a third pass, those
  three numbers settle it instead of another guess.
- The measurement run notes one harness impurity worth recording rather than hiding: the
  dispatched `resize` also re-runs `useKeyboardInset`, which recomputes `--kb` from the real
  (unshrunken) viewport and grows the sheet back. The reveal's arithmetic keys off the
  container's TOP edge, which does not move, so the result is unaffected — but the "after"
  numbers were taken against a box that had already re-expanded.

Both fixes want a pass on a real phone before they are called done.
