---
status: proposed
summary: >
  Yes, build a shared app-UI layer on shadcn — but the folder of components is not the
  deliverable and never was. The repo already HAS an unusually good shared layer
  (`ui/panel.tsx`, 855 lines, ~60% commentary, every comment a measured defect). It fails
  for two reasons this investigation can measure. First, it shares CLASS STRINGS instead of
  COMPONENTS: `panel.tsx` exports 11 class constants against 2,722 inline class-string
  occurrences, so a consumer imports the geometry and re-invents the typography — which is
  how `SlideContext.Row` and `StudioShell.Field` became the same component differing by
  `my-1.5` vs `my-2`, and how `PanelBody`'s scroll+touch contract came to be copy-pasted
  inline in 10 places. Second, adoption is by convention, which this repo has now falsified
  ten times: across 18 cohesion passes, every repair that DELETED the alternative held, and
  every repair that shipped "primitive + standing rule" decayed within days. Under it sits
  the structural cause — the shadcn token bridge carries color, radius and font and NOTHING
  dimensional, so the app has 26 distinct `text-[Npx]` sizes over 1,037 occurrences and four
  bar heights, while the slide side is held to a gated 12-token `--fs-*` scale and a
  hex-literal budget of zero. Lattice tokenized the artifact and left the app untokenized.
  Recommends: add the missing dimensional tokens, promote the seven measured reinventions
  (most are ADOPT-and-delete, not build), write the app-UI spec that does not exist, and land
  each primitive in the PR that deletes its alternatives. Recommends AGAINST a package —
  one consumer, three hard technical blockers, and an owner ruling already on the record.
---

# The app-UI component library

**Date:** 2026-09-07
**Status:** Proposed — investigation complete, four decisions open for the owner (§11).

## The ask

*"We use shadcn under the hood but part of me is that we are duplicating what could be
reusable components… whether we can and should create a shared component library built on
top of shadcn so we are not reinventing the wheel… The design language for Lattice should be
consistent. Top navbar proportions, input behavior inside of panels on mobile, search input
behavior and look, location of close cross button."*

With an explicit guard: **"we shouldn't try to fit a round hole into a square peg."**

## Answer first

**Yes — and the four surfaces you named are all symptoms of one cause, which is not "we
never built a shared layer."**

We built one. `docs/src/components/ui/panel.tsx` is 855 lines, roughly 60% commentary, and
almost every comment records a defect somebody measured on a real device. It is better than
most design systems' equivalent. It is also bypassed by 65% of the surfaces it exists for.

The layer fails for two measurable reasons, and both have the same fix.

**Failure 1 — we share class strings, not components.** `panel.tsx` exports `SETTING_ROW`,
`SETTING_LABEL_COL`, `SETTING_CONTROL_COL`, `PINNED_FIELD_ROW`, `PANEL_SEARCH_BOX`. A
consumer imports the string and rebuilds the JSX around it, so it inherits the geometry and
re-invents everything the string does not cover — margins, label type, help placement,
description styling. Eleven shared class constants stand against **2,722 inline class-string
occurrences**.

**Failure 2 — adoption is optional, and this repo has falsified that approach ten times.**

## The empirical law

Eighteen cohesion passes are on the record between 2026-06-09 and 2026-09-05. Sorted by
whether the fix held, they split perfectly:

**Held — every one deleted the alternative or moved the rule below its consumers.**
`TopBar.astro` deleted (06-18). `ui/split.tsx` + `use-panel-width.ts` deleted (07-19). The
slim `<header>` branch deleted (09-05). The wheel rule moved into
`lib/core/present-transport.mjs` (08-10). The 44px close target fixed *in the vendored
`dialog.tsx`/`sheet.tsx`* rather than per panel (07-27). `--kb` subtracted once in the shell
instead of per surface. These are prevention because nothing is left to diverge from.

**Decayed — every one shipped a primitive plus a standing rule.**
`panel.tsx` (07-17) → four entry edges, five heights, three close sizes eleven days later.
`ui/switch` (07-13) → a hand-rolled holdout two days later, sitting *between two adopters*.
`PillTabs`, declared "the ONE pill-tab implementation" → forked twice by 07-28.
`PanelSection`, whose own docblock called it "the one subhead grammar" → one consumer, and
the subhead now ships in four voices. `icons.ts` (07-26) → two files importing raw icons in
the same PR.

