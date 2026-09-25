---
status: in-progress
summary: >-
  Panes put two components' body content on ONE slide — a list beside a table, an image beside
  prose, a chart over a stat row — while the slide keeps its one title, eyebrow, subtitle, Key
  Insight, below-note, header, footer and page number. The engine renders each pane as an
  ordinary one-slide deck of its component, then embeds its body in a `<lat-pane>` Cell; the CSS
  build widens every component rule's root from `section` to `:is(section,lat-pane)`, which keeps
  specificity identical, so no component is edited and no existing deck changes. The carve runs
  inside the engine's own markdown-it parse, so slide breaks, fences and directives are the
  engine's answers. A proof of
  concept ships with `examples/panes.md`; this note records the audit, the design, the measured
  costs and the gaps that stand between the proof and a v1.
---

# Panes — two components, one slide

**Answer first.** Yes, Lattice can put content from two components on one slide without
writing a new component for each pairing, and it can do it without touching a single
component. The author writes a normal slide and marks where each component's body begins:

```markdown
`Pipeline review · Q3`

## EMEA carried the quarter while APAC held flat.

<!-- panes: 40/60 -->
<!-- pane: list -->

- EMEA closed three late deals
- APAC renewals slipped

<!-- pane: table -->

| Region | Q2 | Q3 |
|---|---|---|
| EMEA | 4.1 | 5.3 |

> EMEA's three late deals are the whole quarter's growth.
```

The eyebrow, title, subtitle, Key Insight, below-note, header, footer and page number all belong
to the slide exactly as they do today. Only the body splits. A proof of concept ships in this PR:
`lib/core/panes.js`, the `pane` Cell (`lib/forms/cell/pane/`), the selector widening
(`tools/lib/pane-selectors.js`) and the demo deck `examples/panes.md`.

This is the build the 2026-06-18 note deferred "until a real deck needs it"
(`2026-06-18-frame-recursion-cells.md` §4): one flat split, depth one, a real component in each
cell. It is not the recursion that note rejected.

---

## 1. The authoring contract

| Marker | Meaning |
|---|---|
| `<!-- pane: <component> -->` | Starts a pane. Two per slide in v1; everything before the first marker is the slide's own masthead. |
| `<!-- panes: 40/60 -->` | Optional split. 25–75 in 5% steps; default 50/50. |
| `<!-- panes: stack 35/65 -->` | Stack the panes top-to-bottom instead of side by side. |
| `<!-- panes: 50/50 no-rule -->` | Drop the spine between the panes (on by default). |

**A spine marks the seam.** Between the panes the engine draws the chart family's diagram|key
rule (`buildSpine` in `lib/components/chart/_chart-family/svg-legend.js`) in CSS: an accent fade,
transparent at both ends, horizontal when the panes stack. It is placed from the ratio, never from
the content, so it cannot move. It is on by default because it is the family's existing answer to
"two things share this box"; `no-rule` drops it where a pane's own edge already separates the two
(a photo).

**The trailing coda belongs to the slide.** After the second pane, the engine peels the trailing
run of blockquotes (Key Insight), `— ` paragraphs (below-note) and comments back onto the host
slide — unless the second pane's component claims that element for its own anatomy in its
manifest's `coda.claims` (a `quote`'s attribution, a chart's caption). Then it stays where the
component alone would keep it, so a pane reads exactly as the component's own slide does.

**One title.** A `#` or `##` written inside a pane, with an eyebrow or subtitle pill beside it, is
lifted to the slide. **Whole-slide components** (`title`, `split-panel`, …) cannot go in a pane;
the pane renders as `content` and the carve records a warning for the linter.

**The ratio range is 25–75 in 5% steps.** Past 75/25 the narrow pane is too thin to hold a line of
body type. Snapping keeps each pane's shape predictable, so the four shape families (§3.3) still
decide layout and the gallery can cover every step. An out-of-range ratio falls back to 50/50;
`parseLayout` records the reason for the linter (§6.6).

---

## 2. How it renders

1. **Carve** (`installPanes`, a markdown-it core rule in `lib/core/panes.js`). It runs INSIDE the
   host's own parse, after the engine has split slides (`---` and `split: headings`), applied
   directives and propagated deck classes, and before the default-component rule. So where a slide
   ends, whether a marker sits inside a fence, and which directive a comment sets are the engine's
   own answers. The rule keeps the masthead, any `#`/`##` heading written inside a pane, the
   trailing coda and the running header/footer tokens on the host; cuts each pane's blocks back
   out of the source by their line maps; replaces the pane region with one placeholder; and gives
   the section the `lat-pane-host` class (which keeps `content`, and any component class, off it).
   A deck with no marker is untouched: the rule returns before it reads a token.
