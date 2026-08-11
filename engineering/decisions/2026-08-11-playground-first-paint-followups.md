---
status: shipped
summary: Four residues from #1563/#1581, closed together, and the one shape they turn out to share. The pre-paint split seed spent a saved PERCENTAGE without the panes' PIXEL minimum, so a share saved at 1920 painted a 298.3px preview and settled at 320px at 1194 — and took the instant shell with it, because the shell's slide is placed at a rect measured in a box that no longer existed; the clamp is now declared once and applied pre-paint as a min-width, which for a two-panel flex row IS the library's clamp. The Explore walk bar took ~100px off the deck a second after the deck was on screen (pane 720 → 619 at 1194x834, 680 → 571 at 390x844); the reserve #1581 built and withdrew is NOT rebuilt — the bar is now chrome rather than walk state, rendered from the SSR'd markup with a height its contents cannot change, which also clamps a 289-character caption that made the bar 184px on a phone down to 101px. The collapsed-pane capture #1581 reasoned about was finally RUN, and it is safe for two independent reasons rather than the one the argument had. And the shared header's palette select and mode toggle — the select empty for 1.9–5.1s depending on the route, the toggle naming the WRONG stop for the same window — now resolve before paint on every page. The shape: three of the four are the same defect, and the answer is never a better prediction, it is removing the thing that has to be predicted.
---

# Four first-paint residues, and the shape they share

**Date:** 2026-08-11 · **Status:** shipped · **Issues:** #1589, #1588, #1590, #1592 ·
follows #1563 / #1581 (`2026-08-10-playground-assembles-in-view.md`) and #1553
(`2026-08-10-shell-app-boot-state-sharing.md`)

These four came out of #1581's own adversarial pass and its Residues section. They are not
one feature, but they are one *kind* of defect, and closing them together is what made the
kind visible.

## The shape, stated first because it is the transferable part

> A pre-paint side that has to PREDICT what hydration will produce is a second model, and
> second models drift. The durable fix is not a better prediction — it is removing the thing
> that has to be predicted: publish the number the other side already enforces, or make the
> value a constant, or render the box unconditionally so there is nothing to reserve.