Ten of the eighteen passes shipped exactly that second kind. The team wrote the law down
itself, in `2026-07-17-panel-drawer-cohesion.md`:

> "a primitive nobody is required to adopt only guarantees cohesion where it is wired"

and in `2026-07-27-mobile-panel-framing.md`:

> "Cohesion by convention decays the moment nobody is required to follow it."

**So the shipping rule for anything this investigation proposes is: a primitive lands in the
PR that deletes its alternatives, or it does not land.** No more "foundation + first
consumer" landings. That pattern is 0-for-10 here.

## The structural cause: a token system with no dimensions

`docs/src/styles/tailwind.css`'s `@theme inline` block maps 33 aliases. Every one is a
**color**, plus `--radius` and two font families. There is not one token for height,
spacing, control size, or touch target.

The consequence, measured over `docs/src`:

| | app UI (docs/src) | slide engine |
|---|---|---|
| Type scale | **26 distinct `text-[Npx]` values, 1,037 occurrences** — 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 18, 19, 20, 24, 26 | a 12-token `--fs-*` role scale, **gated** (HARD RULE #4, `checkTypographyTokens`) |
| Color literals | 1,329 `var(--token)` occurrences — good | hex literal budget **0**, allowlisted, **gated** (HARD RULE #3) |
| Dimensions | **1,812 arbitrary size/spacing occurrences, 273 distinct** | `--space-*` / layout tokens, `margin` budget **0**, **gated** (HARD RULE #20) |
| Adoption gate | **none** — `tools/check-ownership.js` has 78 checks and not one looks at `docs/src/components/ui/` | 78 checks |

That is the whole story in one table. **Lattice tokenized the artifact and left the app
untokenized.** The four inconsistencies you named cannot currently even be *stated* in the
token system, let alone checked.

## The four surfaces you named, measured

### Top navbar proportions — 23 bars, 11 distinct height specifications

| Bar | Height | Padding | Gap |
|---|---|---|---|
| Studio app header (`StudioShell.tsx:4778`) + its SSR mirror (`StudioChromeSkeleton.tsx:173`) | `h-[54px]` | `px-2.5` | `gap-1.5` |
| Docs site header (`SiteHeader.astro:262`, bespoke `.sh-*` CSS) | `3.75rem` = **60px** | `0 24px` | `0.75rem` |
| Every `PanelHeader` (`panel.tsx:595`) + drawer nav (`StudioDrawer.tsx:328`) | `h-14` = **56px** | `px-3.5` / `px-2` | `gap-3` / `gap-2` |
| Fabricate / FinishStudio / MotionStudio pane bars | `h-[50px]` | `px-3` | `gap-2` |
| Two more Fabricate pane bars | `h-[44px]` | `px-3` | `gap-2` |
| Playground toolbar (`playground.css:30`) | auto, `8px 16px` | `16px` | `8px` |
| Edit / preview bars, overlay bars, in-panel bars | `py-1.5` · `py-2` · `py-2.5` · `py-3` | `px-2`…`px-4` | — |

**Across 23 bars: 11 distinct height specifications, 7 distinct horizontal paddings, 6
distinct gaps.** The `h-[50px]` string is byte-identical in all three files that use it. Only
two pairs are deliberately pinned to each other — the app header and its SSR mirror (a parity
spec), and `PanelHeader` with the drawer nav.

`panel.tsx:592` says its `h-14` is "the SAME 56px the StudioDrawer's own nav bar uses, so the
two agree" — and they do agree, with each other, while disagreeing with the app header two
pixels away and the site header six. The 54px number itself is written four ways: `h-[54px]`
in two files, `3.375rem` in `panel.tsx:178`, and prose in `panel.tsx:88,142` and
`CommandPalette.tsx:380`.

### Close cross button — 12 hand-rolls, targets from ~16px to ~48px

Five primitive definitions cover 35 instances; **18 more close/dismiss affordances are
hand-rolled**. Across all of them there are **11 distinct hit-target specifications** —
`size-[30px]`, `h-11`, `size-6`, `size-6`+`pointer-coarse:size-11`, `size-8`, `p-1`, `p-1.5`,
`p-0.5`, `px-1 py-0.5`, `px-3.5`, and none at all (`StudioShell.tsx:3527` is a bare
`<button>`). Placement is not settled either: three Fabricate bars put the X **leading**, as
does `PresentOverlay.tsx:1773`, while every `PanelHeader` puts it trailing. Two sites still
render a raw glyph rather than the icon — `✕` at `PlaygroundApp.tsx:1647` and `×` injected via
`textContent` at `vetrina.astro:239`. Many targets — the floor `2026-07-27` describes as having "held inside the
drawer and nowhere else. That floor is the stated reason the whole mobile toolbar was
redesigned. Every destination broke it." The one automated 44px assertion
(`docs/e2e/responsive.spec.ts:63`) covers **only the eight mobile bar cells**, not one panel
close button.

### Search inputs — 11 fields, 4 implementations, 3 with no keyboard support

`ui/input` (`components-ref/SearchControls`) · `CommandInput` (`site/CommandMenu`,
`playground/ComponentPicker`, `studio/reference-doc-ui`, `studio/CommandPalette`) ·
`PanelSearch` (`studio/Library`, `studio/SlidePicker`) · **raw `<input>`**
(`Fabricate:1066`, `ModelPicker:92`, `TtsModelPicker:85`, `VoicePicker:187`).

Counted by mount point that is **12 fields, 5 implementations, 8 distinct visual variants**
once per-call-site overrides are included. A leading search icon appears on 8 of 11; a clear
button on 2; a debounce on 1. Font sizes run 15px / 13.5px / 13px / 12.5px / cmdk default.

The three picker comboboxes have **zero `onKeyDown` between them** — no arrow keys, no
type-ahead. The documented iOS ban on Radix Popover inside a modal Sheet (§10) justifies not
using `popover`; it does not cover the missing keyboard handling, and `PanelSearch` is
exported for exactly this.

### Inputs inside panels on mobile — 51 of 53 declare a size that never applies

53 text/textarea/select/number fields render inside the app's 8 sheet and drawer hosts, from
6 different implementations (`Input`, `Textarea`, `SelectTrigger`, `PanelSearch`,
`CommandInput`, native). **Only 2 declare 16px** — `FeedbackSheet`'s pair, and only below
`md`. The other 51 declare 14px, 13.5px, 13.12px, 13px, 12.5px, 12.48px or 11.5px.

They do not actually zoom iOS, and the reason is worth stating precisely, because two places
in the tree give different accounts of it and one of them is wrong.

What saves them is the **unlayered** coarse-pointer net at `landing.css:213` — it matches
`input`, `textarea` and `select`, sets `font-size: max(16px, 1em)`, and beats Tailwind's
layered `text-[Npx]` utilities *because* it is unlayered. Its own comment says so, and
`landing.css` is imported by every page including `studio.astro`. `docs/e2e/ios-zoom.spec.ts`
guards it.

`command.tsx:92-95` credits a different mechanism: *"`.lx-ui input { font: inherit }`
(tailwind.css) outranks it, so every input in this app already renders at the inherited
16px."* That reset is at `tailwind.css:137`, inside `@layer base` (opened at `:123`), and the
layer order at `:22` puts `utilities` last — so the utility wins, not the reset. The comment's
conclusion also fails on a fine pointer, where the net does not apply and `text-[12.5px]`
renders at 12.5px.

So the state of this surface is: **51 field declarations state a size that is overridden on
the device the size was picked for, held up by a global net in a stylesheet named for the
landing page, with a comment elsewhere in the tree attributing the save to the wrong rule.**
The behavior is correct today. Nothing about it is legible, and no primitive owns it.

The same shape shows up without the safety net in `PanelBody`: the touch-scroll contract
`2026-07-17` put there so it would fix "every panel at once" is copy-pasted inline in **10
places across 8 files** (`GalleriesSheet:62`, `DeckSetupSheet:97`, `SlideContext:549`,
`Library:670`, `ReshapePicker:69`, `StudioShell:3633,3661,4026`, `SlidePicker:342,615`), each
with different padding. The next fix to that contract reaches 1 site of 11. And the two
Playground sheets, which use a raw `Sheet` rather than `PanelSheet`, get **none** of
`useKeyboardInset`, `MOBILE_HEIGHT` or `PanelDock` for their six fields.

### And the one you did not name, which is the clearest of all

**The same panel wears two different header voices depending on viewport width.**

Coach, Chat and Reader views render `PanelSheet` + `PanelHeader` on compact
(`StudioShell.tsx:5356,5366,5384`) — the correct 13px semibold sentence case. Docked, the
same three panels hand-roll `font-mono text-[11px] font-bold uppercase tracking-widest`
(`StudioShell.tsx:5279,5286`, `ArchitectChat.tsx:394`) — the voice `PanelSection`'s own
docblock retired, quoting the drawer's rule 4: *"At 10px on a phone it is the least legible
combination available."* The docked Inspector has no header at all. `Library` is the only
assistant-slot panel that gets it right in both transports.

## The scale of the duplication

| Measure | Value |
|---|---|
| Surfaces that are a sheet / drawer / docked panel | 34 |
| — using `PanelSheet` | **12 (35%)** |
| — using `PanelHeader` | 13 (38%) |
| — owning their own `SheetContent` | 5 (1 documented, 4 not) |
| — docked columns with a hand-rolled header | 4 |
| Raw `<button>` in Studio (non-test) | **272**, against **12 files** importing `ui/button` |
| — of which are `Button` variant look-alikes (heuristic floor) | 55 |
| Independent `Row` definitions | **8** |
| Subhead voices | **4** |
| Segmented-control implementations | 4, in 3 shapes |
| Distinct class strings repeated across ≥2 files | 228, covering 942 occurrences |
| Near-duplicate families (differ by 1–2 classes) | **186; 120 span ≥2 files; 781 occurrences** |
| Application components using `cva` | **0** (all 3 cva files are vendored shadcn) |
| Ad-hoc ternary class strings instead | **157 across 30 files** |
| Shared class constants | 11 |

Nine files **import `Button` and hand-roll anyway** — `Fabricate` (25 raw), `Library` (21),
`StudioChromeSkeleton` (13), `WorkspaceSheet` (12), `FinishStudio` (10), `StudioShell` (41).
The bypass is not ignorance of the primitive. It is per-site restyling, because the primitive
has no variant for what the site wanted and adding one is harder than writing a class string.

`StudioShell.tsx:5521-5709` is the tell: an undeclared settings design system —
`Field`, `Control`, `Toggle`, `TextRow`, `InspGroup`, `TabNote`, `More`, `RailOp`,
`ArchCard` — defined inside a 5,709-line file. Each has a near-duplicate elsewhere. The
comment at `:5593` states the pathology outright: `TabNote` and `SlideContext`'s `TabIntro`
are "same job… kept local to each file rather than shared because the two panels size their
type independently."

And `panel.tsx:827-843` already diagnosed the failure mode better than I can:

> "Near-identical is worse than plainly different: nothing distinguishes them, so every
> difference reads as an accident rather than a signal."

## The design model

Four axes. Options on each, then the recommendation.

**A — What unit do we share?** class strings (today) · components · components + tokens.
**B — Where does the layer live?** in `ui/` as today · a named tier inside docs · an extracted package.
**C — How is adoption guaranteed?** convention (today) · a build gate · deletion of alternatives.
**D — How wide is the mandate?** Studio only · every React surface · also absorb the bespoke CSS.

The drift history settles **C** empirically: convention is 0-for-10. It also constrains
**A** — a class string is not a unit you can delete an alternative to.

## Recommendation

**Build the layer. Three moves, in this order. Most of it is adoption, not new code.**

### Move 1 — give the app a dimensional token layer

Extend `@theme inline` with a small closed set: `--bar-h`, `--touch-min: 44px`,
`--control-h-{sm,md}`, `--icon-{sm,md}`, `--panel-w-{sm,md,lg}` (340/440/720 already exist as
literals inside `PanelSheet`), and a real app type scale to replace 26 ad-hoc pixel sizes.

This is the app-side analogue of HARD RULE #3, it is the smallest diff of the three, and it
is what makes "top navbar proportions" a checkable statement rather than a feeling.

### Move 2 — promote the measured reinventions, ranked by counted duplication

| # | Primitive | Build or adopt | Replaces | Count |
|---|---|---|---|---|
| 1 | `SettingRow` | **build** | `Field`×2 · `Row`×8 · ~13 named `*Row` variants | 3 disagreeing shapes |
| 2 | `PanelBody` | **adopt** | inline copies of its scroll+touch contract | 10 sites / 8 files |
| 3 | `PanelHeader` on docked columns | **adopt** | 4 hand-rolled docked headers | same panel, 2 voices |
| 4 | `IconButton` | **build** | raw `<button>` icon controls | 272 raw / 55 look-alikes |
| 5 | `SearchField` | **build** (= promote `PanelSearch`) | 4 impls over 11 fields | 3 with no `onKeyDown` |
| 6 | `SectionLabel` | **adopt** (= `PanelSection`) | 4 voices, 12+ class recipes | 12+ |
| 7 | `AppBar` | **build** | 54 / 56 / 50 / bespoke | 4 bar heights |

Four of seven are "adopt what exists and delete the copies." That is the cheap half and it
carries most of the cohesion win.

Give the built ones **`cva` variants**, not props with ternaries. Zero application components
use `cva` today while 157 hand-written ternaries do the same job — that is the mechanism by
which "add a variant" lost to "write a class string."

### Move 3 — write the spec that does not exist

`design/` is **entirely slide-side**. There is no document specifying the app UI's design
language, and CLAUDE.md's canonical-doc table has **no row for it**. The knowledge lives in
`panel.tsx`'s comment block and eighteen dated decision docs — excellent, and unfindable by
someone about to build the nineteenth surface.

Ship `engineering/app-ui.md` (bar proportions, touch floor, the type scale, close-affordance
placement, panel grammar, when a primitive is owed) plus the CLAUDE.md table row.

## Non-goals — the square peg guard

You asked for this explicitly, and the repo has already paid for most of these lessons:

- **Do not force Radix into modal sheets.** A Popover inside the Workspace `Sheet` portals
  onto the dialog's `pointer-events:none` layer, which real iOS Safari enforces against
  touch. The inline accordion IS the correct form (`2026-07-13`, §"WON'T DO").
- **Do not force the wrong primitive.** A swatch-dot row is not pill-tabs; a full-width
  segmented switch is not pill-tabs. `2026-07-13`'s sharpened rule: *"'Migrate everything
  native' is not the goal; 'share the right component where it's a genuine, verifiable
  improvement' is."*
- **Do not break the no-JS surfaces.** `SiteHeader`'s `<details>` menu is deliberately
  crawlable and SSR-only; Radix needs an island and regresses it.
- **Build and measure before rejecting or adopting.** `2026-08-17` re-litigated the
  hand-rolled search dropdown against Radix `Popover` by *building* the alternative and
  measuring it, then rejected it on evidence. That is the standard.
- **Respect the cascade.** `native-widgets.css` is unlayered and Tailwind utilities are
  layered, so a primitive **cannot** turn off the global focus ring with
  `focus-visible:outline-none` — it must use the `[data-focus-ring='container']` opt-out.
  This is the HARD RULE #26 trap in a different coat.
- **Do not absorb the bespoke CSS in this line of work.** ~3,300 lines across five files
  (`playground.css` 978, `landing.css` 434, `components.css` 363) are *unlayered*, so they
  beat Tailwind utilities, and the 06-09 rule requires a migrated surface to delete its
  bespoke CSS in the same change. That is a separate, larger call — see decision 2.

## Packaging: in-repo, not a package

**Recommend against `packages/ui`,** on four grounds:

1. **One consumer.** No `apps/`, no `packages/`, no Tauri artifacts anywhere in the tree. The
   desktop wrapper is a separate repo, described by `2026-08-09-org-rehost-playbook.md:112`
   as "the only external consumer this repo has… it lives elsewhere," and by
   `2026-06-14-read-aloud-kokoro.md:201` as having **no code yet**.
2. **You already ruled on this.** `2026-06-09-shadcn-migration.md` §0.2 planned `packages/ui`
   + `apps/desktop` and you overrode it: *"Website-only, inside `docs/`. NO monorepo,"* on
   exactly the ground that the second consumer had not materialized — while leaving the door
   open: *"extractable to a shared package later if a desktop app ever materializes."*
3. **Three hard technical blockers.** Tailwind v4 generates utilities by scanning **the
   consumer's** source, so a package outside the docs `@source` scan emits no CSS at all.
   `docs/` is not a root workspace member and installs from its own lockfile in its own
   working directory, so a root-workspace UI package and its only consumer would resolve from
   different trees. And the co-located-`package.json` toolchain split (Vite loads `dist/`,
   tsc loads source — "non-deterministic by disk state") is already a recorded falsified
   claim in `2026-07-08-library-shape-cadenza-vetrina.md:44-62`.
4. **The in-tree precedent that works is not a package.** `components/diagnostics/` is a
   shared UI layer with six consumers across site and studio, and it lives in `components/`.

The extraction cost stays low if you ever want it: only **two** imports in all 36 `ui/` files
escape both `ui/` and npm (`panel.tsx:10-11`).

## What I found that is broken independent of this decision

- **Two decision docs claim closed threads that are open.**
  `2026-07-17-panel-drawer-cohesion.md:112-114` marks "Full `PanelSheet`/`PanelHeader`
  migration of every sheet" **DONE**; it is done for the Studio's compact sheets only — not
  the site sheets, the playground sheets, the dialogs, or any docked column.
  `2026-07-13-native-widget-shadcn-ownership.md:333` says "the native-widget → shadcn thread
  has no remaining holdouts"; `StudioShell.tsx:3432` is a native `<select>`.
- **`panel.tsx:16-20` is stale** — still says "the primitive + its FIRST consumer
  (FeedbackSheet)… not yet repo-wide" after the 07-27 migration and nine renderers.
- **`ui-proof/` should have been deleted.** Its own docblock says "Deleted once Phase 1 lands
  the first real island." Phase 1 landed in June.
- **`command.tsx:92-95` gives the wrong reason for a correct behavior** — it credits a
  `@layer base` reset that loses to layered utilities, when the actual guarantee is the
  unlayered coarse-pointer net in `landing.css`. Its claim that "every input in this app
  already renders at the inherited 16px" is false on a fine pointer.
- **Three comboboxes have no keyboard navigation at all** (`VoicePicker`, `ModelPicker`,
  `TtsModelPicker`) — an a11y defect, not a cohesion one.
- **Six near-dead primitives** with one consumer each: `collapsible`, `checkbox`,
  `scroll-area`, `table`, `breadcrumb`, `tabs`.

Per HARD RULE #18 these are pre-existing and off-path: recorded here, not pulled into a diff.
The two stale doc claims and `panel.tsx`'s stale status note are cheap enough to fix in the
first PR of this work, since that PR is about exactly those claims.

## What I did not verify

- **Nothing here is visually verified** (HARD RULE #23). Every claim is source-read and
  counted. Whether a given bypass *looks* wrong on screen is unmeasured; a visual sweep at
  1440/820/390 in both modes is owed before any migration ships.
- **Counts are text-matched, not AST-derived.** A class string built by concatenation or held
  in a variable is invisible to the scan. "55 Button look-alikes" is a heuristic floor; 272
  is the raw ceiling. My own first pass at the raw-button count said 212 and was wrong —
  `<button` followed by a newline was missed.
- **The clone is shallow** (50 commits, back to 2026-09-02), so git cannot date any primitive
  or tell whether `StudioShell.tsx:3432`'s native `<select>` is a regression or predates the
  sweep that declared no holdouts.
- **Whether the Tauri repo now has code** is the one input I cannot get from here, and it is
  the input decision 1 turns on.
