---
name: restyle-deck
description: "Use when changing how a deck looks without changing what it says: theme, color mode, preset, finish, mode, registers, per-slide modifiers, or a better-fitting layout."
kind: operate
studio: true
---

# Skill — Restyle a deck

> Change the look of a deck — palette, canvas, backdrop, hand, accents, one
> slide's layout — while every word, number and slide stays where it was.

**Read this when** the ask is "make it darker", "use our brand palette", "make
it feel more editorial", "give it a backdrop", "this slide would work better as
cards", or "it's going to a big room". **You'll produce** the same deck with a
changed front-matter block and, where needed, changed `<!-- _class: … -->` lines.
The text of every slide is untouched.

To change what the deck says, use `edit-deck.md`. To build a new palette or
backdrop, use `theme.md` or `finish.md`.

---

## The 10/10 bar

- **Content is invariant.** Headings, bodies, numbers and notes come back
  byte-identical. A restyle diff lives in front matter and `_class:` lines.
- **One decision, one key.** Each look change is one front-matter key at deck
  level, not the same modifier pasted on every slide.
- **Deck first, slide second.** A per-slide modifier is an exception you can
  name ("this one slide is a bright break in a dark deck"), not a habit.
- **Every value is real.** A typo'd register value silently renders the
  default; `lint:deck` catches it, so lint after every change.
- **It still fits.** A larger `venue:` or `scale-*` makes text bigger, never
  smaller, so a full slide can clip. Render and look.

Mediocre looks like: `dark` added to every `_class:` line instead of
`color-mode: dark`, a finish with no reason behind it, three registers fighting
a preset, or a layout swap that quietly cut a bullet.

---

## Mental model

A slide's look is a stack of independent choices, and each has one home:

| Choice | What it controls | Where you set it |
|---|---|---|
| **Palette** | every color | `theme:` (`indaco` is the default; `<name>-dark` variants exist) |
| **Canvas** | light or dark | `color-mode:` `light` · `dark` · `system` · `inherited` · `print` |
| **Look preset** | several registers at once | `preset:` `classic` · `editorial` · `brand` · `minimal` |
| **Backdrop** | atmosphere behind content | `finish:` `none` · `atrium` · `meridian` · `strata` · `halo` · `ledger` · `nimbus` · `loom` · `savile` · `gallery` |
| **Hand** | clean or hand-drawn | `mode:` `boardroom` · `sketch` · `sketch-clean` |
| **Room** | how big type renders | `venue:` `laptop` · `huddle` · `conference` · `hall` |
| **Details** | heading rule, kicker, alignment, card lift, corners | `rule:` · `eyebrow:` · `headline:` · `lift:` · `corners:` |
| **Layout** | the slide's shape | the component in `<!-- _class: name -->` |
| **Slide exceptions** | one slide differs | modifiers on that slide's `_class:` line |

They compose: `theme: cuoio` + `color-mode: dark` + `finish: atrium` +
`mode: sketch` is a hand-drawn dark deck on a glow backdrop in the cuoio
palette.

**A preset is a starting point; an explicit key beats it.** `preset: editorial`
sets `finish: ledger`, `headline: left`, `rule: short`, `eyebrow: bar`,
`spectrum-trim: restrained` and `lift: on`. Write `rule: none` beside it and you
get everything from Editorial except the heading rule.

**Per-slide tokens win over deck keys.** `<!-- _class: content light -->` puts
one bright slide in a `color-mode: dark` deck. `no-finish` takes one slide out
of a deck-wide finish; `finish-<name>` on a slide replaces the deck's finish
for that slide.

---

## Where it lives

- **Front matter**: the leading `---` block of the deck. Every key is a row of
  `lib/core/deck-settings.js`; `lint:deck` warns on a key that is not there
  (`unknown-key`) and on a value outside a register's list (`unknown-finish`,
  `unknown-mode`, `unknown-preset`, `unknown-color-mode`, `unknown-theme`, …).
- **Palettes**: `themes/<name>/`. The lint message for `unknown-theme` lists
  every valid name.
- **Register reference**: `lib/base/base.registers.docs.md` — every register,
  its values and default.
