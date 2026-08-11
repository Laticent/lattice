---
status: shipped
summary: Four residues from #1563/#1581, closed together, and the one shape they turn out to share — plus the claim the adversarial trio refuted, which is the most useful thing in the note. The pre-paint split seed spent a saved PERCENTAGE without the panes' PIXEL minimum, so a share saved at 1920 painted a 298.3px preview and settled at 320px at 1194, and took the instant shell with it because the shell's slide is placed at a rect measured in a box that no longer existed. The first fix declared the minimum once and applied it pre-paint as a min-width, on the claim that for a two-panel flex row min-width IS the library's clamp. IT IS NOT: react-resizable-panels resolves an under-minimum size in TWO branches, snapping a collapsible pane below the MIDPOINT of collapsedSize and minSize to the 28px rail and only clamping above it — so the clamp-only model painted 320px where the app was about to show 28, 292px wrong for ~1.3s, worse than the defect it fixed, and preview-rect.ts had that rule written down since #1553. The sessionStorage collapse guard could not cover it either, because the marker is per-tab and the sub-minimum share is permanent — a guard is only as good as the shortest-lived thing it reads. What ships models both branches: PG_SPLIT_RAIL and a derived midpoint join PG_SPLIT_MIN, and the seed emits the clamp inside a viewport media query covering only the band where the library clamps. The Explore walk bar took ~100px off the deck a second after the deck was on screen (pane 720 → 619 at 1194x834, 680 → 571 at 390x844); the reserve #1581 built and withdrew is NOT rebuilt — the bar is chrome rather than walk state, rendered from the SSR'd markup with a height its contents cannot change, hidden by default so a boot that cannot resolve a view shows nothing rather than a dead nav, and its row rigid everywhere except the one item that truncates (nowrap stops a ROW wrapping, not a BUTTON — a long cross-component label grew the bar 20.8px at 390px and the first verification used a label too short to trip it). The collapsed-pane capture #1581 reasoned about was finally RUN and is safe for two independent reasons rather than the one the argument had. The shared header's palette select and mode toggle now resolve before paint on every page, painted from html attributes rather than written into the markup by a script racing the first frame. And the reason the worst defect got through: the oracle counts DISTINCT rects, so a first paint wrong by 292px for 1.3s scores better than a right one with an 86ms blip.
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