2. **Render each pane as an ordinary slide**, after the host's transforms. The engine renders the
   pane's markdown as a one-slide deck of its component (`renderPane` in `lib/engine/index.js`)
   through a parser built for the PANE's box. Every transform — the chart kernels, the table
   row-label ruler, the list rulers — sees a normal whole section, so none of them changes. The
   pane's `data-family` and `data-orientation` describe the pane, not the slide. Its SVG ids are
   pinned to the host slide's number (`pinRenderSlide` in `lib/core/render-ids.js`), so a slide's
   ids never depend on a later slide's panes, and a slide rendered alone at its offset matches its
   deck render.
3. **Embed** (`panes.embed`). The pane section's body moves into
   `<lat-pane class="<component classes>" data-family=…>` inside the host's stage. The pane's
   stand-in masthead is dropped: the host owns the only title. The placeholder carries a nonce
   hashed from the source, so author HTML shaped like one is never filled.

### 2.1 Why the component CSS needs no copy

Component CSS reaches its content through the slide: `section.list > .cell-stage > ul`. Measured
over all 70 component stylesheets, 2,850 selectors start at `section.<component>`, and about 91% of
them style body content; 97 set properties on the section itself, 95 style the stage box, 68 style
the title, coda or footer. So the rules are already written for "the body of a list". The only
problem is the first word: `section` asks "which component is this SLIDE?", and a slide with two
panes can only give one answer.

The build therefore widens that one word, in place:

```css
section.list > .cell-stage > ul                    /* source, unchanged */
:is(section,lat-pane).list > .cell-stage > ul      /* what the bundle carries */
```

- **Specificity is unchanged.** `lat-pane` is a custom element, so `:is(section,lat-pane)` weighs
  exactly one type selector, as `section` did. Every rule keeps its cascade rank.
- **Nothing that counts slides can see a pane.** Pagination, page count, present mode and export all
  look for `section`; a pane is not one.
- **Shape stamps resolve per pane.** The 234 `data-family` rules and the 105 `:has()` gates sit on
  the root compound, so they read the pane's own stamps.

The rewrite is positional (`css-tree` offsets), so comments and formatting survive, and it touches
only a selector whose FIRST compound starts with `section` — or an arm of a leading
`:is(section.x, figure.x)`, the dual-surface chart head. `section` anywhere else is left alone.

**The base sheets get a narrower version of the same pass.** A pane's body also needs the defaults
that live outside the component sheets — every table's rules, list rhythm, code, sketch mode, the
accent finish — written as `section … > :where(.cell-stage) > table td`. The first cut widened only
component sheets, so a table in a pane lost its rules and fell back to the browser's centered
headers and bare cells. The whole bundle now takes a `stageOnly` pass: a `section` rule is widened
only when its selector reaches THROUGH `.cell-stage` (127 selectors, none in any theme). Slide-level
rules — padding, backdrop, pagination — never reach a pane. Measured on the chart, inventory and
comparison galleries plus `examples/sketch.md` and `examples/accent-finishes.md` (73 pages, rendered
with a `main` build and this one): 0 differing pixels.

### 2.2 The options this replaced

| Option | Why not |
|---|---|
| **Nested `<section>` for a pane** | Component CSS would work untouched, but about 100 code sites query every `section` (lib, docs, tools) and 48 CSS counters count them. Any one of them could count a pane as a slide: an extra PDF page, a second page number, a present-mode stop. The risk lands on export, the surface every deck depends on. |
| **Copy each component's rules for a pane `<div>`** | Correct, but it duplicates 2,938 selectors (+28% minified if always shipped) to express what one word already says. The owner's objection — "why copy anything?" — was right. |
| **Hand-migrate component CSS off `section`** | The cleanest end state, but it touches all 70 components for no behavior the widening doesn't already give. |

---

## 3. The audit — what can go in a pane

All 70 components, classified by the shape their content needs. **Fits a half** means the content
reads in a ~50% cell. **Wide share** means it needs 65–75% of the width, or a full-width stacked
band. **Whole slide** means the component is a frame that claims the canvas.

| Class | Count | Components |
|---|---|---|
| **Fits a half** | 43 | every SVG chart — bar, bullet, funnel, heatmap, line, map, piechart, progress, quadrant, radar, scatter, slope, stacked-bar, state-chart, waterfall, word-cloud; diagram; math; code; list, checklist, cards-stack, list-tabular, glossary, inventory (ledger), actors, agenda, logo-wall, q-and-a; kpi, stats; big-number, quote, content; matrix-2x2, cycle; video; contact, wifi; authority-chain, citation-card, policy-recommendation, regulatory-update |
| **Wide share or stacked band** | 17 | table, gantt, journey, kanban, matrix-grid, roadmap, timeline-list, compare-prose, decision, pricing, redline, verdict-grid, cards-grid, team-profile, obligation-matrix, statute-stack, list-steps |
| **Whole slide** | 10 | title, divider, closing, topic, premise, split-panel, split-compare, compare-code, image, scene |

