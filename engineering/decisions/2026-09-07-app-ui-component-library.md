---
status: in-progress
summary: >
  Yes, build a shared app-UI layer on shadcn — but the folder of components is not the
  deliverable and never was. The repo already HAS an unusually good shared layer
  (`ui/panel.tsx`, 855 lines, ~60% commentary, every comment a measured defect). It fails
  for two reasons this investigation can measure. First, it shares CLASS STRINGS instead of
  COMPONENTS: the tree holds 13 shared class constants against 2,888 `className` literals, so
  a consumer imports the geometry and re-invents the typography — which is
  how `SlideContext.Row` and `StudioShell.Field` became the same component differing by
  `my-1.5` vs `my-2`, and how `PanelBody`'s scroll+touch contract came to be copy-pasted
  inline in 10 places. Second, adoption is by convention, which this repo has now falsified
  ten times: across 18 cohesion passes, every repair that DELETED the alternative held, and
  every repair that shipped "primitive + standing rule" decayed within days. Under it sits
  the structural cause — the shadcn token bridge carries color, radius and font and NOTHING
  dimensional, so the app has 24 distinct `text-[Npx]` sizes over 1,058 occurrences and eleven
  bar-height specifications, while the slide side is held to a gated 12-token `--fs-*` scale and a
  hex-literal budget of zero. Lattice tokenized the artifact and left the app untokenized.
  Recommends: add the missing dimensional tokens, promote the seven measured reinventions
  (most are ADOPT-and-delete, not build), write the app-UI spec that does not exist, and land
  each primitive in the PR that deletes its alternatives. Recommends AGAINST a package —
  one consumer, three hard technical blockers, and an owner ruling already on the record.
---

# The app-UI component library

**Date:** 2026-09-07
**Status:** In progress — investigation complete; the owner's four decisions are recorded in
§"The decisions". Implementation follows in its own branches.

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
description styling. Thirteen shared class constants stand against **2,888 `className="…"` literals** in non-test
`docs/src`.

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
`PanelSection`, whose own docblock called it "the one subhead grammar" → one consumer at the
time (3 files / 10 sites today), and the subhead still ships in four voices. `icons.ts` (07-26) → two files importing raw icons in
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

`docs/src/styles/tailwind.css`'s `@theme inline` block maps **38 aliases: 32 colors, 4 radius
steps and 2 font families** (`--radius` itself sits in `:root`, outside the block). There is
not one token for height, spacing, control size, or touch target.

The consequence, measured over `docs/src`:

