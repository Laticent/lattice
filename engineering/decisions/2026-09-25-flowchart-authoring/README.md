---
status: proposed
summary: The flowchart chart's authoring grammar and rendering rules, decided with the owner over a design competition and eight prototype rounds. Every list item is a shape named by its text; a sub-list of shapes makes a group; arrows (`->` `<-` `<->` `--`, heavy `=>`) connect, on the item row or as sub-items; a trailing inline-code span styles what it follows; the key sits below the outline, notes are nested blockquotes. Dagre lays it out (ELK rejected), our router draws it, edge labels never get a painted background, and the flow dots run only on live surfaces when an author opts in.
---

# Flowchart authoring and rendering (2026-09-25)

**Status: proposed.** Nothing here is built. The prototypes that proved each rule
were throwaway scripts under `.scratch/flow/`, so this note is the record; the
images in this folder are rendered from real Lattice slides (real theme tokens,
real finish backdrops) by those prototypes.

**The answer in one screen.** A flowchart is written as a Markdown list. This is
the whole grammar, with every rule used once:

```markdown
<!-- _class: flowchart lr -->

## Every page reaches a human within 15 minutes.

- Alert fires `:pill` => Auto-triage => Severity?
- Severity? `:diamond`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket -> Mitigate
  - -SEV3-> Backlog `:dotted`
- Page on-call `fail` =ack=> Mitigate => Postmortem
  > Pages the secondary after 5 minutes.
- Platform `:c2`
  - Storefront => Payments
  - Payments -screens-> Fraud checks
  - -ships via-> Carriers

`[{=>, Happy path}, {:dotted, Deferred}, {fail, Pages a human}, {:c2, Customer-facing}]`

*SEV1 pages a human inside five minutes; everything else waits for business hours.*
```

![The source above, rendered in light mode](01-full-light.jpg)
![The same slide in dark mode](02-full-dark.jpg)

---

## 1. What a flowchart is (and is not)

A flowchart is **free-form**: an org chart, a data flow, an actor map, a decision
flow, or a loose set of shapes and groups with no lines at all. It is **not** a
state machine and not a sequence of steps. That rules out anything that implies
order, which is why the state chart's numbered-list grammar and its `start` /
`end` words are not reused here. The state chart stays as it is; the two
components share rendering pieces (tile look, tokens, dagre delivery), not
grammar.

## 2. The grammar

### 2.1 Shapes and names

- **Every list item is a shape.** Numbered and bulleted lists mean the same
  thing; numbering is the author's own labeling and implies nothing.
- **A shape's name is its displayed text**, matched case-insensitively with
  whitespace collapsed. Every mention of the same name is the same shape.
- **An explicit name** goes in the lead of the modifier span, in the pill
  grammar's label slot: `` - Know-your-customer checks `{kyc}:diamond` ``. Use
  it for long text or for two shapes that display the same words.

### 2.2 Groups

- **Anything with a sub-list of shapes is a group.** Its shape sub-items are its
  members. Groups nest. There is no `:group` word and no exception (an earlier
  `tree` slide class that made nesting draw lines was dropped for this reason).
- A group is a shape for connections: it can be a target, and its own arrow
  sub-items (below) are the group's connections. Lines to and from a group stop
  at its border.

### 2.3 Connections

A connection is written with an arrow, in either of two places, and both mean
"from this shape":

```markdown
- Platform `:c2`
  - Storefront
    - => Payments          ← an arrow sub-item

- Platform `:c2`
  - Storefront => Payments ← the same connection, continuing the item row
```

- **A sub-item that starts with an arrow is a connection** from its parent. A
  sub-item that starts with a name is a member. The first token decides; the
  parser never guesses. (`- -> X` is a plain list item whose text is `-> X`:
  CommonMark only reads `-` as a list marker when a space follows it.)
- **Chains:** `A -> B -> C`. **Fan-out:** `-> Auth & Orders`.
- **Placement comes from item rows.** A shape sits where its own item row puts
  it. A name that only ever appears as a target sits **beside** its source (next
  to a group, never inside it).
