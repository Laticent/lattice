---
status: audit — no engine change
summary: What auto-split actually produces for every component and every declared variant at `portrait` (1080×1350) and `square` (1080×1080), from 122 decks of representative authored content written at each component's `sweet` capacity and passing `lint:deck` with zero warnings. Headline: 147 authored slides become 628 portrait pages (4.3x), and auto-split collapses 45 of the 112 visually distinct looks the catalog's variants produce on an unsplit page down to 67. The collapse is measured, not eyeballed — every variant page is pixel-compared against the same content rendered unsplit at `hd`, and the two populations separate cleanly (survivors >= 1.8% of pixels different, erased variants 0.12–0.29%, i.e. antialiasing). Four components lose or destroy authored content outright. The audit exists to answer one question: should each component own its auto-split look entirely, or is this refinement of a shared envelope? Recommendation inside.
builds-on: 2026-09-01-autosplit-splits-on-structure.md, 2026-07-29-autosplit-is-not-a-toggle.md, 2026-07-22-structure-derived-split-patterns.md
---

# Auto-split, seen: every component, every variant, portrait and square

**Date:** 2026-09-05 · **Status:** Audit · **Decision owner:** Sharmarke

## What this is

A look at what auto-split actually renders, across the whole catalog, on
representative authored content rather than a fixture. It answers the question it
was commissioned for — *does every component need to own its auto-split look, or
does the shared envelope need refinement?* — with a recommendation at the end, and
it lists the components that are problematic today with the reason for each.

## How the evidence was made

**One deck per component, one slide per declared variant, at both sizes.**
61 components; 31 enrol in auto-split, 30 do not. Every component's own variant
list is covered — 116 variants — plus the default, for 245 authored slides across
122 decks, rendering to **1,436 pages**.

**The content is authored, not fixture-shaped.** Every slide is a page from one
fictional company's board and operations material (a clinical-data business,
Meridian Health), written at the component's `sweet` capacity — a normal author's
slide, not a stress test. `lint:deck` reports **zero errors and zero warnings on
all 122 decks**, which matters: `capacity`'s only consumer is `lint:deck`, so a
clean lint is the engine's own statement that these slides are inside their word
budget. Everything below is therefore the engine's doing, not the author's.

**A control renders the same decks at `hd`.** Splitting is gated to `square`,
`tall` and `strip`, so the same markdown at `hd` gives the unsplit page for
free — the same content, same component, same variant, no split. Every claim about
what the split *changed* is a comparison against that control, not an impression.

Reproduce it:

```
mkdir -p .scratch/asaudit/decks
cp -r examples/assets .scratch/asaudit/decks/assets
node engineering/decisions/2026-09-05-auto-split-catalog-audit/decks/gen.js
for f in .scratch/asaudit/decks/*.md; do
  node lattice-emulator.js "$f" ".scratch/asaudit/pdf/$(basename "$f" .md).pdf"
done
node engineering/decisions/2026-09-05-auto-split-catalog-audit/decks/looks.js
```

`looks.js` prints the distinct-look counts; `variants.js` prints the per-variant
pixel diffs. `master-table.txt`, `looks.json` and `variant-diffs.json` in this
directory are the outputs as measured on 2026-09-05.

## The three numbers

| | measured |
|---|---|
| **Page multiplier** | 147 authored slides on the 31 enrolled components → **628 pages at portrait** (4.27x) and **606 at square** (4.12x). The 98 slides on non-enrolling components stay at 101 pages. |
| **Variant collapse** | The 20 enrolled components that declare variants offer **136 looks** (default + variants). Rendered unsplit they produce **112 distinct** pages. After auto-split: **67**. The split removes 45 — **40% of the catalog's variant expression on these components**. |
| **Envelope conformance** | The promise is COVER → BODY → CLOSING. Across 141 split runs at portrait: **3 components emit no cover at all** (`journey`, `kanban`, `roadmap` — the three native-slice strategies), and only two components emit a closing page — `content` (1 run) and `roadmap` (5). Every other run just stops on its last member. |

The variant number is the one to trust least on intuition and most on the
measurement, so here is the measurement. Each variant's page is compared with the
default's equivalent page, unsplit and split, as a percentage of differing pixels.
The two populations do not overlap:

