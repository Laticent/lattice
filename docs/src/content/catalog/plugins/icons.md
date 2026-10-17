---
kind: plugin
name: Icons
order: 5
promise: Icons the size of a word, drawn in your theme's colors.
intro: Write `^{database, c3}` in a sentence and a crisp, single-color icon appears at text size, in the deck's own palette — never an emoji, never a font glyph. About 250 icons, chosen for architecture and business slides, also go inside labels and on Lattice's chart nodes.
useWhen: Your slides show systems, pipelines or teams, and you want icons that match the deck instead of emoji or pasted vendor logos.
syntax: '`^{database, c3}`'
facts:
  - { k: You write, v: '`^{name}` in inline code' }
  - { k: Draws with, v: 'Tabler Icons (MIT), about 250 curated' }
  - { k: Surfaces, v: Every one — drawn at render time }
  - { k: Loaded, v: By default; free until a deck uses one }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/icons/icons.docs.md
    note: Every word, the full icon catalog by category, and the no-logos rule.
  - label: The conformance cases
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/icons/icons.fixtures.md
    note: Exactly what each spelling renders to.
  - label: Icons in charts
    href: https://github.com/Laticent/lattice/blob/main/examples/chart-icons.md
    note: A sample deck with icons on flowchart, hub-and-spoke and state-chart nodes.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-29-inline-icons.md
    note: The design note behind the set, the looks and the curation.
examples:
  - key: inline
    label: In a sentence
    caption: An icon sits in a line of text at text size. The service names stay as words.
    sample: |
      ## An icon is a drawing the size of a word.

      Raw files land in `^{bucket, c4}` S3, a `^{function, c3}` Lambda reads each one, and `^{warehouse, c5}` Snowflake holds the model.
  - key: looks
    label: Three looks
    caption: The same icon as a solid tile, an outline, or a pale tint.
    sample: |
      <!-- _class: table table-fill -->

      ## One icon, three looks.

      | Look | `database` | `shield` |
      | --- | --- | --- |
      | `pigment` | `^{database, c1}` | `^{shield, c3}` |
      | `etching` | `^{database, c1, etching}` | `^{shield, c3, etching}` |
      | `tone` | `^{database, c1, tone}` | `^{shield, c3, tone}` |
  - key: pills
    label: In a label
    caption: Inside a pill, the icon leads the label.
    sample: |
      ## Where each upload goes.

      - `{S3, icon=bucket, c4}` raw uploads, kept for 30 days
      - `{Lambda, icon=function, c3}` one run per upload
      - `{Primary, icon=database, tag}` the system of record
  - key: chart
    label: On a chart
    caption: A flowchart node takes an icon beside its name.
    sample: |
      <!-- _class: flowchart lr -->

      ## Uploads reach the warehouse in under a minute.

      - Browser `{icon=browser}` => Gateway
      - Gateway `{diamond, c2, icon=gateway}` => Queue
      - Queue `{icon=queue}` => Worker
      - Worker `{c3, icon=function}` => Warehouse
      - Warehouse `{cylinder, icon=warehouse}`
---

## The problem

Architecture, operations and business slides lean on icons. Authors usually reach for one of two things, and both go wrong:

- **Emoji** look different on every machine, ignore the theme, and carry a tone a board slide doesn't want.
- **Pasted vendor logos** are multicolored pictures that clash with the palette, blur when printed, and come with their own license terms.

What you want is a small, clean drawing that says "database" or "queue", in the slide's colors, at the size of the words around it.

## The idea

- **You write a word in inline code.** `` `^{database}` `` draws a database icon. A few more words, in any order, style it: `c3` picks a color from the deck's chart palette, `lg` makes it bigger, `etching` switches to an outline.
- **It's drawn, not typed.** Every icon is an SVG drawing, so it's sharp at any size and takes its color from the theme — light, dark or print.
- **Roles, not brands.** The set is about 250 icons from Tabler, an open-source (MIT) icon library, curated for architecture and business slides: compute, storage, data, network, security, delivery, people and more. There are deliberately no vendor logos. A service is a role icon beside its name: S3 is a `bucket`, Lambda a `function`.
- **It goes where labels go.** Inside a pill — one of Lattice's small inline labels, written `{S3, c4}` — `icon=bucket` leads the label. On a flowchart, hub-and-spoke or state-chart node, it sits beside the node's name.
- **It costs nothing until you use it.** The drawings load only for a deck that writes an icon.

## How to use it

Icons are on in every deck. Write one in inline code:

```markdown
Raw files land in `^{bucket, c4}` S3.
```

Style it with words, in any order:

| Word | Does | Default |
| --- | --- | --- |
| `c1` … `c12` | A color from the deck's chart palette | `c1` |
| `sm`, `md`, `lg` | Size, relative to the text | `md` |
| `framed`, `bare` | A tile behind the icon, or the lines alone | `framed` |
| `pigment`, `etching`, `tone` | Solid tile, outline, or pale tint | `pigment` |
| `square`, `rounded` | The tile's corners | `square` |
| `label="…"` | What a screen reader says | the icon's name |

Inside a pill, and on a chart node:

```markdown
`{S3, icon=bucket, c4}`

- Gateway `{diamond, c2, icon=gateway}` => Queue
```

To style every icon in a deck at once, set `icon: bare etching` in the deck's front matter (the settings block at the top of the file). In the Studio, the editor suggests icon names as you type after `` `^{ `` or `icon=`, with each drawing beside its name.

## Where else it fits

Icons like these suit any slide that names parts of a system or an organization: cloud and system architecture, data pipelines, security reviews, monitoring, release pipelines, org charts and business models. Tabler itself is a widely used open-source icon set for web interfaces.

## How Lattice uses it

No slide type requires the plugin, but three chart slides are designed to use it: the flowchart, hub-and-spoke and state chart all take an icon per node. Pills take `icon=`. With the plugin switched off, a pill shows its label alone and a node shows its name.

## What it doesn't do

- **No vendor logos.** `^{s3}` stays as code, and the deck linter suggests `bucket`. Vendor marks are multicolored and come with their own terms.
- **A curated set, not every Tabler icon.** And no icons that spell out letters, like `api` or `www`.
- **One color per icon,** on purpose.
- **An unknown name stays as code,** and the linter suggests the nearest names.
- **Icons shouldn't carry meaning alone.** Pair each with a word, so the slide still reads without it.
