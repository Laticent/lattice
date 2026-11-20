---
status: in-progress
summary: The universal coda (key insight, below-note, annotation) reaches 68, 38 and 38 of 80 layouts on the engine — honestly declared, but far short of "almost all" — and on Marp it works only when the runtime runs, which VS Code's default preview security forbids; deck-wide `claim:` never reaches Marp at all. Measured on every layout and three surfaces, with a plan to widen the coda, give split-panel the coda and a width modifier, and make the Marp kit honest.
---

# The coda and the claims, on every layout and every surface

**Asked (2026-11-20).** The owner reported three things: the universal coda — key insight,
below-note, and the closing paragraph — does not work on every component, and nothing makes
that obvious; `claim-hero` and the other claims do not work in VS Code with Marp; and the website
may not describe either truthfully. The expectation: all three coda beats work on almost every
layout (with possible exceptions for `content`, `columns` and `rows`); split-panel layouts support
the coda and get a modifier to adjust the split; the Marp kit works as expected; and the docs match
reality.

This note records what was measured and proposes the fix. It sits under **W4** of
[`2026-11-19-deterministic-authoring-audit.md`](./2026-11-19-deterministic-authoring-audit.md)
("universals are declared, and protected"). W4 makes a silent drop impossible. This note decides
**how far the coda should reach**, and what "works in Marp" means. The per-layout numbers are in
[`2026-11-20-coda-and-marp-parity/per-layout.md`](./2026-11-20-coda-and-marp-parity/per-layout.md).

## The answer in six lines

1. **On the engine the coda is honest but narrow.** Key insight renders on 68 of 80 layouts,
   below-note on 38, annotation on 38. The published contract (`authoring.blocks`) matches the
   render on 79 of 80. The gaps are declared claims, not silent drops.
2. **The 42 layouts without a below-note are mostly charts.** All 30 chart kinds claim the
   trailing paragraph as their caption. The other 12 are the four anchors, `stats`, `image`,
   `split-panel`, `split-compare`, `quote`, `math` and the three QR posters.
3. **On Marp with the runtime running, everything matches the engine** — coda and per-slide
   `claim-*` both.
4. **On Marp without the runtime — VS Code's default preview security — almost nothing works.**
   0 of 80 layouts paint the key insight panel, and most layouts (cards, KPIs, lists, charts,
   splits) render as raw Markdown. The kit's README and Sample-Deck say layout works there.
5. **Deck-wide `claim: hero` never reaches Marp.** Marp drops front-matter keys it does not know,
   and a slide's own `_class:` replaces the deck's `class:`. The runtime's **settings block**
   already solves this and works in a kit deck, but the kit never tells anyone about it.
6. **`split-panel` claims both beats, and its panel width is fixed per variant** (38%, 44% under
   `metric`, 50% under `pullquote`). There is no author control.

## 1. Method

Every layout's manifest `sample` (80: 52 components and 28 chart kinds), plus a trailing
`> blockquote` and a trailing paragraph. A second deck replaces the paragraph with an italic-only
one, to test the annotation. Each deck rendered on three surfaces and measured in Chromium:

| Surface | How it was built | What it stands for |
|---|---|---|
| **Engine** | `node lattice.js deck.md deck.html` | Studio, CLI, PDF/PPTX export |
| **Marp + runtime** | marp-core with `VSCODE_OPTIONS`, the kit's theme stubs, the linked `lattice-vscode-min.css` and the three kit `<script>` tags — the page `test/integration/export/marp-vscode-css-parity.test.js` builds | `marp --pdf`, and the VS Code preview at security level *Disable* |
| **Marp, no runtime** | the same page without the scripts | the VS Code preview at its **default** level, *Strict* |

For each beat the probe found the text, then recorded whether it was visible, inside the slide,
not under another element, and how it was styled: a key insight panel (its `::before` reads
`KEY INSIGHT`), a below-note (inside `.below-note`), an annotation (the drawn spark). Every
"no runtime" verdict was then checked by eye on a contact sheet of all 80 slides, and on the
kit's own `Sample-Deck.md`.

