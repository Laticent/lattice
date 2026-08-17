---
status: shipped
summary: The ⌘K search becomes the Studio header's own expanding combobox instead of a centered overlay. #1707 framed the blocker — a dropdown that never painted — as an architectural fork between portalling the list (and exiling three unit tests to e2e) or taking the header's scroll valve away at desktop. Neither was needed: a live getComputedStyle walk up from the card found the last clip was the `Command` widget's OWN base-class `overflow-hidden`, one level BELOW the header every attempt had been aimed at. The header's `overflow-x: auto` clip is real and also has to lift, which is why lifting it alone (attempt 2) looked like a dead end — two clipping contexts, and clearing either one alone paints nothing. Fixing the widget's clip keeps the scroll valve (#1381), keeps the list in one DOM tree, and keeps all 92 unit tests as unit tests. Two defects the paint failure had been masking also surfaced: the open field sat 11px above the row's control line, and the root's `bg-popover` painted an opaque slab across a deliberately translucent header.
---

# The Studio's inline expanding search, and the clip nobody had looked at

**Ask (2026-08-16, restated 2026-08-17):** *"i like the idea of search input
expanding and hiding items on the right and becoming a dropdown instead of a
popup panel."* The owner then sent a photograph of the live site on an iPad in
landscape: ⌘K had opened its centered `CommandDialog`, the software keyboard had
come up over the bottom half of the screen, and the palette was reduced to a
field, the word "Actions", and one clipped row — a command list you cannot read
while typing into it. That picture is the argument for this change; the rest of
this note is why it took four attempts to paint a box.