```
split-panel  metric      unsplit 93.55%   after split 0.12%
split-panel  proof       unsplit 87.39%   after split 0.13%
split-panel  cat-1..8    unsplit 42.90%   after split 0.16–0.18%
journey      heatmap     unsplit 30.26%   after split 0.13%
compare-prose chosen     unsplit 25.22%   after split 0.13%
list-tabular def         unsplit  6.86%   after split 0.07%
...
agenda       cards       unsplit 38.61%   after split 58.53%   (survives)
kpi          ops         unsplit 45.46%   after split 50.68%   (survives)
kpi          spotlight   unsplit 11.21%   after split  3.07%   (survives)
```

Everything that survives lands at 1.8% or above. Everything erased lands between
0.07% and 0.29% — the noise floor of antialiasing on identical pages.

## What the split looks like when it works

`list-steps`, `policy-recommendation`, `kpi`, `authority-chain`,
`regulatory-update` and `statute-stack` produce the intended shape: an accent
cover that hoists the heading and names the first member, one member per page with
the heading repeated and a pill naming the next member, and a k-of-N dot rail with
fractional page numbers (`2`, `2.2`, `2.3`). Nothing clips. The variants survive.
`policy-recommendation` is the best of them — five stance variants (`adopt`,
`amend`, `oppose`, `defer`) recolor the chip, the member's rule and the ask box on
every page of every run, and the heading stays a heading.

## The problem list, in one table

Every component that is problematic at `portrait` or `square`, with the reason.
`—` means the component is fine at both sizes. Severity keys to the sections
below: **A** content lost · **B** meaning lost · **C** envelope defect ·
**D** poor page.

