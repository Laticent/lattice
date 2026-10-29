# pills

Shaped, colored labels written in inline code:

```markdown
1. Settlement engine
   - Shipped and load-tested `{STABLE, c2}`
2. Ledger migration
   - Cutover paused for review `{PARTIAL, c4}`
```

A label comes first, then shape, color and size words in any order: `{BETA, tag, c4}`. Each word can also
be written by name, `{BETA, shape=tag, color=c4}`. Design: `engineering/decisions/2026-10-17-pills-plugin.md`;
the notation is Segno's (`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`).

This is an **embedded plugin**: part of how Lattice draws a slide, so it loads on every render and has no off
switch. No `plugins:` entry, host narrowing or `disabled` setting turns it off. The one switch is the author's, and it is for the grammar, not the plugin: `inline-code: literal` in a deck's front matter (or `inline-code-literal` on a slide) makes every backtick span literal, so a `{…}` shows as code and a component that takes a pill shows plain code. The other classes of plugin
(essential, external) and what each can do are in `lib/plugins/README.md`.

## The author's contract

The short form first; the full contract follows under **The full contract**.

| You write | You get |
|---|---|
| `` `{LIVE}` `` | A capsule in the accent color |
| `` `{BETA, tag, c4}` `` | A sharp tag in categorical slot 4 |
| `` `{3, circle}` `` | A circular badge (one character, or a number up to two digits) |
| `` `{DECIDE, diamond}` `` | A diamond; `chevron-right` and `chevron-left` point |
| `` `{ok, icon=check}` `` | A pill with a drawn icon, when the icons plugin knows the name |
| `` `\{LIVE}` `` | The literal text `{LIVE}`, backslash removed |

Shapes: `pill` (the default), `chip`, `tag`, `tag-bordered`, `circle`, `chevron-right`, `chevron-left`, `diamond`.
Colors: `c1` to `c12`, ordinal slots and not color names. Sizes: `sm`, `md`, `lg`, though a pill sizes itself from
the text around it. The spellings `{x}`, `{-}`, `{/}` and `{ }` are reserved for the state marks and render as
literal text; `lint:deck` points at the bare `[x]` form.

## For components

