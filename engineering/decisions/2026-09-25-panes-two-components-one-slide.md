---
status: in-progress
summary: >-
  Panes put two components' body content on ONE slide — a list beside a table, an image beside
  prose, a chart over a stat row — while the slide keeps its one title, eyebrow, subtitle, Key
  Insight, below-note, header, footer and page number. The engine renders each pane as an
  ordinary one-slide deck of its component, then embeds its body in a `<lat-pane>` Cell; a deck
  WITH panes assembles its stylesheet with a `section lat-pane` twin beside every rule arm that
  reaches a pane's body (component, base stage and theme rules), in the same rule, so no
  component is edited and every other deck keeps its exact bytes. The carve runs
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
the content, so it cannot move. **The gutter is proportional and sized so the spine never hugs a pane.** `--sp-2xl` side by side
(64px at 1280: 32 either side of the spine, where the first cut's `--sp-lg` left 16 and the spine
read as stuck to whichever pane had a hard edge) — the step compare-prose and kpi already use
between side-by-side panels. A stacked pair spends height, which a 16:9 slide has least of, so it
takes `--sp-xl` (48px, 24 either side). A component with no hard edge (a chart's own whitespace, a
centered number) sits further off; the gutter is the minimum. It is on by default because it is the family's existing answer to
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

So each rule arm that reaches a pane's body gets a TWIN rooted at the pane, in the same rule
(`lib/core/pane-css.js`):

```css
section.list > .cell-stage > ul { … }                                   /* as shipped */
section.list > .cell-stage > ul, section lat-pane.list > .cell-stage > ul { … } /* a deck with panes */
```

- **Nothing is copied.** The twin sits in the same rule, so it keeps the rule's source order and
  its declarations.
- **A pane rule wins a tie against the slide it sits in.** The twin carries one more type
  selector than its slide rule, the same in the CLI's raw sheet and the engine's packed one. That
  edge is load-bearing: `section:not(.math) :is(.katex-display)` matches a math pane's equations
  through the HOST section, and ties `section.math :is(.katex-display)`. The first cut twinned to
  a bare `lat-pane.math …`, which lost that tie on source order in the CLI and gave a math pane's
  equations 16px of padding a math slide does not have (measured in Chromium; 0px now).
- **Only a deck with panes pays.** The twins are added where a deck's stylesheet is assembled —
  the engine's `composeCss` (Studio, Playground, player) and the CLI's inlined sheet — and only
  when the rendered deck holds a `<lat-pane>`. The shipped `dist/lattice.css` is never widened, so
  every other deck, and the Export-to-Marp bundle, gets exactly the bytes it had.
- **Themes and base defaults are covered by the same pass.** An arm is twinned when it is rooted
  at `section` and either names a component (or the chart family's `chart-frame`) in its first
  compound — the component sheets, and theme rules such as the a11y texture channel — or reaches
  THROUGH `.cell-stage` — the base stage defaults every body gets (table rules, list rhythm, code).
  A class inside `:not()` is an exclusion, not a component. Slide-level rules (padding, backdrop,
  pagination) never reach a pane. Coverage: 2,971 of the 3,042 component-sheet arms rooted at
  `section`; the 71 left are `section .functionplot` descendants (which already reach a pane) and
  the auto-split cover/points pages (slide-level).
- **A leading `:is(section.x, figure.x)` is split only to find its arms**, so every arm is judged,
  and twinned, on its own. The authored selector stays byte for byte.
- **Quoted strings are text.** The walker skips `content: "/*"` and `[data-x="a{b"]`, so a brace,
  comment opener or `;` inside a string never splits a rule.
- **Nothing that counts slides can see a pane.** Pagination, page count, present mode and export all
  look for `section`; a pane is not one.
- **Shape stamps resolve per pane.** The 234 `data-family` rules and the 105 `:has()` gates sit on
  the root compound, so they read the pane's own stamps. Deck-wide classes (`mode: sketch`, a deck
  `class:`) reach the pane because the pane renders with the deck's front matter.

**The invariant, tested:** strip the twins back out of a widened sheet and every rule is the rule it
was — same arms, same order, same block — over the real bundle and all 33 themes
(`test/unit/core/panes.test.js`). A kernel bug found while building this (a `;` inside a comment split
a prelude and broke the rule that defines `--sketch-ink`, on every slide of a panes deck) fails it.

### 2.2 The options this replaced