| Component | Enrolled | Sev | Why it is problematic |
|---|---|---|---|
| `inventory` | yes | A B C | The claimed insight prints on every body page (16 times per portrait deck) and at square `editorial` draws it **on top of** the member text — both illegible, no ring. `timeline` collides its number badge with the first letter of every body line. |
| `statute-stack` | yes | A | `lane` renders three body pages carrying the heading and nothing else; one page is blank below the rule. Every provision is gone, at both sizes, with no ring. |
| `split-panel` | yes | A B C | `qr` silently drops its URL and caption. `pullquote` fails to split while its 16 siblings do, and overflows the page at portrait. **17 declared looks → 2 after the split**, the eight `cat-N` accents included. Heading demoted below its own body copy. |
| `math` | no | A C | `math stats` splits although `math` never splits — a variant name that collides with a component name inherits that component's axis. Raw LaTeX prints in the cover lead-in; forward pills read `w w w →`. |
| `verdict-grid` | yes | A B | The criteria legend the split bolts on is clipped with an ellipsis on every body page, both sizes; and a comparison matrix read down its columns does not survive being cut into rows. |
| `compare-prose` | yes | B C | Read-across is the component. **9 looks → 1.** `chosen` and `rejected` — which say which side won — render identically. The cover prints `Side by side →` above a run that is not. |
| `compare-code` | yes | B C | A before/after diff is unreadable serially, and both snippets would fit on one page. Body pages drop the heading entirely and carry no pointer. |
| `decision` | yes | B C | The rejected option gets a full page identical to the chosen one, so that page alone argues the opposite. `banner-tag` shows no tag. |
| `list-tabular` | yes | B C | **6 distinct looks → 1.** Heading demoted to a caption below the member it introduces; `(cont.)` absent on all 150 body pages. |
| `roadmap` | yes | B C | No cover on any run. Closing-page heading set smaller than its own note. Forward pill reads `the note →`. Legend repeats on every page and is then restated as the key insight. **5 looks → 2** at portrait; at square the one variant that splits renders worse than the four that don't. |
| `journey` | yes | B C | No cover. Both legends repeat on every page. **5 looks → 1** at portrait (heatmap pixel-identical to default); at square it does not split at all and leaves ~48% of the canvas empty. |
| `kanban` | yes | C D | No cover, no closing page, and the deck kicker repeats on all nine pages. Worst page is one card on ~85% empty canvas. |
| `kpi` | yes | B D | Three comparable figures become three unrelated captions. At square `trajectory` pushes its value outside the panel with no ring. |
| `stats` | yes | B C | Four differently-united numbers lose the one baseline that made them a set — and the engine reprints that baseline sentence on all five pages. |
| `policy-recommendation` | yes | C | Best variant fidelity in the audit (5 looks → 5) and correct hierarchy — but "THE ASK" prints 15 times instead of getting the closing page, and it is the largest block on each page. |
| `agenda` | yes | B | `progress-2`…`progress-6` become mutually identical after the split — the current-item marker does not advance page to page. **11 looks → 7.** |
| `cards-grid`, `cards-stack` | yes | B | Column-count and stacking variants have nothing to express when a page holds one card. Inherent, not a defect. |
| `checklist`, `list`, `actors`, `cycle`, `glossary`, `premise`, `list-criteria`, `content` | yes | D | Correct structure, no clipping — and 60–85% of every body page empty, with the member set at the size it had when four more were beside it. `content` is the only component in the corpus that emits the promised closing page. |
| `pricing` | no | A | Portrait clips all three variants: one of three tiers visible, text cut mid-word, ~65% of the page blank. Backed out of splitting on 2026-09-01; this is the cost. |
| `split-compare` | no | A | Portrait drops the `RECOMMENDATION` block — the slide's conclusion — and prints the page number inside a card. |
| `wifi`, `contact` | no | A | Portrait cuts the Wi-Fi password off the page edge; drops the QR code and caption while still drawing their empty cell. |
| `state-chart` | no | A | Three of four variants cut the terminal state through its own box at portrait; transition labels render at half the legibility floor on all four. Square loses the end marker past the page edge with no warning. |
| `video` | no | A C | `qr` at portrait loses the first line of its heading off the top and its caption off the bottom, over the footer. `companion` silently suppresses the deck footer at both sizes, and at portrait it stacks rather than placing the player beside the claim — the variant's whole premise. |
| `obligation-matrix` | no | A | `asymmetric` slices its row labels and loses the whole column-header row, both sizes. |
| `code` | no | A | Portrait truncates code mid-identifier inside a panel that is ~90% empty. |
| `logo-wall` | no | A | Square cuts a pill at the left page edge, with no engine warning of any kind. |
| `matrix-grid` | no | A | Square clips the leading letter of its axis label, silently. |
| `gantt` | no | A D | Elides three of five task labels while 28% (portrait) / 63% (square) of the page below the chart is empty. |
| `citation-card` | no | A | `pull-quote` drops the below-note at both sizes — flagged as clipped only at portrait. `split` renders as `default`. |
| `map`, `word-cloud`, `quadrant`, `radar`, `progress`, `timeline-list`, `funnel`, `piechart`, `image`, `scene` | no | D | No clipping; 30–85% of the canvas unused, because a figure composed for a landscape box is centered rather than grown. `quadrant` additionally renders 5 of 7 variants identically, `map` 3 of 6 — both unrelated to splitting. |
| `matrix-2x2` | no | B | At portrait the 2×2 collapses to a one-column stack of four cards, so the two-axis reading is gone. Square is correct. |
| `q-and-a` | yes | A | Otherwise the best-behaved split in the audit — the forward pill carries the next question's text, and `solo` is the one variant that scales its type up for the page it owns. But at square the `grid` variant keeps drawing its 2×2 cell rules: three empty cells on three pages, and on the fourth a rule runs **through** the answer text. |
| `authority-chain` | yes | C | 5 looks → 5 and no fit failure at square, but two citations clip at portrait (`pyramid`, `bracket`) and none of the ten runs emits a closing page. |
| `divider` | no | C | `numbered` silently suppresses the deck footer its own deck set — it renders on the deck's other three pages, so it is the variant, not the deck. |
| `regulatory-update` | yes | C D | Variants survive (5 → 5), but the scope kicker repeats on all 20 body pages, and at portrait `cards` overruns its card and cuts the forward pill at the page boundary with no clipped tag. |
| `compare-table`, `redline`, `big-number`, `quote`, `title`, `closing`, `diagram` | — | — | No blocking defect found. `compare-table` is the one read-across component that split on the right axis — it slices by criterion, so all three options stay on every page and the comparison survives. |

## Problems, by component

Severity: **A** = authored content is lost or unreadable · **B** = the component's
own meaning does not survive the cut · **C** = the shared envelope misbehaves ·
**D** = the page is technically correct and visually poor.

### A — content lost or unreadable

