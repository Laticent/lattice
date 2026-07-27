---
status: in-progress
summary: >
  A measured, slide-by-slide parity audit of examples/bloom-engineering-journey.md against the
  author's source bundle (bloomengineeringjourney.complete.zip — markdown + 987-line CSS +
  rendered PDF, 2026-06-14). Both decks are 960x540pt, so geometry is directly comparable. A raw
  pixel diff is 70-100% on every slide because the canvas color differs deck-wide, which tells us
  nothing; this catalog therefore diffs GEOMETRY (text bounding boxes from pdftotext -bbox-layout)
  and reads the source CSS for intent. Result: 6 deck-wide deltas and 27 per-slide deltas, each
  with the source CSS rule that defines it and the Lattice component/variant that would have to
  change. The dominant finding is that the source's level slides fill the right column top to
  bottom with fixed-height boxes (310px signal card, checkpoint cards stretching to the bottom
  margin) whereas ours are content-height and leave ~45% of the column empty — this was NOT fixed
  by the earlier "stretch/center the cards" change, which only equalized the two cards against
  each other.
---

# Bloom deck — parity delta catalog (measured)

**Purpose.** Answer precisely: *if you pixel-diffed our deck against the source,
what would be different — besides the palette?* This is a measurement document,
not an implementation. Nothing here has been changed yet.

## Method

- **Source of truth:** `bloomengineeringjourney.complete.zip` (CSS 2026-06-14
  22:03, 30 853 bytes / 987 lines). Note the file *named* `..._latest.zip` is
  **older** (2026-04-09, 18 925 bytes) — `complete.zip` is the real latest. The
  standalone `..._complete.pdf` is byte-identical to the PDF inside it
  (md5 `1bdf82d7…`), so there is one canonical reference render.
- **Both decks are `960 x 540 pt`.** Same geometry, so positions compare directly.
  All coordinates below are in **points**, origin top-left, as emitted by
  `pdftotext -bbox-layout`.
- **Type size is compared by measuring the width of an IDENTICAL string** in both
  renders — not by line-box height, which is inflated by leading and gives false
  readings. (An earlier pass mis-read leading as font size and wrongly concluded
  the whole deck was oversized. It is not — only the level slides are.)

## What a raw pixel diff actually reports

| Page | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| differing px | 100% | 100% | 97% | 71% | 71% | 71% | 71% | 73% | 90% | 96% | 100% | 94% | 100% |

Useless as a signal: the cream `#FAF7F2` canvas vs our white/dark canvas differs
at essentially every pixel, so the metric saturates. Every number below comes
from geometry instead.

---

## A. Deck-wide deltas (present on every slide)

| # | Delta | Source | Ours | Where parity lives |
|---|---|---|---|---|
| A1 | **Running header** | none | `LATTICE · BLOOM ENGINEERING JOURNEY` at y19–21, x20 | deck frontmatter `header:` — remove, or `_header: ''` per slide |
| A2 | **Footer caption** | none | `Level 1 · split-panel proof cat-1` etc. at y507, x20 | deck `_footer:` directives — these are our *demo* labels, not deck content |
| A3 | **Page number** | y509, x927 (right, tiny) | y507, x930 | matches closely; no action |
| A4 | **Canvas** | cream `#FAF7F2` | theme `--bg` | **excluded by request** — theme tokens are the accepted difference |
| A5 | **Fonts** | Playfair Display / Outfit / JetBrains Mono | theme font stack | theme-level; same category as A4 |
| A6 | **Top spectrum rule** | 4px `border-image` on most slides | present on ours | matches |

A1 and A2 alone push our ink bounding box to the slide corners on **11 of 13
slides** and are the single largest *non-color* source of pixel difference.
They are demo chrome, not the deck.

---

## B. Per-slide deltas

