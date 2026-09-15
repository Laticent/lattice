# Lattice layouts — anchor, statement



> Opening, closing, section breaks, and the one-claim slides.



**Contents:** `closing` · `divider` · `title` · `big-number` · `content` · `premise` · `quote` · `split-panel`



## closing

> Final slide. Dark canvas mirror of title.

**Function** anchor · **Form** bookend · **Substance** prose

**Tags** `summary` · `takeaway` · `board-deck`

Last slide of every deck. Restates the takeaway or call-to-action. Like title, suppresses header/footer/pagination — the dark canvas signals "we're done." Add `spectrum` (mirrors `title`'s) when the deck itself is built on a multi-step color story worth echoing on the way out.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Closing line — takeaway, thank-you, or call to action. Capped at `--measure-bookend-heading` (16em ≈ 33 characters), mirroring title; `text-wrap: balance` evens the lines. Override the token in front-matter `style:` — never hand-break with `<br>`. |
| `eyebrow` | `p > code` | no | Optional category label. |
| `subtitle` | `p` | no | Optional supporting line. Capped at `--measure-bookend-lede` (26em ≈ 56 characters) — a reading measure, so a two-clause sign-off holds together instead of running the frame's ~90 characters. A trailing list's rows take the same measure. |

#### Variant decision rule

- **default (no modifier).** A single-sentence takeaway or call-to-action closes the deck — the common case.
- **`qr`.** The audience should leave with a scannable link (docs URL, contact card) rather than just a text call-to-action.
- **`index`.** The closing is a reference/see-also list of multiple next steps or resources, not a single takeaway sentence.
- **`spectrum`.** `title` also carries `spectrum` — closes the bookend pair with the same generated gradient bar, echoing the deck's own multi-step color story one last time.

#### Common mistakes

- **Eyebrow written as bold or plain text instead of inline code.** The eyebrow match is `h2 + p:has(> code:only-child)` — wrap it in backticks immediately after the heading; without the code span it falls through to the general italic subtitle rule instead of the uppercase mono eyebrow lifted above the heading.
- **The subtitle paragraph is authored before the eyebrow paragraph instead of after it.** The eyebrow match is an immediate-next-ELEMENT-sibling selector (`h2 + p:has(> code:only-child)`) — keep the source order heading → eyebrow → subtitle.
- **In the `index` variant, the leading reference key isn't wrapped in inline code, e.g. `docs — the component catalog` instead of leading with a backtick-wrapped key.** The `index` variant's mono reference-key styling (`section.closing.index :is(ul,ol) li code`) only applies to an actual `<code>` element — wrap the leading key in backticks so it renders as a mono chip, not plain text.

### When to use

- **Last slide of every deck.** Closes the bookend pair with title. Restates the takeaway, the call to action, or the next-steps line. The dark canvas tells the audience visually that the presentation is over.
- **Single takeaway line.** The h2 is the slide. Keep it to one editorial line that summarizes the whole deck or names the action the audience should take. The eyebrow can carry a sub-line or link.
- **Accent modifier for emphasis.** Pair with the universal `accent` modifier to recolor the focal heading. Useful when the closing line is a quote or a key decision the deck has been building toward.

### When NOT to use

- **Multi-line heading.** Keep the closing line to one editorial sentence. The layout is centered and large — two-line closings get cramped and lose impact.
- **Header or footer overrides.** Don't reinstate `_header:` or `_footer:` on the closing. The dark canvas is the "we're done" signal; chrome breaks it. Use the `silent` modifier to suppress all three in one token.
- **Mid-deck closing.** If the audience needs a strong statement mid-deck, use `big-number` or `content` with the `dark` modifier. Reserving closing for the final slide preserves its bookend role.

### Authoring

```markdown
<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Closing takeaway or call to action

`Optional eyebrow`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│            [dark background]            │
│                                         │
│                 CLOSING                 │
│                                         │
│             Take this away              │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `qr` — qr

Scan to take the deck with you.

```markdown
<!-- _class: closing qr -->

`closing qr`

## Leave a scannable takeaway behind.

The payload bullet renders as a QR code sized for the back row.

- https://laticent.io/components/closing
- Scan to open `caption`
```

#### `index` — index

Ends on a reference list — see also, next steps.

```markdown
<!-- _class: closing silent index -->

## Where to go next.

`Next steps`

- `docs` — the component catalog and authoring contracts
- `gallery` — every layout rendered in light and dark
- `studio` — compose and preview a deck in the browser
```

#### `spectrum` — spectrum

Mirrors title's generated gradient bar — the deck's color story, one last time.

```markdown
<!-- _class: closing silent spectrum -->

## The closing echoes the same six-step spectrum.

`Closing · spectrum`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`title`](#title) — opens the deck — same dark-bookend chrome
- [`divider`](#divider) — mid-deck section breaks — same dark canvas
- [`big-number`](#big-number) — single emphatic statement mid-deck without the bookend signal

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/anchor/closing>


## divider

> Section boundary slide. Dark canvas with a single heading.

**Function** anchor · **Form** divider · **Substance** prose

**Tags** `section-break` · `agenda-setting` · `walkthrough`

Marks the start of a major section. Use sparingly — every divider is a context switch for the audience. A 30-slide deck typically has 3-5 dividers; more becomes navigation noise.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Section name. Capped at `--measure-bookend-heading` (16em ≈ 33 characters); `text-wrap: balance` evens the lines. Left-aligned by default, so a short section name simply sits on one line and the cap never shows. Override the token in front-matter `style:` — never hand-break with `<br>`. |
| `eyebrow` | `p > code` | no | Optional section number or category label above the heading. |

#### Variant decision rule

- **default (no modifier).** A standard mid-deck section start — dark canvas, one heading, no extra chrome.
- **`numbered`.** The audience needs to know which section they are in — a long, multi-part deck where a running count belongs on the slide itself. `divider` and `divider light` share one series, so mixing them does not restart it.
- **`light`.** A narrower re-focus within a section rather than a full section start — sits between a dark divider and a run of content slides. Reserve the dark default for genuine section starts.
- **`qr`.** The divider itself should carry a scannable link — a resource specific to the section it's opening.

#### Common mistakes

- **Eyebrow written as plain text instead of inline code, e.g. plain `Section 01` instead of a backtick-wrapped one.** Divider's eyebrow uses the shared before-heading rule `p:has(> code:only-child):has(+ h2)` (base.modifiers.css) — wrap it in backticks; without the code span it's just a plain paragraph with no eyebrow treatment at all.
- **Eyebrow paragraph placed AFTER the heading, copying the title/closing pattern.** Divider's eyebrow is the mirror image of title/closing's — it uses the BEFORE-heading rule (`p:has(> code:only-child):has(+ h2)`), not the after-heading one those two use. Keep it directly before `## Section name`; placed after, it still renders (via the separate after-heading rule) but as an italic secondary-color treatment, not the intended mono kicker.
- **Reaching for `numbered` on a slide with no heading, or expecting it on a `title` / `closing`.** The mark rides the heading's `::after` — deliberately, because `section::after` is the engine's page number and `silent` / `no-paginate` null it. No heading, no numeral — and the counter still advances, so the next divider reads one higher and the series silently skips. The heading is a required slot here anyway. `numbered` is a divider modifier only: a bookend is not a section, so `title` and `closing` do not take it. It also suppresses the header and footer, so a numbered divider cannot carry a `_footer:` caption. The mark's band is reserved, so a long heading can no longer climb into the numeral — it pins under the band with a constant 2.5cqi of clearance and grows downward instead, and far enough down the slide genuinely overflows and the export says so. `light` and `qr` need the band too: measured without it they collide at -15.2 and -85.3.

### When to use

- **Major section starts.** Marks the boundary between two themed sections of the deck. The dark canvas is a strong context-switch signal — use it when the audience needs to re-orient.
- **Sparingly.** A 30-slide deck typically has 3-5 dividers. More becomes navigation noise; the signal weakens if every third slide is a divider.
- **With an eyebrow.** An inline-code paragraph above the heading stamps a section number or category label. Useful for serialized decks where the audience needs to remember which section they're in.
- **Light variant for sub-section orientation.** The `light` variant keeps the bright body-slide canvas and centers the heading at h2 weight — a lighter context switch for narrowing focus within a section, between a dark divider and the content slides. (Absorbed the standalone `subtopic` component on 2026-06-07.)

### When NOT to use

- **More than five per deck.** Each divider is a hard context switch. Too many dilutes the signal and slows the audience. Group related content under fewer sections instead.
- **Section title that doesn't earn a section.** If the next 3-4 slides aren't a coherent unit, the `light` variant (bright canvas, centered) is the right tool. Reserve the dark divider for genuine section starts.
- **Header or footer overrides.** Don't reinstate `_header:` or `_footer:` on a divider. The dark canvas is meant to be uninterrupted; chrome belongs on body slides.

### Authoring

```markdown
<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 01`

## Section name
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│            [dark background]            │
│                                         │
│               SECTION 02                │
│                                         │
│            Section headline             │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `numbered` — numbered

Masthead — the running section number over a hairline, top-left.

```markdown
<!-- _class: divider silent numbered -->

`divider numbered`

## The stamp counts this divider for you.
```

#### `light` — light

Bright canvas, sentence-length waypoint.

```markdown
<!-- _class: divider light -->

`divider light`

## The light divider trades the dark canvas for a bright, full-sentence waypoint.
```

#### `qr` — qr

The payload bullet becomes a code.

```markdown
<!-- _class: divider qr -->

`divider qr`

## The payload bullet below becomes a scannable code.

- https://laticent.io/components/divider
- Scan for the divider's docs `caption`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`title`](#title) — opens the deck — same dark-bookend chrome
- [`closing`](#closing) — closes the deck — completes the bookend trio

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/anchor/divider>


## title

> Opening slide. Dark canvas, centered, no chrome.

**Function** anchor · **Form** bookend · **Substance** prose

**Tags** `pitch` · `board-deck` · `showcase` · `kickoff`

First slide of every deck. Sets the topic and the visual tone. Suppresses header, footer, and pagination (or use the universal `silent` modifier for the same effect in one token). Add `spectrum` when the deck itself is built on a multi-step color story (a level system, a spectrum of stages) worth echoing here.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h1` | yes | Deck title. Capped at `--measure-bookend-heading` (16em ≈ 33 characters) so a long title composes as a block rather than a full-width banner; `text-wrap: balance` evens the lines. Override the token in front-matter `style:` — never hand-break with `<br>`. |
| `eyebrow` | `p > code` | no | Optional category label rendered above the h1 (authored as an inline-code paragraph immediately after the h1; flex `order` lifts it above). |
| `subtitle` | `p` | no | Optional plain-paragraph subtitle below the h1. Uncapped — title's subtitle is a single tagline, unlike closing's, which takes `--measure-bookend-lede`. |

#### Common mistakes

- **Eyebrow written as bold or plain text instead of inline code, e.g. `**Category · Date**`.** Wrap the eyebrow paragraph in backticks. The eyebrow CSS matches `h1 + p:has(> code:only-child)`; without the code span the paragraph falls through to the general subtitle rule instead — it still renders styled, just as a second subtitle line, not the uppercase mono eyebrow lifted above the h1.
- **The subtitle paragraph is authored before the eyebrow paragraph instead of after it.** The eyebrow match is an immediate-next-ELEMENT-sibling selector (`h1 + p:has(> code:only-child)`) — it only counts element siblings, so an HTML comment between the h1 and the eyebrow is harmless, but another paragraph is not. Keep the source order heading → eyebrow → subtitle.
- **Inline emphasis (`**bold**`, `_italic_`) inside the h1 itself.** Keep the h1 to plain text. The centered, oversized type already carries full weight — nested emphasis at that scale reads as noise, not emphasis.
- **Trying to author the spectrum bar as a markdown `---`/`***` rule instead of the `spectrum` class.** Every top-level `hr` token in a slide body is Marp's slide separator (it splits the deck into a new slide) — there is no way to hand-author a literal rule element here. Add the `spectrum` class instead; the bar is CSS-generated.

### When to use

- **First slide of every deck.** Sets topic, audience, and visual tone in one glance. The dark canvas anchors the deck visually so subsequent slides feel like a continuous document.
- **Brand or section bookends.** Pair with `divider` (mid-deck section breaks) and `closing` (the final slide) for the full anchor trio. All three share the dark-bookend treatment.
- **Pitch and proposal openings.** When the audience needs the headline and the framing line before any data. The subtitle paragraph is where the framing line goes.

### When NOT to use

- **Mid-deck statements.** Use `big-number` or `content` for emphatic statements inside a deck. Reaching for the title chrome mid-deck breaks the bookend signal.
- **Multi-line h1.** Keep the h1 to one editorial line. The layout is centered and large — two-line titles get cramped and lose impact.
- **Header or footer overrides.** Don't add back `_header:` or `_footer:` on a title slide. The dark canvas is meant to be uninterrupted; chrome belongs on body slides.

### Authoring

```markdown
<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Deck title goes here

`Category · Date or audience`

One-line subtitle that frames the deck.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│            [dark background]            │
│                                         │
│              EYEBROW LABEL              │
│                                         │
│           Display Title Here            │
│           Subtitle or tagline           │
│                                         │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `spectrum` — spectrum

A generated gradient bar below the subtitle, in the theme's own six-step palette.

```markdown
<!-- _class: title silent spectrum -->

# A deck built on a color-coded spectrum.

`Six stages, six colors`

The title echoes the same six-step story the deck's own components carry.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`divider`](#divider) — mid-deck section breaks — same dark-bookend chrome
- [`closing`](#closing) — the final slide — closes the bookend pair

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/anchor/title>


## big-number

> Single oversized number as the focal claim.

**Function** statement · **Form** canvas · **Substance** prose

**Tags** `hero-number` · `metric` · `pitch`

Use to make one metric land. The number should be the headline — supporting text is one short caption. The whole slide is the chart.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code` | no | Optional label above the number. |
| `number` | `ul > li:first-child` | yes | First list item: the giant number. |
| `caption` | `ul > li:first-child > ul > li` | no | One-line caption below the number (nested bullet). |

#### Common mistakes

- **Caption authored as a second top-level bullet instead of nested under the number's list item.** Indent the caption as a sub-bullet of the number, not a sibling `- caption` line — a sibling bullet doesn't just miss the caption styling, it matches the SAME top-level rule as the number itself and renders as a second giant hero-sized line.
- **The unit or label baked into the number line itself, e.g. `- 1,248,500,000 users`.** Keep the number list item to the numeral plus its own unit symbol (`%`, `$`, `×`). Put what's being counted in the nested caption (the layout's demonstrated pattern — see the skeleton/sample) or, for a short category name, the eyebrow — not appended prose after the number itself.
- **Eyebrow restates the number's value instead of naming its category, e.g. eyebrow `92%` above a number `92%`.** The eyebrow names the metric class ("Audience recall", "Q3 revenue"); the number carries the value. Restating the value in both places wastes the eyebrow's one job.

### When to use

- **One metric carries the slide.** When the audience needs to remember exactly one number from this part of the deck. The whole slide is the chart — no surrounding context, no comparisons, no axes.
- **Headline that earns the canvas.** Reach for big-number when the metric is the argument: cost reduced by 4×, audience reach grew 92%, time-to-decision dropped from 14 days to 4. One claim, one canvas.
- **Eyebrow names the metric class.** The inline-code eyebrow contextualizes the number ("Audience recall", "Q3 revenue", "Latency p99"). The number is the value; the eyebrow is the label.

### When NOT to use

- **Multiple metrics on one slide.** Two big numbers on one canvas dilute both. Use `stats` for a row of three metrics or `kpi` for a grid of four; reserve big-number for genuinely solo claims.
- **Caption longer than one line.** If the caption needs a sentence to explain, the number isn't carrying the slide. Either trim the number's claim or move to `content` where prose has room.
- **Decorative numbers without an argument.** "99.99% uptime" by itself is a boast, not a claim. Big-number works when the number is the answer to a question the audience came in with.

### Authoring

```markdown
<!-- _class: big-number -->

`Optional eyebrow`

- 92%
  - of the audience remembers a single number from a deck.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  EYEBROW                                │
│                                         │
│                 ┌─────┐                 │
│                 │ 42× │                 │
│                 └─────┘                 │
│                                         │
│      Caption explains the number.       │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `stats` — row of 2-3 metrics, comparable visual weight
- `kpi` — grid of 4-6 metrics with status indicators
- [`split-panel`](#split-panel) — the metric needs a paragraph of context alongside it
- [`content`](#content) — the argument is mostly prose with a number embedded

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/statement/big-number>


## content

> Generic prose slide — heading plus paragraphs or a short list.

**Function** statement · **Form** canvas · **Substance** prose

**Tags** `walkthrough` · `overview` · `summary`

The catch-all for explanatory content that doesn't fit a more structured layout. Resist using it when a more specific component (cards-grid, stats, compare-prose) would shape the content better. **`content` is also the DEFAULT**: a slide that names no component at all resolves to it (#1292), so writing nothing and writing `_class: content` are the same thing. That is why its prose reads at the body tier rather than the slide-statement tier — it has to sit correctly beside a Key Insight, a below-note and a table, all of which are body-tier.

### Agent contract

**Capacity** ~5 items at a wide @size (crowds past 6, overflows past 7).

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading. |
| `body` | `section > p, section > ul` | yes | Paragraphs or a short bullet list under the heading. Keep under ~40 words — an editorial target for a slide you chose this layout for, not a limit the engine enforces; a slide that merely fell back to `content` is bound by the overflow oracle, not by this. |

#### Common mistakes

- **Nesting a second level of bullets to add sub-points, expecting them to read with the same weight as the top level.** A nested list steps DOWN one type tier (top level is --fs-body, nested is --fs-body-compact) — nested items read as supporting asides, not equal peers. If the items should carry equal weight, keep them all at the top level.
- **Expecting a trailing paragraph to stay body copy after a list or a table.** It is promoted to a below-note — hairline rule, muted ink. A paragraph after a PARAGRAPH is never promoted, so ordinary prose is unaffected. When the trailing sentence really is the conclusion of the list rather than a footnote to it, add `no-note` to the slide `_class` and it stays body copy. A deck-wide `class: no-note` in front matter works too, and reaches every slide — including the ones that name their own `_class:`.

### When to use

- **Explanatory prose that doesn't shape.** A paragraph that develops one idea. No comparisons to spell out, no inventory to grid, no metric to highlight — just prose with a heading. The catch-all when shape would be forced.
- **Under forty words.** Content slides earn their place when they're brief. Past 40 words the slide becomes a wall of text and the audience stops reading. Trim or split into two slides.
- **Optional short bullet list.** If the paragraph wants two or three loose qualifications, a bullet list below the prose is fine. For more than that, the content is really structured — move to a `list` or `cards-stack` slide.

### When NOT to use

- **Forced shape into prose.** If the content is a comparison, use compare-prose. If it's a list of options, use cards-grid. If it's a sequence, use list-steps. Reaching for content when shape exists wastes the slide.
- **Wall of text.** More than 40 words and the audience tunes out. The layout doesn't fight back — it'll happily render a 200-word paragraph that nobody reads. Split or trim.
- **Multiple headings.** Content carries one heading and one idea. Two h2s on one slide reads as two slides crammed together. Split into two content slides or use a structured layout.

### Authoring

```markdown
<!-- _class: content -->

## Slide heading.

The explanatory paragraph that develops the heading goes here. Keep the slide under forty words.

- Optional supporting point one.
- Optional supporting point two.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  EYEBROW                                │
│  Single-idea heading.                   │
│                                         │
│  Paragraph carries the slide.           │
│  One idea expanded into prose,          │
│  no lists, no chrome.                   │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`quote`](#quote) — the prose IS a quote — let the quotation chrome carry it
- [`big-number`](#big-number) — the prose IS a metric — let the number carry it
- `cards-grid` — the prose IS a parallel list of items
- `compare-prose` — the prose IS a two-way comparison
- `list-steps` — the prose IS an ordered sequence

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/statement/content>


## premise

> A framing claim beside a vertically centered ledger of parallel rows — a number, a term, a description, and a right-aligned note, each row colored by its own categorical hue.

**Function** statement · **Form** split · **Substance** series

**Tags** `onboarding` · `ranking` · `definition` · `overview`

Use when a deck needs to introduce an ORDERED vocabulary — a maturity ladder, a set of named stages, a ranked taxonomy — and wants one framing claim to sit beside the whole list at a glance, not one slide per term. The claim doesn't summarize the rows; it states why the ordering matters. Each row is a fixed four-part record: an index, the term, one description clause, and a short framing question or note, right-aligned. Both zones share the page's own background — unlike `split-panel`, there's no colored panel divide.

### Agent contract

**Capacity** ~4 items (crowds past 6, overflows past 8) — past that, split across slides (automatic) / list-tabular. Re-derivable, not an ad-hoc render: a premise element builder lives in tools/lib/calibrate-core.js, so `node tools/calibrate-capacity.js premise --family <f>` reproduces these. At the tool basis (this component density.soft, 14 words a row) landscape, SQUARE and mobile all fit 9+, and PORTRAIT is the only family that binds, at 6. The basis is part of the number — a denser row lowers every ceiling — which is why the flat block stays the landscape budget and adapt.capacity tightens only the family that measured lower. These numbers moved once during review: an earlier cut of the reflow stacked each row into a three-line card, which cut the portrait ceiling to 4; keeping the row a row (term auto-sized rather than pinned to a fixed track) restored it to 6 and removed four gallery clips. premise shipped with no capacity block at all, so an over-long ledger could neither warn nor split; it just clipped.

**Density** aim ~14 words per item; past ~18 it reads as a wall of text — the description clause plus the trailing question, combined — not a sentence each.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | The claim — why the ordering in the ledger matters, not a summary of it. |
| `lede` | `h2 + p` | yes | One-to-two sentence framing paragraph under the claim, naming the two axes or dimensions the ledger's rows walk. |
| `rows` | `ol > li` | yes | Each row is a NUMBERED item: the term on the item's own line, then exactly two nested bullets — the description clause, then a short framing question. The ordinal is a CSS counter (never author-typed, so rows renumber on reorder) and the term bolds automatically. 3-8 rows; each is colored by its own slot in the theme's categorical palette. |

#### Common mistakes

- **Writing the row as a nested `- Title` / `  - body` pair instead of one inline line.** `premise` rows are ONE line with four inline segments (code, bold, plain text, italic) — the nested title+body pattern other card-style layouts use doesn't apply here; the row parser looks for a `<strong>…</strong>` immediately followed by descriptive text and a trailing `<em>`.
- **Omitting the trailing italic note, expecting the row to still align.** The note's column is reserved whether or not it's authored — an empty note leaves a blank cell rather than collapsing the row, so pad it or the row reads unfinished.

#### Data shape

- Rows should be authored in the ranking's natural order (lowest to highest, or first to last) — the row order IS the categorical color order.
- Up to eight rows are colored from the categorical palette before hues repeat; past eight, split into two slides.

### When to use

- **An ordered vocabulary needs one overview slide.** A maturity ladder, a named set of stages, a ranked taxonomy — anything with 3-8 ordered terms that deserves a single at-a-glance slide before the deck dives into each one individually.
- **The claim explains the ORDER, not the list.** The heading + lede earn their place by saying why the ranking matters ("growth is a change in thinking, not title") — if there's nothing to claim about the ordering, a plain `list` serves better.
- **Every row shares the exact same four-part shape.** Index, term, one clause, one right-aligned note. A row that needs more than that (a nested sub-list, a multi-sentence description) has outgrown `premise` — reach for `cards-stack` or a per-term `split-panel proof` slide instead.

### When NOT to use

- **Rows with unequal structure.** Every row must carry all four segments in the same order. A row missing its trailing note, or with a two-clause description, breaks the ledger's scan rhythm — trim or pad it to match its siblings.
- **More than eight rows.** The categorical palette cycles at eight; past that, split into two premise slides by group rather than repeating hues.
- **The heading summarizes the rows instead of claiming something.** "Six cognitive verbs" restates the list; "growth is a change in thinking, not title" claims why the list matters. If the heading can't be argued with, it's a caption, not a premise.

### Authoring

```markdown
<!-- _class: premise -->

## The claim the ledger exists to support.

One or two sentences naming the axes the rows below walk.

1. First term
   - A short clause describing it.
   - A question it answers?
2. Second term
   - A short clause describing it.
   - A question it answers?
3. Third term
   - A short clause describing it.
   - A question it answers?
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  The claim,      01 Term  clause  note  │
│  why the         02 Term  clause  note  │
│  order matters.  03 Term  clause  note  │
│                  04 Term  clause  note  │
│                  05 Term  clause  note  │
│                  06 Term  clause  note  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`split-panel`](#split-panel) — the featured element deserves its own colored panel, not a shared background
- `list-tabular` — the rows need MORE than four fields, or a header row naming the columns
- `cards-stack` — each term needs its own multi-sentence body, not a one-clause row
- `glossary` — the terms are unordered and there's no claim to make about their sequence

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/statement/premise>


## quote

> A pulled quotation, centered, with attribution.

**Function** statement · **Form** canvas · **Substance** prose

**Tags** `pull-quote` · `quotation` · `showcase`

Use to land a phrase verbatim — customer voice, expert claim, mission statement. Keep under ~25 words. The quote IS the slide; the attribution is the supporting credit. `bare` drops the card, border, and quotation-mark glyphs for a plain, display-scale statement — a hook or cold-open line, not a sourced quotation.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `quotation` | `blockquote > p` | yes | The quoted text. |
| `attribution` | `section > p:last-child` | no | Attribution line below the quote. |

#### Common mistakes

- **Writing the attribution as a second line inside the blockquote (`> quote text` then `> — Person`) instead of a separate paragraph after it.** The attribution slot is the paragraph AFTER the blockquote, not inside it — written inside, it inherits the blockquote's large italic quotation styling instead of the smaller attribution treatment.
- **Splitting the quotation across two paragraphs inside the blockquote.** The blockquote's opening/closing smart-quote glyphs decorate the blockquote as a whole, once — two paragraphs inside it both render at full quotation size with no visual distinction, instead of the single continuous quotation the layout expects.

### When to use

- **Verbatim language matters.** When the audience needs to hear the words exactly as they were said — customer feedback, expert claim, regulatory text, mission statement. Paraphrasing would lose the impact.
- **One breath of reading.** Keep the quotation under ~25 words. The audience reads silently in one breath; longer than that and they're scanning, not feeling the words.
- **Attribution earns the quote.** Anonymous quotes feel weak. Attribute the speaker, their role, and the context ("Head of Product, Pilot Team 3" beats just "a customer"). The attribution is the credibility.

### When NOT to use

- **Paragraph-length quotes.** If the quote runs past 25 words, the slide is reading like a wall of text. Trim aggressively or use `split-panel pullquote` (gives the quote half the slide alongside spelled-out implications).
- **Multiple quotes per slide.** Two quotes on one canvas dilute both. The whole point is that one quote earns the whole slide. For a montage of customer voices, use successive quote slides.
- **Decorative quotes.** If the quote could be paraphrased without losing anything, the slide doesn't need to be a quote slide. Move the idea into `content` and skip the chrome.

### Authoring

```markdown
<!-- _class: quote -->

> The quoted sentence sits here, kept short enough to read in one breath.

— Person, Role
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│                                         │
│       "A pulled quote that fills        │
│        the center of the slide."        │
│                                         │
│          — Attribution, source          │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `bare` — bare

No card, no quotation marks — a plain display-scale line.

```markdown
<!-- _class: quote bare -->

> The difference between a senior engineer and a staff engineer isn't what they ship — it's how they think about what to ship.

*The question this framework answers*
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`split-panel`](#split-panel) — the quote needs implications spelled out alongside it
- [`content`](#content) — the language is paraphrasable — let prose carry it
- [`big-number`](#big-number) — the most memorable thing is a metric, not a phrase

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/statement/quote>


## split-panel

> Featured left panel + supporting right zone — one prominent claim beside the points that substantiate it.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `summary` · `board-deck` · `hero-number` · `pull-quote` · `takeaway`

Use when one prominent element (a heading, a hero number, a pull-quote, a phase) deserves a dedicated panel and the right side carries the supporting points. The default anchors a heading; variants reshape what the panel features: `metric` (hero number, light-left), `pullquote` (pull-quote), `steps` (numbered step-timeline), `watermark` (accent panel + letterform + meta footer), `proof` (a scenario signal + two paired proof cards, for a claim that must be demonstrated, not just supported). Add `capstone` on top of `proof` for that sequence's climactic entry: the signal becomes a quoted card, the checkpoints become plain top-rule pillars. For a binary decision with a verdict, reach for `split-compare`. A run of `proof` slides is a SEQUENCE, so the engine tints each one from the theme's categorical palette by its position in the deck — authors write `split-panel proof` and nothing else. `capstone` implies `proof`, so the sequence's final slide is just `split-panel capstone`. An explicit `cat-1`…`cat-8` overrides the assignment for one slide.

### Agent contract

**Density** aim ~16 words per item; past ~24 it reads as a wall of text — one finding per row, a sentence.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-of-type > code` | no | Optional inline-code label above the feature (the phase number under `steps`, the unit under `metric`). |
| `heading` | `h2` | yes | The featured element in the left panel — a heading by default; a hero number under `metric`; the phase name under `steps`. (Under `pullquote`, use a blockquote instead — see the variant.) |
| `lede` | `p` | no | One-sentence framing paragraph under the feature. |
| `points` | `ul > li` | yes | Right-side supporting points. Each li's lead is the point title — it renders bold automatically (no `**…**`); follow it with a nested `- body` line. Under `proof` there are exactly THREE items and the FIRST is the scenario signal (its lead is the label, e.g. "You know you're here when"); the other two render as the paired proof cards. |

#### Variant decision rule

- **default (no modifier).** A thesis heading deserves the panel and the right column substantiates it with prose points — the plain briefing look.
- **`metric`.** A hero number is the featured element — the panel flips light and the number becomes the display type.
- **`pullquote`.** The featured element is a verbatim quotation — author a blockquote in the left panel instead of a heading.
- **`steps`.** The panel anchors a numbered phase rather than a heading, and the right column is a numbered sequence rather than loose points.
- **`watermark`.** You want a decorative accent panel — an oversized letterform behind the heading — plus an optional two-line Audience/Intent metadata footer after the points.
- **`mirror`.** Same anatomy, but the deck's reading rhythm wants the featured panel to land on the right instead of the left.
- **`qr`.** A URL to scan supplements the panel — a bullet tagged `qr` (or a bare URL) auto-resolves into a QR figure appended to the RIGHT (supporting) column; the left panel keeps its normal required heading/lede, it doesn't become the QR.
- **`cat-1`.** Rarely — the tint is ASSIGNED automatically from the slide's position in the run of `proof` slides, so you normally write nothing. Reach for an explicit `cat-N` only to pin one slide to a specific hue (or to repeat a hue deliberately). A pinned slide still counts in the sequence, so it does not shift the slides after it.
- **`capstone`.** This is the SEQUENCE's last, most-earned entry — the claim is proven, not just illustrated. Write `split-panel capstone`: it implies `proof` (same three-item shape) and joins the same automatic tint sequence. Swaps the signal callout for a quoted card and the checkpoint cards for top-rule pillars.

#### Common mistakes

- **Using a `## heading` in the left panel under `pullquote` instead of a `>` blockquote.** Under `pullquote` the transform builds the left panel from ONLY the blockquote and its citation — an `h2` never lands in the left panel at all; it gets swept into the right column above the supporting points instead, leaving the featured panel blank.
- **Adding a third line to `watermark`'s trailing metadata footer, expecting a third labeled row.** The footer's "Audience ·" / "Intent ·" prefixes are hard-coded to the first two list items only — a third item renders with no label prefix at all.
- **Under `proof`, omitting the lede paragraph between the heading and the `### signal` label.** Always write a lede under `proof` — omitting it lets the extractor mistake the signal paragraph for the lede, hoisting it into the left panel and leaving the right zone's label empty.
- **Under `proof`, authoring more or fewer than exactly two checkpoint items.** The two-column card grid assumes a pair. One item leaves an empty column; three crowds a third card half-width.
- **Applying the same `cat-N` to every slide in a sequence, or picking numbers out of order (`cat-1`, `cat-4`, `cat-2`).** The point of `cat-1`…`cat-8` is that each slide in the SET reads as its own step — assign them in order, one number per slide, not the same number repeated or shuffled.
- **Setting a long deck-level `header:` on a deck that uses this layout.** The running header sits OVER the panel here, so it takes the panel field's ink (`--on-dark-secondary` on the inverse panel, `--on-accent` under `watermark`, `--cat-on-fill` on a `cat-N` tint) rather than the canvas ink. Past roughly 25 characters the header runs beyond the panel's edge and carries that ink onto the canvas, where it loses contrast. Keep it short, or set `<!-- _header: "" -->` on these slides. `metric`, `steps` and the `mirror` forms put canvas under the header and are unaffected.

### When to use

- **One feature, supporting points.** When a single prominent element — a thesis heading, a hero number, a quote — deserves its own panel and the right side substantiates it. The panel is the anchor; the right is the evidence.
- **Pick the variant by what the panel features.** Heading (default), hero number (`metric`), pull-quote (`pullquote`), phase + numbered steps (`steps`), an accent panel with a letterform watermark and a metadata footer (`watermark`), or a scenario + two proof cards (`proof`).
- **A claim that must be demonstrated, not just supported.** `proof` pairs the panel's claim with one scenario paragraph ("you know you're here when…") and two named proof cards. Use it when the audience needs evidence the claim actually holds, not just a list of reasons to believe it.
- **Points carry a title + body.** Each right-side item leads with a bold title (lifted automatically) and a nested one-line body. Three or four points read best; more crowds the panel.

### When NOT to use

- **A binary decision with a verdict.** If the slide weighs two options and lands a recommendation, use `split-compare` — its right zone is a 2-option grid + a verdict card, which `split-panel` does not provide.
- **Co-equal halves.** split-panel is asymmetric — a featured panel beside supporting detail. For two co-equal options side by side, use `compare-prose`.
- **A list with no feature.** If there's no prominent left-panel element, a plain `list` or `cards-stack` serves better — the panel earns its place only when one element leads.

### Authoring

```markdown
<!-- _class: split-panel -->

`Eyebrow context`

## Headline that anchors the panel.

One-sentence framing paragraph explaining what the points cover.

- First point
  - Supporting detail explaining the first point.
- Second point
  - Supporting detail explaining the second point.
- Third point
  - Supporting detail explaining the third point.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  ┌────────────┐  FINDINGS               │
│  │ BRIEF      │  │ Finding title        │
│  │ heading    │  │ body detail          │
│  │ + lede     │  │ Finding title        │
│  │            │  │ body detail          │
│  └────────────┘                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `metric` — metric

Light panel behind one hero number.

```markdown
<!-- _class: split-panel metric -->

`split-panel metric`

## 16<em>wpi</em>

Words per item — the budget this layout holds its supporting column to.

- The panel flips light
  - metric flips the panel light behind one hero number.
- The number claims
  - Keep support brief — two items beside a figure.
```

#### `pullquote` — pullquote

Half the slide to one quotation.

```markdown
<!-- _class: split-panel pullquote -->

> pullquote gives half the slide to one voice, and the other half to what it means.

`split-panel pullquote · the layout, quoted`

- The quote claims
  - Display italic on the dark panel; keep it under twenty-five words.
- The column interprets
  - Two items that say why the words matter, not who said them again.
```

#### `steps` — steps

The panel anchors a numbered phase.

```markdown
<!-- _class: split-panel steps -->

`02`

## steps

The left panel anchors a phase; the column numbers its moves.

1. Watermark the phase
   - The inline-code number becomes the panel's backdrop.
2. Number the column
   - An ordered list reads as sequence — three steps fit.
3. Keep steps parallel
   - Verb-first titles, one supporting line each.
```

#### `watermark` — watermark

Accent panel, letterform, h3 rubric.

```markdown
<!-- _class: split-panel watermark -->

## Watermark

### The heading's first letter becomes the panel

- The accent panel decorates
  - A large letterform behind the heading — presence without a photo.
- The h3 subtitles
  - One line naming what the slide surveys.
- The column carries the content
  - Same three-item budget as the default split.
```

#### `proof` — proof

Scenario signal + two paired proof cards, filling the column top to bottom. Narrows the claim panel to 31% and steps the claim heading to the h2 tier — the evidence side carries three stacked regions where the base carries one list.

```markdown
<!-- _class: split-panel proof -->

`Level 1 · Remembering`

## Execute with accuracy.

*How is this done?* You recall syntax, patterns, and standards — the path is known, and the job is to follow it without error.

- You know you're here when
  - You ship on an existing API and rework is rare.
- Follows examples well
  - Compiles, runs, and tests locally with confidence.
- Works from brief tickets
  - Consistent quality without hand-holding.
```

#### `capstone` — capstone

Composes with `proof`: the signal reads as a quoted card, the two proof points read as plain top-rule pillars — the sequence's climactic, most-earned entry.

```markdown
<!-- _class: split-panel capstone -->

`Level 6 · Creating`

## Build what didn't exist before.

*What should exist?* You synthesize new frameworks, platforms and operating models — what you produce becomes the standard.

- The signal
  - Teams across the enterprise adopt your framework as their foundation.
- Reference architecture
  - The implementation exists and is validated.
- Organization-wide adoption
  - Measurable outcomes follow.
```

#### `mirror` — mirror

Featured panel moves right.

```markdown
<!-- _class: split-panel mirror -->

`split-panel mirror`

## mirror puts the featured panel on the right.

Same anatomy, flipped — for when the deck's rhythm wants the claim to land late.

- Reading order still works
  - The eye crosses support first, then lands on the panel's claim.
- Use it sparingly
  - One mirror per section keeps the flip meaningful.
```

#### `qr` — qr

Payload bullet becomes a code.

```markdown
<!-- _class: split-panel qr -->

`split-panel qr`

## The payload bullet becomes a code on the panel.

A bare URL auto-resolves; the caption line labels the scan.

- https://laticent.io/components/split-panel `qr`
- Scan for this layout's docs `caption`
```

#### `cat-1` — cat-1

Override: pins this slide to the theme's categorical slot #1 — the claim panel's fill, and under `proof` the checkpoint labels' ink. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-1 -->

`Stage 1 of 8`

## Discover the real problem.

- Talk to the people living with it
  - Five conversations beat one survey.
- Write down what surprised you
  - The surprise is usually the actual problem.
```

#### `cat-2` — cat-2

Override: pins this slide to the theme's categorical slot #2 — the claim panel's fill, and under `proof` the checkpoint labels' ink. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-2 -->

`Stage 2 of 8`

## Define what "done" means.

- One sentence, not a document
  - If it needs a meeting to explain, it isn't defined yet.
- Name what's explicitly out of scope
  - The edges matter more than the center.
```

#### `cat-3` — cat-3

Override: pins this slide to the theme's categorical slot #3 — the claim panel's fill, and under `proof` the checkpoint labels' ink. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-3 -->

`Stage 3 of 8`

## Design the smallest real version.

- Cut until it's uncomfortable
  - Comfortable scope is usually still too big.
- Sketch before you spec
  - A rough picture surfaces disagreement a document hides.
```

#### `cat-4` — cat-4

Override: pins this slide to the theme's categorical slot #4 — the claim panel's fill, and under `proof` the checkpoint labels' ink. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-4 -->

`Stage 4 of 8`

## Build the thing you designed.

- Ship the ugly path first
  - It finds the real risk; the happy path is easy.
- Keep a running list of shortcuts taken
  - Nothing is forgotten faster than a deliberate shortcut.
```

#### `cat-5` — cat-5

Override: pins this slide to the theme's categorical slot #5 — the claim panel's fill, and under `proof` the checkpoint labels' ink. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-5 -->

`Stage 5 of 8`

## Validate with the people it's for.

- Watch, don't narrate
  - What they do matters more than what they say they'd do.
- One real user beats five imagined ones
  - A single honest session outweighs a week of speculation.
```

#### `cat-6` — cat-6

Override: pins this slide to the theme's categorical slot #6 — the claim panel's fill, and under `proof` the checkpoint labels' ink. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-6 -->

`Stage 6 of 8`

## Launch to a small, real audience.

- Small enough to fix fast
  - A limited launch turns mistakes into hours, not weeks.
- Tell people it's early
  - Set the expectation and the feedback gets more honest.
```

#### `cat-7` — cat-7

Override: pins this slide to the theme's categorical slot #7 — the claim panel's fill, and under `proof` the checkpoint labels' ink. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-7 -->

`Stage 7 of 8`

## Scale what actually worked.

- Scale the mechanism, not the guess
  - Confirm why it worked before you multiply it.
- Expect the edges to break first
  - Scale finds every assumption that only held at small size.
```

#### `cat-8` — cat-8

Override: pins this slide to the theme's categorical slot #8 — the claim panel's fill, and under `proof` the checkpoint labels' ink. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-8 -->

`Stage 8 of 8`

## Sustain it without you in the loop.

- Write down what only you know
  - If it lives in your head, it isn't sustained yet.
- Hand off the decision, not just the task
  - Ownership transfers when someone else can say no.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `split-compare` — a binary decision with a recommendation card
- `compare-prose` — two co-equal options side by side
- [`big-number`](#big-number) — the hero number is the whole slide, with no supporting list
- `list-steps` — an ordered process without a left anchor panel

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/statement/split-panel>