| Option | Why not |
|---|---|
| **Nested `<section>` for a pane** | Component CSS would work untouched, but about 100 code sites query every `section` (lib, docs, tools) and 48 CSS counters count them. Any one of them could count a pane as a slide: an extra PDF page, a second page number, a present-mode stop. The risk lands on export, the surface every deck depends on. |
| **Copy each component's rules for a pane `<div>`** | Correct, but it duplicates 2,938 selectors (+28% minified if always shipped) to express what one word already says. The owner's objection — "why copy anything?" — was right. |
| **Hand-migrate component CSS off `section`** | The cleanest end state, but it touches all 70 components for no behavior the widening doesn't already give. |
| **Widen the shipped bundle at build time** (this PR's first design) | Shipped first and reviewed by the adversarial trio. It broke Export-to-Marp for EVERY deck: the base pass left `:is(section,lat-pane)` in the second position of a selector list, which the Marp scoper reads as a slide descendant, so ~107 rules (every table's rules among them) could never match there. It never reached themes, which the CLI reads raw at render time, so a11y chart textures dropped out of panes. And it cost every deck +15.3% gzipped CSS (about 14 KB) and tipped the Playground's first-paint snapshot over its 240K-unit cap. |

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
| Existing decks render the same markup | engine, every committed deck | 311 decks (every `examples/*.md`, component gallery and baseline deck; `panes.md` excluded): byte-identical HTML between `origin/main` and this branch, each rendered from its own worktree |
| Existing decks get the same stylesheet, plus only the pane cell's own rules | engine `render().css` | the same 311 decks: every composed sheet differs from `main` by exactly +2,805 bytes, all of it `lib/forms/cell/pane/pane.css` (keyed on `section.lat-pane-host` / `lat-pane`, which no normal slide carries); zero lines removed |
| Existing decks render the same pixels | CLI PDF export | 81 pages vs a `main` build, 0 differing pixels: `examples/a11y.md`, `sketch.md`, `finish-backdrops.md`, the legal and progression galleries |
| Export-to-Marp is unchanged | `marpScopableCss` over the shipped `dist/lattice.min.css` | 4 selectors still start with `:is(` (as on `main`; the build-time design left 111), 0 twin arms (the only `lat-pane` selectors are the pane cell's own 14 in `pane.css`) |
| Two components on one slide, chrome kept | CLI PDF export | `examples/panes.pdf` (light, committed) and a dark render reviewed alongside it, not committed — list+table 40/60, bar+list 55/45, image+text 50/50, table+big-number 70/30, stacked line over stats, piechart+list 45/55 |
| Themes, sketch and finishes reach a pane correctly | CLI export, computed styles in Chromium | a11y-deuteranopia: a pie pane's wedge fills `url(#latt-a11y-chart-tex-1)` like a pie slide; `mode: sketch`: a cards pane's card computes the same 2px hand-drawn border as a cards slide; `class: dark` + `finish: atrium`: panes paint no background and no padding |
| The Studio previews a panes slide | the real Studio (`/studio/`, docs dev server built from this branch), 1440px desktop | the demo deck typed into the editor: one host section, two `lat-pane` cells, list pills and table rules computed as on the CLI, no page errors. An earlier run found the preview's sanitizer **dropping** `<lat-pane>`; `lat-pane` joined `ADD_TAGS` in `lib/core/sanitize-slide-html.mjs` (which also covers the self-contained `.html` export) |
| A pane is never a slide; slides around it survive | engine | `test/unit/core/panes.test.js`: one `<section>` and one `<h2>` per panes slide; `---` directly under a table, list or comment, and `split: headings`, keep every later slide |
| Slide ids don't depend on later panes | engine | the same test: a piechart slide's ids are unchanged by a panes slide after it, and a panes slide's ids match between the deck render and a render alone at its offset |
| Studio / Playground smoke | Playwright `@smoke` | 59/59 locally on the final code |

**Not verified:** the Studio at tablet and phone widths; the Playground UI with a panes deck; the
PPTX, image-set and player exports; Export-to-Marp OF a panes deck (marp-core cannot carve; §6);
a Mermaid diagram in a pane. They share the engine, but "shares the engine" is not verification
(HARD RULE #23). Each is a `followups.d/2376-*` item.

---

## 5. The measured cost

- **CSS: 0 bytes for a deck without panes** beyond the pane cell's own 2.8 KB of rules. A deck WITH
  panes composes a widened sheet: 3,353 twin arms on the demo.
- **Compose time:** composing a theme's sheet takes ~147ms once and is memoized (2.5ms warm). A
  deck with panes composes a second, widened copy once per theme.
- **Render time:** one extra markdown-it parser per distinct pane shape (orientation × family),
  memoized. Decks without panes pay one substring test (`pane:`) per render, inside the parse.
- **The Playground's first-paint snapshot** keeps pane arms only when the captured slide holds a
  pane, so a pane later in the deck does not push slide 1's snapshot past its 240K-unit cap.

---

## 5a. What the independent reviews changed

**Maker-checker on the first cut** (HARD RULE #25) reproduced three blockers and nine smaller
defects, all fixed and each pinned by a test in `test/unit/core/panes.test.js`:

- **A debug line crashed the browser engine on any panes deck** (`process.env` in the bundle).
- **The first carve was a text pre-pass with its own idea of a slide break**, which dropped slides
  after a `---` under a table or with `split: headings`, mis-closed a 4-backtick fence, and lost
  directives, titles and the host class. The carve moved into the parse (§2).
- **Quote attribution was taken as the slide's below-note.** Now governed by `coda.claims` (§1).
- **A chart pane painted the slide's background**; a pane is transparent now.
- **Pane ids depended on later slides; a forged placeholder could be filled; a comment holding
  `<div>` could swallow a pane.** Pinned ids, a nonce, and a div matcher that skips comments.

**The adversarial trio on the full PR** (owner's request before merge) found three blockers — the
build-time widening's Marp regression and its theme blind spot (now §2.2's rejected row), and a
cubic-time `panes:` regex a 3 KB deck could hang on — and fixed-in-PR should-fixes: a pane's first
code-only paragraph was deleted with the chart stand-in heading (the stand-in is now chart-only and
hands a lifted pill back), a `_class` inside a pane replaced its component (a directive the engine
applied stays on the slide), a pane anywhere in the deck cost slide 1 its Playground snapshot,
deck-wide classes never reached a pane, `lint:deck` read pane markers as narration, plus
`Object.hasOwn` on `PANE_FORM` and the id pin released in a `finally`. The design was upheld:
normal slides match exactly the rules they matched before (3,712 rules compared), the sanitizer
change opens nothing, and embedding held across 361 modifiers and 18 registers.

---

## 6. The gaps between the proof and a v1 (ranked by what they unblock)

Panes ship **experimental**: the syntax may change until these close. Each has a `followups.d/`
file (`npm run followups`), so none lives only in this note.

1. **Surface a clipped pane and the carve's warnings** (`2376-p1-…`). A pane clips at its own edge
   and does not overflow its section, so the slide-level overflow checks stay green while a table
   loses rows in the PDF; the carve's recorded warnings (a whole-slide component, a bad ratio, a
   third marker) reach no one. `lint:deck` and the export's overflow warning should report both.
2. **Measure the pane, don't estimate it** (`2376-p2-measure-…`). The engine classifies a pane from
   `STAGE_FRAC`; the real stage height moves with the subtitle and the coda (192px, not 488px, on
   the demo's first slide). The runtime should re-stamp each pane from its laid-out box.
3. **Size chart geometry to the pane** (`2376-p2-size-chart-…`). A chart in a narrow pane draws its
   labels below their designed size (the bar values and pie legend in `examples/panes.pdf`).
4. **Author and package CSS in a pane** (`2376-p2-author-css-…`). A panes deck widens the shipped
   sheet, the theme and the CLI's front-matter `style:`; installed packages and the Studio's
   `extraCss` are not widened yet, so their `section.<component>` rules skip a pane.
5. **Audit the runtime's section-keyed passes** (`2376-p2-audit-…`) — about 17 in `lib/runtime`,
   plus sketch's rough-ink pass; Mermaid in a pane is untested.
6. **A shape family for stacked bands** (`2376-p3-band-…`): a line chart letterboxes, stat tiles
   need ~45% of the stage.
7. **The remaining surfaces** (`2376-p3-panes-on-…`): PPTX, image-set, player, the Studio at 820 and
   390px and its slide strip ("text"), and Export-to-Marp, which cannot carve and should degrade to
   the two panes' content, stacked.
8. **Retire the chart stand-in heading** (`2376-p3-retire-…`).
9. **Authoring surfaces and the spec** — the Studio's insert menu and Compose editor, and the LFM
   spec (`docs/src/content/docs/spec/lfm.md`) — once the syntax is no longer experimental.

---

## 7. See also

- `2026-06-18-frame-recursion-cells.md` — the rejection of recursive frames, and §4, the flat split
  this note builds.
- `design/forms.md` §6 — the Cell contract (resolution-blind box, gap, clip) a pane honors.
- `lib/adaptive/families.js` — the shape families a pane is classified into.
- `2026-06-22-the-fit-spine.md` — the Frame owns box-response; the pane Cell is a new box it owns.