Two whole-slide components have an obvious pane form. **`image`** ships one in the proof: an image
pane renders through `content` and `pane.css` makes the picture cover its Cell. **`scene`** would
follow the same pattern.

### 3.1 What was already in place

- **Charts scale.** Every chart is an SVG with a `viewBox` and `preserveAspectRatio`, sized off a
  size-container `.chart-body`. Mermaid fills any flex box.
- **Components already reflow by shape.** About 315 component rules key on the four shape families
  (wide, square, tall, strip, from `lib/adaptive/families.js`). `families.js` itself anticipated a
  nested cell stamping its own family. Capacity budgets in the manifests are already per family.
- **Type is pinned to slide pixels.** The `--fs-*` and `--sp-*` tokens compute through
  `--_sec-1cqi`, which the engine writes as px, so both panes set type at the same size as the rest
  of the deck. Only bare `cqi`/`cqh` in component CSS re-anchor to the pane (the pane is a size
  container), which is the behavior a box-relative length wants.
- **The overflow probe is cell-aware.** `CLIP_CELL_SELECTOR` in `lib/core/overflow-probe.js`
  matches `.cell-stage`, and each pane holds one, so a pane that overflows tags the slide. The
  proof's own first draft hit this: the export flagged the clipped list pane on page 1.

---

## 4. What the proof verified

| Claim | Surface | Evidence |
|---|---|---|
| Existing decks render the same markup | engine, every committed deck | 309 decks (every `examples/*.md`, component gallery and baseline deck; `panes.md` excluded): byte-identical HTML between `origin/main` and this branch, each rendered from its own worktree |
| Existing decks render the same pixels | CLI PDF export | chart, inventory and comparison galleries (45 pages): 0 differing pixels, `compare -metric AE` (measured before the carve moved into the parse; the markup check above covers the move) |
| Two components on one slide, chrome kept | CLI PDF export | `examples/panes.pdf` (light, committed) and a dark render reviewed alongside it, not committed — list+table 40/60, bar+list 55/45, image+text 50/50, table+big-number 70/30, stacked line over stats, piechart+list 45/55 |
| The browser engine renders panes | the Playground's engine bundle in headless Chrome | `LatticeEngine.createEngine().render()` on a panes deck returns two panes; before the fix it threw `process is not defined` |
| The Studio previews a panes slide | the real Studio (`/studio/`, docs dev server built from this branch), 1440px desktop | the demo deck typed into the editor: the preview frame holds one host section and two `lat-pane` cells, drawn side by side, no page errors. The first run found the preview's sanitizer **dropping** `<lat-pane>` (DOMPurify strips unknown tags and keeps their children, flattening both panes into one column); `lat-pane` joined `ADD_TAGS` in `lib/core/sanitize-slide-html.mjs`, which also covers the self-contained `.html` export that shares it |
| A pane is never a slide; slides around it survive | engine | `test/unit/core/panes.test.js`: one `<section>` and one `<h2>` per panes slide; `---` directly under a table, list or comment, and `split: headings`, keep every later slide |
| Slide ids don't depend on later panes | engine | the same test: a piechart slide's ids are unchanged by a panes slide after it, and a panes slide's ids match between the deck render and a render alone at its offset |
| Parser reuse is unchanged for decks without panes | engine | `parser-memo.test.js`: every deck without panes still shares one parser; panes decks still match a cold render |

**Not verified:** the Studio at tablet and phone widths; the Playground UI; the PPTX, image-set and
player exports; Export-to-Marp; a Mermaid diagram in a pane. The Studio's slide strip labels a panes
slide "text" — it does not know the host class yet (§6.8). They share the engine, but "shares the
engine" is not verification (HARD RULE #23).

---

## 5. The measured cost

- **CSS size: +28.4% minified, +15.3% gzipped (about 14 KB), if shipped in every bundle** (against `main` at `83023ea`; +23.5% / +12.3% before the base stage defaults below were widened too). The
  widened text itself is small (+36 KB across the sources). The bundle grows more because
  `distributeLeadingIs` (tools/build-css.js) deliberately splits every leading `:is()` into
  separate selectors so Marp-style scopers can read each arm — so `section.x` becomes
  `section.x, lat-pane.x`. An earlier estimate in the design conversation (+6.1% / +1.5%) measured
  the widening without that pass; this line corrects it.
- **Fixed-size budgets feel it first.** The Playground's first-paint snapshot stores the CSS a
  slide uses under a 240K-unit cap. Its capture keeps any selector arm it cannot evaluate, and the
  pane arms rode along: 315K units on a deck with no panes, so nothing was stored and CI's
  `studio-smoke` caught the Playground reload tests. The capture now drops pane arms whenever the
  frame holds no `lat-pane` (exact, since they cannot match): 223K. Any other surface that
  serializes the bundle against a budget should be read with the same question — §6.1 removes the
  question by not shipping the arms to decks without panes.