### Page 1 — Title
| # | Delta | Measured |
|---|---|---|
| B1 | Heading wraps to **2 lines** in source, **1 line** in ours | src `From Remembering to` / `Creating`, x199–762; ours one line x164–796 |
| B2 | Source caps the heading at `max-width:760px` (570pt) forcing the break | ours has no cap → 632pt single line |
| B3 | Eyebrow→heading gap | src 24pt (`margin-bottom:32px`); ours ~5pt |
| B4 | Subtitle width | src 360pt; ours 384pt (close) |

**Parity:** `anchor/title` needs a heading `max-width` ≈ 59cqi and a larger
eyebrow→heading gap. Cosmetic, low risk.

### Page 2 — Hook (quote)
**Closest slide in the deck.** Only deltas: A1/A2 chrome, and quote measure —
source `max-width:1080px` (810pt, rendered 778pt) vs ours 696pt (0.89x). Two
lines in both, attribution gap matches (src 33pt / ours 34pt).

**Parity:** widen `quote.bare` measure ~12%. Very low risk.

### Page 3 — Premise
| # | Delta | Measured |
|---|---|---|
| B5 | **Vertical relationship inverted.** Source heading starts *above* the rows (h2 y108, rows y181). Ours: rows start *above* the heading (rows y139, h2 y152) | 73pt vs −13pt |
| B6 | Heading slightly smaller in ours | `Growth is a change in` src 287pt / ours 250pt (0.87x) |
| B7 | Row internals match well | verb 74/72pt, question 77/77pt, desc 145/137pt — all ≈1.0x |

**Parity:** `statement/premise` — align the left column's top with the row stack
(source uses `padding-top:140px` + `align-content:center`). Row anatomy is
already faithful.

### Pages 4–8 — Level slides (`split-panel proof`) — **the big one**
| # | Delta | Measured |
|---|---|---|
| **B8** | **Right-column boxes don't fill the column.** Source: signal card is a **fixed 310px (232pt) tall** box with vertically centered text; checkpoint cards span `top:356px → bottom:28px` (**252pt tall**) and stretch to the bottom margin. Ours: signal ≈95pt, cards ≈75pt, both hugging content — **~45% of the right column is empty below y270** | see `rc-stack.png` |
| B9 | Left panel too wide | src 400px = **300pt** (31.25%); ours **365pt** (38%) |
| B10 | Right column starts too far right | src x361; ours x456 (**+95pt**) |
| B11 | Heading oversized | `Execute with` src 163pt / ours 282pt (**1.73x**) |
| B12 | Body oversized | `You recall syntax, patterns, and` src 209pt / ours 289pt (**1.38x**) |
| B13 | Signal text oversized | src h20 / ours h29 (~1.45x) |
| **B14** | **Element order in the left panel differs.** Source: eyebrow → *italic question* → heading → description (the question is inside `h3` at `top:172px`, heading `h2` at `top:244px`). Ours: eyebrow → heading → question → description | src question y152 (above h2 y183); ours question y374 (below h2 y241) |
| B15 | Checkpoint label content | src is CSS-generated `Checkpoint I` / `Checkpoint II` (identical on all 6 slides); ours is the authored point title (`FOLLOWS EXAMPLES WELL`) |
| B16 | Checkpoint body composition | src puts the point title *inline in the sentence* ("Follows examples well. Compiles, runs…"); ours splits title into the label slot |
| B17 | Eyebrow text | src `REMEMBERING` only; ours `LEVEL 1 · REMEMBERING` |

**B8 is the delta the author has flagged twice.** The earlier
"stretch/center the cards" fix made the two cards equal *to each other* but
never made them fill the column — the empty band below them is unchanged.

**Parity:** `split-panel.proof` needs (a) `.panel-right` to distribute its three
regions over the full column height — signal card a fixed proportional height with
centered content, checkpoint grid `flex:1` stretching to the bottom padding;
(b) `--panel-left` width ≈31% under `.proof`; (c) a `proof`-scoped type ramp at
~0.6x `--fs-h1` for the heading and ~0.72x for the lede; (d) the question moved
above the heading — which is a **kernel change** in
`lib/core/split-panels.js` (`applyPanel` currently emits `eyebrow + h2 + introP`);
(e) B15/B16 are a content-model choice — source's generic "Checkpoint I/II" vs our
authored titles. **(d) and (e) are the two that need your call**, since they change
`proof`'s contract for every existing consumer, not just this deck.