**That photograph is at 1194px** (iPad Pro 11" landscape), which
`use-breakpoint.ts` classifies as `desktop` (`> 1099px`), so it is exactly the
tier the inline field serves. Verified at that width: the field opens to 452px and
the list occupies y=61–483, entirely above where the keyboard lands.

## What #1707 believed, and why it was wrong

The issue's diagnosis was specific and, as far as it went, correct: the header is
`overflow-x-auto` (#1381, so a squeezed row stays reachable), **`overflow-x: auto`
computes `overflow-y` to `auto` as well**, and an absolutely-positioned child is
therefore clipped to the 54px band. Three attempts followed from it:

1. **A Radix `Popover` portal.** Visually correct. But portalling the list out of
   the `Command` subtree made cmdk's items stop responding to clicks *under
   jsdom*, failing three unit tests. React context crosses a portal, so filtering
   still worked; only the jsdom click path broke.
2. **Lift the header's clip while the field is open.** All tests stayed green.
   **The card still did not paint.**
3. **Remove `isolate` from the `Command` root.** `isolate` was opening a stacking
   context that trapped the dropdown's `z-50` beneath the editor pane. A real bug,
   correctly fixed — and the card still did not appear.

So the issue concluded the fork was architectural and asked for a decision
between **(a)** portalling and migrating the three tests to e2e, or **(b)** the
header ceasing to be a scroll container at desktop.

**Both options were answers to a question that wasn't the blocker.** Attempt 2
did not fail; it was *incomplete*, and because a partial fix and a wrong fix look
identical from the outside — nothing paints either way — the correct step got read
as a dead end and the search moved on.

## The actual cause, found by walking the chain in a real browser

The issue's own closing instruction was the right one: *check every ancestor
between the `Command` root and `<body>` … diagnose it in the real browser with
`getComputedStyle`, not by reading CSS files.* Done at 1920, the very first entry
in the walk — the `Command` root itself — reported:

```
DIV  flex h-full w-full flex-col overflow-hidden rounded-md bg-popover …
     flags: { overflow: "hidden/hidden", position: "relative" }
     rect:  { y: 0, h: 53 }
card       position: absolute, top: 61px, zIndex: 50, visibility: visible
     rect:  { y: -12, h: 422 }     ← unclipped rect, offset by the root's scrollTop
```

**`overflow-hidden` is in `Command`'s own base class** in
`docs/src/components/ui/command.tsx` — shadcn puts it there so a palette card
clips its own rounded corners. The dropdown hangs from that root, at `top: 61px`,
inside a box **53px tall that clips both axes**. The card was cut away by the
control it hangs from.

Two details confirm it rather than merely implicating it:

- The card's reported `y` was **−12**, not 61. The root had been **scrolled to
  73px** — `overflow: hidden` still scrolls programmatically, and something tried
  to bring the active item into view. That is precisely the symptom the issue
  describes in the header's voice: *"the list draws INSIDE the bar, scrolled, with
  the field hidden behind it."* The symptom was real; only its address was wrong.
- Setting `overflow-visible` on that root, changing nothing else, moved the card
  to `y: 61, h: 422` — below the 54px header, at full height, 34 items.

**Why three attempts missed it.** All three were aimed at the header, because the
header's clip is real, is documented, and explains the symptom perfectly. Nothing
about the symptom distinguishes "one clip left" from "wrong clip". A widget that
clips *itself* is also the last place you look when the box you are trying to
escape is visibly a bar: the mental model was "get out of the header", and the
first fence was inside the control.

## The decision

**Neither (a) nor (b). Fix the widget's clip; keep everything else.**

- **The list is NOT portalled.** One DOM tree, one source of truth for the anchor,
  and the card tracks the field's width and left edge with no measuring. The three
  unit tests stay unit tests — 92/92 still pass. Route (a)'s cost was real but it
  was being paid for a misdiagnosis.
- **The header keeps its scroll valve.** `overflow-x-auto` stays; it lifts only
  while the field is open, which is attempt 2 unchanged and still necessary. #1381
  never had to be re-litigated, so the "re-check the overflow bug at raised
  minimum font sizes" work route (b) demanded is not owed.
- **Corner clipping moves to the element with corners.** The card carries
  `overflow-hidden rounded-xl`; the field's wrapper does not need a clip at all.

The rule worth carrying out of this: **an absolutely-positioned child has to clear
every clipping context between it and its containing block, and a component's own
base classes are one of them.** When a popover does not paint, walk the chain from
the card outward and read the *computed* styles — including the element you just
wrote — before concluding the architecture is at fault. Two clips in series, each
sufficient to hide the card, is indistinguishable from one clip you cannot fix.

## Two defects the paint failure was masking

Neither is a regression this change introduced — both were latent in the WIP and
invisible while nothing painted. Both are fixed here (HARD RULE #18: they arrived
on the path of this change).

**The open field sat 11px above the row's control line.** `Command`'s base class
carries `h-full`, so in a 54px header the root is 53px tall and, as a
`flex-col`, top-aligned its 32px field at y=0 while every other control in the row
sits at y=10.5. The earlier verification measured the field's *width* (the number
the issue quotes) and never its `y`. Fixed with `justify-center` on the root
rather than an `h-8` override — and the full-height root then earns its keep,
because the card's `top: calc(100% + 8px)` measures from the **header's** bottom
edge instead of the field's, so the dropdown clears the bar with no magic offset
and nothing to re-derive if the 54px header height ever changes.

**The root painted an opaque slab across a translucent header.** The base class
also ships `bg-popover`, which resolves to `var(--bg)` (`tailwind.css:75`), while
the header is deliberately `color-mix(in srgb, var(--bg) 92%, transparent)`. The
field's own wrapper carries the surface it needs (`bg-card` + a border), so the
root is now `bg-transparent`.

## What the tier split is, stated as a decision rather than inherited

The issue flagged that ⌘K's *presentation* varies by width and asked for that to
be an explicit call. It is, and it stays as it is:

| Tier | Search surface | Why |
|---|---|---|
| desktop, ≥1100 | **inline field + dropdown** | There is a pill in the row to grow, and free space to grow into. |
| tablet, 700–1099 | `CommandDialog` | No pill renders here — search is reached through the ⋯ menu, so there is nothing to expand in place. |
| mobile, <700 | `PanelSheet`, field bottom-docked | The field sits directly above the keyboard, which is the same problem the owner's photograph shows, already solved on this tier. |

Exactly one surface mounts per width (`cmdInline` and `cmdPalette` are mutually
exclusive in `StudioShell.tsx`), so ⌘K never has two homes. Verified at the
boundary: 1100 → inline, 1099 → overlay.

**Logged, not fixed here (off-path, HARD RULE #18):** the *tablet* tier still
opens a centered dialog, which on an iPad in **portrait** (834px) reproduces
exactly the keyboard-occlusion the owner photographed — the tier below the one
their screenshot was taken at. Extending the inline treatment there is a genuine
design question, not a port: there is no pill in the tablet row to expand, so it
would mean either giving that tier a pill or anchoring a dropdown to a ⋯ menu
item. It is named in the handback rather than folded into this PR, which is
already one feature (#17).

Also unchanged and pre-existing: cmdk does not set `aria-activedescendant` on its
input even while an item carries `data-selected`. That is shared by all three
transports (they mount the same `CommandInput`), so it is not introduced here.

## A third defect, self-inflicted, caught by widening my own probe

The first verification pass measured only the **Write** stop. #1707 quotes "369px at 1440"
where that pass measured 600px, and chasing the discrepancy to **Craft** — the tightest
desktop configuration, where the header carries its full control set — found a regression
this change introduced.

**With the field open at 1100 and 1160 in Craft, the row burst**: it needed 1200px, so
`scrollWidth` exceeded `clientWidth` by **100px and 40px**. The cause was the field's
`min-w-[320px]` floor. And this is worse than a cosmetic overflow, because the header's
`overflow-x-auto` scroll valve is deliberately **lifted while the field is open** — it has
to be, or the dropdown is clipped. So the row cannot be scrolled and the pinned
Present/Share/feedback tail simply leaves the screen unreachable. **That is precisely the
failure #1381 added the valve to prevent, reintroduced through the one state in which the
valve is off.**

**The floor was doing nothing except bursting the row.** Its stated purpose was "the field
must never open narrower than the pill", and `flex-[1_1_720px]` already guarantees that on
its own — measured natural widths with no floor at all: **187px @1100, 232 @1160, 263
@1200, 304 @1280**, every one wider than the 180px pill. (The "101px collapse" the floor
was written for belongs to an earlier revision that used a plain `flex-1`, which loses the
slack to the row's spacer.) Measured break-even at 1100/Craft: floor 240 → 20px over,
**floor 220 → 0px over**. The floor is now 220 — still above the pill, unable to burst the
row, and binding only at ≤1160 in Craft.

**Why no gate caught it, and the gate that does now.** Every existing guard measures the
header **idle** — `check:overflow` and `studio-header-fit.spec.ts` both assert
`scrollWidth <= clientWidth` on a row whose search is a closed pill. This is the same shape
of blind spot #1687 closed when a width-only oracle missed a *vertical* burst, and the same
remedy applies: when a guard misses a state, teach it the state. `studio-header-fit.spec.ts`
gains **"the inline search does not burst the row when it opens"** — it opens the field at
1100 / 1160 / 1200 / 1280 / 1440 / 1920 × all three stops and asserts self-overflow within
tolerance, no control taller than the header, and **every tail control still inside the
viewport** (the consequence that actually hurts a user, and one that can diverge from
`over`). 1160 is in that list precisely because it burst and is absent from the spec's own
`WIDTHS`.

**Verified able to fail:** rebuilt with the old 320px floor, the new test fails with
`the open search bursts the row at 1100px on Craft by 101px` — matching the 100px measured
independently by hand. A guard that has never failed is not known to work.

## A fourth: a unit test that encoded the old transport

`studio.controls.test.tsx` — "⌘K runs a command (Fabricate) and a theme" — scoped its
clicks to `role="dialog"` named "Studio commands". `matchMedia` is polyfilled to `desktop`
in that suite, which is now the inline tier, so there is no such dialog. It now asserts the
transport swap explicitly (the field is present, the dialog is **not**) and scopes to the
command list's own `role="listbox"`. What the test is about — that ⌘K *runs commands* — is
unchanged and still covered.

**This was missed on the first pass because `npm run build:e2e` is not what CI runs.**
`build:e2e` is `astro build` only; the `docs-build` job runs the **full** docs Vitest suite
(3159 tests) plus `npm run build`, which additionally runs `check-studio-shell.mjs`.
Running one test file (`StudioShell.test.tsx`, 92 tests) and `build:e2e` left both gaps
open, and CI found them. Run `cd docs && npx vitest run && npm run build` before claiming
the docs tier is green.

## Verification (HARD RULE #23)

Real headless Chromium driving the real Studio at `localhost:4321` against a
production `astro build` — clicking the real pill, not a harness. The port was
freed before each run: `playwright.config.ts` sets
`reuseExistingServer: !isCI`, and a stale server silently re-tests the previous
build (the trap that inverted a flake conclusion in the 2026-08-16 pass).

- **The dropdown paints outside the bar, both modes, both widths.** Screenshots at
  1440 and 1920 × light and dark. Card at `y: 61, h: 422` in all four; header
  bottom is 54, so `cardTop >= headerBottom` holds. 34 items.
- **The field is on the control line.** field `y=10.5 h=32` — byte-identical to
  Present (`10.5/32`) and the posture dial (`10.5/32`) in all four captures.
- **Expansion, at BOTH stops** (the coverage gap that hid the burst): Write —
  486px @1280, 600 @1440, 720 @1920; Craft — 320 @1280, 418 @1440, 720 @1920;
  narrow desktop — 220 @1100-Craft (the floor), 232 @1160-Craft, 380 @1100-Write.
  Every one above the 180px idle pill. The known, accepted cost holds and is
  unchanged: the deck title truncates to `Markdown for the b…` at 1440 while open,
  restoring on close. At 1920 it does not truncate.
- **The row does not burst in any of them.** `scrollWidth === clientWidth` at
  1100 / 1160 / 1200 / 1280 / 1440 / 1920 × Write and Craft with the field open,
  and the field holds `y=10.5 h=32` in all of them.
- **The tail does not move.** Present at x=1200 and Share at x=1301, *identical*
  open and closed at 1440, so no click target shifts under the pointer when the
  field collapses (the #1371 invariant, and the reason a capture-phase dismissal
  is safe).
- **The interaction path, on the real surface.** Clicking "Workspace settings" in
  the dropdown opened the Workspace dialog and collapsed the search back to the
  pill; typing `resh` filtered 34 → 1; ArrowDown×2 selected "Reshape for a
  reader"; Escape restored the 180px pill; a click at (700, 700) dismissed.
  This is the path route (a) would have taken out of the unit suite.
- **AT wiring.** The input reports `role="combobox"`, `aria-expanded="true"` and a
  populated `aria-controls`; the list reports `role="listbox"`.
- **Owner's width.** 1194px: inline, card `y: 61, h: 422`, list wholly in the top
  483px of an 834px-tall viewport.
- **Gates.** `npm run lint` clean · docs `tsc --noEmit` clean · `npm run
  build:check` clean · docs `npm run build` clean (including
  `check-studio-shell.mjs`) · the **full** docs Vitest suite **3159/3159 across 240
  files** · `studio-shell-parity` + `studio-header-fit` **18/18**, the 18th being
  the new open-state guard (so the idle pill still matches the SSR skeleton
  control-for-control, no control outgrows the header, and the open field cannot
  push the tail off-screen) · `npm run test:e2e:smoke` **17/17**.

**UNVERIFIED:** real touch on a physical iPad, and iOS Safari — neither is
reachable from this sandbox. The 1194px result above is a desktop Chromium
viewport at the iPad's CSS width with a mouse; it establishes the geometry and the
layout tier, **not** the keyboard behavior on the device the owner photographed.
The claim that the list clears the keyboard is geometric: the list ends at y=483
and iPadOS's landscape keyboard occupies roughly the bottom 40% of an 834px
viewport. Worth a tap on the real device before the issue is called closed.
