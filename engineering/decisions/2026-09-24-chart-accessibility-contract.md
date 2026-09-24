---
status: shipped
summary: >
  An audit of all 22 charts against their three non-sighted readers — screen readers, Cadenza
  narration, and the Present Guide — measured on the real export and the real Guide. Four charts
  and one radar variant narrated only their heading; heatmap and line data were unreachable by a
  screen reader past a one-line summary; the Guide placed 65.5% of chart cues, most of them on
  nothing more specific than the slide. Fixed per chart, then pinned by one contract test over
  every gallery slide: every labeled mark reaches the accessibility tree, is spoken, and leads a
  sentence the pointer can land on.
companion:
  - ./2026-09-20-narration-audit.md
  - ./2026-09-21-generic-data-series-narration.md
  - ./2026-09-20-gesture-audit.md
---

# Every chart, three readers (2026-09-24)

**The symptom.** A reader asked whether our charts carry what screen readers, Vetrina and Cadenza
need. The honest answer, measured: some did, and nothing checked. `progress`, `kanban`,
`timeline-list` and `gantt` exported captions that said the heading and stopped — "Progress bars
race toward their targets." then silence over five bars. The radar `quadrant` variant did the
same. A heatmap's `<desc>` named each row's peak and nothing else, and a line's named its first,
last, peak and trough, so a screen-reader user could not reach most of the numbers. And the
Present Guide — Vetrina's pointer riding the captions — hid, or fell back to the slide heading, on
most chart sentences.

## How it was measured

