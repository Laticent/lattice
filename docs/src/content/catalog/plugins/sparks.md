---
kind: plugin
name: Sparks
order: 3
promise: A chart the size of a word, right beside the number it explains.
intro: Write `~{12 14 17 21}` next to a figure and Lattice draws its trend in a word's space, in the deck's own colors. Seven types cover a trend, a period's size, a win/loss record, a share of a whole and a value against its target.
useWhen: A number on your slide has a history or a target, and a full chart would take more room than the point deserves.
syntax: '`~{12 14 17 21}`'
facts:
  - { k: You write, v: '`~{numbers, words}` in inline code' }
  - { k: Draws with, v: Lattice's own drawing, from your numbers }
  - { k: Surfaces, v: Every one — drawn at render time }
  - { k: Loaded, v: By default; nothing to download }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/sparks/sparks.docs.md
    note: Every type, size, color and marker word, the frame and look axes, and what stays as code.
  - label: The conformance cases
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/sparks/sparks.fixtures.md
    note: Exactly what each spelling renders to.
  - label: A sample deck
    href: https://github.com/Laticent/lattice/blob/main/examples/inline-sparks.md
    note: Sparks in a table, on KPI tiles, in a sentence, and in all three looks.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-28-inline-sparks.md
    note: The design note — the seven types, the fixed widths, and where a spark does not belong.
examples:
  - key: table
    label: In a table
    caption: A trend column turns a row of numbers into a shape you can compare down the table.
    sample: |
      <!-- _class: table table-fill -->

      ## Asia Pacific is the only region still accelerating.

      | Region | Q3 revenue | Last 8 quarters | Against plan |
      | --- | ---: | --- | --- |
      | Americas | $4.2M | `~{3.1 3.3 3.6 3.8 3.9 4.0 4.1 4.2, end}` | `~{4.2/4.0, bullet}` |
      | Europe | $2.7M | `~{2.9 2.8 2.8 2.7 2.6 2.7 2.7 2.7, end}` | `~{2.7/3.0, bullet}` |
      | Asia Pacific | $1.9M | `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9, end}` | `~{1.9/1.6, bullet}` |
  - key: sentence
    label: In a sentence
    caption: A spark sits in a line of text like a word, and the number stays in the text beside it.
    sample: |
      ## Churn held while signups climbed.

      Weekly signups rose to 21k `~{12 14 13 17 19 21, end}` while churn stayed near 4% `~{4.2 4.4 4.1 4.3 4.2 4.0, zero}` all quarter.
  - key: types
    label: Seven types
    caption: A series draws a line, area, bars, steps or wins and losses. A ratio draws a ring or a bullet.
    sample: |
      <!-- _class: table table-fill -->

      ## One grammar, seven types.

      | Type | Spark | Shows |
      | --- | --- | --- |
      | `line` | `~{12 14 13 17 21}` | the shape of change |
      | `area` | `~{12 14 13 17 21, area, c2}` | the same, with weight |
      | `bar` | `~{3 5 4 6 8, bar, c3}` | the size of each period |
      | `step` | `~{2 2 3 3 5, step, c4}` | levels that hold, then jump |
      | `winloss` | `~{1 1 -1 1 -1 1 1, winloss}` | hits and misses |
      | `ring` | `~{72%}` | one part of a whole |
      | `bullet` | `~{72/80, bullet, c5}` | a value against its target |
  - key: looks
    label: Three looks
    caption: The same spark as a filled tile, an outline, or a pale tint. Set it per spark, per slide or for the whole deck.
    sample: |
      <!-- _class: table table-fill -->

      ## One spark, three looks.

      | Look | Trend | Share |
      | --- | --- | --- |
      | `pigment` | `~{12 14 13 17 21, c1}` | `~{72%, c3}` |
      | `etching` | `~{12 14 13 17 21, c1, etching}` | `~{72%, c3, etching}` |
      | `tone` | `~{12 14 13 17 21, c1, tone}` | `~{72%, c3, tone}` |
---

## The problem

A slide says revenue is $1.9M. The reader's next question is whether that is up or down, and by how much. A full chart answers it, but takes half the slide for one line of context. Leaving the history out makes the reader take the number on trust.

- **A full chart** is too big for a table cell or a KPI tile, and ten of them crowd out the point.
- **An arrow or a percentage** gives the direction, but not the shape: steady growth and one lucky quarter look the same.
- **A pasted image** of a chart doesn't take the theme's colors and goes stale the moment the numbers change.

What you want is the shape of the history, the size of a word, right where the number is.

## The idea

- **A chart with no chrome.** No axes, labels or legend. The number sits in the text beside the spark, and the spark shows its shape. Edward Tufte called this a *sparkline*; Lattice says "spark" because two of the seven types are not lines.
- **Data first, then words.** `` `~{12 14 17 21}` `` is a line. Add words in any order to change it: `bar`, `lg`, `c3`, `end`.
- **Two kinds of data.** A series of 2 to 48 numbers draws a trend. A ratio (`` `~{72%}` `` or `` `~{72/80}` ``) draws a ring or a bullet.
- **Widths are fixed per size.** Every spark in a column is the same width, so rows can be compared at a glance.
- **The deck's colors.** `c1` to `c12` are the same slots charts and pills use, and three looks decide how that one color is spent.

## How to use it

Sparks are on in every deck. Write one in inline code, next to the number it explains:

```markdown
Revenue reached $1.9M `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9, end}` this quarter.
```

