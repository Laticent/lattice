---
title: Authoring decks
description: How a Lattice deck is structured — front matter, slide separators, components, and the authoring contract.
---

A Lattice deck is one Markdown file. You compose it from **named
components**, one per slide, and the engine assembles each slide against
the deck's palette. You never set fonts, colors, or positions by hand.

## Anatomy of a deck

```markdown
---
theme: indaco       # palette (see Themes & palettes)
paginate: true
header: "Quarterly Review"
---

<!-- _class: title -->

# Deck title

`Category · Date or audience`

One-line subtitle that frames the deck.

---

<!-- _class: cards-grid -->

## Three pillars

- Reliability
  - 99.95% uptime across the quarter.
- Velocity
  - Lead time down 40% since Q1.
- Cost
  - Unit economics improved 12%.
```

Three things to notice:

1. **Front matter** selects the palette (`theme:`), the deck's finish
   (`finish:`), and global chrome (`paginate`, `header`, `footer`).
2. **Headings** separate slides by default — each `##` starts a new one (and a
   `---` still works too). Set `split: rule` for separators-only (see The
   `split:` key below).
3. **`<!-- _class: NAME -->`** picks the component for that slide. The
   component decides the structure; your Markdown fills the slots.

## Picking a component

Each component has a contract: which headings, lists, and slots it expects,
and what it's for. The components are organized into twelve buckets by the
job they do — anchor, statement, inventory, comparison, progression,
evidence, imagery, plus the substance buckets (chart, diagram, math,
code) and the legal domain set.