### Page 9 — Capstone (level 6)
| # | Delta | Measured |
|---|---|---|
| B18 | Panel width **matches** here | src 484px=363pt; ours ~365pt; right col src x435 / ours x437 |
| B19 | Proof pillars sit too high | src y419–470 (anchored near bottom, `bottom:84px`); ours y299–355 → **~145pt empty below** |
| B20 | Lead paragraph starts too high | src y87 (`top:112px`); ours y37 (**−50pt**) |
| B21 | Closing question **undersized** | `What should exist?` src 223pt (40px font) / ours 168pt (**0.75x**) |
| B22 | Heading oversized | `Build what` src 192pt (56px) / ours 237pt (**1.23x**) |

**Parity:** same fill-the-column fix as B8, plus a capstone type ramp (heading
down ~20%, closing question up ~33%).

### Page 10 — Axis explainer (`compare-prose axis`)
| # | Delta | Measured |
|---|---|---|
| B23 | **Heading centered in source, left-aligned in ours** | src x258–702 (centered on 480); ours x48–457 (masthead, left) |
| B24 | Lede measure far too wide | src 530pt centered (`max-width:720px`); ours 844pt |
| B25 | Card pair too wide | src 615pt total (`max-width:820px`); ours 862pt |
| B26 | Closing note | src 2 lines centered, no glyph; ours 1 line + a `✦` glyph we add |
| B27 | Numerals match | `I` src 17pt / ours 16pt |

**Parity:** `compare-prose.axis` needs a centered masthead (`headline:` register
→ center), a lede `max-width` ≈55cqi, a card-pair `max-width` ≈64cqi, and the
annotation glyph suppressed.

### Page 11 — Matrix (`matrix-grid`)
| # | Delta | Measured |
|---|---|---|
| **B28** | **Filled cells are solid pills with white text in source; pale tints with dark text in ours** | src `td:not(:empty){background:var(--lN);color:#fff}` |
| B29 | Heading undersized | src 500pt (1.9em); ours 343pt (**0.69x**) |
| B30 | Corner header | src hides it (`thead th:first-child{font-size:0}`); ours renders **`VERB`** |
| B31 | Row labels | src **right-aligned** (all end x157); ours **left-aligned** (all start x145) |
| B32 | `WIDER REACH` centering | src centered over the **4 data columns** (x393, `left:41%`); ours centered on the whole table (x480) |
| B33 | Arrow glyph | src `→`; ours `▶` |
| B34 | Legend | src **centered**, two swatch items, with a **separate centered italic caption line** below; ours left-aligned, merged into one line at x124–848 |
| B35 | Table proportions | src cells 142x44px, compact, left of center; ours notably wider |

**Parity:** `chart/matrix-grid` — filled-cell treatment is the headline (B28);
plus hide the corner cell, right-align row labels, re-anchor the column-axis
label to the data columns, and split the legend from the caption. B28 conflicts
with our contrast rule (we chose pre-blended tints because raw `--chart-cat-N-hue`
has no text-contrast guarantee) — **this one needs your call**: match the source's
solid pills using `--cat-N-mark` + `--cat-on-mark`, or keep our accessible tints.

### Page 12 — Practice (`list-steps capsule cat`)
| # | Delta | Measured |
|---|---|---|
| B36 | **Heading centered in source, left-aligned top in ours** | src x315–645 (centered, y144); ours x48–352 (y68) |
| B37 | **Source centers heading + cards as ONE group**; ours pins heading top and leaves a large empty bottom band | src block y144–365 (centered); ours heading y68, cards y236–355 |
| B38 | Cards too wide | src 765pt (`max-width:1020px`); ours 847pt |
| B39 | **We draw `▸` connectors between cards; source has none** | `list-steps ol>li:not(:last-child)::after` |
| B40 | Badge→title gap | src 32pt; ours 19pt |