- **Screen reader:** every chart gallery rendered through `lib/engine`, then the accessibility
  text of each `.chart-body` collected the way assistive tech reads it — the `<svg role="img">`
  name and description, plus text outside `aria-hidden` subtrees — and every `data-label` a mark
  carries checked against it. No real screen reader was driven: that surface is **UNVERIFIED**
  (HARD RULE #23). What is verified is the tree those readers consume.
- **Cadenza:** the real CLI, `lattice-emulator.js <gallery>.md --captions`, and the per-slide
  `.vtt` it wrote.
- **Guide:** `tools/sweep-guide-gestures.mjs`, which bundles the shipping `present-guide.ts`,
  renders each deck in Chromium, and asks it to place every real caption cue. This change adds
  `--deck` (measure named decks only) and `--misses` (print every cue that hid, and every one that
  fell back to the whole chart).

## Root causes

1. **The caption walker cannot read these charts, by construction.** `speakGeneric` collects
   `p, ul, ol, dl, blockquote, table, …`. Three flow charts render only `<div>`s; `gantt` renders
   an `<svg>`, which the walker skips on purpose. Their manifests said `figure: "flow"` — "the
   data is in the DOM and reachable" — which was true of the DOM and false of the walker.
2. **A mark's identity was missing or unmatchable.** The Guide's mark tier needs a `data-label`
   that LEADS the sentence and a `data-value` the sentence SAYS. Pie wedges, radar series, word
   cloud words, quadrant regions, gantt lanes and every category axis had no label. Where a label
   existed, the value check spelled it one way only (`toSpokenText`), while chart narration says a
   pill by its value (`spokenValue`): LATAM's `$0.6M` is "six hundred thousand dollars", so the
   right bar was rejected. A range value (slope's `31% to 24%`) was never a contiguous phrase in
   the sentence. A horizontal `<line>` measures zero pixels tall, so the dumbbell bar the matcher
   found was thrown away by the "has an area" guard.
3. **Descriptions summarized by design, with nothing behind them.** The heatmap's summary-only
   `<desc>` is a deliberate choice, and a right one — 120 numbers in one breath is the raw data,
   not the finding. But there was no second route to the numbers.

## What changed

- **Narrators** for `progress`, `timeline-list`, `kanban`, `gantt` and the radar `quadrant`
  variant (`lib/core/chart-narration.js`), each reading the tokens its transform reads, with a
  `projection.frame` sentence in each manifest. Status words are said in words from one table,
  `lib/core/chart-status.js`, which the transforms now import too (it moved down from
  `_chart-family/transform-utils.js`, as `chart-values.js` did).
- **Mark identities** on every mark a sentence is about, and on the group a group-sentence names
  (the shared category axis labels every cartesian chart's categories). A caller that shortens its
  axis labels passes the full names.
- **Guide** (`present-guide.ts`): values checked in all three spellings and ranges by both ends;
  pieces of one mark (a map group) resolve to the largest piece; a unique valueless group label
  answers for tied bars; three chart tiers after every existing one (a spoken detail note → its
  mark; chart words in a `div`/`text` → that element; a sentence about the whole chart → the
  chart); a zero-thickness mark measured at 4px; screen-reader-only text never a target.
- **Screen reader:** radar's `<desc>` carries every score, small multiples are titled and
  described, the quadrant cohort variant lists its items, gantt's `<desc>` names milestones,
  dependencies, window and today; heatmap and line append a hidden, walkable data table
  (`cartesian.buildSrDataTable`); list roles on the three flow charts; status words on roadmap
  `horizons` rows (shown before by color and CSS glyph only); "size" on kanban's chip.
- **Overflow probe:** `.chart-sr-only` joins `IGNORED_CLIP_SELECTOR` in `lib/core/overflow-probe.js`.
  The hidden table's wrapper clips its content by design; before this, every heatmap and line
  export reported "OVERFLOW … CLIPPED" (the integration tier's frame invariant caught it), which
  is also autosplit's signal. Export warnings for every chart gallery now match `main`.
- **Fallback:** `slideToSpeech`, which Present speaks until the rendered projection loads, reads
  a GFM table as rows instead of pipes and dashes.

## Result

| Guide, 22 chart galleries | Before | After |
|---|---|---|
| Cues | 1,592 | 1,818 (+226, mostly the four charts that now speak) |
| Pointer hid | 549 (34.5%) | 1 (0.1%) — an authored `[?]` on a prose slide |
| On a labeled mark or a declared part | 349 (21.9%) | 819 (45.0%) |
| On the whole chart | — (no such tier) | 194 (10.7%) |

The whole-chart answers are listed one by one by `--misses`. They are the frame sentences, axis
sentences, state-machine and word-cloud summaries, the gantt window — sentences about the whole
chart — plus seven that are honest ambiguities: a benchmark radar's comparison series (folded
into one band) and a line axis that repeats `Q1`. The rest of the placed cues land on the words
themselves: headings, prose, list items and table rows.

All 85 galleries were re-rendered and pixel-diffed against their goldens in both moods
(`node tools/regression-gate.mjs --scope galleries`). 81 are identical. Four drift —
`state-chart`, `authority-chain`, `legal`, `statement` — and all four drift by the same amount on
`main` with this change stashed, so none is this change's (logged in
`followups.d/2317-p2-preexisting-golden-drift.md`).

## The contract that keeps it

`test/unit/components/chart-a11y-contract.test.js` renders every chart gallery and asserts, per
labeled mark: it reaches the accessibility tree; Cadenza says it; and a sentence opens with it.
Charts whose reading is by design not one sentence per mark (a quadrant read a region at a time,
a heatmap a row at a time) sit in `NOT_PER_MARK` with the reason, and a row that stops matching
fails. It went red when the progress narrator was unregistered and when the heatmap table was
removed. The rules for a new chart are in `lib/components/chart/_chart-family/chart-family.docs.md`
§ Accessibility.

## Left open, on purpose

- A word cloud narrates a ranking — its leader by name, its tail as a range — so the middle words
  are in the `<desc>` but not the voice. That is `narrateWordCloud`'s design, not a gap this
  closes.
- A benchmark radar folds its comparison series into one band; a sentence about one of those
  series points at the whole chart.
- A line whose category axis repeats a label (Q1 … Q4, Q1) cannot make either Q1 a unique target;
  those cues point at the whole chart, honestly.