- An unresolved-looking name is created, not rejected, so a typo draws a stray
  shape. `lint:deck` warns on near-duplicate names (edit distance of 2 or less)
  with a "did you mean". This is the one inference in the grammar, and it buys
  the one-line chain.

**The arrow carries meaning; the span carries drawing.** Direction and weight
change what the chart says, and what Cadenza and Suono say aloud, so they live in
the arrow. Two shafts and four ends give eight forms:

| Arrow | Meaning | Spoken as |
|---|---|---|
| `->` | leads to | "A leads to B" |
| `<-` | comes from (write incoming lines under the target) | "B leads to A" |
| `<->` | two-way exchange | "A and B exchange" |
| `--` | related, no direction (org and association lines) | "A is linked to B" |
| `=>` `<=` `<=>` `==` | the same four, heavy: the primary path | "mainly…" |

A label sits inside the arrow: `-SEV1->`, `=ack=>`, `<-settled-`, `-advises-`.

**Measured, not assumed:** markdown-it passes every arrow through as text but
HTML-escaped (`->` arrives as `-&gt;`, `<-` as `&lt;-`), the trap
`lib/core/shape-glyphs.js` records for the quadrant eyebrow. The parser decodes
both spellings and tests each. Typographic replacement is off in the engine, so
`--` is not turned into a dash. Letter heads such as `-x` and `-o` pass through
too but collide with ordinary words, and `*` risks emphasis, so head shapes are
span words instead.

### 2.4 The modifier span

A trailing inline-code span **styles what it follows**: right after a shape's
name it styles the shape; after a connection's target it styles that line.

- **Order inside the span does not matter**, as with pills: `` `:dotted:c4` ``
  and `` `:c4:dotted` `` are the same. The one positional piece is the optional
  lead, `{id}` or a status word, exactly like a pill's `{LABEL}:mods`.
- **An unknown word** leaves the span as literal code and `lint:deck` names it.
- **A shape word on a connection** (`` -> B `:diamond` ``) is a lint error:
  *style "B" on its own row*. That is what removed the need for a `:line-c3`
  prefix: `:c3` is the only word that could style either, and the position now
  tells them apart.

| Word | Styles | Meaning |
|---|---|---|
| `:box` (default) `:square` `:pill` `:diamond` `:circle` `:cylinder` `:io` `:doc` | shape | outline |
| `:c1` … `:c12` | shape or line | a palette slot, the same twelve pills use (`--cat-N-*`), not a color name |
| `:fill-cN` `:border-cN` `:text-cN` | shape | one channel only |
| `done` `on-track` `live` / `at-risk` `warn` / `fail` `blocked` / `muted` `deferred` | shape | status roles (lead position), from `lib/core/chart-status.js` |
| `:open` `:dot` `:cross` | line | head: depends-on or uses / attaches (reads, writes) / blocked or stops here. The default is a filled triangle |
| `:dashed` `:dotted` | line | optional, async or planned / informal or advisory |
| `:loose` | line | drawn, but kept out of layout so it cannot reshape the chart (an advisory line in an org chart) |

There is no hex and no free token name anywhere; every color is a palette slot
or a status role. That closes the state chart's `:::token` silent-typo hole
rather than copying it.

### 2.5 Key, notes, caption

The positions follow existing chart precedent, where **position decides what a
span means** (`lib/core/bracket-list.js`; `matrix-grid` puts axes above its body
and the key below):

- **Key (legend):** one bracketed span **below** the outline, parsed by the
  shared `parseInlineSet` in `lib/core/label-set.js` with no changes. **The key
  is the word you already typed** (`=>`, `:dotted`, `fail`, `:c2`), as in
  roadmap where the key is the marker typed in a cell. Each swatch wears the
  same paint as the marks it names: a slot used by a group draws as a group
  tint, a slot on a shape as a tile. No key is drawn unless one is written.
