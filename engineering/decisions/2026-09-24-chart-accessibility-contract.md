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
- **Guide, live:** the built Studio (`npm run build:e2e`, `astro preview`) with a seven-slide deck
  of each gallery's first `gantt`, `progress`, `kanban`, `radar`, `heatmap`, `line` and
  `piechart` slide, Present opened with Guide on and played on the silent rung. A screenshot 1.1s
  into each of the 69 cues: every sentence about one mark rested on that mark — each gantt bar,
  lane and the GA diamond, each progress row, each kanban column and card, each radar series
  polygon, each heatmap row label, each line category, each pie wedge — and every detail note
  ("92 decks, averaging 18 slides each.") on its parent's mark. None landed on the wrong mark. The first
  sentence after a slide change sometimes showed no pointer yet, because it was still arriving.
  That sentence is the eyebrow or the heading, which the block-text tier places ahead of every
  chart tier this change adds.

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

## Round two — what a listener heard

The owner listened to a 26-slide deck built from the galleries, with the Guide on. Every
complaint was right, and every one traced to one of two causes.

1. **One sentence, one breath, many numbers.** Radar, heatmap, journey and the weighted journey
   joined a whole row into one sentence with semicolons ("Mar 2026: M0, one hundred; M1,
   seventy-one; M2, fifty-nine; M3, fifty-five."). The caption segmenter makes one cue per
   sentence, so each row was one breathless run. This is the defect `narrateMachineShape` already
   fixed for state-chart. It had not been fixed anywhere else.
2. **The numbers without the verdict.** Slope said "2023, thirty-one percent; 2026, twenty-four
   percent" and never "fell". Quadrant said "at three, seventy" after stating two axis ranges
   several sentences back. Matrix-grid and roadmap `horizons` went through the generic walker,
   which read every placeholder cell ("Self: not applicable; Team: reachable; …") and then the
   key's words alone. A listener got the inputs to a judgment and had to make it from memory.

**What changed.** Each chart now says what its numbers do before it says them, one idea per
sentence, and every sentence still opens with the mark it is about:

| Chart | Now reads |
|---|---|
| radar | "Meridian is strongest on Performance and Security, at nine." Then the middle, grouped by score, and the weakest. Sectors: "People averages three." |
| heatmap | "Each row runs across M0, M1, M2, and M3." Then "Jan 2026 is highest at M0, one hundred, and lowest at M3, forty-four." |
| line | "Enterprise fell zero point six overall, from four point one to three point five." Then one sentence per point, "Q2 2025, four point four.", which the Guide places on that dot. A series past eight points says its start, high, low and end. |
| slope | "Northwind, marked failing, fell seven points, from thirty-one percent to twenty-four percent." The columns are said once. |
| dumbbell | "Each row runs from Plan, the hollow dot, to Actual, the solid dot." Then "Platform rose seven, from forty-eight to fifty-five." |
| quadrant | "Scoring model v2 is low on Effort and high on Reach: Effort three, Reach seventy." Unnamed axes read "high and to the left". |
| journey | The scale once ("from one, pain, to five, delight"), then "Evaluate, three steps." and "Read case study, by the prospect, scores five out of five." Ends on the low and high points. |
| roadmap `horizons` | "Horizon 1: Now." Then "Connector v1 has shipped, in Signal Intake." The generated "Phase 01" and the key are not read. |
| matrix-grid | The two axes, then bottom row up: "Junior sits at Remember and Self." and "Junior: Team is reachable." Then "The other cells are not applicable." |

The marks those sentences open with got names: line series and dots (a dot also carries its
value, which is what tells one quarter's three dots apart), journey stages and steps, horizon
heads and bets, and matrix-grid's filled cells, which both render paths stamp through
`lib/core/matrix-grid-cells.js`.

**GA.** Cadenza's built-in lexicon now expands `GA` to "general availability", exact-case. By the
lexicon's own rule an abbreviation stays always-on only when it is unambiguous in the house
domain (a SaaS/tech boardroom), and GA is — except as a map region code, which `map.docs.md`
sanctions: GA is Georgia on `map us` and Gabon on the world map. So the map narration spells a
code-only region ("G A", "U S A"), the lexicon never sees the token, and the Guide's mark tier
accepts a code label in its spelled form. Prose that means Georgia still declares
`acronyms: GA: Georgia`.

**What the independent checker found, and what changed.** Four real defects, all fixed:
quadrant said high or low against the authored threshold on every variant, but only `quadrant
threshold` draws it there (the others split at the center); a line point written with a text
pill before its value (`` `est` `8.2` ``) was dropped, because the narrator took the first pill
and the transform takes the last; the GA collision above; and a dot whose value was `4.0` also
"corroborated" the sentence "four point three", tying two dots so the Guide fell back to the
axis label — a spoken value now counts only when no "point" or magnitude word follows it. Two
smaller ones: matrix-grid now says every cell the chart draws (a second placed level, plain
text), and radar says every middle score, three to a sentence, instead of "between five and
nine on the other four axes". On `line stacked-area` no dots are drawn, so its per-point
sentences land on the category label, which is the honest target there.

**Measured.**

- Caption shape, the 26-slide deck, real `--captions` export, `tools/measure-cue-profile.mjs`:
  the 90th-percentile cue fell from 7.6 to 5.6 seconds and the longest from 9.9 to 8.9. Every
  flagged slide now tops out below 6.5 seconds.
- Guide, the eight changed galleries (`sweep-guide-gestures.mjs --deck … --misses`): 1,042 of
  1,043 cues placed. 57.7% land on a labeled mark. The one miss is on a `cards-stack` slide.
  "Placed" means some target answered, not that it was the right one; the live check below and
  the checker's per-cue replay against the export are what say the right one.
- Live Present, the built Studio, the ten flagged slides, 135 cues, a screenshot each: the pointer
  rang each line dot as its point was read, each quadrant item, each journey step, each horizon
  bet and head, and each matrix-grid level.

**Not changed, and why.** The longest cues left are `bullet` rows ("Partner-sourced ARR, nine
hundred thousand against a one point four million target — sixty-four percent of plan, closing
on plan", 8.9 seconds). Nobody flagged bullet, and its narrator went through four review rounds
of its own; splitting it is a separate change.

## Round three — the state chart the pointer lost

The owner said the state chart had got worse. The narration had not moved (word for word the
same as `main`), but the pointer had: on the state-chart gallery it hid on 77 of 144 cues with
this branch's Guide, and on 99 with `main`'s. The cause landed on `main` in #2355, which draws
each state as an SVG `<rect class="state-node-shape">` and sets the measuring `<li
class="state-node">` list to `display: none`. Every tier still found the `<li>` (it holds the
name, the `data-label` and the manifest handle), and a hidden element has no box to point at.

The fix is general and lives in `findCueTarget`: a target inside a `display: none` subtree hands
off to the first rendered element in the same chart with the same `data-mark`, which the
transform already stamps on both. State-chart gallery: 144 of 144 placed, 0 hidden. All 22
chart galleries: 2,203 of 2,204, the one miss unchanged (an authored `[?]` on a non-chart slide).

The same listen surfaced a narration defect older than this branch: after the transitions,
`narrateStateChart` read the state list again through the flatten ("Draft start. Submitted
on-track. In Review at-risk. … Published end."), repeating the machine with its tags as typed.
A state line now says only what no other sentence does: its status ("Submitted is on track."),
or that it is an end state ("Published is an end state." — nothing else opens with that state,
so this is also the pointer's only landing on it). A state with a note keeps its name before it.

## Heard, not estimated

Every pacing number above was the caption TIMING ESTIMATE; nobody had heard a voice. So the ten
flagged slides and the state chart were rendered to audio with the Studio's own on-device voice —
Kokoro-82M (`onnx-community/Kokoro-82M-v1.0-ONNX`, q8, CPU, via `kokoro-js` outside the repo),
voice `af_heart` — speaking each cue's Cadenza spoken form, joined by the player's breath
(`interCueGapMs × 0.3`). Measured on the audio itself:

- **Rate:** 119–161 words a minute; journey is the fastest.
- **Breath:** real silences of 120 ms and longer, 15–48 per slide; between sentences 0.8–0.97 s.
- **Longest sentence:** two narrator sentences ran long, and both are now split. A heatmap row
  took 7.4 s ("Jan two thousand twenty-six is highest at M0, one hundred, and lowest at M3,
  forty-four"). When every row shares its peak, as a retention grid's cohorts all start at one
  hundred, the peak is now said once, "Every row is highest at M0, at one hundred.", and each row
  says its low; otherwise a row's high and low are two sentences. Gantt's window took 8 s
  ("…to two thousand twenty-six fourth quarter, and today is third quarter"); it is now two
  sentences. After the fix every narrator sentence is 6.5 s or less; the longest cue left, 8.6 s,
  is the gantt slide's authored subtitle.

What the audio surfaced that is NOT changed here, because it is Cadenza's reading for every deck,
not a chart's: a year reads "two thousand twenty-six" (the literal reading `FY2026` pins in
`normalize.test.ts`), and a month abbreviation reads as written ("Jan"). Both are proposed to the
owner as separate decisions.

## Left open, on purpose

- A word cloud narrates a ranking — its leader by name, its tail as a range — so the middle words
  are in the `<desc>` but not the voice. That is `narrateWordCloud`'s design, not a gap this
  closes.
- A benchmark radar folds its comparison series into one band; a sentence about one of those
  series points at the whole chart.
- A line whose category axis repeats a label (Q1 … Q4, Q1) cannot make either Q1 a unique target;
  those cues point at the whole chart, honestly.