A component never draws its own pill. It either has the author write one, or translates its own content into one
through this plugin (the glossary's range pill is built with `pillHtml` / `pillElement`), and passes in only what it
knows, through custom properties set on the pill or on an ancestor:

| Property | What it sets |
|---|---|
| `--lat-pill-edge`, `--lat-pill-bg`, `--lat-pill-ink` | Border color, fill, text color |
| `--lat-pill-case` | `uppercase` (the default keeps the text's own case) |
| `--lat-pill-tracking` | Letter spacing; the optical-centering indent follows it |
| `--lat-pill-size` | The font size outright, for a component whose type follows something other than the surrounding text (a chart label sized from its grid cell) |
| `--lat-pill-cap` | How much of the surrounding text a pill may fill, `0.85` by default; `1` matches a caption instead of undercutting it |
| `--lat-pill-scale` | A multiplier on the size the plugin chose |

**A pill holds what it is handed.** `pillHtml(text, off, lead)` and `pillElement(doc, text, off, lead)` take an
optional `lead`: content the component built (on the string path, markup a kernel produced, never author text; on the
DOM path, a node). The pill puts it first, in a `.lat-pill-lead` span spaced `0.35em` from the label, and zeroes the
lead's own inline margin, so that gap and the pill's padding are the only spacing. The pill never reads what the lead
is: a drawn check, a mark or a dot all go through the same door. `pillHtmlFrom(parts, off, lead)` and
`pillElementFrom(doc, parts, off, lead)` take the pill's parts (`{value, shape, c, size, icon}`) instead of its
`{…}` text, so a component that already has a label never quotes it. Narration reads a check that leads a pill
sitting directly in a list item or cell as that item's answer, in the layout's own words, exactly as it reads a
`.badge` today (`lib/transformers/prose-projection.mjs`). Elsewhere the lead is spoken as its own word before the
label. Why: `engineering/decisions/2026-10-18-checks.md` §6 and §16.

A component may place a pill (`position`, `align-self`, `flex`) and may ring it (`box-shadow`). It never sets the pill's
border, background, padding, radius or font from `--pill-*`, and no stylesheet outside this plugin may read a
`--pill-*` token: `checkHandRolledPills` (`tools/check-ownership.js`) counts reads per file against an allowlist that
only shrinks. An element that merely looks like a pill (a chip an engine builds, a counter drawn in a pseudo-element)
is not a pill: it owns its type and shape and shares only the base `--radius-*` scale. The rules and their reasons are
in the design note, § 4.3 and § 4.4.

## Icons

A pill's `icon=` calls the icons plugin. Icons is an essential plugin, so a host can switch it off, and then a pill
shows its label alone. Pills list icons as `optional`, never `requires`: an embedded plugin may require only other
embedded plugins.

## The full contract

**Turning the grammar off:** `inline-code: literal` in front matter makes every
single-backtick span in the deck literal — pills, marks and all, including any in the
deck's own `header:` / `footer:`. One slide at a time is
`<!-- _class: inline-code-literal -->`. It is the switch for a
deck you did not write, where `` `[x]` `` in prose was never meant to draw anything. See
[`base.registers.docs.md`](base.registers.docs.md) § `inline-code:`; the Studio carries it
as **Deck settings · General · Inline pills and marks**.

A `{LABEL}` inside **single-backtick** inline code renders as a pill. Shape and color
belong to the value, not to the slide — one ledger can carry four different statuses
without any variant class on the section.

The label comes first, then any shape, color and size words, separated by commas and in any
order: `{BETA, tag, c4}`. Each word can also be written by name — `{BETA, shape=tag, color=c4}`
is the same pill. A label that holds a comma is quoted: `{"Cost, excluding tax"}`, and so is
one that holds `|` `=` `[` `]` `{` or `"` (`{"A|B", tag}`, `{"5\" screen"}`). Unquoted, such a
label leaves the span as plain code, and `lint:deck` warns (`pill-literal`) with the quoted
spelling. This is
the [Segno notation](../../engineering/decisions/2026-09-28-segno-unified-inline-notation.md)
every inline directive shares.

```markdown
1. Settlement engine
   - Shipped and load-tested `{STABLE, c2}`
2. Ledger migration
   - Cutover paused for review `{PARTIAL, c4}`
```

### Shape

`tag` · `tag-bordered` · `chip` · `circle` · `chevron-right` · `chevron-left` ·
`diamond`. With no shape word you get the capsule `pill`.

Every shape is exactly as tall as the capsule, so pills of different shapes share one
center line and never make a row or a line of prose taller. `circle` is a
capsule-height disc and `diamond` a capsule-height rhombus, so they hold **one
character, or a number up to two digits** — `{3, circle}`, `{12, circle}`, `{!, diamond}`. The clipped shapes (the chevrons and the diamond)
carry the same 1px edge as the rest. The label is centered on its capitals, not on the
line box, so it sits on the pill's visual center in Chrome, Firefox and Safari alike;
lowercase descenders hang into the bottom padding. Anything longer stretches the box until
it stops reading as the shape (`{OK, circle}` is an oval, `{WM, circle}` a capsule), so
`lint:deck` **warns** (`pill-shape-crowded`), the editor underlines the pill, and the fix
points at `tag` or `chip`. It never blocks a deck.

### Color — `c1` … `c12`

Ordinal slots onto the categorical tokens, **not color names**. The same slot is sky
blue on `indaco` and deep red on `burgundy`, so a slot picks contrast, never meaning —
never write `c2` because "green means good". Text contrast comes from the categorical
policy already in the engine, so a slot needs no per-pill contrast math.

### Size — automatic, then `sm` `lg`

A pill sizes itself from the text it sits in, so most pills need no size word:

| Where the pill sits | Size |
|---|---|
| A heading or other large text (`#`, `##`, a title slide, a lead or emphasis paragraph) | Half the text's size: large in a title, a step up in a slide title. Text under about twice the pill size, such as an `###` subheading, keeps the usual size |
| Body text, lists, cards, table cells | The metadata size, as always |
| A below-note, a chart caption or a figure caption | Small |
| Footers, headers and other small print | Small, 0.85 of the text around it |

`sm` and `lg` still work, and they scale whatever the context gave: `lg` in a
footer is a bigger footer pill, not a heading-sized one.

Word order is free: `` `{X, tag, c4, lg}` `` and `` `{X, lg, c4, tag}` `` are the same pill.

### What stays literal

Plain inline code is untouched — `` `getUserId()` ``, `` `:root` ``, `` `[data-mark]` ``,
`` `--accent` ``, `` `{ ok, scene }` ``. A pill's `{` is followed directly by its label,
which is what separates it from a JS object literal an author wrote as code: those pad
their braces.

An unknown or repeated word fails back to literal rather than being ignored:
`` `{X, c13}` `` renders as code, visibly wrong in review, instead of quietly becoming a
pill the author did not ask for.

To force the literal for a label that WOULD qualify, put a **backslash** in front:
`` `\{LIVE}` `` renders as `{LIVE}`, and `` `\[x]` `` renders as `[x]`. A broken pill escapes
the same way and silences `pill-literal`: `` `\{A|B}` `` renders as `{A|B}`.

The backslash is only an escape when what follows would have become a pill or a mark, or
is a broken pill attempt, so a regex is safe: `` `\[a-z]` `` and `` `\d+` `` are untouched
and keep their backslash. Braces that belong to another language are never a pill attempt —
a span holding a backslash (LaTeX `` `\{a,b\}` ``, a regex `` `\{2,3\}` ``), a regex interval
(`` `{2,5}` ``) or a template tag (`` `{{name}}` ``) — so they get no warning and keep every
backslash.

**Fenced and indented code blocks are never touched at all** — they are not inline code,
so nothing in them is ever read as a directive.

### An icon in a pill — `icon=`

`{S3, icon=bucket, c4}` leads the label with a drawn icon, in the pill's own color, at any shape:
`{Primary, icon=database, tag}`. `{icon=database}` is an icon with no label. `icon` is written by
name, because a pill's first word is its label. The icons come from the **icons** plugin
(`lib/plugins/icons/icons.docs.md`), which also draws an icon on its own in prose (`^{database}`);
with that plugin off, the pill shows its label alone. A name the set does not have — or a vendor
service name like `icon=lambda` — keeps the span literal, and `lint:deck` names the role icon to
use instead.

### Where a pill can go

Anywhere inline code can — verified on a real render: a heading, a paragraph,
mid-sentence, a blockquote, a table cell, a footer, and a list row's clause. A fenced
` ``` ` block is not inline code and is never touched.

In a **`list-tabular` row** a pill takes the same cell a trailing `` `code` `` takes, so
`` 1. cards-grid `{STABLE, c2}` `` puts the pill in the trailing column. Two limits, both
measured:

- **`spec`** addresses its two codes by position among `code` elements, which cannot see
  a pill. A `spec` row whose trailing chip is a pill works; one whose **key** is a pill
  does not — the key stays in the trailing column.
- **Two trailing items in one row overlap**, e.g. `` 1. Name `META` `{PILL}` ``. That is
  not about pills: two plain `` `code` `` values do the same, because the row is a grid
  and a grid item paints over rather than pushing. Put one value in the trailing slot.

### Editing a pill without typing it — the Studio

In the Studio's Compose editor a pill is **drawn as the slide draws it**, in your theme's own
colors, and it is **one object**: its `{…}` text is not on the page, and there is no caret inside
it. **Tap or click the pill** to change its label, shape, color and size from one editor (a popover
on a desktop or tablet, a sheet on a phone). Each pick rewrites **only the word you changed** in the
span, so `{BETA, c4, tag}` stays in that order and every other pill on the slide is untouched.
**Done** closes the editor and puts the cursor just after the pill; **Edit as text** turns the pill
back into its `{…}` text with the words between the braces selected, and the pill is drawn again when
the cursor leaves it. The arrow keys step over a pill as one thing, Backspace takes all of it, and
Enter on a selected pill opens its editor.

The slide bar has **Undo** and **Redo** buttons for the whole deck, because a phone has no undo
gesture Compose's history is visible to (iOS's own undo lists only what the browser edited). On a
narrow pane the bar is two rows: history and the insert doors on the first, the Format group on the
second. The **+ Pill** button puts a new pill at the cursor (a short selected word becomes its label)
and opens its editor.

A pill stays as text on a slide that is edited in Markdown, in a deck set to `inline-code: literal`,
and where the engine would not draw it (a reserved label, an unknown icon). Opening a deck never
rewrites it: a drawn pill writes back the exact code span it came from. Two code spans cannot touch in
Markdown (`` `{A}``{B}` `` is one span, and both would stop being pills), so Compose keeps a single space
between a pill and a neighboring pill or code span, and **+ Pill** adds that space itself. Backspace on that space does nothing visible: it comes straight back. The editor does not touch a
pill's `icon=`; that word is kept exactly as written. Design:
`engineering/decisions/2026-10-13-compose-inline-notation-editors.md`.