- **Per-slide modifiers**: `lib/base/base.docs.md` § Universal variants (`dark`,
  `light`, `mirror`, `silent`, `scale-l` / `scale-xl` / `scale-2xl`,
  `no-pagination`, tone tokens, `tint-*` / `mark-*`) and § Switches (`no-X` /
  `with-X`).
- **In the Studio**: the Deck panel (activity rail, "Deck") opens on a short
  list — theme, preset, color mode, size, venue, page numbers, logo — and its
  Look section adds Mode and Finish. The preset row previews all four presets on one sample
  slide in the deck's theme and color mode. "Slide settings" (rail,
  "Slide") holds one slide's look. The chat can set a key with
  `set_front_matter` after reading it with `read_front_matter`.
- **Commands**: `npm run lint:deck -- <file>`; `npx @laticent/lattice deck.md deck.pdf`.

---

## Recipe

1. **Name the goal in one sentence** before touching a key: "dark, quiet, for a
   projector", "on-brand for Harbor", "a sketch feel for a workshop".

2. **Pick the deck-level keys that deliver it**, cheapest first:
   - Palette → `theme:`.
   - Light or dark → `color-mode:`. (The Studio's "Switch light / dark mode"
     command changes the Studio's own display preference, not the deck file;
     only a deck set to follow the site — `color-mode: inherited`, "Match
     site" in the Deck panel — moves with it.)
   - Overall feel → `preset:`, then override single registers if one is wrong.
   - Atmosphere → `finish:`. Leave it at `none` unless the deck earns it; see
     `finish.md` for what each one is for.
   - Room size → `venue:`. Each component's `.docs.md` says how many items it
     holds per venue.

3. **Then the exceptions.** Only for a slide that must differ: `light` / `dark`,
   `no-finish`, `mirror` (flips an `image` or `split-panel`), `silent` on
   bookends.

4. **Swap a layout only when the content's shape calls for it.** Count the
   items, match the shape (parallel set, sequence, two options, one number) to a
   component in `dist/docs/components.pick.md`, read that component's
   `.docs.md` and grep `test/integration/baseline-decks/gallery.md` for a live
   example (HARD RULE #6). Then re-pour the same words into the new skeleton —
   no word added, none dropped. If it does not fit, that is a split
   (`edit-deck.md`), not a restyle.

5. **Lint**: `npm run lint:deck -- <file>`. Every register typo shows up here.

6. **Render in both color modes if you touched color**, and look at the dark
   bookends, a dense slide and any chart.

---

## The contract / skeleton

Deck-level restyle — the content below the front matter did not change:

```yaml
---
marp: true
size: 4k
theme: cuoio
color-mode: dark
preset: editorial
venue: conference
paginate: true
header: "Harbor Analytics · Pricing review"
---
```

One bright slide inside that dark deck:

```markdown
<!-- _class: content light -->

## Small teams leave when one busy month doubles their bill.

Exit interviews name surprise invoices first, ahead of price and features.
```

A layout swap: five reference rows were crammed into `cards-grid` (hard cap 4).
Same words, poured into `list-tabular`, which takes numbered rows:

```markdown
<!-- _class: list-tabular -->

## Usage pricing moved revenue toward our largest accounts.

1. Enterprise
   - Up 34% on seat growth.
2. Mid-market
   - Up 12%, flat churn.
3. Small teams
   - Down 6%, churn doubled.
4. Trials
   - Conversion steady at 9%.
5. Partners
   - Two new resellers live.
```

A full restyled deck (lint-clean):

```markdown
---
marp: true
size: 4k
theme: cuoio
color-mode: dark
preset: editorial
venue: conference
paginate: true
header: "Harbor Analytics · Pricing review"
---

<!-- _class: title silent -->

# Harbor Analytics

`Pricing review · 2027`

Usage pricing grew revenue, but small teams need a cap before renewal season.

---

<!-- _class: divider -->

`Section 01`

## What changed this year

---

<!-- _class: list-tabular -->

## Usage pricing moved revenue toward our largest accounts.

1. Enterprise
   - Up 34% on seat growth.
2. Mid-market
   - Up 12%, flat churn.
3. Small teams
   - Down 6%, churn doubled.
4. Trials
   - Conversion steady at 9%.
5. Partners
   - Two new resellers live.

---

<!-- _class: content light -->

## Small teams leave when one busy month doubles their bill.

Exit interviews name surprise invoices first, ahead of price and features.

---

<!-- _class: closing silent -->

## Cap small-team bills and protect renewals.

`Priya Shah · CFO · finance@harbor.example`

We recommend a monthly cap before renewals open in March.
```

---

## What good looks like

- "Make it dark" is one line: `color-mode: dark`. No slide's `_class:` changed.
- "More editorial, but no heading rule" is two lines: `preset: editorial` and
  `rule: none`.
- A finish was chosen for a reason the author can repeat ("the ledger lines
  suit a finance review"), and the closing slide still reads cleanly over it.
- The one bright slide in a dark deck carries `light`, and it is the slide the
  speaker wants the room to stop on.
- A layout swap kept every word; the diff shows only the `_class:` line and
  the list markers.

---

## What bad looks like

- `<!-- _class: content dark -->` on all 14 slides. Fix: `color-mode: dark`
  once, and drop the per-slide tokens.
- `finish: atriumm` — warned as `unknown-finish`, renders no backdrop. Fix the
  spelling; the warning lists the valid names.
- `theme: gaia` carried over from another tool — `unknown-theme`. The CLI stops
  with "palette not found". Pick a name the warning lists.
- `mode: dark` — `mode:` is the hand (`boardroom`, `sketch`, `sketch-clean`),
  not the canvas. Fix: `color-mode: dark`.
- `preset: brand` plus five explicit registers that undo it. Fix: pick the
  preset closest to the goal and override one or two keys, or drop the preset.
- A swap from `cards-grid` to `split-compare` on a slide with three options.
  `split-compare` takes exactly two. Fix: pick by item count, read the
  component's capacity first.
- `venue: hall` on a deck of five-bullet slides. Every slide now clips. Fix:
  split the slides first, or pick the venue that matches the real room.

---

## Ship checklist

- [ ] Slide text, numbers and notes byte-identical to before.
- [ ] Each look decision is one deck-level key; per-slide modifiers are named
      exceptions.
- [ ] No register is set twice (once by a preset, once by hand) unless the
      override is the point.
- [ ] Any layout swap: the new component's `.docs.md` read, item count within
      its `capacity`, every word kept.
- [ ] `npm run lint:deck -- <file>`: no errors or warnings.
- [ ] Rendered and looked at; in both color modes if color changed.

---

## Common mistakes

1. **Restyling slide by slide.** Reach for the deck key; per-slide is the
   exception.
2. **Confusing `mode:` with `color-mode:`.** `mode:` is the drawing hand;
   `color-mode:` is light or dark.
3. **Assuming the Studio's light/dark toggle changed the deck.** It changes the
   Studio's display preference and writes nothing to the file. Write
   `color-mode:` to change the deck everywhere it renders.
4. **Mixing the legacy `class: dark` with `color-mode:`.** Where both exist,
   the key wins and the alias is dropped; lint flags the leftover
   (`deck-wide-component`). Delete the alias.
5. **Treating a layout swap as free.** A different component has different
   slots. Read its `.docs.md` and re-pour the words into its skeleton.
6. **Adding a finish to fix a weak slide.** A backdrop never rescues a slide
   that has no claim. Fix the content with `edit-deck.md` first.
7. **Raising the type size to fill space.** `scale-*` and `venue:` exist for
   the room, not for a sparse slide.
8. **Editing a theme's CSS to restyle one deck.** Pick a different `theme:`, or
   build a palette with `theme.md`. Never hand-edit `dist/`.

---

## Canonical sources

- `lib/base/base.registers.docs.md` — every front-matter register: `preset:`,
  `mode:`, `finish:`, `fit:`, `split:`, `rule:`, `eyebrow:`, `headline:`,
  `lift:`, `venue:`, `corners:` and the rest.
- `lib/base/base.docs.md` § Universal variants and § Switches — per-slide modifiers.
- `design/theming.md` — palettes and the four ways to a dark canvas.
- `lib/core/deck-settings.js` — the list of front-matter keys the linter knows.
- `engineering/decisions/2026-09-26-deck-presets-and-settings-tiers.md` — why
  presets work the way they do.
- `dist/docs/components.pick.md` — choosing a component for a layout swap.
- `design/skills/finish.md`, `design/skills/theme.md` — creating a new backdrop
  or palette.
