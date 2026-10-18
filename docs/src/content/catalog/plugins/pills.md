---
kind: plugin
name: Pills
order: 4
promise: A label with a shape and a color, set right inside your sentence.
intro: 'Write `{LIVE}` in inline code and Lattice draws a pill. Add a shape or a color word and it becomes a tag, a chevron or a numbered badge: `{BETA, tag, c4}`. A pill sizes itself from the text around it, so the same pill fits a heading, a bullet and a caption without you picking a size. Pills are part of how Lattice draws a slide, so this plugin is always on.'
useWhen: A row, a heading or a sentence needs a status, a step, a count or a tag the reader can scan at a glance.
syntax: '`{LIVE}`'
facts:
  - { k: You write, v: '`{label, words}` in inline code' }
  - { k: Draws with, v: Lattice's own drawing, in the deck's colors }
  - { k: Surfaces, v: Every one — drawn at render time }
  - { k: Loaded, v: Always. Part of every deck, so it has no off switch }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/pills/pills.docs.md
    note: The notation, the plugin's rules for components, and how it relates to the icons plugin.
  - label: The conformance cases
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/pills/pills.fixtures.md
    note: Exactly what each spelling renders to.
  - label: A sample deck
    href: https://github.com/Laticent/lattice/blob/main/examples/inline-pills.md
    note: Every shape, color and size, in a list, a heading and a sentence.
  - label: Pills inside components
    href: https://github.com/Laticent/lattice/blob/main/examples/pills-plugin.md
    note: The same pill placed and tinted by cards, a KPI tile, an owner row, a legal update, a roadmap header and a glossary.
  - label: Why it is a plugin
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-17-pills-plugin.md
    note: The design note, including why pills are always on and why components do not draw their own.
examples:
  - key: status
    label: A status on each row
    caption: A pill at the end of a row gives the reader a status to scan down the list.
    sample: |
      ## Where each workstream stands.

      1. Settlement engine
         - Shipped and load-tested `{STABLE, c2}`
      2. Ledger migration
         - Cutover paused for review `{PARTIAL, c4}`
      3. Reporting rebuild
         - Not started `{QUEUED, c1}`
  - key: shapes
    label: Seven shapes
    caption: The shape says what kind of label it is. A circle holds one character or a number, and the chevrons point.
    sample: |
      ## One notation, seven shapes.

      - A capsule is the default `{LIVE}`
        - `chip` and `tag` are squarer `{CHIP, chip, c2}` `{TAG, tag, c3}`
      - A circle holds a number or one character `{3, circle, c5}` `{!, circle, c4}`
        - `tag-bordered` and `diamond` add an edge or a point `{REVIEW, tag-bordered, c5}` `{DECIDE, diamond, c3}`
      - The chevrons point a direction `{STEP 2, chevron-right}` `{BACK, chevron-left}`
  - key: sentence
    label: In a sentence
    caption: A pill sits in a line of text like a word, and the line keeps its height.
    sample: |
      ## The migration is live `{LIVE, c2}`.

      The ledger cutover `{PARTIAL, c4}` finishes this week, and the reporting rebuild `{QUEUED, c1}` starts after it.
---

## The problem

A slide lists four workstreams. The reader's next question is which are done, which are stuck and which have not started. Writing "(done)" after each one makes the list read like a form, and coloring a whole row says nothing in a black-and-white printout.

- **Plain words in a row** are easy to skip, and they all look alike.
- **A colored row** costs the reader the text's contrast, and the color alone carries the meaning.
- **A pasted label image** doesn't take the theme's colors and doesn't resize with the text.

What you want is a small, named label with its own shape and color, set right where the status is.

## The idea

- **A label in braces.** `` `{STABLE}` `` is a capsule. Add words in any order to change it: a shape (`tag`, `chip`), a color (`c1` to `c12`) or a size (`sm`, `lg`).
- **The shape carries meaning too.** A circle is a count, a chevron is a step or a direction, a diamond is a decision. The shape still reads when the color doesn't.
- **It sizes itself.** A pill takes its size from the text around it, so one pill fits a heading, a bullet and a caption.
- **The deck's colors.** `c1` to `c12` are the same slots the charts and sparks use. A slot picks contrast and never meaning.
- **Always on.** Pills are part of how Lattice draws a slide, so there is nothing to turn on, and nothing can turn them off.

## How to use it

Pills are on in every deck. Write one in inline code. The label comes first, then any words, in any order:

```markdown
Shipped and load-tested `{STABLE, c2}`
```

| Word | Does |
| --- | --- |
| `pill` (the default), `chip`, `tag`, `tag-bordered` | The shape of the label |
| `circle`, `diamond` | A round or pointed badge for one character or a number |
| `chevron-right`, `chevron-left` | A pointed label that shows a direction |
| `c1` … `c12` | The color, from the deck's chart palette |
| `sm`, `lg` | A step smaller or larger than the text around it |
| `icon=name` | A drawn icon beside the label, when the icons plugin knows the name |

Each word can also be written by name: `{BETA, shape=tag, color=c4}` is `{BETA, tag, c4}`. A label with a comma or a `|` goes in quotes: `{"Cost, excluding tax"}`. To show the braces themselves, put a backslash in front: `` `\{LIVE}` ``.

In the Studio, type `` `{ `` for a menu of starter pills. After a comma, the menu offers only the words that fit next.

## Where else it fits

Anywhere a row, a heading or a line has a state: a ledger of workstreams, a status next to a heading, a step number, a count, a tag on a figure caption.

## How Lattice uses it

Pills are part of every slide, so no slide type has to ask for the plugin. The colors are slots, not names: `c2` is a different hue on every theme, so a slot picks contrast and never meaning. Use a pill's words, not its color, to say what it means.

## What it doesn't do

- **It has no off switch.** Pills are always on. A plugin list, a host setting or a `--disable-plugin` option cannot turn them off, and naming one as disabled is an error.
- **It doesn't guess.** An unknown or repeated word leaves the span as plain code, and the deck linter says why. `{ ok, scene }` with padded braces is code.
- **It isn't a status system.** The label and the color mean what you write. Lattice does not check that `{STABLE}` is green.
- **Circles and diamonds hold one character or a number up to two digits.** Longer text makes an oval, and the linter points you to `tag` or `chip`.