| | app UI (docs/src) | slide engine |
|---|---|---|
| Type scale | **24 distinct `text-[Npx]` values, 1,058 occurrences** — 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 18, 19, 20, 24, 26 | a 12-token `--fs-*` role scale, **gated** (HARD RULE #4, `checkTypographyTokens`) |
| Color literals | 1,329 `var(--token)` occurrences — good | hex literal budget **0**, allowlisted, **gated** (HARD RULE #3) |
| Dimensions | **1,812 arbitrary size/spacing occurrences, 273 distinct** | `--space-*` / layout tokens, `margin` budget **0**, **gated** (HARD RULE #20) |
| Adoption gate | **none** — `tools/check-ownership.js` defines 77 checks and not one is about `docs/src/components/ui/` | 77 checks |

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
hand-rolled**. *(Source-read. Driving the live app did not reproduce a sub-44px close target:
on a phone `PanelHeader` correctly renders a back chevron and no Close at all, and the
dismiss-ish controls reachable at 1440 are 32px pointer-only controls, where the touch floor
does not apply. The small hand-rolled targets sit in states — a dismissible hint, the crash
card — that this pass could not reach. Treat the hit-target spread as a source finding
awaiting a real-surface check, not as a confirmed defect.)* Across all of them there are **11 distinct hit-target specifications** —
`size-[30px]`, `h-11`, `size-6`, `size-6`+`pointer-coarse:size-11`, `size-8`, `p-1`, `p-1.5`,
`p-0.5`, `px-1 py-0.5`, `px-3.5`, and none at all (`StudioShell.tsx:3527` is a bare
`<button>`). Icon sizes run `size-3` to `size-5` plus `size-[18px]`; paddings run `p-0.5` to `p-1.5`.
Placement is not settled either: three Fabricate bars put the X **leading**, as
does `PresentOverlay.tsx:1773`, while every `PanelHeader` puts it trailing. Two sites still
render a raw glyph rather than the icon — `✕` at `PlaygroundApp.tsx:1647` and `×` injected via
`textContent` at `vetrina.astro:239`. The smallest targets land near 16px, well under the
44px touch floor — the floor `2026-07-27` describes as having "held inside the
drawer and nowhere else. That floor is the stated reason the whole mobile toolbar was
redesigned. Every destination broke it." Two automated 44px assertions exist — `docs/e2e/responsive.spec.ts:63` covers **only the
eight mobile bar cells**, and `docs/e2e/back-gesture.spec.ts:236` covers a `PanelHeader`
*action* button. Neither covers a close button, and the second asserts the phone header has
no Close at all.

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

### And the one you did not name, which is the clearest of all — now measured on the real app

**The same panel wears two different header voices depending on viewport width.** This one is
**observed, not inferred**: the docs site was built and driven at both widths, and the
computed styles read off the live Coach panel are:

| | docked, 1440 | compact, 390 |
|---|---|---|
| element | `div` | `h2` |
| font family | **JetBrains Mono** | **Playfair Display** |
| size / weight | 11px / 700 | 15px / 600 |
| case | `uppercase` | sentence |
| tracking | +1.1px | −0.3px |
| header band | 35px tall | 16px tall |

It is not a drift of a few pixels — it is a **different typeface**, which is more than the
source read suggested. Screenshots of both states are in this branch's working notes.

Coach, Chat and Reader views render `PanelSheet` + `PanelHeader` on compact
(`StudioShell.tsx:5356,5366,5384`) — the house voice, **15px semibold** (`panel.tsx:603`).
Docked, the
same three panels hand-roll `font-mono text-[11px] font-bold uppercase tracking-widest`
(`StudioShell.tsx:5279,5286`, `ArchitectChat.tsx:394`) — the voice `PanelSection`'s own
docblock retired, quoting the drawer's rule 4: *"At 10px on a phone it is the least legible
combination available."* The docked Inspector has a header (`StudioShell.tsx:4002-4023` — bordered, 13px bold title,
scope chip, lede, close) but not a `PanelHeader`, so it is a fourth voice again. `Library` is
the only assistant-slot panel that gets it right in both transports.

(The 13px semibold sentence case that `PanelSection`'s docblock argues for is the **subhead**
voice, `panel.tsx:845` — a different rank from the 15px header. Both numbers belong in the
spec Move 3 proposes; conflating them is how a fifth voice would get authored.)

## The scale of the duplication

| Measure | Value |
|---|---|
| Surfaces that are a sheet / drawer / docked panel | 34 |
| — using `PanelSheet` | **12 (35%)** |
| — using `PanelHeader` | **12 (35%)**, across 8 files |
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
| Shared class constants | **13** |

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
- **Do not absorb the bespoke CSS in this line of work.** `docs/src/styles/` is 3,297 lines
  across 13 files, of which **2,314 sit in the five largest** (`playground.css` 978,
  `landing.css` 434, `components.css` 363, `fonts.css` 231, `tailwind.css` 229 — the last two
  are not bespoke surface CSS, and `lattice-tokens.generated.css` is generated). The bespoke
  ones are *unlayered*, so they beat Tailwind utilities, and the 06-09 rule requires a
  migrated surface to delete its bespoke CSS in the same change. Confirmed out of scope by
  decision 2.

## Packaging: a workspace package inside `docs/src`, on the Vetrina topology

**This section reverses my own first recommendation.** I initially recommended a plain
in-repo layer and called a package blocked. The owner's answer and one precedent in this repo
both say otherwise, and the precedent is decisive.

**On consumers, the owner's ruling (2026-09-07):** *"I consider the Playground and Studio
separate users. More capabilities outside the Lattice will be introduced now that Laticent is
born."* So the "second consumer has not materialized" premise that carried the 2026-06-09
`NO monorepo` call no longer holds — not because the desktop app shipped, but because the
count was wrong at the time and is getting wronger. The Playground and the Studio are two
apps sharing a folder.

**On the technical blockers — I was wrong, and the repo already disproves me.** I argued a
package could not work because Tailwind v4 generates utilities by scanning *the consumer's*
source, and because `docs/` is not a root workspace member so a package and its consumer
would resolve from different trees. Both dissolve under the topology already running here:

> Root `workspaces` is `["docs/src/lib/cadenza", "docs/src/lib/lente", "docs/src/lib/suono",
> "docs/src/lib/vetrina"]` — four real npm workspace packages, each with its own
> `package.json`, dual CJS/ESM exports, emitted `.d.ts`, and an import-boundary gate — **living
> inside `docs/src`** and consumed by the docs app through the ordinary `@/lib/*` path alias.

Because the package sits inside `docs/src`, Tailwind's automatic content detection scans it
like any other docs source (there is no `@source` directive in `docs/` at all), so utilities
generate normally. Because it is consumed by path alias, there is no cross-tree resolution.
And because it is *also* a workspace member, root CJS can require it by name the day
something outside `docs/` needs it — which is exactly the seam Cadenza was extracted to open.

**So: build the layer as a fifth workspace package under `docs/src/lib/`, with the boundary
gate.** `checkVetrinaBoundary` (`tools/check-ownership.js:7215-7236`) is the template: it
fails any import that is not relative, `node:*`, or an explicitly sanctioned dependency. For
a UI package the sanctioned set is `react`, `react-dom`, `radix-ui`, `lucide-react`, `clsx`,
`tailwind-merge`, `class-variance-authority`. That gate is what keeps the layer extractable
by construction rather than aspirationally — the same phrase the 2026-06-09 ruling used
("authored cleanly enough to be extractable") and did not enforce.

Three things it must carry that Vetrina did not have to:

- **`cn` moves with it.** `@/lib/utils` is a 7-line wrapper over `clsx` + `tailwind-merge`
  imported by 27 of the 36 `ui/` files. It belongs inside the package, re-exported.
- **`@/lib/overlay-back` and `@/lib/use-breakpoint`** (`panel.tsx:10-11`, one file each) either
  move in or become injected. They are the only other host escapes.
- **The token bridge stays in the consumer.** `tailwind.css`'s `@theme inline` maps shadcn
  semantics onto live Lattice palette tokens on `<html>`; it is a stylesheet the app owns, not
  a package artifact. Move 1's dimensional tokens join it there. The package consumes tokens;
  it does not define the palette.

**What this does not authorize:** publishing to npm, or a `packages/` monorepo move at the
root. Both remain non-goals (`2026-07-08-library-shape-cadenza-vetrina.md:19`). The four
existing libraries are workspace-internal with publish-ready shape, and that is the shape
being copied.

## The decisions (owner, 2026-09-07)

1. **Packaging** — the Playground and Studio count as separate consumers and more are coming,
   so the layer is built extraction-ready as a workspace package inside `docs/src/lib/`, per
   the section above. This supersedes `2026-06-09-shadcn-migration.md` §0.2 on the consumer
   count, not on the `packages/`-at-root or npm-publish non-goals.
2. **Mandate — all React surfaces.** Studio, Playground, site, landing, components-ref, craft.
   The ~2,300 lines of bespoke surface CSS stay out of scope for this line of work.
3. **Enforcement — gate plus land-by-deletion.** A `checkAppUiCohesion` arm in
   `tools/check-ownership.js` with a `SANCTIONED_*` allowlist that fails on stale entries (the
   pattern rules #3, #20, #22, #26 and #29 already use; no new CI step, `build:check` runs it),
   *and* the shipping rule that a primitive lands in the PR that deletes its alternatives.
4. **Sequence — tokens, then primitives.** Move 1 first because the primitives cannot express
   themselves without it; then adopt-and-delete (`PanelBody` ×10, docked `PanelHeader` ×4,
   `PanelSection`), then build (`SettingRow`, `IconButton`, `SearchField`, `AppBar`).

**Amended after the second sweep (see § Beyond the four named surfaces).** Two preconditions
join Move 1, because adopting the layer without them spreads defects rather than fixing them:

- **0a — reconcile the `ui/` primitives with each other** before asking anyone to adopt them.
  Focus geometry (six treatments, three of them primitive-vs-primitive) and disabled opacity
  (`button` 50 vs `switch` 40) have to agree first.
- **0b — settle the breakpoint numbers in Move 1**, not later. Four systems disagree, with two
  live contradiction bands (640–699 and 1024–1099). A component library that ships `sm:`-based
  components into an app whose hook says 699 *entrenches* the split.

Move 1's token set therefore covers three axes, not one: **dimension** (bar height, touch
floor, control and icon sizes, panel widths), **breakpoint** (one set of numbers, one
authority), and **fallback** (a token-defaults module, retiring 58 divergent `var(--fail,#…)`
reds and nine `--accent` guesses).

## Beyond the four named surfaces

A second sweep went looking for what nobody named. It changes the plan in two structural
ways, so those come first.

### Precondition A — the `ui/` primitives disagree with each other

Adopting a layer that is not internally consistent spreads its inconsistency. Two measured
cases, both inside vendored `ui/`:

- **Focus geometry, six treatments.** `ring-[3px] ring-ring/50` (button, input, select,
  textarea, badge, tabs, scroll-area) · `ring-2 ring-ring ring-offset-2` (checkbox, switch) ·
  `ring-2 ring-inset` (toggle-group, radio-group) · `outline-2 outline-offset-1`
  (`panel.tsx:431,522`, `help-tip.tsx:49` without the offset) · `ring-2 ring-[var(--accent)]`
  across ~10 studio sites · `focus-visible:underline` on landing links. All resolve to the
  same hue, so this is six *shapes* for one signal — and rows 1–3 are primitives contradicting
  primitives.
- **Disabled state.** `button.tsx:8` says `opacity-50`; `switch.tsx:22` says `opacity-40`.
  Six opacities and three cursor treatments follow them downstream.

**So reconciliation is step zero, not a consequence of adoption.**

### Precondition B — a library would ENTRENCH the breakpoint disagreement

Four systems, and their numbers do not agree:

| System | Numbers |
|---|---|
| `useBreakpoint()` (`lib/use-breakpoint.ts:14-15`) | mobile ≤ **699** · tablet ≤ **1099** · desktop ≥ **1100** |
| Tailwind defaults (**not** overridden — no `--breakpoint-*` in `tailwind.css`) | sm **640** · md **768** · lg **1024** · xl **1280** |
| Playground | **820**, **560** |
| hand-written `@media` | 420, 520, 560, 600, 620, 640, 680, 720, 760, 820, 880, 900, 64rem, 88rem, 90rem |

Two live contradiction bands: at **640–699px** Tailwind's `sm:` has fired while
`useBreakpoint()` still returns `'mobile'`; at **1024–1099px** `lg:` has fired while it still
returns `'tablet'`. Both bands are active inside files that mix the two — `StudioShell.tsx`,
`Fabricate.tsx`, `SlidePicker.tsx`, and `ui/panel.tsx` itself (5 hook calls, 6 `sm:`, 10
`min-[1100px]`/`max-[699px]`).

Shipping components that use `sm:` into an app whose hook says 699 makes this worse, not
better. **The breakpoint numbers must be settled in Move 1 alongside the dimensional tokens.**

### A real accessibility failure the sweep found — WCAG 2.4.7 (AA)

**Four AI prompt rows have no focus indicator at all.** The wrapper carries no `focus-within:`
and the input inside carries `outline-none` with nothing replacing it, so tabbing in paints
nothing: `Fabricate.tsx:999/1008`, `Fabricate.tsx:1207/1216`,
`motion/MotionStudio.tsx:478/491`, `FinishStudio.tsx:411/420`.

Verified by reading all four: `outline-none` and no focus treatment of any kind. The proof
that it is an adoption gap rather than an oversight is sitting next to them — the *name* rows
in the same files (`Fabricate.tsx:970`, `FinishStudio.tsx:376`, `MotionStudio.tsx:310`) carry
`focus-within:border-[var(--accent)]`, and the shared `PANEL_SEARCH_BOX` (`panel.tsx:735`)
carries `focus-within:border` **plus** `focus-within:ring-2`. The rows that went through the
shared path are correct; the four that did not are not.

Roughly 20 further hand-rolled fields use `outline-none` + `focus:border-[var(--accent)]` —
`focus:`, not `focus-visible:` — a 1px hue change standing in for the primitives' 3px ring.

### Token FALLBACKS are a second, unpoliced hex channel

HARD RULE #3 holds engine layout CSS to a hex budget of zero, and **explicitly exempts
`var(--t,#fallback)` defaults**. That exemption, meant for the engine's token files, has let
the app layer accumulate a parallel palette of guesses:

- `var(--fail, …)` — **four** different reds across 58 sites: `#b3261e` ×33, `#c0392b` ×16,
  `#c20000` ×7, `#9e2222` ×2. The real token is `#550014`. **None of them match it.**
- `var(--accent, …)` — **nine** distinct values. Sixteen use `#006fa8`, which matches one
  theme; **fourteen are Tailwind's default indigo** (`#4338ca` ×12, `#6366f1` ×2) — leftover
  shadcn defaults sitting in a 33-theme ochre-and-blue system.
- `--radius-sm` is given as `8px` in three files and `6px` in two; it computes to 4px.

A hardcoded fallback for a *themeable* token is wrong by construction here — it can match at
most one of 33 themes. These paint only in the pre-resolve window, but that window is real,
and `SkipLink.astro:46` would flash indigo on an ochre site.

### The rest of the sweep

**A library fixes these** — destructive confirmation (five patterns; `SlideComments.tsx:114`
and `LensesPanel.tsx:445` delete with *no* confirmation, while `Library.tsx:857`'s `DeleteBtn`
is a good arm-and-confirm control stranded in a feature file); empty states (six grammars —
`PanelEmpty` has 3 consumers, and `VoicePicker.tsx:109` uses a permanently-disabled
`<input placeholder="No published voices">`, which a screen reader announces as a textbox);
thirteen hand-rolled sheet-reset effects that are **not** equivalent (some `if (open)`, some
`if (!open)`, so which direction leaves stale state varies by sheet); icon naming
(`TriangleAlert` and `AlertTriangle` are the same glyph under a deprecated alias, four files
each — so grepping either finds half the warning sites); and `IntentTag.tsx:12`, where one of
four status colors is a hardcoded hex while its three siblings are tokens.

**A library does NOT fix these** — and saying so matters, because the library should not be
sold as covering them: elevation, z-index and motion have no scale at all (23 shadows,
16 z-indexes including `z-[2147483647]` and `z-[2147483646]` — INT_MAX and INT_MAX−1 —
and ~13 motion durations with two hand-written curves for the same intent); six full pages
(`cadenza`, `suono`, `vetrina`, `lente`, and two vetrina sub-pages, ~2,165 lines) ship with
**zero** responsive treatment, **zero** axe coverage and **zero** inbound links, running a
fifth button system (`class="btn primary"`); five date formats, six byte formats and three
currency formats, with **no `Intl.*` formatter anywhere in the tree** (the same 5 MB file
reads as `5.0 MB`, `~5.0 MB`, or `5120.0 KB` depending on the panel); typed shape glyphs
(`✓ ⚠ ✕ ● ▸`) on rendered docs-site surfaces, which HARD RULE #29's gate does not reach
because it covers engine CSS and shipped decks, not `docs/src`; and 25 sites of alpha-diluted
`text-muted-foreground/25…/80` that `axe-site.spec.ts:50-53` names as the site's outstanding
contrast risk and cannot scan, because it drives no route and opens no panel.

**Dead code worth deleting**: `PG_SPLIT_DEFAULTS` (`playground/pg-split.ts:41`) has zero
readers while its own docblock claims it prevents a drift that is currently present —
`PlaygroundApp.tsx:1676/1719` and `playground.astro:210` hardcode the numbers;
`BoundingBoxToggle.tsx` is a complete component with no consumers; `useNarrowDesktop`
(`lib/use-breakpoint.ts:95`) is an entire unused hook carrying a fifth breakpoint band; and
twelve `*_BY_NAME` catalog maps have no readers.

The sweep also checked and found **clean**: non-semantic interactive elements (2 candidates,
both correctly handled), accessible names on icon-only controls (12 apparent hits, all false
positives — labeling discipline is genuinely strong), TODO/FIXME debt (effectively zero
outside generated files), button label capitalization, and live-region usage.

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

- **One claim is now visually verified; the rest are not** (HARD RULE #23). The two-header-voices
  finding was driven on the built docs site at 1440 and 390 and is reported above from computed
  styles. Everything else is source-read and counted. In particular the **sub-44px close target
  claim did NOT reproduce** in the states reachable from here — see the note under "Close cross
  button". A full visual sweep at 1440/820/390 in both modes is still owed before any migration
  ships.
- **Counts are text-matched, not AST-derived.** A class string built by concatenation or held
  in a variable is invisible to the scan. "55 Button look-alikes" is a heuristic floor; 272
  is the raw ceiling. My own first pass at the raw-button count said 212 and was wrong —
  `<button` followed by a newline was missed.
- **The clone is shallow** (50 commits, back to 2026-09-02), so git cannot date any primitive
  or tell whether `StudioShell.tsx:3432`'s native `<select>` is a regression or predates the
  sweep that declared no holdouts.
- **Whether the Tauri repo now has code** is the one input I cannot get from here, and it is
  the input decision 1 turns on.

## Corrections applied after fact-check

An independent pass re-derived every count against the tree: 63 claims confirmed, 14 refuted,
13 unreproducible from the method as stated. The refutations are corrected in place above. The
three that mattered, recorded because each would have shipped into Move 1 or Move 3:

- **The header voice is 15px semibold (`panel.tsx:603`), not 13px.** 13px semibold is
  `PanelSection`'s subhead (`:845`) — a different rank. Move 3 would have written one voice
  into the spec under the other's number, authoring a fifth voice while retiring four.
- **`@theme inline` maps 38 aliases, not 33; the type scale is 24 distinct sizes, not 26.**
  Move 1 sizes the new token set against both.
- **`docs/src/styles/` is 3,297 lines across 13 files, not ~3,300 across five** — and two of
  the 13 are not bespoke surface CSS. Decision 2's scope line is stated against the corrected
  footprint.

Cheap corrections that did not move the argument: 77 checks defined in `check-ownership.js`
(not 78); 12 `PanelHeader` render sites across 8 files (not 13, and not "only StudioShell and
panel.tsx"); three host escapes from `ui/` (not two — `@/lib/utils` is the third, with 27
importers); `PanelSection` has 3 consumers today (the "one consumer" is the docblock's
historical claim); two 44px e2e assertions exist (neither covers a close button); the docked
Inspector has a header, just not a `PanelHeader`; X icons run `size-3`–`size-5`, not to
`size-6`.

Counts the fact-check could not reproduce from the method as stated are now given with their
method inline (`className="…"` literals in non-test `docs/src`) or dropped. The qualitative
groupings — subhead voices, segmented-control shapes, the 34-surface panel census — are hand
censuses and are labeled as such; their checkable components (12 `PanelSheet`, 5 non-`ui/`
`SheetContent` owners, 10 `PanelBody` copies) all verified exactly.

One live contradiction found in passing and not fixed here, since it is off this note's path
(HARD RULE #18): `panel.tsx:684-687` still asserts that `focus-visible:` "scores (0,2,0) and
takes it back" from the global focus ring, while `native-widgets.css:64-73` records that as
measured false — unlayered beats layered at any specificity. Both comments ship today.