Then add words, in any order:

| Word | Does |
| --- | --- |
| `line`, `area`, `bar`, `step`, `winloss` | The type for a series (`line` by default) |
| `ring`, `bullet` | The type for a ratio (`ring` by default) |
| `sm`, `md`, `lg` | Size, relative to the text |
| `fill` | Stretches the spark across its line |
| `c1` … `c12` | The color, from the deck's chart palette |
| `end`, `minmax` | Dot the latest value, or the low and the high |
| `zero` | Start a line at 0, so a series that barely moved reads as flat |
| `framed`, `bare` | A tile behind the spark, or ink alone |
| `pigment`, `etching`, `tone` | How the color is spent |
| `square`, `rounded` | The tile's corners |

To set the frame, look or corners for the whole deck, use the `spark:` front-matter key. For one slide, use a `spark-` class:

```markdown
---
spark: etching rounded
---

<!-- _class: table spark-bare -->
```

In the Studio, type `` `~ `` for a menu of starter sparks. After a comma, the menu offers only the words that fit next.

## Where else it fits

Anywhere a figure has a past or a target: KPI tiles, a trend column in a quarterly table, an operating review, a sales pipeline by stage, an uptime record (`winloss`), a quota against plan (`bullet`), or a sentence in a board memo. A spark is drawn from the numbers in your Markdown, so updating the deck means editing the numbers.

## How Lattice uses it

No slide type requires the plugin. The `kpi` layout sizes a spark to match its status pills, and a `fill` spark under a KPI headline becomes the tile's trend line. In `mode: sketch`, sparks are drawn by hand like the rest of the slide. Every spark carries a spoken label with its numbers ("Trend, 8 points, from 0.8 to 1.9"), so a screen reader hears what the chart shows.

## What it doesn't do

- **It isn't a chart.** No axes, labels, legend or tooltips. When the reader needs to read values off the shape, use a chart slide.
- **It doesn't guess.** A span with a thousands comma, a unit, or a word that doesn't fit its type stays as code, and the deck linter says why. A backslash (`` `\~{…}` ``) keeps the text on purpose.
- **Numbers only.** No units, currency signs or dates in the braces. The reader's number belongs in the text beside the spark.
- **At most 48 points.** Past that, the data wants a chart.
- **Chart captions are the one place to avoid** for now: a caption stacks the spark on a row of its own.