**Parity:** `list-steps.capsule` needs centered masthead, the whole group
vertically centered, a `max-width` cap, and connectors suppressed under `capsule`.

### Page 13 — Close
| # | Delta | Measured |
|---|---|---|
| B41 | Heading wraps to **2 lines** in ours, 1 in source | src `Grow on two axes, not one.` 422pt; ours breaks after `not` |
| B42 | Heading oversized | ~**1.28x** (per-character width) |
| B43 | Body measure too narrow → 5 lines vs 4 | src 465pt (`max-width:620px`); ours 360pt |

**Parity:** `anchor/closing` — reduce heading ~20% (or raise its `max-width` to
≈56cqi) and widen the body measure to ≈48cqi.

---

## C. Summary — where the work actually is

Ranked by visual impact:

1. **B8 / B19 — the right column doesn't fill the slide** (pages 4–9, six slides).
   The single most visible structural break. Source designs the right column as a
   full-height stack; ours is a content-height stack with dead space.
2. **B28 — matrix filled cells** (pale tint vs solid pill). Changes the whole
   read of the deck's centerpiece slide.
3. **B23 / B36 — centered vs left-aligned mastheads** on the axis and practice
   slides (two slides, but total layout re-read).
4. **B11/B12/B22/B29/B42 — type ramp errors**, all component-local, none deck-wide.
   Level headings run 1.73x too large; matrix heading 0.69x too small; capstone
   question 0.75x too small.
5. **B14 — question above vs below the heading** on the level slides (kernel).
6. **A1/A2 — our demo header/footer chrome**, trivially removable.
7. Everything else is measure/gap tuning.

## C2. What shipped from this catalog (2026-07-27, same day)

The brief was "parity without jank, sustainability in mind — variants may look
distinct, but the AUTHORING must be idiomatic." Everything below uses a
mechanism Lattice already had; no new tokens, no kernel change, no multipliers.

**Fixed**
- **B8 / B19 — the evidence column now fills.** `flex:1 1 0` + `min-height:0` on
  both the signal card and the proof-card grid. Proportional, so it holds at any
  slide size or `--fs-scale` — a fixed pixel height would not.
- **B9 — `.proof` claim panel 38% → 31%**, the variant-scoped width lever
  `.metric`/`.steps`/`.pullquote` already use.
- **B11 / B12 / B21 — type by ROLE-TOKEN SWAP**, never a multiplier (HARD RULE #4):
  level heading `--fs-h1`→`--fs-h2` (0.58x, needed 0.58 — exact), lede
  `--fs-message`→`--fs-body`, capstone question `--fs-message`→`--fs-h2`
  (1.33x, needed 1.33 — exact).
- **B23 / B36 / B37 — centered mastheads** on `axis` and `capsule` via the
  `headline:` seam, the mechanism `list-steps.timeline` already used.
- **B24 / B25 / B38 / B1 / B41 / B43 — measures** in `cqi`.
- **B30 / B31 — matrix corner blanked, row labels right-aligned.**
- **B39 — `capsule` drops the connector arrows.**
- **A1 — running header removed.**

**Authoring jank removed (the part that mattered most)**
- **The capstone's "second paragraph falls through to the right column" trick is
  gone.** It depended on `extractFirstP` lifting only the FIRST paragraph — an
  invisible, position-dependent rule no author could infer. All six level slides
  now use the **identical** authoring shape (eyebrow / `##` claim / one lede whose
  leading `*em*` is the question / `### signal` + paragraph / two checkpoint
  bullets). `.capstone` differs in CHROME ONLY. The cost is one accepted
  structural difference — source puts a lead paragraph in the capstone's right
  column, we keep it in the left with the rest of the lede — taken deliberately:
  a teachable authoring contract beats one paragraph's placement.

**Deliberately NOT changed (this is Lattice being Lattice)**
- `▶` over source's `→` — the triangle fixes a real bug (`writing-mode:vertical-rl`
  rotates arrow glyphs an extra 90°; geometric shapes are immune).