| Component | Size | What happens | Why |
|---|---|---|---|
| `inventory` | square | `editorial` pages 4.2–4.5: the repeated below-note is **drawn on top of the member text**, both illegible. No overflow ring. | The layout `claims` the blockquote (`coda.claims`), so the split leaves the beat inside every body page instead of hoisting it to a closing page; at square the two blocks land in the same box. |
| `statute-stack` | both | `lane` pages 5.2–5.4 render **the heading and nothing else** — every provision (label, citation, body, status) is gone; 5.4 is blank below the rule. | The `lane` variant's CSS places members by lane; a page holding one member has no lane to place it in, and nothing rings. |
| `split-panel` | both | `qr` run silently drops the authored URL bullet and its `caption` line — no QR, no link, no caption on any page. | `feature-cover` re-authors the page from parsed parts and has no slot for a payload bullet. |
| `math` | both | `math stats` **splits into four pages**, though `math` is placed `atomic`/never-splits. The cover prints raw LaTeX (`φ ( a , b ) \phi(a,b) φ ( a , b ) →`) and the forward pills read `w w w →` and `b t b _ t b t →`. | The split registry resolves a slide's component from its class list, so the `stats` *variant name* on a `math` slide matches the `stats` *component* and inherits its axis. Minimal repro in `decks/` — `math` alone = 1 page, `math stats` = 4. `split-facts.js`'s gate reads manifests, so it cannot see a class combination. |

Three collision pairs exist in the catalog today — `math stats`, `compare-prose
decision`, `radar quadrant`. Only `math stats` misfires, because the other two
base components are themselves enrolled and win the lookup.

### B — the component's meaning does not survive one-member-per-page

| Component | Why | Evidence |
|---|---|---|
| `kpi` | The slide says "$4.2M / 1.8% / 3.1x, read off one baseline". One metric per page turns three comparable figures into three unrelated captions, and the `AHEAD` / `ON PLAN` badges stop being a column. | 6 runs, 24 portrait pages; the number is set at the same size it had as one of three. |
| `stats` | Same, and worse: four different units (68%, 4.1x, −3d, $410K) cohere only under one baseline sentence. The engine's own tell is that it reprints that sentence on all five pages. | `stats` claims `trailing-paragraph`, so the methodology line rides every page. |
| `verdict-grid` | A matrix read **down** the criteria columns. One option per page leaves badges with no column to sit in; the engine bolts a criteria legend onto every page and then **clips it with an ellipsis on all three**. | Legend reads `Option 1 of 3 · comparing Finance can forecast it · Customer a…` on every body page, both sizes. |
| `compare-prose` | Read-across is the component. The cover prints `Side by side →` above a run that is not side by side. Worse, `chosen` and `rejected` — which say *which side won* — render identically after the split. | 9 declared looks → 8 distinct unsplit → **1** after the split. |
| `decision` | The heading states a verdict; the two options are its evidence. Split, the rejected option gets a full page with identical treatment to the chosen one, so that page alone argues the opposite. | 2 → 2 → **1**. `banner-tag` shows no banner tag. |
| `compare-code` | A before/after diff is unreadable serially. Both snippets are three and four lines and fit side by side with room to spare. The body pages also **drop the heading entirely**, so page 1.3 is an `After` with no *after what*, and there is no pointer from `Before`. | 1 authored slide → 3 pages. |
| `cards-grid`, `cards-stack` | Variants (`four`, `three`, `horizontal`) describe how members sit *together*. One per page has no arrangement, so they collapse — inherently, not by defect. | 4→3→1 and 3→2→1. |
| `agenda` | `progress-1` … `progress-6` mark which section is current. After the split every page of a `progress-N` run shows the same state: `progress-2`…`progress-6` are **mutually identical** (150 differing pixels out of 254k) where unsplit they differ by 3,900–7,500. The marker does not advance with the page. | 11→10→**7**. |
| `journey` | At portrait all four variants (`heatmap`, `curve`, `swimlane`, `weighted`) render as the same vertical stage stack — the heatmap page is **pixel-identical** to the default. At square journey does not split at all and all five looks are distinct. Part of this is the portrait form transform rather than the split; the split cannot restore what the transform already dropped. | 5→5→**1** at portrait; 5 distinct at square. |
| `roadmap` | At portrait `default`, `horizons`, `swimlane` and `milestones` produce the same four-page run. At square only `horizons` splits, and the split run is **worse than the four that don't** — a phase card collapsed to ~28% of the page width with everything ragging, beside an unsplit page that fits all three phases comfortably. | 5→5→**2** portrait; 20 portrait pages vs 8 at square. |

### C — the shared envelope misbehaves