- **Note:** a `>` blockquote nested under a shape's item is a note pinned to that
  shape, drawn as a note card on a dotted tether. A blockquote is a block, not a
  sub-list, so "sub-list means group" still holds.
- **Caption:** an italic paragraph below, the chart family's `.chart-caption`.
- **Above the outline:** reserved. A flowchart has no axes, so it does not borrow
  the axis position for anything else.

## 3. Settings: slide, deck, Studio

| Layer | Written as | Holds |
|---|---|---|
| Slide | `<!-- _class: flowchart lr elbow arrow-open flow -->` | direction (`lr` `tb`), route (`elbow` `curved` `straight`), default head, flow dots |
| Deck | `flowchart: tb elbow arrow-open` (PROPOSED new register) | the same words as defaults; a slide class overrides |
| Deck | `flow:` (PROPOSED register) | flow dots on or off for the deck |
| Deck | `finish:` (exists) | the backdrop finish; the flowchart conforms to it |
| Studio | settings inspector, deck and slide | writes the two places above; no third store |

Route style is chart-wide only: mixing routes within one chart reads as a bug.

## 4. Edge labels: never a painted background

The trouble spot was a label that has to sit on its line and hide what is behind
it, when "behind" can be the canvas, a group tint, a finish texture or a
gradient. A painted knockout can only match a flat, known ground. So:

1. **Ports first.** Edges entering or leaving the same side of a shape each get
   their own port, and their own lane. Two edges never share a final segment
   unless it is a deliberate fan-in trunk, and trunks are never labeled. This is
   the root cause of the collision in image 4: two edges into Mitigate shared a
   segment, so no knockout could have said which one the label belonged to.
2. **Room reserved.** A labeled edge bends early enough that its last straight
   run holds the label plus clearance from the arrowhead.
3. **Scored placement.** Candidate spots sit only on segments the edge owns, and
   are scored against every other line, shape and label. When a run is too short
   to hold the label, it goes beside the line instead.
4. **Text always wins.** After placement every line under a label is cut, by
   splitting the path geometry itself: no clip-path ids (which collide when a
   slide is cloned), no mask, nothing that needs a PDF soft mask.
5. **Fallback chip.** Only if step 3 finds no clear spot does the label get a
   chip filled with the ground it sits on, and lint warns. The gallery decks must
   render with **zero** fallbacks, so a routing regression cannot hide behind
   chips.

![The label collision the owner found, fixed by ports and reserved room](04-label-collision-fix.jpg)

## 5. Flow dots

A dotted overlay moving along a line, a separate path above the real edge.

- **Opt-in** (`flow` slide class or `flow:` register) and **live surfaces only**:
  the Studio, the Playground and the HTML player. Off in PDF, PNG, PPTX and
  standalone SVG, off under `prefers-reduced-motion`.
- By default the dots run on the **heavy** lines, which is the happy path the
  author marked with `=>`.
- One speed and one phase across the chart, so a chain reads as one stream; the
  phase at a merge follows the longest-path distance (design-competition track 2).
- Never carries `pathLength` or an anima role, and starts after the build-in, so
  it cannot fight the drawn-on edge.

## 6. Layout and routing

- **dagre, not ELK.** ELK routes around shapes, attaches edges to groups and
  tidies fan-outs natively (image 5), and its geometry was identical on re-run
  (the only differences were GWT `$H` object counters). But its bundle is
  **1.61 MB minified, 470 KB gzipped**, against dagre's **64 KB and 22 KB**:
  about 21 times heavier. The owner declined it. dagre is already vendored
  (`dist/lattice-dagre.min.js`), so the routing quality becomes our router's job,
  with ELK's renders as the target.
- **We own the router**, which is what makes several rules cheap: `:loose` lines
  are left out of layout and routed afterwards; edges to a group are laid out
  between representative members and drawn to the group's border; an edge whose
  boxes overlap on the flow axis leaves through the side that faces its target.
- **Determinism** (same source, same machine and fonts, byte-identical SVG):
  shapes are keyed `n0…` in authored order (graphlib enumerates integer-like keys
  numerically, a measured footgun); back edges are chosen by our own depth-first
  walk in authored order, never by dagre's cycle breaker; measured sizes are
  quantized before layout. dagre has no `Math.random`.