- **Render time:** one extra markdown-it parser per distinct pane shape (orientation × family), memoized.
  Decks without panes pay one substring test (`pane:`) per render, inside the parse.

---

## 5a. What the independent review changed

A maker-checker pass (HARD RULE #25) reproduced three blockers and nine smaller defects in the
first cut, all fixed in this PR and each pinned by a test in `test/unit/core/panes.test.js`:

- **A debug line crashed the browser engine on any panes deck** (`process.env` in the bundle). Removed.
- **The first carve was a text pre-pass with its own idea of a slide break.** A `---` directly
  under a table, list, comment or fence, or `split: headings`, made it fold the following slides
  into pane 2 and drop them silently. It also mis-closed a 4-backtick fence, lost spot directives
  written beside the panes, lost a title written after the first marker, and lost the host class
  to a later `_class:`. Moving the carve into the parse (§2) fixed all of these at once, because
  the engine's own tokens answer each question.
- **Quote attribution was taken as the slide's below-note.** Now governed by `coda.claims` (§1).
- **A chart pane painted the slide's background over a colored slide** (`section.chart-frame`
  paints `--bg`, and the widening carried it to the pane). A pane is transparent now.
- **Pane ids depended on later slides; a forged placeholder could be filled; a comment holding
  `<div>` could swallow a pane.** Pinned ids, a nonce, and a div matcher that skips comments.

Still open from that review, all in §6: the warnings the carve records are not surfaced yet (the
lint work, §6.6); a third marker folds into the second pane; deck-wide classes reach the host but
not the pane element; the perf overlay's `stats` counts pane renders inside the transform bucket.

---

## 6. The gaps between the proof and a v1 (ranked by what they unblock)

1. **Ship the widened rules only where they are used.** Attach the `lat-pane` arm for just the
   components a deck places in panes, at CSS pack time (`lib/engine/css.js` already packs per
   deck), so a deck without panes carries zero extra bytes. This is the change that decides whether
   the CSS cost in §5 is paid by every deck or only by decks that use panes.
2. **Measure the pane, don't estimate it.** The engine classifies a pane from a fixed fraction of
   the slide (`STAGE_FRAC`, measured once on a titled 16:9 slide). The real stage height moves with
   the subtitle and the coda: on the proof's first slide it was 192px, not 488px. The runtime already
   re-stamps `data-family` on sections; it should re-stamp each pane from its laid-out box.
3. **Size chart geometry to the pane.** Chart kernels pick their `viewBox` from orientation, then the
   SVG scales to the box. In a half pane that shrinks labels below their designed size (the bar
   values and the pie legend in `examples/panes.pdf`). The kernel should size the `viewBox` from the
   pane's px box, so labels keep their size and the label-collision logic runs at the real scale.
4. **A fifth shape family for bands.** The four families describe slide shapes, from 16:9 down to
   portrait. A stacked pane is a short band 3–5× wider than it is tall, and nothing classifies it:
   the line chart letterboxes and the stat tiles need about 45% of the stage to fit. Either add a
   `band` family or make the band-sensitive components (stats, kpi, charts) size to height.
5. **Retire the stand-in heading.** The chart-family wrap locates the slide's `h2`, so each pane
   renders with an invisible stand-in heading that the embed drops. The kernel should accept a
   heading-less body instead.
6. **Lint the pairing.** The carve already records warnings (a whole-slide component in a pane, a
   bad ratio, a third marker); `lint:deck` should surface them, warn when a wide-share component
   gets under 60%, and apply the pane's family capacity (the manifests already have per-family
   budgets; §3.1).
7. **Audit the runtime's section-keyed passes.** About 17 passes in `lib/runtime` select
   `section.X`. Charts worked in the proof because the engine builds them before the runtime runs;
   anything the runtime builds or measures on its own (Mermaid, fit passes, reveal steps) needs
   `:is(section,lat-pane).X` or an explicit pane walk. Not yet enumerated.
8. **Authoring surfaces and the spec.** The Studio's insert menu and Compose editor, the Playground,
   the LFM spec (`docs/src/content/docs/spec/lfm.md`), and Export-to-Marp (a panes slide cannot
   render in Marp; it should degrade to its two panes' content stacked).

---

## 7. See also

- `2026-06-18-frame-recursion-cells.md` — the rejection of recursive frames, and §4, the flat split
  this note builds.
- `design/forms.md` §6 — the Cell contract (resolution-blind box, gap, clip) a pane honors.
- `lib/adaptive/families.js` — the shape families a pane is classified into.
- `2026-06-22-the-fit-spine.md` — the Frame owns box-response; the pane Cell is a new box it owns.