**What this does not measure.** Whether the BODY still fits once a beat is added. The 2026-11-19
audit found 11 layouts that clip their own sample under a key insight (`kpi` hides its fourth
tile); that is a capacity question, tracked there.

## 2. The engine: honest, and narrower than the owner expects

| Beat | Renders | Declared | Mismatch |
|---|---|---|---|
| Key insight | 68 / 80 | 68 | none |
| Below-note | 38 / 80 | 39 | `video` (its sample at capacity pushes the band off the slide) |
| Annotation | 38 / 80 | same set as below-note, by construction | `video` |

Who withholds what, and why — each is a `coda.claims` entry in the layout's manifest:

| Layouts | Withholds | Because the element is |
|---|---|---|
| 30 chart kinds (`bar` … `word-cloud`) | note + annotation | the chart caption (`liftChartCaption`); `matrix-grid` and `state-chart` use it as the legend |
| `title`, `closing`, `divider`, `topic` | note + annotation | the bookend lede |
| `stats` | note + annotation | its italic lede |
| `image` | note + annotation | the text column |
| `split-panel` | **both** | the right panel's body; the `pullquote` variant's quote |
| `split-compare` | **both** | the verdict card (which already reads the insight label) |
| `quote` | **both** | the quotation and its attribution |
| `math` | **both** | the equation grid |
| `contact`, `wifi`, `gift-card` | **both** | a poster card that fills the stage |
| `citation-card`, `redline`, `policy-recommendation`, `inventory` | key insight | a blockquote in their own anatomy |

`content`, `columns` and `rows` — the three the owner offered as exceptions — **already take all
three beats**. Removing support that works would be a regression; this note keeps them.

## 3. Marp: the runtime is the whole story

**With the runtime**, the Marp page matches the engine beat for beat on all 80 layouts, and
per-slide `_class: <layout> claim-hero` (and `-quiet`, `-bleed`) renders exactly as on the engine
(measured on `cards-grid`, `bar`, `kpi`, `image`, `content`). Two differences, both off-path for
this note: `image`'s library asset does not resolve in the kit, and `word-cloud` loses its key
insight panel.

**Without the runtime**, which is what VS Code shows by default:

- The key insight panel paints on **0 of 80** layouts; the blockquote stays a plain quote.
- The below-note is never promoted; a CSS-only fallback draws the annotation's spark and rule.
- **Most layouts render as raw Markdown.** Turning the runtime on changes more than 5% of the
  pixels on 63 of 80 layouts. Only the anchors, `code`, `compare-code`, `table`, `agenda`,
  `list-tabular`, `list-steps` and `premise` hold their shape. On the kit's own `Sample-Deck.md`,
  `kpi`, `split-panel`, the chart and the diagram are raw.
- `claim-*` does nothing: the header, footer and page number stay.

So the complaint "claims don't work in VS Code" has two causes, and the coda has the same two:

| Cause | Affects | Fix exists? |
|---|---|---|
| The preview is at *Strict*, so the runtime never loads | every layout's structure, the coda, the claims | No — see §5, decision 4 |
| Deck-wide `claim:` (and every Lattice-only key: `mode:`, `finish:`, …) is dropped by Marpit, and a slide's `_class:` replaces the deck's `class:` (`<section class="kpi">`, verified) | deck-wide settings, even with the runtime | **Yes.** The runtime reads a settings block, `<script type="application/lattice-settings">`, under the front matter (`lib/core/settings-block.js`). Measured in a kit deck: `claim: hero` there reaches every slide, including those with their own `_class:`. The Export-to-Marp bundle writes this block; the copy-and-go kit never mentions it |

**The docs say otherwise.** The kit README says four of the Sample-Deck's thirteen slides need
the runtime and "everything CSS does … holds on all three" surfaces; the Sample-Deck's "What
renders where" slide marks *layout* as working in the VS Code preview. Both are false at the
preview's default level. §6 lists every doc finding.

## 4. Split panels

`split-panel` sets one width token, `--_panel-w`, per variant (`split-panel.styles.css:55`):
38% by default, 44% under `metric`, 50% under `pullquote`. Nothing lets an author change it.
`split-compare` has its own fixed split. Both dock the coda as a **row** (the section is a flex
row), and the row arm already exists in `lib/forms/cell/coda/coda.css` (`premise` uses it), so
giving them the coda is a manifest change plus a check of each variant, not new layout machinery.