#1581 left the rule *measuring beats mirroring*. This is the next one along: **not needing a
measurement beats measuring.** All three of the fixes below reach for it, and the one place
it does not apply (#1590) turns out not to need a fix at all.

## #1589 — the split seed spent a percentage against a pixel minimum

The saved layout is a pair of PERCENTAGES. Each pane also has a minimum in PIXELS
(`PG_SPLIT_MIN` — editor 280, preview 320), and a share that clears its minimum at the window
it was saved in can fall below it at a narrower one. The library clamps at hydration; the
seed did not.

Measured on the built site by driving the real divider to a 25% preview at 1920 and reloading
at 1194:

| t | editor | preview |
|---|---|---|
| 350ms | 894.8 | **298.3** |
| 1321ms | 873 | **320** |

The visible consequence was worse than 22px of divider. The instant shell places its cached
slide at a rect measured in a specific box, and refuses when the box differs — so a pane that
changes size between the replay and hydration meant **no shell at all**. `data-pg-shell` was
never set on any of these loads.

**The fix is to stop predicting the clamp and apply it.** `PG_SPLIT_MIN` is declared once in
`pg-split.ts` and read by both sides — the `<ResizablePanel minSize>` that enforces it and the
seed that has to anticipate it, the shape #1495 established for the bucket string. The seed
publishes it as `--pg-split-min-a/b` and `playground.css` spends it as `min-width` while
`data-pg-split-seed` is up. That is not an approximation of the library's clamp: a flex item
whose min-width is violated freezes at the minimum and the remainder goes to its sibling,
which for a two-panel group is exactly what the library computes.

After: **one geometry**, 873/320 from t=375ms, and the shell fires at t=623ms where it used
to be missing entirely.

Three details that cost time and are worth keeping:

- **`!important` is load-bearing.** The SSR'd panel wrapper carries `min-width:0` INLINE, so a
  plain stylesheet rule loses. The first attempt did nothing at all for this reason.
- **Setting the style on the ELEMENT instead would be worse than losing.** It would win the
  cascade and then never be undone: React's prop record would still read `0`, so the library
  would never write over it, and the clamp would outlive the seed for the life of the page.
  This is the same React-19 inline-style trap the predecessor note is half about, from the
  other direction.
- **The clamp must die with the seed, and it is skipped over a collapsed pane.**
  `adoptBootSeed` drops the attribute alongside the view/pane ones. And when a collapse is
  stored, the seed does not apply the clamp at all: that pane is heading for its 28px rail,
  not its minimum, and the saved share in that state can itself be below the minimum
  (measured 2.347%, i.e. the rail's own width) — clamping it would paint 320px and snap to 28,
  turning a load that happens to be right today into two geometries. **That is a regression
  this change would have created, caught by driving the collapse before shipping** (#18); the
  collapsed pane's own late jump is a separate pre-existing gap the boot-state note records.

## #1588 — the walk bar, by removing the thing that had to be reserved

In Explore the bar mounts only once the component's plan has been fetched, and takes ~100px
off the preview when it does. Measured at CPU 6x: the pane 720px until t=1366ms and 619px
after at 1194x834; 680 → 571 at t=1564ms at 390x844.

#1581 built a reserve for that band from a stored measurement and withdrew it. The reasons are
in that note and they all hold: the only height available to reserve from is the caption of
the slide the LAST session ended on, while the band belongs to the FIRST slide of the next
boot; and keyed on the bar's absence with no time bound, a plan fetch that 404s left a
permanent dead band.

**So do not answer the question better — delete it.** In Explore the walk bar is *chrome*, not
walk state. It is now rendered unconditionally, in the server-rendered markup, before any plan
exists, and only its CONTENTS wait for the network: the steppers are disabled and the position
reads nothing, which is the `pending` shape #1581 gave the component picker, applied to a box
rather than to a value.

That only works if the height cannot then change, so nothing is allowed to change it:

- the row is `nowrap` — a wrapped row is a second height, and the label that would wrap it
  ("Next component: kpi →") appears exactly when the visitor reaches the end of a plan,
  mid-read. The next button truncates; its `aria-label` still carries the whole string.
- the position holds a fixed 4em slot, so the steppers do not slide sideways when the numbers
  arrive — nor again on the step from "9 / 12" to "10 / 12".
- the caption box is exactly two lines whatever it holds, including nothing.
- a notice shares that line-box rather than adding one.
- the caption's `<p>` gets `margin: 0`. The UA's 1em block margin was adding **26px** to every
  bar and quietly making the container's own `gap: 6px` a fiction — the bar measured 100.64px
  where its declared parts sum to 74.64px.

**Clamping the caption is a win, not a cost, and measuring it is what settled that.** The
longest caption in the 61 staged plans (`math`, 289 characters) rendered five lines on a
phone: a 184px bar, 22% of an 844px viewport, for prose *already printed on the title slide
above it*. It is 101px now, with the full text on the element's `title`.

Verified: one preview-pane geometry for the whole load at both reference conditions, one on a
plan fetch that 404s (an inert bar, honestly empty, instead of a dead band), and no height
change when the cross-component label appears at 390px.

## #1590 — the case that needed running, not fixing

A snapshot captured while the preview pane is collapsed to its ~28px rail, replayed into an
expanded one: `fit.boxW` would be a rail against a full pane, a ratio of ~23×, and the failure
would be a wildly oversized slide at first paint. #1581 gave two arguments for why it was
already safe and ran neither.

Driven through the real controls at 1194x834 — collapse, force a render and the leave-capture
a navigation fires, expand, reload — the capture returns null, the stored snapshot's `ts` is
unchanged, and the reload replays that previous good snapshot onto the live filmstrip within
**0.05px**.

**There are two independent guards, where the argument had one.** `.pg-preview-wrap` sits
inside the `.pg-pane-inner` a collapsed pane hides, so the box measures 0x0 — *and* the preview
iframe has no layout under a `display:none` ancestor, so the slide inside it measures 0x0 too.
Neutering either alone still refuses; the e2e case only fails when `measureFit` is made to hand
back a rail-sized fit outright.

That second guard is why the first sabotage attempt "passed" and looked like a vacuous test.
It was not vacuous — it was over-protected, which is a different thing and worth being able to
tell apart. **A test that survives your sabotage has two explanations, and "the test is weak"
is only one of them.**

## #1592 — the same defect in shared chrome, plus the one nobody had noticed

The header's theme `<select>` rendered empty and filled in with the persisted palette; and the
light/dark button rendered the Monitor ("System") icon at a visitor who had **pinned dark** —
a control naming the WRONG stop, which is worse than one naming none, and which was not in the
report. Measured at 1440x900, CPU 6x: both wrong from t≈145ms, corrected at t≈1.9s on the
component reference, t≈3.8s on the landing, t≈5.1s on the Playground. Three page families, one
shared component, on every page of the site.

Both answers were in `localStorage` before paint. Only the controls waited — and one of them
could not have spoken anyway:

**Radix's `SelectValue` with no children renders NOTHING.** The selected item's text is portaled
in by `SelectItemText`, and the items only exist once a layout effect has built the closed
content's `DocumentFragment`. So the trigger was empty in the SSR markup whatever the value
was — the `value` prop had never been able to reach the screen before hydration. Naming the
label as children (`<SelectValue>{label}</SelectValue>`) is what makes it plain text a seed can
then correct.

The rest is the boot-state channel the Studio already had, applied here: a pre-paint script in
`SiteHeader.astro` (body-parse, immediately after the island's SSR'd markup) writes the
visitor's palette into that text and publishes the mode PREFERENCE as `<html data-mode-pref>`;
`PaletteControls` resolves both from those attributes during its FIRST render, so hydration is
a no-op rather than a swap. It lives in the header rather than in a per-route head script
because the header is the thing with the defect and it is on every page.

Two things this taught that are not obvious:

- **`data-mode` cannot stand in for `data-mode-pref`.** System-resolved-dark and pinned-dark are
  the same resolved mode and a different STOP, and the icon names the stop (#1285). The
  preference needed its own published attribute.
- **The icon is three icons with CSS picking one, and that is not decoration.** The server
  cannot know the stop, so React choosing would put Monitor in the HTML and Moon in the
  client's first render — a hydration mismatch React 19 does not patch, which is the failure
  mode #1553 spent a whole section on. Rendering the same three on both sides moves the choice
  to an attribute the seed has already written. Where the DOM can be corrected in place (the
  select's label) the seed does that; where it cannot (which component renders), the choice
  moves out of React entirely.

`paletteLabel` moved to a React-free `lib/palette-label.ts` so the Astro seed shares the
derivation rather than restating it — the same reason `pg-split.ts` and `preview-rect.ts`
exist. The seed also normalizes an unshippable `data-palette` to one this build has, so the
seed and the control's first render cannot disagree about the fallback.

## Verification

Per HARD RULE #23, on the real built surface (`astro preview` on a production build), at the
cards' conditions, driven through the real controls — the divider by its ARIA arrow-key resize
(a synthetic mouse drag on this splitter is documented as not re-engaging after a reload), the
walk by its own steppers, the collapse by the pane header's button, the palette by the real
`<select>`.

**Every new case is confirmed to fail when the thing it guards is sabotaged**, which on this
surface is not optional — #1581's own headline test could not tell a working instant shell from
an absent one, and two reviewers found that independently:

| case | sabotage that makes it fail |
|---|---|
| the split clamp | `min-width: 0 !important` in place of the seeded minimum |
| the Explore / phone / 404 walk-bar cases | put `<WalkBar>` back behind `{walk && …}` |
| the collapsed capture | `measureFit` returns a rail-sized fit instead of null |
| the header controls (all three routes) | early-return from the pre-paint seed |

Ten new e2e cases and five unit cases. The existing Explore case now tracks `previewPane` and
`walkBar` again — they were excluded with a stated reason, and the reason is gone.

## Residues, again rather than averaged away

- **A COLLAPSED pane still jumps on reload**, and this change deliberately does not fix it: the
  measured sequence is 28 → 320 → 28, where the middle value is the library clamping the saved
  share before the collapse restore (its own effect, `ready` + a double rAF) lands. The seed
  now declines to make it worse rather than making it better. It is the same pre-existing gap
  the boot-state note records for the Studio, in the same hook, and it is the obvious next
  slice.
- **A caption longer than two lines is truncated on the phone.** The full text is on `title`,
  which a touch device cannot show. It is a net improvement over 22% of the viewport spent on
  prose that is already on the slide, but "read the rest" has no affordance; a tap-to-expand
  would cost a height change on user action, which is acceptable where a boot-time one is not.
- **`--pg-walk-cap-lines: 2` is a judgment, not a measurement.** Two lines covers every caption
  in the staged plans at 1194px and clips the longest of them at 390px. A plan author who
  writes a longer caption gets less of it shown, and nothing warns them.
- **The header seed runs at body-parse, not in `<head>`** — it has to, because it writes into
  the island's SSR'd markup. On the landing the sampler's first frame with a header already
  shows the corrected value, but the window between the header markup and the script is a
  window, and a slow enough parse could paint inside it. The `@visual` baseline would not catch
  it; the per-frame sampler would only catch it intermittently.
- **`docs/e2e/visual.spec.ts` "@visual studio renders at this viewport" fails in this sandbox**,
  identically on a clean rebuild of `origin/main`'s `docs/src` — the whole page is offset, which
  reads as a font/rasterizer environment difference rather than anything in this diff. Stated
  because "CI green" is not verification and neither is "it was already red".
- **iPadOS Safari is UNVERIFIED**, as in the predecessor note. Every measurement here is desktop
  Chromium at iPad dimensions. #1591 — the `(pointer: coarse)` editor metrics — is untouched for
  exactly that reason: it needs a physical device, and the honest outcome from here is a
  check-list handed to a human, never a claim of coverage.

## The rule this leaves behind

> When a pre-paint side and the hydrated app must agree, ask first whether the pre-paint side
> can be relieved of the question. Publish the constraint the other side already enforces
> (#1589), make the value one that cannot vary (#1588), or render the box unconditionally so
> there is nothing to reserve (#1588, #1592). Predicting correctly is the last resort, not the
> first — and where you must predict, predict from a value the other side published, never from
> a re-derivation of how it will behave.