| Problem | Where | Detail |
|---|---|---|
| **No closing page** | 29 of 31 enrolled components | Only `content` and `roadmap` emit one. The below-note / key insight the rule reserves a page for either never appears or rides every body page. |
| **The claimed beat rides every page** | `inventory`, `policy-recommendation`, `stats` | Eight enrolled components declare `coda.claims`. `roadmap` hoists its note to a closing page correctly; the plain paginate path does not, so the below-note prints once per member. `inventory` prints its insight 16 times across a portrait deck; `policy-recommendation` prints "THE ASK" 15 times, and it is the largest block on each page. (`journey`, `kanban`, `redline` and `split-panel` also claim a beat, but the corpus slides for them carry none, so this audit says nothing about those four.) |
| **No cover** | `journey`, `kanban`, `roadmap` | The native-slice strategies open straight on a body page. `kanban` additionally repeats the deck kicker (`PLATFORM · WEEK 24`) on all nine pages, which the rule says a split page must not carry. |
| **Closing page hierarchy inverted** | `roadmap` (all 6 closing pages) | The restated heading is set *smaller* than the note beneath it. |
| **Heading demoted below its own body** | `split-panel`, `compare-prose`, `compare-table`, `decision`, `list-tabular` | On body pages built by a re-authoring cover strategy the h2 renders as a hairline caption above a rule, smaller than the member title under it. `policy-recommendation` and `list-steps` keep it at display size, so this is a defect and not a house convention. |
| **`(cont.)` missing on the first body page** | every run, every component | Page `x.2` repeats the heading bare; `x.3` onward carry the mark. `list-tabular` and `split-panel` carry it on no page at all. |
| **Forward pointer degrades silently** | `checklist`, `list`, `agenda`, `policy-recommendation` | Past roughly 42 characters the pill stops naming the next member and says `continues →`. Measured: a 37- and a 38-character label name their target; a 44- and a 45-character one do not. |
| **Pointer names machinery** | `roadmap` | The last body page's pill reads `the note →`. |
| **Variant look erased by the re-authoring strategies** | `split-panel` (feature-cover), `list-tabular` (cover-rows), `compare-prose` (cover-sides), `decision` (cover-decision) | These four account for 30 of the 45 lost looks. The strategies rebuild the page from parsed parts, so the component's own class hooks — and with them every finish, accent and semantic marker — do not reach the page. `split-panel` is the extreme: **17 declared looks, 17 distinct unsplit, 2 after the split**, and the eight `cat-N` accents all render the same blue. |
| **A run can fail to split while its siblings do** | `split-panel` `pullquote` | 16 of 17 runs split; `pullquote` renders unsplit and overflows the page bottom at portrait, colliding with the page number. |

### D — technically correct, visually poor

Every split body page carries one member sized as if four more were beside it.
Reviewers measured 55–85% of the canvas empty on the body pages of `actors`,
`cards-grid`, `cards-stack`, `checklist`, `content`, `cycle`, `glossary`,
`kanban`, `kpi`, `list`, `list-criteria`, `list-tabular`, `premise`, `split-panel`
and `stats`. The one counter-example in the corpus is `q-and-a`'s `solo` variant,
which does scale its type up for the page it owns and is visibly the best body
page in the audit — proof the engine can do it and mostly does not.

### The components that never split — the other half of the picture

Not enrolling has its own cost, and at these sizes it is larger than expected. Of
the 30 non-enrolling components, these lose content with no split available to
save them:

| Component | Size | What happens |
|---|---|---|
| `pricing` | portrait | All three variants clipped. Only one of three tiers is visible; bullet text is cut mid-word (`Volume dis`, `$0.14 / recor`) while ~65% of the canvas is blank white. `pricing` was backed out of splitting on a conformance-gate technicality on 2026-09-01; this is what that costs. |
| `split-compare` | portrait | The `RECOMMENDATION` block — the slide's conclusion — is dropped; the page number prints inside the card. |
| `wifi` | portrait | The Wi-Fi password runs off the right edge and is unreadable. |
| `contact` | portrait | The QR code and its caption are dropped; the empty cell and its divider still draw. |
| `state-chart` | portrait | Three of four variants cut the terminal state `Expired` through its own box; transition labels render at 6.7px against a 13.5px floor on all four. |
| `video` | portrait | `qr` loses the first line of its heading off the top edge and its caption off the bottom, where it overprints the footer. |
| `obligation-matrix` | both | `asymmetric` slices its row labels (`FEDER`, `STATE`, `CONTR`) and loses the column-header row entirely. |
| `code` | portrait | Code truncated mid-identifier (`DEFAU`) inside a panel that is ~90% empty. |
| `logo-wall` | square | `dense` cuts the `Since 2023` pill at the left page edge — **with no engine warning of any kind**. |
| `matrix-grid` | square | The axis label renders `EEPER TUNING` — the leading `D` clipped at the canvas edge, silently. |
| `gantt` | both | Three of five task labels elide with an ellipsis while 28% (portrait) / 63% (square) of the page below the chart is empty. |

