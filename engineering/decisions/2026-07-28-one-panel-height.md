---
status: shipped
summary: >
  The two-tier phone panel height (`auto`/`full`) is retired for ONE height, an inset
  of exactly the app header. Three measurements killed the tiers: with a keyboard up
  they already collapse to byte-identical geometry; the tier assignment is
  uncorrelated with what any panel's content wants (the SHORT tier held the two
  TALLEST panels); and the obvious replacement, a flat 88dvh, lands in three different
  places relative to fixed-pixel chrome across three phone heights. Also collapses four
  header heights to one, docks the three filter panels' search fields above the
  keyboard, and gives the empty states somewhere to live so dead air stops arguing for
  a shorter sheet.
last-updated: 2026-07-28
companion:
  - 2026-07-27-mobile-panel-framing.md
  - 2026-07-17-panel-drawer-cohesion.md
  - 2026-07-26-studio-mobile-eight-cell-bar.md
---

# One panel height

## How this was found

`2026-07-27-mobile-panel-framing.md` made every mobile panel a bottom sheet with one
radius and one 44px close, and introduced two HEIGHT tiers to replace five ad-hoc ones.
The report after it shipped was about the tiers:

> "i think if three categories of drawers. full, auto which i really don't fucking like
> and drawer with search function."

So the same method as last time: measure the twelve Studio drawers on the real built
site at 390×844 before proposing anything.

## What the measurement said

### 1. The tiers already collapse, in the state where height is most contested

`MOBILE_TIER.auto` was `100dvh - max(7rem, --kb)` and `full` was `100dvh - max(1rem, --kb)`.
Both `max()` calls resolve to `--kb` the moment the keyboard exceeds 112px. Forcing
`--kb: 336px` (a typical iPhone keyboard) and re-measuring:

| | top | bottom | height |
|---|---|---|---|
| every `auto` panel | 0 | 508 | 508 |
| every `full` panel | 0 | 508 | 508 |

Byte-identical. The distinction only existed with the keyboard *down* — i.e. it was
absent from every moment a user spends typing in one of these panels.

### 2. The tier tracked nothing

Each panel's content height, measured by neutralizing the tier (`height: auto`, every
inner scroller expanded) and reading the box:

| Panel | Tier | Gets | Wants | Result |
|---|---|---|---|---|
| Reader views | full | 828 | 310 | **518px dead** |
| Chat (empty) | full | 828 | 312 | 516px dead |
| Version history (empty) | **auto** | 732 | 224 | 508px dead |
| Library (empty) | full | 828 | 346 | 482px dead |
| Search / commands | full | 828 | 436 | 392px dead |
| Send feedback | full | 828 | 573 | 255px dead |
| Overflow "···" | auto | 732 | 495 | 237px dead |
| Settings | full | 828 | 925 | overflows 97 |
| Share | **auto** | 732 | 1008 | **overflows 276** |
| Coach | **auto** | 732 | 1140 | **overflows 408** |

`auto` — the SHORT tier — held the app's two TALLEST panels. The assignment is
uncorrelated with demand in both directions, which is what an axis produces when no
measurement can falsify it. "Do you work here, or do you pick and go" is that kind of
axis: Coach was `auto` and Chat was `full` though they are peer cells on the same bar;
Version history was `auto` and Reader views `full` though they are adjacent rows in the
same drawer card.

### 3. A percentage cannot hold a relationship to fixed-pixel chrome

The obvious one-tier replacement is a flat `88dvh`. Measured chrome, identical on every
phone: app header `0–54`, Eight-Cell Bar `54–102`, its captions `81–95`. Where 88dvh
puts the sheet's top edge:

| Phone | top edge | lands |
|---|---|---|
| 430×932 | 112px | clears the chrome |
| 390×844 | 101px | 1px into the bar cell |
| 375×667 | **80px** | **through the caption band** |

Same rule, three results. This is why the retired tiers were already written as insets
rather than percentages, and the replacement has to stay one.

### 4. `auto`'s reason for existing is inert

`auto`'s 7rem was justified as keeping the Eight-Cell Bar "whole and legible above the
panel." With a panel open, that bar is inside an `aria-hidden` subtree and the overlay
takes its taps — `document.elementFromPoint` over the Coach cell returns
`DIV.sheet-overlay` — while the cell goes on rendering in its PRESSED state, the
universal "tap again to close" signal. It is a picture of a control. Tapping it dismisses
the sheet via the scrim rather than toggling the cell.