- The `✦` annotation glyph — Lattice's universal trailing-italic treatment.
- Matrix heading size — source sits at ~4.16cqi, no role token lands there, and
  inflating one chart's masthead above every other chart's breaks deck consistency.
- Capstone heading — source 4.375cqi falls between `--fs-h2` and `--fs-h1` with
  nothing closer; `--fs-h1` at 14% over is the honest answer.
- Per-slide footer component labels — this is the demo deck (HARD RULE #9) and the
  labels are what make it self-documenting.

**Measured after:** no overflow on any of the 13 slides. One overflow was
introduced and fixed during the pass — porting source's 56cqi lede measure onto
`axis` verbatim ran the lede to five lines and the centered stage clipped at BOTH
ends. The lesson is recorded in the CSS: **source measures cannot be copied as
numbers**, because our body tier is 1.67cqi where the reference set 1.33cqi. A
measure has to be set for the tier that will actually occupy it.

## C3. Two findings the geometry pass could not have caught

Both surfaced only by measuring the rendered slide, and both are general Lattice
lessons rather than deck-specific fixes.

### C3.1 — `cqi` silently changes axis inside `writing-mode: vertical-*`

`matrix-grid`'s two axis labels declare the SAME token (`var(--fs-meta)`) and
rendered at **6.2px vs 13.5px**. `--fs-*` tokens are `cqi`-based, and Chromium
resolves `cqi` against the axis that is inline *for the element's own writing
mode*. Under `vertical-rl` that is the container's **block** axis (528px on a
16:9 slide) instead of its inline axis (1152px) — a 46% silent shrink.

Fixed without touching the token: declare the size on the (horizontal) figure and
let the rotated `::before` inherit an already-computed length. **Any `cqi`-based
size inside a rotated box has this bug**; it is invisible in review because the
CSS looks correct.

### C3.2 — the token audit cannot see what a component invents

`tools/contrast-audit.js` was green — 704 pairs, 32 themes — while the rendered
deck carried **44 sub-AA text runs, several at 2.54:1**. No contradiction: that
tool checks each theme's own token matrix, i.e. the pairs a palette DECLARES. It
has no way to see `--text-secondary` placed on a `--cat-N-fill`, or `--cat-N-mark`
used as a card label — pairings that exist only once a component renders.

Root cause of every failure was the same misread: **`--cat-N-mark` is a stroke
token**, guaranteed 3:1 against the BACKGROUND. `--cat-on-fill` is the ink
guaranteed 4.5:1 against any fill. Using a mark as small type borrows a guarantee
it never carried. Two legitimate resolutions, both used here:
- swap to the ink the contract guarantees (`--cat-on-fill`), accepting that a fill
  has exactly ONE guaranteed ink, so hierarchy must come from size/weight/case/face;
- or keep the mark and meet the bar it DOES carry — `premise`'s verb names went to
  weight 700, which puts them over WCAG's large-text threshold (>=18.66px + >=700)
  where 3:1 is the requirement.

`tools/check-slide-contrast.js` now exists to make this repeatable. The remaining
sub-4.5 runs are the footer caption and page number — the muted-chrome tier the
palette contract explicitly exempts.

## D. What needs a decision rather than an edit

- **B14** — moving the italic question above the heading changes
  `lib/core/split-panels.js`'s panel assembly for *every* `split-panel` consumer.
- **B15/B16** — generic `Checkpoint I/II` labels vs our authored point titles is a
  content-model fork, not styling.
- **B28** — solid categorical pills (source) vs contrast-guaranteed tints (ours);
  we adopted tints deliberately, so reverting is a real tradeoff.
- **B39** — the `▸` connector is `list-steps`'s signature; suppressing it under
  `capsule` changes an existing variant's identity.
