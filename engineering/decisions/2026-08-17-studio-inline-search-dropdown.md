---
status: shipped
summary: The ⌘K search becomes the Studio header's own expanding combobox instead of a centered overlay. #1707 framed the blocker — a dropdown that never painted — as an architectural fork between portalling the list (and exiling three unit tests to e2e) or taking the header's scroll valve away at desktop. Neither was needed: a live getComputedStyle walk up from the card found the last clip was the `Command` widget's OWN base-class `overflow-hidden`, one level BELOW the header every attempt had been aimed at. The header's `overflow-x: auto` clip is real and also has to lift, which is why lifting it alone (attempt 2) looked like a dead end — two clipping contexts, and clearing either one alone paints nothing. Fixing the widget's clip keeps the scroll valve (#1381), keeps the list in one DOM tree, and keeps all 92 unit tests as unit tests. Two defects the paint failure had been masking also surfaced: the open field sat 11px above the row's control line, and the root's `bg-popover` painted an opaque slab across a deliberately translucent header. Round three (2026-08-18) closes the two items that handback left open: the dropdown's height cap now knows about the software keyboard — it takes a third arm from `--vvh` via the same `useKeyboardInset` every mobile sheet caps against, turning the ≈0px margin computed at an iPad's landscape geometry into 12px, with the no-keyboard geometry unchanged at 100% zoom — and the hand-rolled dropdown container is re-litigated against the shared Radix `Popover` (HARD RULE #15) by BUILDING the non-portalled variant and measuring it: it paints, and even removes both clip workarounds, but it has to be told the offset the CSS derives, runs a measurement pipeline for a static position, wraps the listbox in `role="dialog"`, and needs seven props to switch its own behavior off. Rejected — and the one thing it would have bought, never thinking about the clips again, is bought instead as a regression test that fails if either clip returns.
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

## Round two — the owner's two calls, and the measurement that shaped one of them

After seeing the four surfaces side by side, the owner made two calls:
*"tablet portrait should use drop down too… no sense of having different behavior
for it"* and *"we should reclaim space by hiding everything to the right."* Both
shipped. The second one also retired a compromise this branch had made.

### 1. Everything right of the field yields while it is open