**The fix is to stop predicting the clamp and apply it** — publish `PG_SPLIT_MIN` once in
`pg-split.ts`, read by the `<ResizablePanel minSize>` that enforces it and by the seed that
has to anticipate it (the shape #1495 established for the bucket string), and let a
`min-width` do the arithmetic while `data-pg-split-seed` is up.

After: **one geometry**, 873/320 from t=375ms, and the shell fires at t=623ms where it used
to be missing entirely.

### The claim that was wrong, and cost the most

The first draft said this, in three places:

> `min-width` is not an approximation of that clamp, it IS it: a flex item whose min-width is
> violated is frozen at the minimum and the remainder goes to its sibling, which for a
> two-panel group is exactly what the library computes.

**That is false, and this repo already knew it was false.** `react-resizable-panels` resolves
an under-minimum size in TWO branches — `Z()`, which is what a `setLayout` RESTORE validates
through (a drag takes a different function, `le()`, with its own half-delta arithmetic):

```js
if (size < minSize)
  if (collapsible) { const mid = (collapsedSize + minSize) / 2;
                     size = size < mid ? collapsedSize : minSize; }
  else size = minSize;
```

Both Playground panes are `collapsible` with `collapsedSize={28}`, so the midpoint for the
preview is 174px. Below it the library snaps to the **rail**, not to the minimum. Measured on
the real page: a saved share resolving to 167px settles at 28; 179px settles at 320. Exactly
the midpoint.

So the clamp-only model painted a **320px preview where the app was about to show 28** — 292px
wrong, held ~1.3 seconds, on a share the divider leaves behind the moment it is dragged past
its minimum, which is a gesture the collapse button's own tooltip advertises. That is worse
than the defect it was written to fix, and `components/studio/preview-rect.ts` had the rule
written down since #1553, in the same words: *"clamping alone painted a 300px preview where
the app handed off to a 46px rail."*

**The `sessionStorage` guard the first draft added did not cover it, and could not.** It
skipped the clamp when a collapse marker was present — but the marker is per-tab while the
sub-minimum SHARE is in `localStorage` and permanent, so a **new tab** takes the clamp branch
and breaks. The transferable line: **a guard is only as good as the shortest-lived thing it
reads.** The predecessor's walk reserve failed because it was keyed on an absence with no time
bound; this failed because it was keyed on a presence with too short a one.

### What ships instead

`PG_SPLIT_RAIL` and a derived `PG_SPLIT_SNAP_MIDPOINT` join `PG_SPLIT_MIN` in `pg-split.ts`,
and the seed emits the clamp inside a **viewport media query** covering only the band where
the library actually clamps:

    T_pane = max(821, ceil(midpoint_pane × (a + b) / share_pane) + 1)

A media query rather than an `innerWidth` read on purpose: it needs no measurement and stays
right if the window is resized before hydration. The group spans the viewport on this surface
(873 + 320 + a 1px separator at a 1194 viewport), which is what makes the two interchangeable.
Below the threshold nothing applies and the raw share paints — what shipped before any of
this. Reproducing the *rail* pre-paint would mean modeling the snap too, and a mis-modeled
snap fails in the same expensive direction, so the seed declines instead.

Measured, both branches, against `origin/main` on the same experiment:

| | `main` | this change |
|---|---|---|
| above the midpoint (25% saved at 1920, reloaded at 1194) | 298 → 320, **2 geometries** | **320, one** |
| below it (dragged past the minimum, reopened in a new tab) | 17 → 320 → 28, 3 | 17 → 320 → 28, **3 — identical** |

The rules are generated from `PG_SPLIT_PANEL_IDS` and injected into `<head>`, which retires
the static CSS as well: it had restated both panel ids *and* the `a → editor` mapping that
only the seed established, with no gate — the same silent-drift surface #1495 exists to close.

Three mechanics that cost a round each:

- **`!important` is load-bearing.** The SSR'd panel wrapper carries `min-width:0` INLINE, so a
  plain stylesheet rule loses. The first attempt did nothing at all for this reason.
- **Setting the style on the ELEMENT instead would be worse than losing.** It would win the
  cascade and then never be undone: React's prop record would still read `0`, so the library
  would never write over it, and the clamp would outlive the seed for the life of the page.
  The same React-19 inline-style trap the predecessor note is half about, from the other side.
- **The clamp must die with the seed.** `adoptBootSeed` drops the attribute alongside the
  view/pane ones, or a collapsed pane could never reach its rail.

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

Two things had to be true for that to work, and the first draft got both of them only
half-right. **Recorded here rather than tidied away, because a per-frame sampler and a hostile
reader found them and the first verification did not.**

**The bar must be hidden by DEFAULT, not hidden in Edit.** The first draft kept the existing
`:is(:root[data-pg-view='edit'], body[data-view='edit']) .pg-walk { display: none }` and made
the bar always mounted — so whatever the CSS says with no boot view resolved is what a visitor
gets. It can be unresolved: the pre-paint seed's outer `try` opens with a `localStorage` read,
which THROWS where storage is denied (Safari's "block all cookies", a partitioned context, a
privacy extension), and `<body>` carries no `data-view` until the island mounts. Measured with
storage denied at `?view=edit`: a **93px dead nav bar in Edit for ~1.5s**, then a 93px jump
when it left — the same band this change exists to remove, on an error path that could not
produce it before the bar was always mounted. It is now `display: none` by default and Explore
reveals it; the same experiment now records the bar at 0px throughout and one pane geometry.

**And the height was still not invariant.** `flex-wrap: nowrap` stops the ROW wrapping; it
does nothing about text wrapping INSIDE a shrinkable item, and only `.next` had been hardened.
A long cross-component label squeezed Prev — which kept the default `flex-shrink: 1` — until
"‹ Prev" broke onto two lines: measured at 390x844 on the `matrix-grid` plan's last slide
("Next component: obligation-matrix →", 237px), the bar **101.48 → 122.28px** and the preview
pane 578.52 → 557.72, mid-read, at the exact moment the CSS comment names. The whole ≤390px
band was affected. **The first verification cleared this case with a shorter label** (`agenda`,
213.9px, below the ≈220px threshold) and reported "no height change when the cross-component
label appears at 390px" — a claim that was false when written. Prev and the position are rigid
now; re-measured Δ0 at 320 · 360 · 375 · 390 · 414 · 428 · 480 · 560 · 600 · 768 · 820.

So nothing is allowed to change the height:

- the row is `nowrap` AND every item in it except `.next` is rigid (`flex: 0 0 auto;
  white-space: nowrap`) — a wrapped row is a second height, and a wrapped BUTTON is too. The
  next button is the one elastic item and it truncates; its `aria-label` carries the whole
  string.
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

One more thing the bar owes, found by reading its a11y rather than its pixels: `.pg-walk-pos`
carries `aria-live="polite"` and is now SSR'd EMPTY, so a region already in the tree went from
nothing to "1 / 8" — a change, which assistive tech announces. The bar never did that when it
mounted whole. The attribute now arrives WITH the value, so it reads as a region that arrived
populated. *A pending state has to be pending to assistive tech too, not just to the eye.*

Verified: one preview-pane geometry for the whole load at both reference conditions, one on a
plan fetch that 404s (an inert bar, honestly empty, instead of a dead band), one with storage
denied, and Δ0 bar height across eleven widths when the cross-component label appears.

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

The rest is the boot-state channel the Studio already had, applied here — with one turn the
first draft did not take. A pre-paint script in `SiteHeader.astro` publishes `data-palette` and
the mode PREFERENCE (`data-mode-pref`) on `<html>`, and both controls are **painted from those
attributes**: PaletteControls renders every palette's label and all three mode icons, and CSS
shows the one in force. `PaletteControls` reads the same attributes in its first render so its
own state agrees. It lives in the header rather than in a per-route head script because the
header is the thing with the defect and it is on every page. (An earlier draft of this note
said it was "the only one on the landing, which has none" — false: `index.astro`,
`features.astro`, `comparison.astro` and `ComponentsLayout.astro` all carry a head palette
seed. What is true, and is the point, is that none of them VALIDATES what it stamps.)

**The first draft patched the trigger's text with a script placed just AFTER the markup, and
it lost the race about one run in three.** A per-frame sampler caught the un-seeded state at
t=114ms with the corrected one at t=177ms — a ~60ms flash of "Indaco"/System. The lesson is
sharper than "put the script earlier": *a script that has to beat the first paint of markup it
sits below is a race; setting an attribute the markup has not been parsed against yet is not.*
Moving the script above the header only works because the controls now read attributes rather
than needing their text rewritten.

Two more defects the trio found on this surface, both created by making the trigger truthful:

- **The seed normalized an unshippable palette without CLEARING it.** `syncFromStorage`
  re-reads the key at mount with no validation of its own and stamps it straight back, so a
  retired palette made the page paint the fallback and then flip to a theme whose CSS 404s — a
  flash that did not exist before, on every route except the Playground (whose head seed has
  always cleared the key, for the "blank in my browser, fine in private browsing" report). The
  seed clears it now.
- **The select's LIST kept ticking the old palette after a command-palette pick** — and
  re-picking the item radix already believes is selected fires no `onValueChange`, so the
  visitor could not get back to it at all. The desync is pre-existing (`storage` only fires
  cross-tab), but while the trigger was equally stale the control was at least *consistently*
  wrong; making the trigger truthful turned it into a contradictory one. `site-chrome` now
  announces a same-tab change and `PaletteControls` listens. **By this section's own standard
  — a control naming the wrong stop is worse than one naming none — that was this change's
  defect to fix, not to log.**

Two mechanics that cost a round each and are worth writing down:

- **A `<style set:html>` in an `.astro` component is not bundled into the head.** Astro emits
  it at the END of the body — after the header it styles. That reopened the same window in a
  different colour (no label at all, t≈165ms → t≈365ms). The per-palette rules are therefore
  handed to the seed through `define:vars` and appended to `<head>` by it, before the header
  is parsed.
- **A per-frame sampler must know when a control is half-PARSED.** The three icons are large
  inline SVGs, the parser yields between them, and a frame landing there sees a button with
  two icons and none lit — which reads as a second value and failed about one run in eight.
  That is absence, not a state a person sees. The sampler skips such a frame, and the case
  asserts the settled DOM really does hold all three so the skip cannot hide a regression.

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

## What the adversarial trio changed (HARD RULE #25)

Run against the pushed commit with CI green and the PR open, as the predecessor's was. It
changed the diff materially — which is the only evidence a verification pass was worth running
— and this time it did so on the piece the author was most confident about.

- **The Munger inversion pass refuted the central claim** (§#1589) by reading the library
  rather than the diff, and measured the 292px consequence in both directions. It also named
  the shape: a guard is only as good as the shortest-lived thing it reads.
- **The red team broke #1588's headline invariant** on its own reference viewport, and found
  the verification that had cleared it was run with a label too short to trip it.
- **The inversion pass found the walk bar's default-visible window**, and the red team found
  the palette-normalize-without-clearing flip and the command-palette dead control.
- **The independent checker took three attempts** — the first two died mid-run (an API error,
  then a session resume that killed the agent) — and the third earned the wait. It ran the
  vacuity audit properly: neuter the MECHANISM, rebuild, run the one case, revert. Eight of
  the ten new e2e cases fail under a targeted neutering of the thing they name, and cases 1
  and 2 each survive the OTHER's sabotage, so neither is riding on the other's branch. It
  found two cases whose comments claimed more than they proved (below), and confirmed all
  three of the load-bearing numbers it was pointed at: the threshold formula is exact at its
  boundary at two widths 870px apart (at `G=871` the pane is exactly 174.000 and the library
  clamps, matching `Z()`'s strict comparison); the group equals the viewport with a 1px
  separator at 900/1194/1440/1920; and the 174px midpoint is width-independent because both
  constraints convert against the same denominator.
- **Something the trio cleared, and it is the one I was least sure of:** the a11y of eighteen
  palette labels of which seventeen are `display:none`. The accessible name is `"Theme"` (from
  `aria-label`) and the value is the single visible label; the hidden seventeen are absent
  from the a11y tree, the mobile Sheet's second instance does not double-label, and no
  hydration mismatch appears on any of five routes. Also cleared: `280 + 320` never overflows
  down to 821px, and #1590's refusal held against mobile single-pane, un-fitted-slide windows,
  resize, two tabs and zoom.

**Two cases said more than they proved, and both are now written down honestly.**

- **The collapsed-capture case named the wrong guard.** Its comment said the sabotage proved
  `measureFit` refusing on the BOX, and the `[0, 0]` wrap assertion was sold as the operative
  cause. Remove only the box half of that guard and the case still passes: the preview iframe
  has no layout under a `display:none` ancestor, so the SECTION rect is 0x0 and short-circuits
  first. Remove both and it fails. The outcome it asserts is real; the mechanism it credited
  was not the one doing the work. (It also pointed at "the sabotage below" — there is no
  sabotage in the committed spec; the sabotages are a verification step, not an artifact.)
- **"The seeded controls still drive the site chrome" says nothing about the seed.** Neuter the
  pre-paint seed's two `setAttribute` calls — the entire pre-paint value of #1592 — and the
  three header cases fail while that one passes, because everything it asserts is satisfied by
  React writing the attributes after hydration. It is the right guard (a frozen-but-correct
  control would pass the other three), but its name and its first assertion read as evidence
  about the seeded stop. Renamed, and the assertion now says what it is for.

Both are the same failure of writing rather than of code, and both are the kind that decays
into a false claim of coverage the moment someone trusts the comment over the test.

**And one flake the checker's repeat runs exposed, in a case inherited from #1581.** The
boot-view parity table read `<html data-pg-view>` once, from outside the page, at
`waitUntil: 'commit'` — on the reasoning that "the head script has already run by then, since
it is inline and synchronous". A navigation can commit BEFORE the inline head script has run,
and under load in this sandbox it did, about one run in eight, reporting `null` as "the
pre-paint script published no boot view". The value has a window at both ends (the head script
opens it, `adoptBootSeed` closes it at mount), so reading it from across the wire is a bet on
landing inside that window. It now LATCHES the first non-null value from a `requestAnimationFrame`
sampler inside the page, which cannot be early or late — the same idiom the rest of this file
uses, for the same reason. Confirmed still non-vacuous: with the seed's `setAttribute` removed,
all nine cases fail.

**A note on the oracle, because it is why the worst of these got through.**
`assertOneGeometry` counts DISTINCT rects. A first paint that is wrong by 292px and held for
1.3s scores *better* than a right one with an 86ms blip — so a metric built to enforce "one
paint, never corrected in view" rewarded a change that made the single paint wrong. The
below-midpoint case added here asserts the VALUE of the first paint, not just how many there
were. If you add a case to this file, ask what it counts and what it would let through.

## Residues, again rather than averaged away

- **A pane heading for the rail still shows the minimum for a beat**, and this change
  deliberately does not fix it: the measured sequence is 17 → 320 → 28, where the middle value
  is the LIBRARY clamping — `collapsible` is `split.ready`, which is false during the
  backstop's first `setLayout`, so `Z()` takes the non-collapsible branch and clamps; the snap
  only happens once `ready` flips. Byte-identical on `origin/main`, so pre-existing and not
  this change's to carry, but it is the reason the below-midpoint band has three geometries
  rather than one. Gating `collapsible` on something earlier than a post-mount state flip is
  the next slice.
- **A caption longer than two lines is truncated on the phone.** The full text is on `title`,
  which a touch device cannot show. It is a net improvement over 22% of the viewport spent on
  prose that is already on the slide, but "read the rest" has no affordance; a tap-to-expand
  would cost a height change on user action, which is acceptable where a boot-time one is not.
- **`--pg-walk-cap-lines: 2` is a judgment, not a measurement, and the inversion pass priced
  it.** Across all 643 captions in the 61 staged plans: **632 need only one line at 1194px**,
  so the reserved second line is blank on 98% of desktop loads and costs ~19px (20% of the
  bar) permanently — to serve eleven slides. At 390px, 549 fit in one line and **32 are
  truncated by the two-line clamp, median 33% of the text lost**. One line would reclaim the
  19px and truncate eleven desktop captions that today lose nothing; two lines is the side of
  that trade this change picked, and it is a pick rather than a finding. The inversion pass
  argued for deleting the caption outright — 521 of 643 open with text that appears verbatim
  in the slide's own markdown — which is a product call, not this change's to make, and is
  logged rather than taken.
- **The header seed still runs at body-parse rather than in `<head>`.** It no longer needs the
  markup (it writes `<html>` attributes and appends a stylesheet), so it sits above the header
  and the measured flash is gone across eight consecutive runs — but it is above the header in
  ONE component, and a future page that renders header-shaped chrome before `<SiteHeader>`
  would be outside it. A head-level seed shared by every route would close that properly; the
  reason it is not done here is that `data-palette`'s head seeds are per-route today and
  unifying them is its own change.
- **With scripting off the theme select shows no label**, because the rules that reveal one are
  injected by the seed. It showed none before this change either — radix needs JS to portal the
  item text — so it is not a regression, but it is not the fix either.
- **A palette added to `PaletteControls`' `opts` at RUNTIME would render a blank trigger**, as
  the reveal rules are baked from the build-time list. Only the `__dbChrome` bus can widen
  `opts`, and nothing sets it any more (the Drawing Board is removed), so this is a trap in
  dormant code rather than a live defect — but it is the kind of "a new call site must
  remember X" that this repo normally gates, and does not here.
- **The pre-paint seeds are now load-bearing for correctness, not polish.** Three inline
  scripts on the Playground and one on every page of the site decide what is on screen. A
  future CSP that drops `unsafe-inline` would silently revert all of it. Nothing records that
  dependency but this line.
- **`docs/e2e/visual.spec.ts` "@visual studio renders at this viewport" fails in this sandbox**,
  identically on a clean rebuild of `origin/main`'s `docs/src` — the whole page is offset, which
  reads as a font/rasterizer environment difference rather than anything in this diff. Stated
  because "CI green" is not verification and neither is "it was already red".
- **A classic-scrollbar browser is UNVERIFIED for the media-query threshold.** The seed emits a
  VIEWPORT query for a GROUP constraint; a classic vertical scrollbar would make `innerWidth`
  exceed the layout box by ~15px and fire the clamp early inside that band. It cannot arise on
  this route — `/playground/` is `body { overflow: hidden }` and never scrolls — but this
  headless Chromium uses overlay scrollbars, so that conclusion rests on the non-scrolling page
  rather than on a measurement.
- **A ~1-frame third geometry exists on the snap branch** and the case cannot see it: the pane
  paints 174 → 320 → 28, with the 320 lasting ~18ms. It is the library's own
  mount-clamp-then-restore two-step (the seed's attribute is already gone by then), and the
  below-midpoint case asserts only the first and last entries, so it does not use
  `assertOneGeometry` and would not catch a fourth. Almost certainly pre-existing; recorded
  because it is the same blind-spot shape as the one above.
- **The fractional band `820 < w < 821`** has the split active (`@media not (max-width: 820px)`)
  while the seed's floor (`min-width: 821px`) is off. Reachable only by zoom or a fractional
  DPR, and only when the computed threshold was already below 821 — i.e. a large pane — so the
  residual error is a few pixels rather than 292.
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