The fastest way to choose is the **[component reference](/components/)**:
an interactive catalog of every component with its slots, variants, when to
reach for it, and when not to — and you can preview the whole thing in
any Lattice palette. The same content is also available as a single
[Markdown document](https://github.com/slidewright/lattice/blob/main/dist/docs/components.md).

## Swappable renderings (variants)

Some components offer several interchangeable looks over one authored content
shape — you change one class and the same Markdown re-renders a different way,
no re-authoring. The **`inventory`** component (an eyebrow, a title, a bulleted
list with bold leads, and a closing insight) is the clearest example: its
default is a numbered **ledger**, and three variants restyle the identical
content:

- `inventory` — the default: numbered rows with hairline rules and an accent insight band
- `inventory cards` — an equal grid of cards with the insight as a centred pull-quote
- `inventory timeline` — a horizontal numbered run with the insight above
- `inventory editorial` — a magazine split: the insight beside a ruled item column

Write the list once, then swap `<!-- _class: inventory -->` for
`inventory cards` (and so on) to try each. The variants are looks of the one
`inventory` component, so they don't add to the component count.
See [`examples/inventory.md`](https://github.com/slidewright/lattice/blob/main/examples/inventory.md)
for one deck that renders the same content all four ways.

## The card-style nesting rule

Card-style components (`cards-grid`, `cards-stack`,
`decision`, `verdict-grid`, and others) expect **nested** list items,
not inline bold titles:

```markdown
- Title
  - body text continues here
```

Not `- **Title.** body text` — the autobold rule on those components would
make the body inherit the title's weight. The component reference flags
this per component, and the repo's commit-time validator catches it across
every deck.

## Modifiers

Any component accepts universal modifiers appended to the class —
`dark`, `compact`, `loose`, `accent`, state markers, and treatments.
For example `<!-- _class: cards-grid dark -->` renders the grid on the
dark canvas. The catalog of modifiers lives in the design system
reference in the repository.

## The `split:` key — your outline divides the slides

**By default, your headings split the deck.** The first `#` is the lead slide
and every `##` after it opens a new one, so the body is clean Markdown with no
separators to remember:

```markdown
---
theme: indaco
---

# Deck title          ← the lead slide

`Category · Date`

## First topic         ← a new slide

…body…

## Second topic        ← another slide
```

A slide's `<!-- _class: NAME -->` directive and its eyebrow are written *above*
the heading (so the eyebrow renders above the title) and **stay with that
slide** — the break is pulled back over them, never orphaning onto the slide
before. The default is also **hybrid**: an explicit `---` still forces a break,
which is how you give a slide no heading at all (an image slide) or split two
slides under one idea.

To opt back into the classic behaviour — split **only** on `---`, never on a
heading — set `split: rule` in front matter:

```markdown
---
split: rule    # separators only; headings never split
---
```

`split:` takes exactly two values — `headings` (the default) and `rule` — and a
misspelling is caught by the deck linter (`unknown-split`) rather than silently
falling back to the default.

## The `mode:` key — a hand-drawn deck

A deck's **mode** is how the content itself is drawn — its type-and-geometry
hand — separate from its palette (`theme:`) and its backdrop (`finish:`). Set it
once in front matter and every slide inherits it:

```markdown
---
theme: carta        # palette — still owns the colours
mode: sketch      # rendering hand — the whole-deck mode
---
```

(The key is `mode:`, not `style:` — Marp already uses `style:` for inline-CSS
injection.) `mode:` takes one of three values:

- **`boardroom`** — the clean baseline. The default when you omit the key.
- **`sketch`** — a hand-drawn register: felt-tip headings, a hand-sans for
  prose, and every card/box redrawn as a sketched frame.
- **`sketch-clean`** — hand headings and boxes, but a clean body font for
  text-dense slides.

The mode is **palette-blind** — it wobbles type and geometry, never colour, so
it pairs with any theme. It **composes** with per-slide components (`mode:
sketch` plus `<!-- _class: cards-grid -->` renders a hand-drawn grid) and with a
`finish:` **backdrop** (`mode: sketch` + `finish: atrium` is a hand-drawn deck on
an atrium backdrop — the two are orthogonal axes). Add `<!-- _class: boardroom -->`
to opt one slide back to clean. A misspelled value (`mode: sketchh`) is caught by
the deck linter rather than silently rendering the baseline.

> **Moved in a recent release:** `sketch`/`boardroom` used to be `finish:` values.
> They're now `mode:` — `finish:` is backdrops only (`none` / `atrium` … `gallery`).

## Autocomplete in the Drawing Board

The **[Drawing Board](/drawing-board/)** is the in-browser editor. It
completes the deck vocabulary as you type, from the same catalog the component
reference and the linter use. Every suggestion is deterministic and offline;
`Ctrl-Space` summons any of them on demand.

- **`theme:` in front matter** — the registered palette names. An unknown one
  renders an unstyled white deck, so the name stays valid.
- **`finish:` in front matter** — the backdrop-register names (`none`, `atrium`
  … `gallery`), the same set the linter validates, so a typo can't slip through.
  The **Deck setup** drawer also exposes Finish as a picker.
- **`mode:` in front matter** — the rendering-mode names (`boardroom`,
  `sketch`, `sketch-clean`), linter-validated. The **Deck setup** drawer exposes
  Mode as a picker beside Finish.
- **`split:` in front matter** — the two split modes (`rule`, `headings`), again
  linter-validated. The **Deck setup** drawer exposes it as the Slide-splitting
  picker.
- **Inside `<!-- _class: … -->`** — component names (tagged by bucket), then the
  modifiers that component accepts, its own variants first and the universal ones
  after.
- **On an empty slide** — a `skeleton` completion drops the component's slot
  scaffold already in the correct nesting, so a card-style slide starts from
  the `- Title` / `  - body` shape rather than the inline-bold trap above.
- **Other slide directives** — `_paginate`, `_header`, `_footer`, and friends
  inside an HTML comment, plus `_paginate`'s `true` / `false` / `skip` values.
- **Fence languages** — the language id after ` ``` `, including the
  `mermaid` and `chart` blocks Lattice renders.
- **Inside a `mermaid` block** — the Mermaid diagram and flow keywords.
- **Inside a `map` slide's list** — the country, state, and group names the
  basemap resolves, including blocs and categories like `European Union` or
  `Global South`, so the spelling matches on the first try.

### Type-ahead — suggestions open on their own

By default the popup opens **the moment your cursor enters a `<!-- _class: … -->`
directive**, before you type anything — so the component list is right there, and
picking a component then pressing space cascades straight into its modifiers. Deck
directives (`theme:`, `finish:`, fence languages, …) stay quiet until you type or
press `Ctrl-Space`, so front matter doesn't pop a menu in your face. **Settings →
Workspace → "Open suggestions automatically"** changes the reach: *Components
only* (the default), *Everywhere* (every context opens on entry), or *Off* (the
popup opens only on typing / `Ctrl-Space`).

## Inline validation — issues underlined as you type

The same authoring checks the linter runs (the footgun rules, content capacity,
unknown classes or map regions) also surface **inline in the editor**: an issue
is drawn as a wavy underline — red for an error, amber for a warning — with a
matching dot in the gutter, and hovering it shows the message and the fix. Where
a fix is mechanical (the inline-bold card/ledger trap, a body-less split item, a
retired gantt delimiter) the hover carries a **Quick fix** button that rewrites
the line for you in one undoable step. It's the same deterministic engine as the
**[Architect](/drawing-board/)** panel and the `lint-deck` CLI — just shown where
your cursor is. This runs in **both** the Drawing Board and the
[Playground](/playground/).

A few shortcuts: **F8** / **Shift-F8** jump between findings, **Ctrl-Shift-M**
opens the lint panel, and **Alt-Shift-F** (or the Architect panel's **Fix all**
button) applies every mechanical fix in the deck at once.

Validation is **on by default**. To turn it off for a deck, flip **Inline
validation** off in the Deck setup drawer (or write `validate: off` in front
matter) — useful for a deck built on bespoke local classes the linter doesn't
know. The choice lives in front matter, so it travels with the deck.

## Deck setup (front matter without the YAML)

The Drawing Board's **Deck setup** drawer — the sliders button beside the
settings chip — edits the deck's front matter through plain controls, so you
never hand-write the `---` block and the Markdown body stays content-only. It
covers the whole-deck settings: **theme**, slide **size** (landscape HD / 4K /
Standard, plus social/mobile Square / Portrait / Story / Mobile),
**page numbers**, running **header** / **footer**, **inline validation** on/off,
and a few advanced ones
(a default slide **class**, **math** renderer, document **language**). The
controls are pre-filled from whatever front matter the deck already has, and
each change writes a minimal block back to the top of the source — so the
values persist across refreshes and travel with an exported `.md`. A deck with
nothing configured carries no front matter at all.

**Theme is one value in three places.** The top-bar palette picker, the Deck
setup drawer's theme select, and the editor's `theme:` line are kept in sync:
pick a palette in either control and it's written into the deck (and the
preview + page recolor); type a valid `theme:` in the editor and the picker
follows. Only a registered palette is applied — a typo stays in your source so
you can fix it, but the deck keeps rendering in the last valid palette rather
than going unstyled, and the drawer flags it.

## Chrome — show or hide the slide furniture

Every deck carries a standard set of *chrome*: the running **header** and
**footer** bands, the **page number**, and the **section rail** (the row of
progress dots that tracks where you are between dividers). You control each one
at **two scopes** — set the baseline for the whole deck in the front matter, then
opt an individual slide out with a `_class` token.

| Element | Whole deck (front matter) | One slide (`_class`) | On by default? |
|---|---|---|---|
| Running header | `header: "Acme — Q3"` | `no-header` | no — appears once you give it text |
| Running footer | `footer: "Confidential"` | `no-footer` | no — appears once you give it text |
| Page number | `paginate: true` | `no-paginate` | on for Form decks |
| Section rail | `class: no-progress` (turns it **off**) | `no-progress` | on when the deck has dividers |

The header, footer, and page number ride Marp's own front-matter directives, so
a running band turns **on** by giving it text and **off** by removing the line.
The section rail has no such directive, so its deck-wide off-switch is the
`no-progress` class, which propagates to every slide. Want the rail gone
everywhere? Add `class: no-progress` to the front matter. Want it back on one
slide? That direction is rarer — reach for Marp's per-slide `_header:` /
`_footer:` / `_paginate:` local directives when you need to turn a band *on* for
a single slide against a deck that leaves it off.

For a slide that wants **none** of the standard chrome — a bookend, a full-bleed
statement — `silent` clears the header, footer, and page number in one token:

```markdown
<!-- _class: content silent -->
## Nothing but the message
```

To let the content dominate *without* stripping the title, reach for the
**claim** presets (`claim-hero`, `claim-quiet`) instead — they recede the chrome
but keep the slide labeled, because a board slide should never go untitled.

In the **Studio**, these live as switches: the Deck inspector carries the
whole-deck toggles (Page numbers · Running header · Footer · Section rail), and
the *This slide* editor's Chrome section carries the per-slide ones (Clean slide
· Hide header · Hide footer · Hide page number · Hide rail).

## Where to go next

- [Themes & palettes](/guides/themes/) — choose or author a palette.
- [Component reference](/components/) — every component's
  authoring contract.
- [Drawing Board](/drawing-board/) — author a full deck in the
  browser (autocomplete, live linting).
- [`design/skill.md`](https://github.com/slidewright/lattice/blob/main/design/skill.md)
  in the repo — the full deck-authoring contract.
