---
status: proposed
summary: Phase 2 of the content-capacity contract — make per-element word budgets and universal-structure (eyebrow, title, key-insight, pill) word budgets a structured manifest fact, expert-seeded and evidence-clamped, so the LLM author picks brevity by contract rather than by luck.
---

# Prose-density budget — give the LLM a word budget, not just an element count

> **Amendment (2026-08-25).** The two WHOLE-SLIDE numbers this note set —
> `SLIDE_PROSE_BUDGET` (70 words / 6 bullets) and the 14-word title ceiling — are
> no longer universal. Measured across the 198 scorable committed decks they fit every
> professional genre in the corpus *except* teaching (median slide 78 words, above
> every other family's 90th percentile) and, on the heading axis, mission (17% over
> 14 words). They now live in `lib/authoring/deck-profiles.js` as per-genre budgets
> set from that distribution. **The per-element `density` contract and the universal
> CHROME table this note is actually about are unchanged** — an eyebrow must read as
> an eyebrow in every genre. See
> `2026-08-25-deck-profiles-craft-style-split.md`.

**Status:** proposed 2026-06-30. This is **phase 2 of the content-capacity
contract** (`2026-06-17-content-capacity-contract.md` §3.3, which named it and
deferred it). Phase 1 (shipped) answers *"how many things fit"* — element COUNT
per axis. This answers the question phase 1 left open: *"how many WORDS does each
thing get."* The manifest schema (`lib/components/manifest.schema.json`) owns the
field shape; `lib/authoring/prose-budgets.js` owns the universal table;
`lib/authoring/review-core.js` owns the enforcement; `design/editorial.md` owns
the prose philosophy this encodes.

---

## 1. The problem

The model writes decks that are too wordy. It picks a layout, then pours
three-sentence card bodies, ten-word eyebrows, and paragraph-length "key insight"
panels into slots designed for a label and a short clause. The slides lose
brevity and overflow. This is not a layout-choice failure — phase 1 already
steers *that* — it is a **per-element prose failure**: the right layout, the
right number of elements, but each element carrying far too many words.

The information needed to prevent it **already exists, but only as prose** —
exactly the situation phase 1 found with element counts before it promoted them
to a contract. Examples already in the manifests today:

- `actors` antiPattern: *"More than one sentence per row crowds the ledger."*
- `base.docs.md` on the metadata pill: *"keep pill text to one word (hyphenated
  is fine) or two words at most."*
- `editorial.md` / `overflow.docs.md`: *"content slides past ~40 words become
  walls of text the audience stops reading anyway."*

This is **density as prose, not as contract** — skimmable, unstructured,
unenforced, and free to drift. The model reads the structured `capacity` block
while choosing but gets no structured word budget, so it has nothing to aim at.
The fix is the same move phase 1 made for counts: **promote the word budget to a
structured, machine-readable, advisory fact** the author reads while writing and
the reviewer checks after.

There are two distinct kinds of budgeted text, and they need two homes:

1. **Per-element body prose** — the words inside each card / row / step. This is
   component-specific (a `kpi` label tolerates fewer words than a `cards-grid`
   body) and rides the same axis rail `capacity` already uses.
2. **Universal chrome** — eyebrow, slide title, subtitle, key-insight, below-note,
   annotation, pill. These are **auto-detected markdown patterns**
   (`base.docs.md`), not component slots; they appear on *any* slide. They want
   ONE global table, not a per-manifest repeat.

## 2. The key insight — brevity is a *target*, not a *fit ceiling*

This is the crux, and it determines how we set every number. (It is also the
answer to "do we sample from visual evidence?" — see §4.)

A word budget's job is **editorial brevity**, not overflow prevention. Those are
two different jobs with two different owners:

- *Will it physically overflow the box?* — **The Fit Spine already owns this**
  (`2026-06-22-the-fit-spine.md`): collapse → shed → split, and it **refuses to
  shrink type**. Breakage is handled at render time, after the fact.