Two of those clips — `logo-wall.square` and `matrix-grid.square` — are invisible
to the overflow probe: it catches a box that exceeds its frame or clips
internally, not content that simply sits past the page edge.

## What the pattern actually is

Three different mechanisms produce the 45 lost looks, and they need different
answers:

1. **Arrangement variants (inherent).** `cards-grid four`, `cards-stack
   horizontal`, `compare-prose mirror`/`vertical`, `list-steps vertical`. These
   describe how members sit *together*. One member per page has no arrangement to
   express. Nothing is broken; the variant simply has no referent. ~11 looks.
2. **Finish and semantic variants (a real defect).** `split-panel`'s eight `cat-N`
   accents plus `metric`/`proof`/`capstone`/`watermark`, `list-tabular`'s record
   styles, `compare-prose`'s `chosen`/`rejected`, `decision`'s `banner-tag`,
   `agenda`'s progress state. None of these is about arrangement. They are lost
   because a re-authoring strategy discards the component's own class hooks, or
   because a stateful marker is not advanced per page. ~30 looks.
3. **Lost upstream of the split.** `journey` and `roadmap` at portrait: the
   chart-family transform picks one rendered form regardless of variant, and the
   splitter never sees the others. ~4 looks. Fixing the splitter cannot fix these.

## The recommendation

**Refine the shared envelope; do not make each component own its auto-split look.**

The evidence points that way rather than the other, and the reason is in which
components fail. The components that work — `policy-recommendation`,
`list-steps`, `kpi`, `authority-chain`, `regulatory-update`, `statute-stack` —
work because they go through the **plain paginate path**, which keeps the
component's own CSS on every page. They needed no per-component split code to get
there. The components that fail worst — `split-panel`, `list-tabular`,
`compare-prose`, `decision` — fail precisely because they already *do* own their
split look, through a bespoke `cover-*` strategy that rebuilds the page from
parsed parts and drops everything the component knew about itself. Sixty-one
bespoke split implementations would generalize the failure mode, not the success
one.

What the evidence does support, in the order it would pay off:

1. **Stop the content loss.** Four defects, each narrow: the `coda.claims`
   duplication (one rule, five components, and it is the same rule the native
   strategies already apply), `statute-stack lane`, `split-panel qr`, and the
   `math stats` class collision.
2. **Make the closing page real.** It fires on 2 of 31 components. Fixing the
   claims duplication is most of this — the beat is not missing, it is in the
   wrong place.
3. **Give the re-authoring strategies the component's own classes.** That is 30
   of the 45 lost looks in one change, and it is a property of four strategies,
   not sixty-one components.
4. **Scale the member for the page it owns.** One shared rule; `q-and-a solo`
   already shows what it looks like.
5. **Then, and only then, decide per component whether it should enrol at all.**
   The audit says `kpi`, `stats`, `verdict-grid`, `compare-prose`, `decision` and
   `compare-code` should probably not — for exactly the reason `progress` and
   `timeline-list` were declined on 2026-09-02: the comparison *is* the read. That
   is six enrolment decisions, not sixty-one implementations.

The one thing this audit does **not** settle is whether the size gate is right.
`roadmap.square` is the uncomfortable case: four variants that decline to split
render better than the one that splits, on the same content, on the same page.

## Caveats, stated rather than implied

- **The variant measurement compares each variant against the default.** It
  therefore misses variants that stay different from the default while becoming
  identical to *each other*. `agenda`'s `progress-2`…`progress-6` are exactly that
  case and were caught by hand; the all-pairs `looks.js` count (11→10→7) does see
  them, and it is the number quoted above.
- **Some variants were already inert on this content.** `list`'s `numbered`,
  `roman` and `lettered` show no marker at `hd` either, because the corpus authors
  that slide with `-` bullets. Re-run with an ordered list and the counters appear
  unsplit **and survive the split**. Twenty of the 116 variant slots are in this
  class and are counted as "already indistinct", not as split damage.
- **Emptiness is a reviewer estimate.** A stretched empty card fills the canvas
  with background, so a blank-row measurement cannot see it. The percentages in
  section D are eye estimates from whole-page review, not instrument readings.
- **One theme, one palette.** Everything is `indaco`, light mode. A palette-driven
  defect would not show here.
- **Repeated headings across variant slides** are an artifact of the audit's own
  shape: the same content is rendered once per variant, so `lint:deck`'s
  `duplicate-heading` suggestion fires. It is advisory and not a finding.
