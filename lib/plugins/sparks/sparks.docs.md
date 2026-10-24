# sparks

Word-sized charts, written in inline code:

```markdown
Revenue `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9, end}` $1.9M, against a plan of `~{1.9/1.6, bullet}`.
```

That sentence draws a line with its latest value dotted, and a bar against a target tick, each
the size of a word. Edward Tufte named the line version a *sparkline*. Lattice says "spark"
because two of the seven types are not lines.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`). It is on by default,
so a deck that writes `~{…}` needs nothing in its front matter. It has no payload: every spark is
drawn at render time from the numbers in the span. A host that narrows the default set, or a
deck rendered with the plugin disabled, shows the span as plain code.

| | |
|---|---|
| You write | `~{data, words…}` or `@spark{data, words…}` in inline code |
| Front matter | `spark:` — the deck's frame, look and corners |
| Per slide | `_class: spark-<word>` |
| Kernel | `sparks.inline.js` (read, draw, diagnose, edit) |
| Design | `engineering/decisions/2026-09-28-inline-sparks.md` |
| Demo | `examples/inline-sparks.md` |
| Fixtures | `sparks.fixtures.md` |

## Where a spark goes


A `~{…}` (or `@spark{…}`) inside **single-backtick** inline code renders as a **spark**: a
chart the size of a word, with no axes, labels or legend. It goes wherever inline code can go,
and it belongs beside a current number that has a history: a `kpi` line, a trend column in a
`table`, a `big-number` caption, a sentence. Spec and rationale:
`engineering/decisions/2026-09-28-inline-sparks.md`. Demo: `examples/inline-sparks.md`.

```markdown
| Region | Q3 revenue | Last 8 quarters | Plan |
| --- | ---: | --- | --- |
| Asia Pacific | $1.9M | `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9, end}` | `~{1.9/1.6, bullet}` |
```

## Data

The data comes first inside the braces, then any words — type, size, color, markers, frame —
separated by commas and in any order: `~{12 14 17, bar, c3, lg}`. The `~` before the brace is
what makes it a spark rather than a pill.

- **A series** is two to 48 numbers, space-separated, oldest first: `~{12 14 13 17 21}`.
- **A ratio** is one value against a whole or a target: `~{72/80}`, or `~{72%}` for 72 of 100.

Numbers only: a sign and decimals are fine, but no units, thousands commas or currency
signs. The reader's number is already in the text beside the spark.

## Type

| Type | Data | Shows |
|---|---|---|
| `line` (default for a series) | series | the shape of change |
| `area` | series | the same, with weight — for a hero trend |
| `bar` | series | the size of each period |
| `step` | series | levels that hold, then jump (headcount, a price tier) |
| `winloss` | series | the sign only: a hit above the line, a miss below |
| `ring` (default for a ratio) | ratio | one part of a whole |
| `bullet` | ratio | a value against a target tick |

## Size — `sm` `md` `lg` and `fill`

A **framed** spark (the default) is a tile measured in a pill's type size, so it matches
the pills around it wherever it sits: 1.25× a pill's height at `md`, and 0.85× or 1.6×
that at `sm` and `lg`. A **bare** spark is measured in the text's own em instead:
`sm` is 0.8em × 3em, `md` 1em × 4.5em, `lg` 1.7em × 7.5em. Either way widths are fixed
per size, so every row's spark in a table can be compared. `fill` puts the spark on a line of its
own and stretches it to the width of the text block it sits in. In a `kpi` hero tile that
is the width of the tile's widest line, which is what lets a trend underline the metric.
Keep `fill` out of a sentence, because it breaks the paragraph. It works on every type
except `ring`.

## Scale — `zero`

A `line`, `area` or `step` runs from its own low to its own high, which shows the shape
of change. It also makes a series that barely moved look dramatic. `zero` starts the
axis at 0 instead, so churn between 4% and 5% reads as flat. Use it when the claim is
that something held. A `bar` always starts at zero, because a bar's length is its value.

## Markers — `end` `minmax`

`end` dots the latest value in `--accent`, so "now" looks the same in every spark on a
slide. `minmax` dots the low and the high. Both apply to `line`, `area` and `step`.

## Color — `c1` … `c12`

A spark with no color is `c1`, the deck's first chart hue; `c1`–`c12` are the same numbered
slots pills use, drawn from the chart cycle (`--chart-catN`) so a spark shows a slot in the hue a
chart gives it. The **look** (below) decides where that one color goes. A bare spark draws in
the slot's mark. A `winloss` loss is `--accent`, but its position below the line
carries the meaning.

## Frame — framed by default, and yours to set

Every spark sits in a **squared frame**: a 3:2 tile (a ring's is square) about 1.25× a pill's
height, measured in the pill's type size and wearing its fill and edge, but a visible step
taller, so it reads as a small chart and never as a pill. With a color slot the frame takes the slot's fill and edge, as
`` `{X, c3}` `` does. The frame has three axes, and each can be set for one spark, one slide or
the whole deck:

| Axis | Words | Default |
|---|---|---|
| Frame | `framed` · `bare` (no frame, just ink) | `framed` |
| Look | `pigment` · `etch` · `tone` (how the color is spent, below) | `pigment` |
| Corners | `square` · `rounded` (the theme's small radius) | `square` |

- **One spark:** the word in the spark, `` `~{1 3 2, bare}` `` or `` `~{1 3 2, etch, rounded}` ``.
- **One slide:** the word as a class with `spark-` in front, `<!-- _class: table spark-bare -->`.
- **The deck:** the `spark:` front-matter register, `spark: bare` or `spark: etch rounded`
  ([`base.registers.docs.md`](../../base/base.registers.docs.md) § `spark:`).

The most specific wins, one axis at a time: the spark, then the slide, then the deck, then the
default. `framed`, `pigment` and `square` (and the matching classes) exist so a spark or a
slide can return to the default inside a deck that set another value. A spark that names its
own corners (`` `~{…, rounded}` ``) wants a frame, so it keeps one on a bare slide or in a bare
deck unless it also says `bare`. A look is about color, not the tile, so it does not. The three sizes scale
the whole tile (0.85× / 1× / 1.6×). A frame adds a little height to a line of prose, so a
paragraph with several sparks may read better with `spark-bare` on that slide.

## Look — `pigment`, `etch`, `tone`

A spark has four parts one color can go to: the **tile**, its **edge**, the **ink** every line,
dot and ring arc draws in, and the **body** that fills bars, an area and a bullet's value. A
look decides all four from the one color the spark names (`c1` when it names none), so the parts
never come from two slots. The names are the chart family's three finishes
(`engineering/chart-styling.md` §3):

| Look | Tile | Edge | Ink | Body |
|---|---|---|---|---|
| `pigment` (default) | the slot's fill | the slot's ink | the ink that reads on the fill | the ink |
| `etch` | clear | the slot's ink | the slot's ink | a 30% wash, ink-edged |
| `tone` | a 12% tint | a 45% tint | the hue pulled toward the heading ink | a 55% tint |

Every look keeps the edge: no fill clears the 3:1 graphical floor on its own, and the edge does.
The CSS is `sparks.styles.css`; the four parts are `--spark-tile`,
`--spark-edge`, `color` and `--spark-body`, all derived from `--spark-hue`.

**In `mode: sketch`** a spark is drawn by hand like the tables around it: the rough ink
(`lib/core/rough-ink.js`, `kind: 'spark'`) redraws the tile's edge, the line, each bar's outline,
a bullet's tick and a ring's arc, in each part's own color. Fills keep their look, and the zero
baseline stays clean. Nothing to write — the finish does it.

Word order is free: `` `~{1 3 2, area, c4, lg}` `` and `` `~{1 3 2, lg, c4, area}` `` are
the same spark. Each spark carries `role="img"` and a spoken label with its numbers
("Trend, 8 points, from 0.8 to 1.9, low 0.8, high 1.9").

## What stays literal

A span that opens with `~{` and has a digit in it, or a spark word (`~{abc, bar}`), is a spark attempt. If it doesn't
parse, it stays code, and nothing is guessed:
`` `~{1,200 1,450}` `` (a comma), `` `~{72%, bar}` `` (a bar needs a series),
`` `~{3 5 4, bar, end}` `` (markers only go on the line types), `` `~{3 5 4, c13}` ``.
`lint:deck` **warns** (`spark-literal`) and names the reason, and the editor underlines
the span. A **backslash** keeps the literal on purpose, and silences the warning:
`` `\~{1,200}` `` renders as `~{1,200}`. A `~{` with no digit in it is not a spark attempt at
all, so LaTeX's `` `\~{}` `` and `` `\~{n}` `` keep their backslash and get no warning.

## In the Studio — autocomplete and a size check

Type `` `~ `` in the Studio's editor for a menu of starter sparks. After a comma inside the
braces, the menu offers the next step only — a type, then a size, a color, the markers and the frame — and
only words the kernel accepts there, so one value is offered a ring or a bullet and a bar is
never offered markers. Typing a word from a later step widens the menu to everything still
valid. Pills complete the same way: a shape, then a color, then a size.

The Studio also **measures** each spark in the live preview, because whether one fits depends
on the layout it lands in, which lint cannot see. A spark that reaches past the space it sits
in, or stands more than **1.5 lines** of the text around it (so it pushes its row or paragraph
apart), gets a `spark-too-big` warning with a one-click fix that sets the largest size that
fits. The check covers the slide in the preview, in the full view; on a phone it reflects the
last time the preview was shown.

Sparks follow the same switch as pills: `inline-code: literal` turns them off for the
deck. **Chart captions** are the one placement to avoid for now: a caption is a flex
column, so an inline spark stacks on its own row (#2266).