- *Is it a good slide?* — **Nothing owns this yet.** A slide packed with words
  right up to the line where it breaks is already a wall of text the audience
  stopped reading. This is what the budget is for, and it sits **well below** the
  overflow ceiling on purpose.

So if we set budgets by **sampling where overflow starts**, we get the wrong
number — *too generous*. The fit ceiling tells you where the slide *breaks*, not
where it *reads well*. The presentation canon is unanimous that the good-slide
target is far under the break point: Reynolds (*Presentation Zen* — slides are
not documents), Duarte (*slide:ology* — glance media, ~the "three-second rule"),
Minto/Knaflic (one idea, stated; cut to the assertion). Our own `editorial.md`
already says the same at ~40 words/slide.

The model therefore is: **the budget is the expert brevity target; visual
evidence supplies only the ceiling that target must never exceed.** Two numbers
per budgeted role, mirroring `capacity`'s soft/hard:

- **`soft`** = the editorial target (expert-seeded). Surfaced to the LLM as the
  number to aim at; a suggestion fires past it ("reads best with ≤N words").
- **`hard`** = the editorial MAXIMUM — past it the element reads as a wall of
  text, and a stronger suggestion fires. It is **not** the physical overflow
  point (the Fit Spine owns that, far higher); §4 clamps it to stay safely *under*
  the measured geometric ceiling, so the suggestion never claims a break that
  won't happen. `soft ≤ hard` always; the soft→hard gap is the editorial
  "reads well" → "reads heavy" band.

  > **Honesty note (red-team correction, 2026-06-30).** An earlier draft worded
  > the `hard` suggestion as *"it will overflow"* and called `hard` the "ceiling."
  > That was false: at a landscape `@size` the geometric break is 40–54+ words
  > while `hard` is ~16–32, so the slide does *not* physically overflow at `hard`.
  > The message now reads *"reads as a wall of text"* — an editorial claim, which
  > is true — not a physical-overflow claim, which wasn't. The budget guides
  > brevity; the Fit Spine, not this number, governs actual overflow.

## 3. Decision

### 3.1 A `density` block in the manifest (per-element prose)

Sibling to `capacity`, keyed to the same axis the layout is built on. It budgets
the **words per element** along that axis:

```jsonc
"density": {
  "axis": "item",          // defaults to capacity.axis; the collection whose ELEMENTS carry prose
  "soft": 14,              // words per element — the editorial target (surfaced to the agent)
  "hard": 22,              // words per element — editorial max (reads heavy); clamped under the geometric break
  "note": "one short clause per row, not a sentence"   // human consequence (reused in docs + message)
}
```

- **One axis per component** (like `capacity`) — the dominant per-element prose
  channel. A `cards-grid` budgets its `item` bodies; a `compare-table` its `row`
  cells. Per-*slot* granularity (title vs. body separately within an element) is
  a deliberate non-goal for v1 (§6); the universal table already covers the slide
  title, and the per-element total is what actually overflows.