The `pullquote` variant uses a LEADING blockquote as its featured quote. The coda harvests only
the TRAILING one, after the right-hand list, so a key insight can coexist with it.

**Prototype, measured.** With `split-panel`'s claims emptied and the catalog rebuilt, the first
nine gallery variants rendered with a key insight and a note on the engine. The beats land at
the foot of the **supporting column**, not as a band under both panels — which is the better
answer for a split, because a band would cut the full-height panel. Seven of nine are right as
they stand, `pullquote` included. Two are not:

- **`metric`** flips the supporting column dark; the note paints `rgb(30, 58, 95)` text on that
  navy, so it is invisible. The note must take the column's ink.
- **`qr`** builds its code after the body, and the code lands INSIDE the `.below-note` wrapper
  (the wrapper measured 349 px tall for one line of text). The QR must be placed before the
  harvested cell.

`split-compare` cannot simply drop its claim: its verdict card IS a blockquote, so the coda would
take the verdict. It needs decision 1's "a second blockquote is the insight" rule.

## 5. The plan

**Done in this line of work without asking** — reversible, inside the issue, each a fix to a
surface the owner named:

1. **`split-panel` and `split-compare` take the coda.** Drop the claims; key insight and
   below-note dock as a row band under both panels. Each variant checked by eye and by the probe.
2. **The kit teaches the settings block.** `Sample-Deck.md` moves its Lattice keys into one; the
   README says where deck-wide settings go and why `class:` at the top is not enough.