This is the half of the ORIGINAL ask that the first cut silently dropped. The
owner's opening words were *"search input expanding **and hiding items on the
right**"*, and the first implementation delivered the expansion but kept the tail
pinned — then reported the pinned tail approvingly (*"Present at x=1200, Share at
x=1301, identical open and closed"*) without checking it against what was asked.
It looked like a virtue because #1371 pins that tail deliberately.

Measured, it was close to the inverse of the request. Opening the field at 1440:

| Element | idle → open (before this change) |
|---|---|
| Deck title | 311 → **263px** (truncates) |
| Posture dial | x 390 → **342** (slides left) |
| Present / Share / feedback | **unchanged** |

The row was paying from the LEFT — the deck being searched within — while the
controls not in use sat still. At tablet it was worse: the field could not grow at
all, because that row's spacer is 0px.

With the trailing run hidden while open, the width comes from the right instead:

| Width | Field before → after | Deck title while open |
|---|---|---|
| 1920 | 720 → 720 | 188 → **188** |
| 1440 | 600 → **720** | **188 → 188** (was 311 → 263) |
| 1280 | 486 → **656** | 188 → 163 |
| 1160 Craft | 232 → **607** | 188 → 153 |
| 1100 Craft | 220 *(pinned at the floor)* → **561** | 188 → 138 |
| 834 tablet portrait | *overlay* → **376 inline** | 154 → 87 |
| 700 tablet floor | *overlay* → **272 inline** | 20 → 56 |

**It also dissolved this branch's worst compromise.** The narrow-desktop burst
(#4 above) forced the field's `min-width` down from 320 to 220 so the row could
not overflow. With the tail yielding there is simply room: the field at 1100/Craft
went from sitting *on* the 220px floor to 561px, and the floor no longer binds
anywhere. It is kept as a floor rather than removed — it costs nothing and it is
what stops a future row change reintroducing the collapse — but it is now genuinely
a floor rather than the number holding the design together.

At 1440 and up the deck title is fully protected. Below 1280 it still gives a
little, because the field's `flex-[1_1_720px]` basis is greedier than the row is
wide; that is the field taking slack it can actually use, not the title paying for
a control nobody is looking at.

### 2. Tablet opens the same dropdown — and why it still has no pill

The tier table below is rewritten: tablet no longer gets `CommandDialog`. What it
does NOT get is an idle pill, and that is a width fact rather than a preference.
Measured on the real row, the tablet header's flex spacer is **0px from 700 all the
way through 834** (900: 32px, 1024: 60px, 1099: 135px). Every pixel is spoken for,
with the deck title absorbing the pressure. A 34px icon pill would come straight
out of the deck title at every tablet width, and at the 700px floor it would eat a
spare budget `studio-header-fit` ratchets at 16px with about 3px of room in it.

So tablet keeps its existing launchers — the ⋯ menu's "Search / commands" row, and
⌘K — and pays **nothing** when idle, while the thing that opens is the same field
and the same dropdown. The distinction that matters: the owner objected to ⌘K
*behaving* differently by width, and it no longer does. The launcher differing
where there is physically no room for a pill is a separate question, and it is
flagged rather than settled — putting a pill there is available at the price of the
deck title, and that is the owner's call to make.

**This is also why the change is cheap.** Idle is byte-identical at every width, so
`StudioChromeSkeleton` needs no edit and `studio-shell-parity` is untouched — the
constraint that has governed every step of this branch.

**Phones keep the `PanelSheet`.** Its field docks at the BOTTOM, above the thumb
keyboard, which is a solved keyboard problem reported from a real device — not a
stylistic difference. Converting it would reintroduce that bug. The owner named
tablet portrait specifically; the phone is flagged, not assumed.

### What the open-state guard now asserts

`studio-header-fit`'s open-state test was rewritten for the new contract. It covers
**11 widths** — the whole tablet tier down to the 700px floor, plus desktop — and
asserts that the tail is **absent** rather than merely on-screen. That is a
stronger check than the one it replaces: the old version skipped any tail control
it could not find, which would have quietly passed a tail that rendered off-viewport.
It also pins the launcher difference **both ways** (pill at desktop, none at
tablet), so a tier silently losing or gaining its pill fails here instead of
hollowing the test into a no-op — the third time this file has had to close that
exact shape of hole.

## What the tier split is, stated as a decision rather than inherited

The issue flagged that ⌘K's *presentation* varies by width and asked for that to
be an explicit call. It is, and it stays as it is:

| Tier | Search surface | Why |
|---|---|---|
| desktop, ≥1100 | **inline field + dropdown**, launched from the pill | The pill is the trigger and becomes the field. |
| tablet, 700–1099 | **the same inline field + dropdown**, launched from ⋯ / ⌘K | Identical presentation; no pill only because the row measures 0px of spare from 700 through 834. |
| mobile, <700 | `PanelSheet`, field bottom-docked | The field sits directly above the keyboard — the same problem the owner's photograph shows, already solved on this tier. |

Exactly one surface mounts per width (`cmdInline` and `cmdPalette` are mutually
exclusive in `StudioShell.tsx`), so ⌘K never has two homes. Verified at the
boundary: 1100 → inline, 1099 → overlay.

**Logged, not fixed here (off-path, HARD RULE #18):** the *tablet* tier still opens
a centered dialog. Measured at iPad portrait (834×1194) that dialog sits y=422–772
with roughly 158px of clearance above the keyboard — so it is **not** a reproduction
of the photographed failure, contrary to what the first draft of this record said
(see the Verification section for the correction and the numbers). Extending the
inline treatment there remains a genuine design question rather than a port — there
is no pill in the tablet row to expand, so it would mean either giving that tier a
pill or anchoring a dropdown to a ⋯ menu item — but it is a **lower** priority than
the keyboard-aware height cap the same measurement surfaced. Both are named in the
handback rather than folded into this PR, which is already one feature (#17).

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

## A fifth: the field dropped focus on the floor

Radix restores focus to a dialog's trigger when the dialog closes. Replacing that dialog
with an inline field that **unmounts while focused** dropped focus to `<body>` instead —
so Escape-then-Enter did nothing and a screen reader lost its place in the row. APG's
combobox pattern asks for Escape to return focus to the combobox, and the collapsed pill
*is* the combobox.

Tab appeared to work, which is what made this easy to miss: Chromium resumes sequential
navigation from the removed element's position, and the pill re-renders at exactly that
position. That is luck, not behavior — and the source comment already *claimed* the
hand-back ("Escape closes and hands focus back"), which made the code read as correct.
An inaccurate comment is its own defect; it is corrected in place.

**Focus is reclaimed only when it was orphaned**, which is what makes one rule serve three
different dismissals correctly. Measured on the real surface, before → after:

| Dismissed by | `activeElement` before | after | Right answer |
|---|---|---|---|
| Escape | `BODY` | the pill | reclaim — nothing else asked for focus |
| Click into the editor | `MAIN` | `MAIN` (unchanged) | leave it — the user moved focus on purpose |
| Running a command | `BODY` / the command's own target | the pill / the command's target | reclaim only if orphaned |

Keying on *where focus is* rather than on *why we closed* is what makes the third row work
in both directions: a command that opens nothing leaves focus orphaned and gets the pill
back, while a command that opens a dialog has already taken focus and is left alone.
`wasOpen` keeps the effect from firing on mount, where the pill would otherwise steal focus
from the page on every Studio load.

Guarded in `command-palette.spec.ts` — both directions, in the real browser, because focus
is exactly what jsdom models loosely. **Verified able to fail:** with only the `focus()`
call removed, it reports `Escape must return focus to the collapsed combobox (APG), not
drop it on <body>`.

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

**And the keyboard margin is thinner than the first draft of this record claimed.**
That draft said the list "clears the keyboard". Measured rather than asserted, it
only just does:

| Orientation | Viewport | Search surface | Keyboard top | Margin |
|---|---|---|---|---|
| Landscape (the photo) | 1194×834 | inline list, y=61–**483** | ≈**481** (≈350pt kbd) | **≈0px — flush** |
| Portrait, before round two | 834×1194 | overlay dialog, y=422–772 | ≈930 (≈264pt kbd) | ≈158px clear |
| Portrait, **after** round two | 834×1194 | inline list, y=61–**483** | ≈930 | **≈447px clear** |

Round two improved portrait substantially without setting out to: the inline list
hangs from the header at y=61 instead of floating at the viewport's middle, so it
sits in the top 40% of the screen rather than the band the keyboard rises into.
**Landscape is unchanged and remains the only tight case** — the list's height is
capped at a flat 420px regardless of tier, so an 834px-tall viewport is where that
cap and the keyboard meet.

So in the orientation that prompted this work, the list ends within a couple of
pixels of where the landscape keyboard begins. It fits; it has no headroom, and a
keyboard carrying a predictive or emoji row would cover the last rows. The list's
height is capped by `max-h-[min(60vh,420px)]`, which at 834px tall resolves to the
**420px absolute arm** — a number chosen for laptop viewports, with no awareness
that a touch device raises a keyboard under it.

**This also corrects a second overstatement:** the first draft said tablet PORTRAIT
"reproduces exactly the occlusion the owner photographed". It does not — portrait
has 1194px of height and ~158px of clearance. The photo was landscape, and that
generalized from one screenshot to a tier that had not been measured. The
portrait/tablet follow-up is therefore **weaker** than first logged, and a
different question is stronger: **should the inline list's cap be aware of a
software keyboard at all?** The repo already has `hasFinePointer()` for exactly
this kind of coarse-pointer gating, and `visualViewport` is the API that actually
reports the keyboard. Deliberately NOT changed here: it cannot be verified from
this sandbox, and shipping an unverifiable CSS change to a touch surface is the
move HARD RULE #23 exists to prevent. It belongs with the touch/tablet work, with
this measurement attached.

Worth a tap on the real device before the issue is called closed.

---

# Round three (2026-08-18): the keyboard cap, and `Popover` re-litigated properly

Two items came back from the handback above. Both are settled here.

## 1. The cap now knows about the keyboard

The measurement in the Verification section is the whole argument: at the width this
feature was reported from — iPad Pro 11" landscape, 1194×834, ~350pt keyboard — the
list ran y=61→483 against a keyboard topping out at ≈481. **It fit by ≈0px.**
`min(60vh, 420px)` had no way to know, because neither arm shrinks for a keyboard:
`vh` is the LARGE viewport unit, and 420px is a number picked for laptop viewports.

The fix takes a third arm from the visual viewport rather than inventing a
measurement: `useKeyboardInset` (`components/ui/panel.tsx`) already publishes `--vvh`
— the height that is actually VISIBLE, keyboard subtracted — and every mobile sheet
already caps against it. The inline field mounts the same hook while it is open:

```
max-h-[min(60vh, 420px, calc(var(--vvh) - 54px - 24px))]
```

`54px` is the header's own `h-[54px]`, +8px for the card's gap below the bar and +16px so
the last row is not flush against the keyboard the way the measured case was. `_-_` in the
source is not decoration: `calc(var(--vvh)-24px)` is invalid CSS and the declaration is
dropped silently.

**Two numbers here shipped wrong for one commit and a checker caught both.** Worth recording,
because each was invisible in a different way.

**`3.375rem` was not 54px.** It was written to mirror `panel.tsx`, which spells the same
header that way — but that file composes it with `dvh`, while here the whole expression is px
against a header that is a fixed `h-[54px]` (`StudioShell.tsx`, both stops). `rem` follows the
browser's font-size setting, so at Chrome's **"Small" (12px root)** the term subtracted 40.5px
instead of 54 and **the card bottom returned to 483 — the exact flush-with-the-keyboard number
this arm exists to remove.** Measured across the setting, with `--vvh` forced to 484px:

| root font | cap | card bottom | clearance |
|---|---|---|---|
| 12px ("Small") | 419.5px | **483** | **1px** |
| 16px (default) | 406px | 469 | 15px |
| 20px ("Large") | 392.5px | 456 | 28px |
| 24px ("Very large") | 379px | 442 | 42px |

Direction was safe for large fonts and wrong for small ones. It is now `54px`. The `minfont`
e2e project could never have caught it: that project raises Blink's *minimum* font size, which
does not move `getComputedStyle(html).fontSize`, so `3.375rem` still measures 54px under it.

**The test written to catch the `_-_` typo could not catch it.** See §Tests below.

**Measured in real Chromium, before → after:**

| Viewport | `--vvh` | list cap | card | bottom edge |
|---|---|---|---|---|
| 1440×900 | 900px (no keyboard) | 420px | y=61 h=422 | 483 — *unchanged* |
| 1920×1080 | 1080px (no keyboard) | 420px | y=61 h=422 | 483 — *unchanged* |
| 1194×834 | 834px (no keyboard) | 420px | y=61 h=422 | 483 — *unchanged* |
| any | 484px (~350pt keyboard) | **406px** | y=61 h=408 | **469** |

So the landscape case goes from ≈0px of margin to **12px**, and it scales: a keyboard
carrying a predictive row shrinks `--vvh` further and the cap follows it down.

**Safe by construction, which is what makes it shippable without an iPad.** The new
arm sits inside `min()`, so it can only ever make the list SHORTER. At 100% zoom with no
keyboard, `--vvh` is the full viewport and the 420px arm still wins — which is why all three
no-keyboard rows above are byte-identical to what round two measured. The worst case
on a device this sandbox cannot reach is a slightly shorter list, never a worse
occlusion.

**IT ALSO SHRINKS UNDER PAGE ZOOM, and the first draft of this record said it did not.**
`visualViewport.height` is in CSS px, so it halves at 2× — it reports what is VISIBLE, and a
pinch shrinks that exactly as a keyboard does. Measured at 1194×834 with
`Emulation.setPageScaleFactor: 2` (the mechanism iPad Safari's pinch drives): `--vvh`
834→417px, cap 420→**339px**, card h 422→341. So "with no keyboard up the geometry is
unchanged at every width" — which was in the changelog, the source comment AND this record —
was false. All three now say what actually happens.

**Kept rather than fixed, because it is the right behavior.** A 420px list inside a 417px
visible band would have to be panned to read; a list that fits the band is correct. The rule
for anyone editing this: **the cap tracks VISIBLE HEIGHT, not "the keyboard"** — do not
re-derive it from `--kb`.

**One consequence left alone deliberately.** Under zoom the hook also publishes a `--kb` that
is not a keyboard — `innerHeight - vv.height` is the whole shrink, whatever caused it
(measured 417px at 2× with no keyboard present). That is pre-existing to `useKeyboardInset`
and inert here: an exhaustive grep of `docs/src`, `docs/public` and `lib/` found the only
consumers of `--kb`/`--vvh` are `MOBILE_OFFSET`, `MOBILE_HEIGHT` and `PINNED_FIELD_ROW`,
every one of them applied under a phone gate (`useIsPhone()`, a `mobile &&` call site, or a
`max-[699px]:` prefix), and none can mount at desktop/tablet. Correcting the arithmetic means
changing what every mobile sheet depends on, on devices this sandbox cannot test — a bigger
and far less verifiable change than the one it would fix. **Logged, not fixed** (HARD RULE
#18: pre-existing, off-path).

**Still UNVERIFIED (HARD RULE #23):** whether iPadOS reports *this* keyboard through
`visualViewport` at all. Headless Chromium raises no keyboard, so the arm that matters
never binds in the browser test either. What each surface can actually hold, and does:

- `command-palette-keyboard.test.tsx` — the WIRING: the listener mounts while the field
  is open, tracks the viewport, is REMOVED on close (a stale `--vvh` would cap every
  later surface against a keyboard that has closed), the mobile sheet mounts exactly one
  hook's worth of listeners and not two, and the cap still NAMES `--vvh`. Verified able to
  fail: with the hook commented out and the arm dropped, all three fail.
- `command-palette.spec.ts` — that the cap RESOLVES correctly in a real browser: its
  resting value, and its RESPONSE to `--vvh` being forced down to the band a 350pt keyboard
  leaves (484 → the list must cap to 406).
- the table above — the arithmetic, by forcing `--vvh` to that same band.

**The first cut of those two tests could not catch the one typo they were written for, and
that is the most useful thing in this section.** Both were shape checks:

- the e2e asserted `max-height` matched `/^\d+px$/`, on the reasoning that *"a dropped
  declaration reads as `none`, and nothing else would notice"*. **It does not read as
  `none`.** `CommandList` carries its own `max-h-[300px]` base class (`command.tsx`), so a
  dropped declaration falls back to **300px** — a silent 120px shrink at every desktop width
  that matches the regex perfectly. Measured on the branch build: with the cap class removed,
  `max-height: 300px`, `cardHeight: 302`, and every assertion in the guard still passed.
- the unit test matched `max-h-[min(…var(--vvh)…)]` against the class STRING, which cannot
  distinguish a live arm from a dead one — jsdom never resolves the value.

**And a correction to the correction, which is worth more than either.** Both the source
comment and the first draft of this section claimed the load-bearing hazard was the `_-_` →
`-` typo: *"`calc(var(--vvh)-78px)` is invalid CSS and would drop the whole declaration."*
**That is false on this toolchain.** Built with the un-spaced form, the generated CSS is
byte-identical — `calc(var(--vvh) - 54px - 24px)` — because Tailwind v4 normalizes the
operators itself. The underscores are convention and readability, not a correctness guard,
and a test written to catch that typo would be testing nothing. Two rounds of reasoning
rested on a hazard nobody had built; one build settled it.

So the regression both tests advertised passed both tests. The e2e now asserts by **value**
(`> 400`) and by **response** (force `--vvh: 484px`, the cap must become 406px, which only a
live `calc()` can do); the unit test's claim is narrowed to what it can actually hold — the
arm cannot be *removed* unnoticed.

**Both assertions verified able to fail, against real mutants, rebuilt each time:** delete
the cap class → `the cap resolved to 300px …`; delete just the `--vvh` arm → `with the
visible band at 484px the list must cap to 406px …, got 420px`. **The lesson generalizes past this file: when asserting that a Tailwind
declaration survived, assert the resolved VALUE, never its shape — the fallback is whatever
base class sits underneath, and base classes are exactly what this whole record is about.**

`useKeyboardInset` was documented as phone-only ("no keyboard to subtract anywhere
else"). That is now false and the comment says so: the second caller is a desktop-and-
tablet surface. The two callers are mutually exclusive by tier, so last-writer-wins is
still safe — **if a third caller ever overlaps one of them, this has to become
refcounted**, and that is written at the hook.

## 2. `Popover` vs. the hand-rolled container (HARD RULE #15)

Round two's answer was *"a Radix `Popover` was tried, it portals the list out of the
`Command` subtree, three unit tests broke."* That is an argument against **one spelling
of it**, not against the primitive — the honest question, and the one #15 actually
asks, is whether a NON-portalled `PopoverContent` should replace the div. So it was
built and measured rather than argued.

**It works.** `PopoverContent` gained a `portal={false}` mode, the inline branch was
rewired to `Popover` + `PopoverAnchor`, and on the real Studio at 1440 the card painted
at y=51 h=422 w=720 with 34 items, hit-testable, and clicking an item ran its command.
Better than that: Radix positions with `strategy: "fixed"`, which escapes overflow
clipping outright — so the spike painted **with both clip workarounds deleted**, the
`overflow-visible` on the `Command` root AND StudioShell's valve lift. Measured with
the header back on `overflow: auto` throughout.

**It was still rejected, and here is the honest ledger.**

For:
- deletes both clip workarounds and the coupling between `CommandPalette.tsx` and
  `StudioShell.tsx` that they create;
- outside-click dismissal and Escape come free from `DismissableLayer`;
- it is the shared primitive, which is what #15 asks for on its face.

Against, all measured:
- **It has to be TOLD the offset the CSS derives.** Anchored to the field, the card
  landed at **y=51 against a header bottom of 54** — three pixels *inside* the bar. The
  full-height root plus `top: calc(100% + 8px)` yields 61 with no number to maintain
  and nothing to re-derive if the header height ever moves. Moving the anchor up to the
  `Command` root fixes the offset and then breaks dismissal, because the content now
  sits inside the anchor and a click into the field reads as "outside".
- **It is a measurement pipeline for a static position.** floating-ui + ResizeObserver
  + rAF, to compute *directly under the field, exactly its width* — which is what
  `inset-x-0` and `top: calc(100% + 8px)` already say, synchronously and for free.
  (`--radix-popper-anchor-width` reported `0px` under jsdom, where every rect is 0×0.)
- **It wraps the listbox in a dialog.** `PopoverContent` renders `role="dialog"`
  (confirmed in `@radix-ui/react-popover` and live: `cardRole: "dialog"`). A combobox's
  popup *is* its listbox; cmdk already gives it `role="listbox"` and wires
  `aria-controls`. Not a demonstrated break — focus never enters the wrapper, so a
  screen reader is unlikely to announce it — but it is semantics pointing the wrong way.
- **Fitting it took seven props whose only job is switching Popover behavior off**:
  `portal={false}`, `avoidCollisions={false}`, `onOpenAutoFocus`, `onCloseAutoFocus`,
  `p-0`, `w-[var(--radix-popper-anchor-width)]`, and `onInteractOutside` — plus a new
  mode on a shared primitive that no other caller wants.

**The test that made the decision cheap.** Popover's one real win was never having to
think about the clips again. That is buyable directly, and it should have been bought
in round two: `command-palette.spec.ts` now asserts the card's box is real, starts at
or below the header's bottom edge, is HIT-TESTABLE at its own top rows (a clipped card
still reports a rect), and that the `Command` root has not been scrolled — *"the list
draws inside the bar, scrolled"* was the reported symptom, produced by a root scrolled
to 73px. **Verified able to fail, once per clip:** re-arming the `Command` root's
`overflow-hidden` fails it, and separately, removing StudioShell's valve lift fails it
— each with `the dropdown must clear the header, not draw inside the 54px bar`. Three
attempts missed this bug; nothing shipped in round two could have caught a fourth.

**What would change the answer.** A second surface needing an inline listbox anchored
to a bar control — then there is a widget to share, and the question becomes which
primitive it is built on, not whether five utility classes are a fork. As it stands the
primitive's value is computing a position we already know, and #15's target — *don't
fork a widget per surface* — is not what one `<div>` with `inset-x-0` is.

The shadcn combobox recipe the repo already has (`ComponentPicker.tsx`: `Popover` +
`PopoverTrigger` wrapping the whole `Command`) stays the pattern for a picker whose
field lives *inside* the popup. It cannot express this one, where the field is the
header row's own control and grows the row — that is the feature.

## 3. Logged in passing, not fixed here (HARD RULE #18: pre-existing, off-path)

Three things a checker surfaced that this change neither caused nor worsens. Recorded so
they are not re-discovered, and deliberately kept out of the diff so #17 (one feature, one
PR) and #8 (gallery isolation) stay intact.

- **A LANDSCAPE PHONE gets neither transport's keyboard handling.** `CommandPalette`'s own
  `mobile` is `useBreakpoint() === 'mobile'`, which EXCLUDES a landscape phone — so the
  `PanelSheet` branch (bottom-docked field, the solved keyboard case) does not apply there
  and it falls through to the `CommandDialog`, whose list keeps the base `max-h-[300px]` and
  has no keyboard awareness of any kind. `StudioShell` separately gates `inline` on a
  phone-INCLUSIVE `mobile`, so the inline field with its new cap does not apply either. The
  shortest viewport in the whole matrix (~390px tall, keyboard guaranteed) is the one with
  the least keyboard-aware search. Pre-existing since the sheet branch was written.
- **`--kb` is not a keyboard under zoom.** See the round-three §1 note; inert today because
  no consumer of `--kb` mounts above the phone tier.
- **`StudioShell.test.tsx` › "reaches Fabricate from the launcher (not a deck mode)" is
  flaky under parallel load** — it passes in isolation and timed out on roughly half of the
  full-suite runs on this machine (both this round's checker and an earlier session hit it).
  It has nothing to do with this diff — it does not use ⌘K at all — but it means any
  "3181/3181" claim about the full docs suite is a coin-flip reproduction, and it is worth
  knowing that before it is read as evidence of a regression somewhere.

## 4. Coverage this round did NOT add

The new paint + cap guard carries no project tag, so it runs on the **desktop** Playwright
project only. The tablet widths that justify the feature (820, 1194) have no paint guard of
their own. Not added here because the spec file's project membership is a config-level
change with its own blast radius; named so the gap is a known one rather than an assumed
cover.