- **Counted** the same two ways phase 1 established (§3.4 of the capacity doc):
  live-approximate from markdown (each top-level element's word count) and
  render-exact as the authority. The live counter is what ships in the pilot.
- **`note`** is the one-line consequence, reused verbatim in the generated docs
  line and the reviewer message — so the contract and the prose can't disagree.

### 3.2 A universal prose-budget table (the chrome)

The auto-detected structures are not slots, so they live once in a pure module,
`lib/authoring/prose-budgets.js`, and apply on every slide:

```js
const UNIVERSAL_PROSE_BUDGETS = {
  title:      { soft: 10, hard: 14, note: 'the takeaway lands in one tight line' },
  eyebrow:    { soft: 5,  hard: 8,  note: 'a label, not a sentence' },
  subtitle:   { soft: 12, hard: 18, note: 'one line of framing' },
  keyInsight: { soft: 18, hard: 28, note: 'one sentence the room remembers' },
  belowNote:  { soft: 16, hard: 24, note: 'a footnote, not a paragraph' },
  annotation: { soft: 12, hard: 18, note: 'a margin aside, kept short' },
  pill:       { soft: 2,  hard: 3,  note: 'one word, two at most' },
};
```

These numbers **reconcile with what review-core already enforces** rather than
duplicate it (HARD RULE 15): the existing `long-heading` rule (fires past 14
words) becomes `title.hard`; the existing `wall-of-text` rule (past 70 words /
6 bullets) stays as the whole-slide backstop and now reads its constant from a
named `SLIDE` entry in the same module. One source of truth for every brevity
number.

### 3.3 Three consumers, one declaration (same shape as phase 1)

1. **Agent-facing — the model reads the budget WHILE writing.** Each layout's
   budget rides into the LLM authoring primer as a `Budget: ≤ N items, ≤ ~M words
   each` line (`docs/src/playground/architect-knowledge.js` `layoutBlock`), and the
   universal chrome limits ride in `AUTHORING_RULES` — so the generation/rewrite
   prompt itself carries the budget, addressing the cause, not just the symptom.
   It is also in `dist/docs/components.json` + `AGENTS.md` for catalog readers.
   *(See §9 — this was the load-bearing claim the red-team found inert as first
   shipped; it is now wired.)*
2. **Enforcement (suggest), everywhere an author works.** A reviewer rule counts
   each element's / structure's words and emits a **`suggestion`** past
   `soft`/`hard`, in `review-core.js` (presentation *traps* — renders fine,
   communicates poorly), **not** `lint-core.js` (footguns — renders wrong; §3.5).
   It surfaces in BOTH the browser Drawing Board panel AND the CLI
   (`tools/lint-deck.js` runs it, advisory, off under `--all`).
3. **Anti-drift, gated.** The `note` and numbers source the generated docs
   "Density" line; and `checkDensityCoverage` (`tools/check-ownership.js`, via
   `build:check`) fails if any text-bearing layout lacks a budget or an exempt
   allowlist entry — so coverage can't silently rot (§9).

### 3.4 The generated docs line

Mirroring the `**Capacity**` line, `build-component-docs.js` emits, when a
`density` block is present:

```markdown
**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one short clause per row, not a sentence.
```

### 3.5 Enforcement home + posture — `review-core`, advisory (locked)

Density warnings go in **`review-core.js` as `suggestion`s**, deliberately *not*
in `lint-core.js`, for three reasons:

1. **Conceptual fit.** Verbosity renders perfectly; it just communicates poorly.
   That is the exact definition of a review-core "presentation trap" vs. a
   lint-core "footgun." `review-core` was built for precisely this and already
   carries the sibling heuristics (`wall-of-text`, `long-heading`) from the same
   canon.
2. **The lint-clean coupling.** A unit gate asserts every committed deck is
   lint-clean with **no warnings** (`lint-deck.test.js`). The six long-running
   galleries and every `stressSample` *intentionally* push prose past its
   comfortable limit. A density **warning** in lint-core would criminalize those
   legitimate stress-tests and demand a bypass hatch. A density **suggestion** in
   review-core does not gate commits, so the stress samples stay free — the
   capacity contract hit this exact wall (its §3.5) and we honor the lesson.
3. **Never blocking.** Advisory only, like all of phase 1. The structured field
   fixes the decision up front; the suggestion catches the slips; the runtime
   overflow watcher remains the render-time ground truth.

## 4. Calibration — expert-seeded, evidence-clamped (the sampling decision)

The numbers are set in two passes, and the order matters:

1. **Seed `soft` from the canon + existing prose.** The editorial targets come
   from presentation best practice and the ranges already written into each
   manifest's prose (`actors`: "one sentence per row"; the pill: "one or two
   words"). This is fast, principled, and gives full coverage immediately. It is
   the *primary* source.
2. **Clamp `hard` from visual evidence.** `tools/calibrate-density.js` renders a
   component at increasing words-per-element via the emulator, reads the existing
   overflow-probe (`lib/core/overflow-probe.js` — the same `scrollHeight >
   clientHeight` oracle phase 1's deferred calibrator was specified to use), and
   reports the first word count that overflows. `hard` is set just **below** that
   measured break point. This is the one job sampling is genuinely needed for: a
   `soft` target is an opinion, but a `hard` ceiling that *exceeds what physically
   fits* would be a lie, and only rendering can tell us the real per-family
   geometry (a `tall`/`strip` box holds far fewer words than a `wide` one).

So: **we do NOT sample to derive the budget** — that yields the too-generous
overflow point. **We sample to clamp the ceiling and capture per-shape geometry**,
then keep the probe wired as an ongoing drift check so a CSS/theme change that
shrinks real capacity gets flagged against the stated `hard`. Evidence keeps the
expert target honest; it does not replace it.

## 5. Staged plan (this branch — pilot, then backfill)

| # | Step | Status |
|---|---|---|
| 1 | **Decision doc** (this file) | ✅ this commit |
| 2 | **Schema** — `density` block in `manifest.schema.json` + `validate()` (`item`/`row` axes, `soft ≤ hard`, measurability; axis NOT tied to focusAxes — see refinement below) | ✅ #629 |
| 3 | **Universal table** — `lib/authoring/prose-budgets.js` (pure, browser-safe) + detectors; reconcile `long-heading`/`wall-of-text` to it | ✅ #629 |
| 4 | **Seed pilot manifests** with `density`, `hard` evidence-clamped (`actors`, `cards-grid`, `list-steps` + the first backfill wave) | ✅ #629 |
| 5 | **Reviewer rules** — per-element + universal `suggestion`s in `review-core.js` | ✅ #629 |
| 6 | **Surfacing** — emit `density` into `components.json`; "Density" docs line; `AGENTS.md` "budget the words" note | ✅ #629 |
| 7 | **Calibration tool** — `tools/calibrate-density.js` (render at increasing words, read overflow-probe) | ✅ #629 |
| 8 | **Demo deck** — `examples/prose-density.md` (+ committed PDF) | ✅ #629 |
| 9 | **Docs + changelog** — `design/design-system.md` density note; `CHANGELOG.md` | ✅ #629 |
| 10 | **Backfill** — every remaining text-bearing layout, density-clamped | ✅ complete — **26 of 53** layouts budgeted; the other 27 are exempt (§6) |

**Refinement (backfill).** `density.axis` is NOT tied to `focusAxes` (unlike
`capacity`). `focusAxes` governs `_focus` HIGHLIGHTING — a ledger may highlight as
table rows — while `density` counts the MARKDOWN the author writes, where that
same ledger is a bullet list (the `item` axis). `glossary` is the canonical case
(`focusAxes: ['row']`, authored as items). The validator's only axis guard is
measurability in the sample. Per HARD RULE 17 the backfill landed in place.

## 6. Non-goals / what this does NOT commit to

- **Not per-slot density in v1** — one axis (the per-element body) per component;
  the universal table covers the slide title. Per-slot (title vs. body *within*
  an element) is a future refinement, noted not built.
- **Not blocking CI** — advisory suggestions only; galleries / `stressSample`
  stay free to push limits (the whole reason enforcement lives in review-core).
- **Not a new renderer or measurement engine** — calibration reuses the emulator
  + `overflow-probe`; counting reuses `wordCount`/`proseWordCount` already in
  `review-core`.
- **Not auto-rewriting prose** — the suggestion names the budget and the
  consequence; the author (or agent) tightens the words.
- **Not deriving budgets from overflow sampling** — §2/§4: sampling sets the
  ceiling, expertise sets the target.
- **Not budgeting non-prose or single-block layouts** — a `density` block only
  fits a layout whose elements are PROSE BODIES along a countable axis. The 27
  exempt layouts fall in clear groups: **data viz** (the 11 remaining `chart`
  layouts — content is series/graph, not words), **code** (`code`/`compare-code` —
  budgeted by `line` count), **figural** (`diagram`, `math`, `image`, `logo-wall`,
  `word-cloud`), **anchors** (`title`/`divider`/`closing` — covered by the
  universal title/eyebrow/subtitle budgets), **data grids** (`obligation-matrix`,
  `pricing` — `[x]` cells / feature checklists, not prose; word-counting them
  mis-fires), **verbatim** (`citation-card` — a quoted statute is intentionally
  long; trimming it would falsify), and **single-block prose** (`quote`,
  `big-number`, `content`, `redline` — one block, already governed by the universal
  key-insight/title budgets and the whole-slide `wall-of-text` rule). The boundary
  test: *can the author tighten this element's words without losing required
  content?* Where the answer is no (a statute, a checkmark, a data series), there
  is no budget.

## 9. Red-team corrections (2026-06-30)

After the backfill, a Munger-inversion red team ("how would we *guarantee* this
fails?") with two independent checker agents found the feature, as first shipped,
was **inert and partly dishonest**. The corrections, all folded back:

- **Inert in production — the budget reached no consumer.** The catalog the
  Drawing Board serializes (`drawing-board.astro` `obCatalog`) never carried
  `density`/`capacity`, and the LLM primer (`architect-knowledge.js` `layoutBlock`)
  never read them. So the budget reached **neither** the generation prompt **nor**
  the review panel's `densityOf` (which is built from that same catalog) — it fired
  nowhere. (An earlier "verification" passed only because it hand-built `densityOf`
  from `components.json`, not the production path.) **Fix:** `obCatalog` now carries
  both budgets; `layoutBlock` emits the `Budget:` line; `AUTHORING_RULES` carries the
  universal chrome limits.
- **CLI/agent authors never saw it.** `tools/lint-deck.js` ran only `lint-core`.
  **Fix:** it now also runs `review-core` (advisory, never affects exit; off under
  `--all`), so the documented author loop surfaces density.
- **The `hard` message was false.** It said *"it will overflow"* and called `hard`
  the "ceiling," but `hard` sits editorially *below* the geometric break (40–54+
  words at landscape). **Fix:** the message, the generated docs line, the schema,
  and this doc now say *"reads as a wall of text"* — an editorial claim that is
  true — and frame `hard` as the editorial max clamped under the real ceiling. The
  Fit Spine, not this number, governs physical overflow (§2).
- **The numbers could rot; new layouts weren't forced to budget.** No gate. **Fix:**
  `checkDensityCoverage` (§3.3.3) enforces budget-or-exempt and fails on a stale
  exempt entry.
- **Known limitations (accepted, not fixed).** Word count is a noisy proxy for
  physical wrap (long words wrap sooner) — acceptable because the budget is now
  framed as *editorial brevity*, not overflow prediction, and an LLM can act on a
  word target but not a character-width one. The markdown-stage counter is
  approximate (inline-code-only bodies read as 0; deep nesting folds into one
  element) — the render-exact `countAxis` remains the staged authority.

## 7. Relationships

- **Phase 2 of** `2026-06-17-content-capacity-contract.md` (this realizes its
  deferred `perItem` density sub-block, generalized to `density` + the universal
  table).
- **Encodes** `design/editorial.md` brevity philosophy and the presentation canon
  already cited in `review-core.js`'s header.
- **Complements** the Fit Spine (`2026-06-22-the-fit-spine.md`) — the Spine
  prevents *breakage* at render; this prevents *verbosity* at authoring, well
  before the Spine is ever reached.

## 8. Gates

Schema validator + reviewer-rule unit coverage; `prose-budgets.js` unit tests;
the reconciled `long-heading`/`wall-of-text` rules still green; `npm run lint`
(exit 0), full unit suite, `build:check` (artifacts fresh — `components.json` +
generated docs lines regenerated), and the integration tier all green; the "every
committed deck lint-clean" gate green (confirms density lives in review-core, not
lint — §3.5); maker-checker (inspection + assessment) folded in before commit.