3. **Every doc finding in §6 fixed** in the same change (HARD RULE #6): `base.docs.md`'s counts
   and lists, the kit README, the Sample-Deck's "What renders where" slide, the website pages.
4. **A conformance check** — the probe in §1, promoted to a test that renders every layout with
   each beat and asserts the result equals `authoring.blocks`. This is W4's conformance test,
   started with the coda.

**Settled with the owner (2026-11-20):**

| Question | Answer |
|---|---|
| 1. Coda reach | Opt-outs shrink to `math` and the three QR posters. **`quote` does not opt out**: its attribution stays the first paragraph after the quotation, and a second trailing paragraph becomes the below-note (or annotation). Quote takes **no** key insight; a second blockquote stays a plain quote. The anchors, `stats`, `image` and the blockquote-anatomy layouts gain the coda as recommended |
| 1b. Anchors (asked later the same day) | **The four anchors — `title`, `closing`, `divider`, `topic` — take no coda at all**, overruling 1's "gain the coda": a takeaway belongs on the content slide it sums up. They claim both beats; `lint:deck` flags an authored `>` on any layout that withholds both beats and has no quotation slot of its own (`block-unsupported`). This is a breaking change for the key insight, which anchors showed before |
| 2. Charts | **A chart's caption IS its coda's paragraph beat.** The below-note or annotation renders inside the figure as its `<figcaption>`; the key insight stays the slide-level panel. Captions stay optional. The same rule applies to `diagram` and `video` |
| 2b. `image`, `collage` | Not decided: they have their own semantics and need a deeper assessment before the caption rule reaches them (`followups.d/`) |
| 3. Split width | `panel-narrow` / `panel-wide` on `split-panel` and `split-compare`; no modifier keeps today's widths |
| 4. Marp at *Strict* | **Loud notice only.** Lattice needs the runtime and will not work without it; the deck should say so as clearly as it can. No markdown-it spike |

The options as they were put follow, for the record.

**Decisions for the owner** (put as one round):

1. **How far the coda reaches.** *Recommend:* every layout takes all three beats except where the
   trailing element IS the layout — `quote`, `math`, and the three posters (`contact`, `wifi`,
   `gift-card`). The anchors, `stats`, `image` and the four blockquote-anatomy layouts lose their
   claims: their own element comes first, so a beat AFTER it is unambiguous ("a second trailing
   blockquote is the insight"). `content`, `columns`, `rows` keep the coda. Moves below-note from
   38 to about 75 layouts and key insight from 68 to 75.
2. **Charts: caption or note?** *Recommend:* the first plain paragraph after the chart stays the
   caption; a second paragraph becomes the below-note; an italic-only last paragraph becomes the
   annotation (the natural home for a "Source:" line). *Alternative:* leave charts without notes.
3. **The split modifier.** *Recommend:* one exclusive **Width** axis shared by `split-panel` and
   `split-compare`, two words either side of today's default: `panel-narrow` (about 30%) and
   `panel-wide` (about 50%). With neither, each variant keeps the width it has now. The exact
   stops are set by rendering every variant at each and checking the right panel still fits its
   sample.
4. **Marp without the runtime.** *Recommend:* make it loud now — a CSS-only band on every slide
   that says "the Lattice runtime is off — set the preview security to *Disable*", visible only
   when the runtime has not loaded — and spike the one route that could make the default
   preview whole: the kit's VS Code extension contributing Lattice's markdown-it plugins
   (`markdown.markdownItPlugins`). Whether Marp for VS Code honors another extension's plugins is
   **UNVERIFIED** (`engineering/gotchas/vscode.md` rules out a workspace engine, not an extension
   plugin); it needs a real VS Code. *Rejected:* a hand-written CSS-only tier per layout — a
   second code path for 60+ layouts, which HARD RULE #1 exists to prevent.

## 6. Doc findings

From an independent docs audit against the measurements above, two findings spot-checked
(`examples/gallery.md` does not exist; `design/skills/chart-component.md:64-67` is as quoted).
Each is fixed in the change that implements §5.

**Tell an author something works that does not:**

| Where | Says | Reality |
|---|---|---|
| `kit/Sample-Deck.md:144-152` ("What renders where") | Layout works in `marp --html` and the VS Code preview; "anything CSS draws holds everywhere" | Most layouts need the runtime; at *Strict* `kpi`, `split-panel`, the chart and the matrix on that same deck are raw |
| `tools/build-marp-kit.js:390-392` → kit README | four of thirteen Sample-Deck slides need the runtime | at least five (`kpi` too) |
| `tools/build-marp-kit.js:409` → kit README | "every purely-CSS layout … holds on all three" | almost no structured layout is purely CSS |
| `tools/build-marp-kit.js:379-381`, `kit/Sample-Deck.md:77-83` | `class: dark` "stamps every slide" | a slide's `_class:` replaces it; every Sample-Deck slide sets one |
| `design/skills/chart-component.md:64-67` | VS Code filters `<script>`, so charts bake into HTML | charts are drawn by the runtime, only at *Disable* |
| `design/skill.md:36-41`, `:78-81` | the same `.md` works unchanged in the VS Code preview; `color-mode: dark` works there | needs the kit's link and scripts plus *Disable*; Lattice front-matter keys are dropped |

**Stale or silent:**

- `lib/base/base.docs.md:596-597` — "61 layouts … 51 / 36 / 36"; it is 80 layouts, 68 / 38 / 38.
- `base.docs.md` Key Insight, Below-Note and Annotation sections never say the beats need the
  runtime on Marp; `:587-590` overstates the CSS-only fallback (it draws only the annotation's
  rule and spark).
- `base.docs.md:373-375` says `split-panel` claims the blockquote for `pullquote`; it claims both
  beats on every variant.
- `base.docs.md:607-609` points at `examples/gallery.md` slides 21–22; the file does not exist.
- `base.docs.md:1000-1004` — `claim-*` works "on every component": true on the engine and on Marp
  with the runtime only.
- `base.registers.docs.md` intro and the generated register table — no word that Marp drops every
  register; only the `inline-code:` section (`:604-660`) says so, and says it well. It is the
  model wording for the fixes.
- `docs/src/content/docs/guides/authoring.md:370-372`, `base.docs.md:517`,
  `content.docs.md:27` — "a front-matter `class:` reaches every slide": engine-only.
- `getting-started.md:81-83` implies `marp: true` is enough for the VS Code preview.
- `cards-grid` slot description puts the key insight "above the cards"; it is below.
- **The website has no page on the closing beats at all** — only lint ids and a switch row. The
  fix adds a "Closing beats" section to `guides/authoring.md`, generated from `authoring.blocks`,
  so it cannot drift.

## 7. As built (2026-11-20)

| Beat | Published before | Published now |
|---|---|---|
| Key insight panel | 68 | **67**, plus 3 that draw your `> …` as their own insight (`inventory`, `policy-recommendation`, `split-compare`) |
| Below-note / annotation | 38 / 38 | **71 / 71** |

**The mechanism.** Two new manifest fields beside `coda.claims`, read by one kernel (`lib/core/coda.js`):

- `coda.anatomy` — the layout uses the FIRST blockquote or paragraph of its own, and a later one is the
  beat: `quote`'s attribution (`trailing-paragraph`), `citation-card`'s cited text (`blockquote`).
- `coda.caption` — the paragraph beat is the figure's caption. Every chart kind hands it back to its own
  caption code (`chart-frame.js` `noteToCaption`, so a chart deck renders as before); `diagram` and `video`
  get a late pass, `lib/transformers/figure-caption.js`, that moves it into the stage under the figure. On a
  `caption` layout a `<figure>` (a drawn `@video{…}`) counts as the block a note may follow.

Panes keep both kinds of element in the pane (`panes.js` `paneClaims`), so a chart pane keeps its caption
and a quote pane its attribution, as before.

**Where it departs from the settled answer, and why.** The tests found three cases the plan had wrong:

- **`redline` keeps its blockquote claim.** It has TWO blockquotes of its own (the old and new passages),
  so "the first one is the layout's" is false for it; a pane and the carousel split pinned that.
- **`inventory`, `policy-recommendation` and `split-compare` keep theirs too.** Each already draws the
  author's trailing `> …` as its own insight (a look-specific band, the ask, the verdict); a second panel
  beside it would be two takeaways. All three gained the note.
- **`image` is unchanged** (key insight yes, note no): settled 2b sends it to a deeper assessment.

**Defects found and fixed on the way:** `video` declared `dock: "row"` on a section that is a flex column,
so any key insight or note pushed its card off the slide; split-panel `metric` painted the note navy on
navy; `split-panel qr` and `closing`/`divider qr` put the code inside the note; `split-compare` put the note
above its verdict; and, on Marp, the LAST slide of every kit deck lost its coda, because the kit's
`<script>`/`<link>` lines at the end of the deck land inside that slide after its beats and the kernel's
tail scan stopped at them (it now steps over them as it does over Marp's `<footer>`).

**Not done here.** `image` and `collage` captions (`followups.d/3362-p3-image-collage-caption.md`). Video
with BOTH a key insight and a caption fits only just: the engine's fit check flags a few pixels on the
gallery sample. The runtime-off notice is verified on a modeled VS Code page (marp-core with the
preview's options), not yet in a real VS Code.

## 8. Verified on every surface (2026-11-20)

A 41-slide board deck using all 39 layouts that gained a beat, rendered and inspected slide by slide on:
the Lattice PDF; the HTML player (stepped through with the keyboard); PPTX and ODP, default and
`--editable`, opened in LibreOffice with the deck's own fonts installed; the copy-and-go kit through
real `marp --pdf`; an Export-to-Marp bundle through real `marp --pdf`; and the modeled VS Code preview,
scripts on and off. **Every gained beat renders on every surface.** What the pass found, none of it new
to this change:

- `gantt`, `journey`, `matrix-grid` (and `roadmap` before trimming) at gallery density overflow with a
  key insight AND a caption, and say so ("Content clipped"). Gantt refuses to shrink by design
  (`gantt.styles.css`); the docs now tell authors to trim or keep one beat.
- Editable PPTX: on the title slide the key-insight text runs a few pixels past its shrink-wrapped
  panel in LibreOffice; LibreOffice was still substituting one font weight, so this wants a look in
  PowerPoint.
- The kit flags both split slides because the running footer is truncated in the narrow dark panel (the
  Lattice PDF truncates it too and does not flag it); a footer-width question, not the coda.
- A kit deck that names a palette the kit does not ship (`theme: indaco`) renders unstyled with no
  warning.

Not reached: a real VS Code (its download host is blocked here), real PowerPoint or Keynote, and the
player's article view.