That also cost the dismiss gesture: `auto` exposed 112px of tap-to-dismiss scrim and
`full` exposed **16px**, under half the 44px touch floor whose breach started this whole
line of work.

## The decision

**One height: `calc(100dvh - max(3.375rem, var(--kb,0px)))`** — an inset of exactly the
app header (`h-[54px]`).

- The app header stays whole and visible, so you always know which deck you are in.
- The Eight-Cell Bar is covered COMPLETELY at every phone height — no sliced captions,
  and no inert control pretending to be live.
- The 54px band clears the 44px touch floor as a dismiss target.
- ≈93dvh at 844, ≈92 at 667, ≈94 at 932: the *relationship* is constant and the
  percentage floats, which is the correct way round.

Three consequences fall out of it, and all three shipped in the same pass because each
one is load-bearing for the claim that the frame is the same everywhere:

**One header.** `PanelHeader` lost its visible `description` and its `eyebrow`. Between
them the app shipped four header heights — 56 (the drawer), 73 (title only), 92 (Version
history and Reader views, whose descriptions wrapped) and 125 (the Library, with its
search welded on). The rule that replaces them: **the header is identity, the body is
explanation.** `eyebrow` had zero call sites when it was removed; the one panel that
wanted one (Workspace) had hand-rolled an inline `your setup` *trailing* the title, in
the one position the slot did not support.

**One input position.** The three FILTER panels — Search / commands, the Library, Add a
slide — put their field at the top, so the control you touch was at the far end of the
screen from your thumb and the results ran away from the keyboard filtering them. They
now dock it at the bottom via `PanelDock`, which is the idiom Chat's composer already
had. List ORDER is deliberately *not* inverted: anchoring the field to the thumb is the
win, and renumbering a ranked list bottom-up would be a novel mechanic, which is the
thing this pass removes.

**One zero state.** `PanelEmpty` centers the blank slate and carries the sentence the
header used to. Version history was 73% blank under a single 12px line; Reader views
64%; the Library 32%. That dead air is what argues for a shorter sheet, and a shorter
sheet is how the tier system got built — so decoupling them keeps the height question
clean.

## What the fix measured, after

All twelve Studio drawers, same harness, rebuilt site:

```
top      [54]        ← one value
h        [790]       ← one value
header   [56]        ← one value
close    [44x44]     ← one value
scrim    [54]        ← one value, above the 44px floor
xScroll  [0]         ← no horizontal scroller nested in a vertical one
```

## Two things this pass got wrong first

**A Tailwind class built by interpolation ships no rule.** The height was first written
as ``h-[calc(100dvh-max(${APP_HEADER},var(--kb)))]``. That type-checks, lints, and
generates NO CSS — Tailwind's scanner reads source text, not evaluated template
literals — so every panel silently fell back to content height. It was caught only by
measuring the built site (HARD RULE #23): twelve drawers came back at twelve different
heights, 274px to 5133px. The constant is now spelled literally, with a note saying why.

**`var(--kb)` with no fallback invalidates the whole declaration.** `useKeyboardInset`
REMOVES the property on cleanup, so between panels `--kb` is unset and a bare `var(--kb)`
inside `max()` makes the height invalid rather than zero. Now `var(--kb,0px)`.

## What is deliberately still open

- **Subhead voices.** `PanelSection`'s mono-uppercase-10.5, Share's display-serif
  small-caps, and the Themes door's sentence-case 13px are still three treatments for
  one job. `PanelSection` also renders at 10.5px uppercase, which contradicts the
  StudioDrawer's own rule 4 ("no mono, no uppercase, nothing under 11.5px") — the
  primitive disagrees with the drawer that launches everything it styles.
- **Sub-navigation.** Five idioms remain: doors/push (the drawer), pill tabs (Library),
  a 2-up segment (Settings), pill chips (Workspace), filter chips (Add a slide). The
  drawer — the shallowest surface — is still the only one with a push model, while
  Settings, Workspace and Library have real depth and are flat.
- **Where the close button lands.** Six drawers return to the deck and six re-open the
  overflow, decided by which launcher you used. Reader views has both entry points, so
  its X does two different things. Left alone here on purpose: it is a navigation-model
  change, not a framing one.
- **Off-Studio drawers.** The Playground's two sheets, the site nav menu, the
  components-reference left nav and `MetricDetail` are still outside this grammar
  entirely — four of them are side sheets over a sliver of the app, and the
  components-reference nav is a hand-rolled `translateX` with no close button, no
  `role="dialog"`, no focus trap, no Escape, and `height: 100vh`. Scoped out by request;
  the inventory is in the PR that produced this doc.