![The same four sources through dagre (our prototype router) and through ELK](05-elk-comparison.jpg)

## 7. The four kinds, one grammar

An org chart, a data flow, a decision flow and a system map with a disconnected
shape, all from the same rules:

![Org chart, data flow, incident, system map](03-four-kinds-light.jpg)

```markdown
- Chief executive `:c1`
  - -- Finance & Technology & Operations
- Finance
  - -- Controller & Planning
- Security `:c4`
  - -advises-> Finance `:dotted:loose`
```

## 8. How it serves Vetrina, Cadenza and Suono

- **Cadenza and Suono** speak the slide from raw Markdown through
  `lib/core/chart-narration.js`. The outline is the spoken order, each arrow has
  a sentence (the table in 2.3), and every piece of metadata sits inside code
  spans, which narration strips by position. That avoids the class of bug where
  the state chart's `:::token`, outside the backticks, reached the voice.
- **Vetrina** points at elements by stable address: shape ids are slugs of the
  name or the explicit `{id}`, so inserting or reordering shapes does not move
  them.
- **Fallback:** with no component (export to Marp, a plain renderer) the source
  reads as an outline.

## 9. How we got here

1. **Design competition** (3 tracks, a critic each, a shared fact-checker, a
   judge; 11 agents). Scores: boardroom-visual-first 8.6, author-first
   (Mermaid-style fence) 8.2, reuse-the-state-chart 7.2. The judge's grafts
   (determinism pins, did-you-mean lint, longest-path phase) are kept above.
2. **Edge labels:** the owner's crop of a label crushed between two lines
   produced section 4.
3. **Authoring semantics**, scored against Vetrina, Cadenza and Suono. The
   owner then corrected the premise twice: a flowchart is free-form, not steps;
   and inline code only modifies, so an edge is content, not code.
4. **Rejected, with the reason:**
   - numbered steps that flow on their own: implies order a flowchart does not have;
   - edges inside inline code: inline code only modifies;
   - a connections table, or Markdown links: splits the structure away from the list;
   - nesting as lines (`tree` class): nesting means group, without exception;
   - flat arrow lines only: loses the list structure, so both forms are kept;
   - `:line-c3`: fixed an ambiguity that position now removes;
   - ELK: 21 times the bundle weight;
   - labels beside the line as the default: ambiguous at a decision's branches;
   - a chart-wide clip-path gap: ids collide on cloned slides.

## 10. Known gaps (router work, not grammar)

- Lines can still cut through shapes (`advises` through Product engineering,
  `ships via` through Card networks in the prototype): obstacle avoidance.
- Fan-outs draw parallel lines where a shared trunk would read better.
- A main path can zig-zag; a pass should line it up.
- Wide charts shrink text below the type floor; the component needs the state
  chart's self-scaling fit.
- A label on a group border must cut the border too.
- A labeled group-to-group edge needs a reserved gap between the groups.

## 11. Build slices

1. **Parser and lint:** the grammar as a pure, fs-free kernel shared by the
   transform, `validate()` and the browser linter (HARD RULE #7), with the arrow
   decoding tests and the near-duplicate warning.
2. **Layout and router:** dagre plus our router: ports, reserved label room,
   side selection, group edges, `:loose`, determinism pins, obstacle avoidance.
3. **Paint:** shapes, groups, tokens, heads and patterns, labels (section 4),
   key, notes, caption; all nine finishes, light and dark; the component docs,
   manifest and a feature deck (HARD RULE #9).
4. **Flow dots and settings:** the overlay, the `flow:` and `flowchart:`
   registers, and the Studio inspector.

## 12. Open questions

- Should a key be derived automatically for status roles and heavy lines when
  none is written, or only ever drawn from an authored key?
- Should the state chart later adopt the arrow and span rules so the two
  sibling charts share one authoring model? (A separate PR if yes.)
