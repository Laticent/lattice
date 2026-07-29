---
status: shipped
summary: Two mobile defects in the Deck-setup drawer, reported from a real iPhone 15 Pro with screenshots. (1) The drawer shipped TWO row geometries — `Field` (label left, control right, help line below) for every dropdown and toggle, and `TextRow` (label, help line, then a full-width input) for Deck name, Header and Footer. `TextRow` now routes through `Field`: one geometry, right edges aligned, input height 32px → 36px to match `Control`, and the Deck name input 107px higher (measured at 390px). (2) `useKeyboardInset` shortens the mobile sheet and lifts it clear of the keyboard, but the sheet's SCROLL POSITION does not move, so a field two-thirds down the scroll region is below the shortened sheet's bottom — tapping Deck name put the keyboard over the field being typed into. TWO cuts of a `useKeyboardFieldReveal` hook tried to COMPUTE the field back into view (first from element rects, then from `visualViewport`'s band) and both were wrong on the device while passing everything the sandbox can run: `getBoundingClientRect()` is relative to the LAYOUT viewport, which iOS neither shrinks nor moves for the keyboard. Measuring the surface that already works ended the argument — the command palette's field is not in a scroll region at all: it sits in a `PanelDock` 21px above the sheet's bottom edge, pinned by layout, where Deck setup's sat 540px above it. The palette does not solve this problem, it does not HAVE it. So the drawer borrows the position instead of deriving it: `PINNED_FIELD_ROW` makes the row you are typing in `position: fixed` at `bottom: var(--kb)` — the same declaration as `MOBILE_OFFSET`, so the row and the sheet's bottom edge cannot disagree. `fixed` not `sticky`, measured: sticky works in isolation but left the row 20px below the scrollport in this drawer's flex chain. The reveal hook is deleted rather than kept as a belt — two mechanisms both guessing at a surface neither can see is worse than one that does not guess. Real-iOS behavior is still UNVERIFIED from this sandbox and marked as such.
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

It is still not enough. A field sitting two-thirds down the scroll region is below the
shortened sheet's bottom edge, because **the sheet's scroll position does not move.** Tapping
Deck name put the keyboard over the field being typed into: the panel showed its tabs and its
description, and the field was not on screen at all.

### Two cuts that computed, and were wrong on the device

The first fix was a `useKeyboardFieldReveal` hook that scrolled the field back into view by
comparing the field's `getBoundingClientRect()` with its scroll container's. It shipped. On
the device it did nothing — correctly, by its own logic: the field *was* inside the container.
`getBoundingClientRect()` is relative to the **layout** viewport, which iOS neither shrinks
nor moves for the keyboard; the **visual** viewport is what moves, and with the body
scroll-locked under a modal sheet iOS shifts it *down* (`offsetTop` > 0) rather than scrolling
the document.

The second cut read the band from `visualViewport`, aimed at the top of it, and added 56px to
clear the accessory bar. Also wrong on the device. Both passed everything this sandbox can
run, which is the honest measure of what that verification is worth for this surface.

### Measuring the surface that already works ended it

The command palette does not solve this problem — **it does not have it.** Measured at 390px
on the built site, with a focused field in each:

| | field inside a scroll region? | distance from the sheet's bottom edge |
|---|---|---|
| Command palette | **No** — it is in a `PanelDock` | 21px |
| Deck setup | Yes | 540px |

The palette's field is pinned by layout to the sheet's bottom edge, and `--kb` has already put
that edge above the keyboard. There is no arithmetic in it. Two rounds of refining a
calculation were spent reaching a position the layout can simply hold.

### What ships: the row pins itself

`PINNED_FIELD_ROW` (in `panel.tsx`, applied by `Field`). While you type in a settings row,
that row is `position: fixed` at `bottom: var(--kb)` — **the same declaration as
`MOBILE_OFFSET`**, so the row and the sheet's own bottom edge are positioned by one variable
and cannot disagree. If the sheet clears the keyboard, so does the row.

A panel with one primary field docks it in a `PanelDock`. A settings panel has many, wherever
each setting belongs, so it borrows the position instead — same destination, no DOM move, no
focus handoff.

Decisions worth naming:

- **`fixed`, not `sticky`** — measured, not assumed. `position: sticky; bottom: 0` is the
  tidier expression and it works in an isolated harness; in this drawer's chain, where the row
  sits two wrappers deep inside a flex-sized `overflow-y-auto` body, the row stayed **20px
  below the scrollport** with `position: sticky` and `bottom: 0px` both computed and applied.
  `fixed` does not depend on the scroll container at all. It is safe here because nothing
  between the row and the viewport carries a transform — checked on the built site, since a
  transformed ancestor would become the containing block and `bottom: var(--kb)` would then be
  measured from the sheet's already-lifted edge.
- **The LABEL+CONTROL row pins, not the whole setting block.** The help line stays in flow: a
  four-line description pinned over the deck would eat most of what a keyboard leaves, and the
  dock this imitates is one row.
- **`:has(input:focus)`, not `focus-within`** — a tapped dropdown in the same row would
  satisfy the latter, and a settings row leaping to the bottom because you opened a menu is
  worse than the overlap it fixes. Rows without an `<input>` carry the class inertly.
- **Phone only** (`max-[699px]`, the `useBreakpoint` mobile cutoff, so the shell and this
  switch on one authority). A pointer surface has no keyboard eating the viewport.
- **The reveal hook is deleted, not kept as a belt.** Two mechanisms both guessing at a
  surface neither can see is worse than one that does not guess.

## Verified

- **Layout, on the real built Studio** (`astro build` + `astro preview` + real Chromium) at
  **390 / 820 / 1440**. At every width: label and input on one row, input height 36px, right
  edge within 1px of the Language and Theme controls'. The Marks tab (Header, Footer) checked
  the same way — its four rows now share one geometry with the Page numbers and Section rail
  switches. Screenshots taken and reviewed at each width.
- **The pin, on the built Studio at 390px.** Unfocused: `position: static`, in flow. Focused:
  `fixed`, bottom edge at the viewport bottom (`--kb` is 0 with no keyboard). With a keyboard
  simulated at 500px: `fixed`, bottom edge at **344px — exactly the sheet's own bottom edge**,
  and the row visible. On blur: back to `static`, back in flow. Every other row stayed
  `static` throughout, so only the row being typed in pins. Screenshotted; it lands in the
  palette's position, hairline and all.
- **The declaration, in unit tests** (`panel-keyboard.test.tsx`, 4 cases). There is no
  arithmetic left to test, which is the point. What they hold is that the declaration is
  intact and correctly scoped: it pins on focus at `MOBILE_OFFSET` (asserted against the
  constant, so the row and the sheet cannot drift apart), it carries a stacking order and an
  opaque background, every declaration is phone-scoped, it keys off `input:focus` rather than
  `focus-within`, and it survives as literal text — an interpolated Tailwind arbitrary variant
  generates no rule at all, and this file already documents that trap costing twelve drawers
  their height.
- **The build output was checked, not assumed:** all five declarations appear in the shipped
  CSS inside `@media not all and (min-width:699px)`, and the prefixed class appears nowhere
  outside it.
- **A structural shell test** asserts the Deck name label and its input share a row
  container, so a revert to the stacked form fails rather than passing quietly.

### UNVERIFIED — stated, not glossed (HARD RULE #23)

**Real iOS Safari is not reachable from this sandbox.** Headless Chromium has no software
keyboard, so `visualViewport` never shrinks on its own and `--kb` is always 0; every
keyboard number here is *injected*. What that means concretely:

- The pin was driven with a **synthetically** set `--kb`. Two earlier cuts passed exactly
  this bar and failed on the phone, so it is worth being precise about why this one is a
  different kind of claim: those depended on the sandbox reproducing iOS's *viewport
  behavior*, which it cannot. This depends only on `--kb` being correct — and the command
  palette, on the user's own device, demonstrates that it is. The row is positioned by the
  same variable as the sheet, so the remaining question is not "is the arithmetic right" but
  "does the sheet clear the keyboard", which the palette answers yes.
- What is still unverified on a device: that `:has()` and the `max-[699px]` media query behave
  on that iOS version (both are widely supported, neither is exercised there from here), and
  that no ancestor gains a transform under a real keyboard, which would re-anchor the fixed
  row. `?vvdebug` (`ViewportDebugOverlay`) prints `inner`, `visual` and `offset` on the real
  phone if a fourth pass is needed.
- The measurement run notes one harness impurity worth recording rather than hiding: the
  dispatched `resize` also re-runs `useKeyboardInset`, which recomputes `--kb` from the real
  (unshrunken) viewport and grows the sheet back. The reveal's arithmetic keys off the
  container's TOP edge, which does not move, so the result is unaffected — but the "after"
  numbers were taken against a box that had already re-expanded.

Both fixes want a pass on a real phone before they are called done.
