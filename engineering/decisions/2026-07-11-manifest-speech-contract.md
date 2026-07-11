---
status: proposed
summary: Design record for making TTS/read-along captions sound natural by teaching narration the slide's semantics. A five-lens review (linguist + phonetician personas, red-team + Munger-inversion + independent-checker trio) reframed the ask — a `speech` field on all 56 manifests — into a phased plan whose highest-value first slice touches ZERO manifests. Records the invariants, the reuse map, the killed ideas, and the open forks awaiting a scope decision.
companion:
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-08-read-along-export-manifest.md
  - ./2026-07-03-semantic-html-accessibility.md
---

# A manifest-declared `speech` contract for natural TTS captions — design record (2026-07-11)

> **Symptom.** Read-aloud / read-along narration sounds robotic: a KPI tile authored `1. $2.4B` /
> `- Total revenue` is spoken *"two point four billion dollars. Total revenue."* — value before its
> label, a full stop wedged between the two, and tokens like `+9%`, `4.2×`, `−18d`, `§1798.140` read
> as raw glyphs or mis-parsed. **Root cause:** the manifest already names every slide's semantic parts
> (via `slots`, `adapt.priority`), but narration never reads that knowledge — it flattens Markdown in
> document order and appends a period to every line. **Decision (this doc):** don't jump to "a `speech`
> block on 56 manifests." A five-lens review found most of the felt win is a component-blind fix in one
> file, and that a per-component contract is a real but *later, smaller* phase gated behind two
> prerequisites. This is the design record and the phased plan; the forks at the end await a scope call.

This doc records a design; it ships no code. It is the deliverable of the design request
("adding a caption entry to each component manifest … I need a red team on this, inversion and
independent checker … personas of linguist and phonics experts").

## 1. What exists today (verified, not assumed)

**Two narration tiers, live path only:**
- `slideToSpeech(markdown)` (`docs/src/components/studio/read-aloud.ts:41-74`) — the generic fallback.
  Flattens a slide's Markdown in document order, strips markup, and appends a period to every
  *structural* line (heading / list item / blockquote) so Kokoro takes a breath. The robotic baseline.
  Note it **already strips the `1.` ordered marker** (`:70`) — so the live path does *not* literally
  say "one"; the residual robot is **value-before-label order + a full stop between the parts**, not a
  spoken ordinal. (All five reviewers independently corrected the framing example on this point.)
- `chart-narration.ts` — 5 hand-written narrators (funnel, journey-weighted, radar, quadrant,
  state-chart). Each re-derives its transform's parse off raw Markdown and phrases a *computed* fact
  ("…twenty-two percent of the prior stage") the flatten can't reach. Proven, heavily hardened
  (`2026-07-09-cadenza-narration-quality.md` §10/§11), but bespoke JS per component. The other 8 buckets
  get nothing but the flatten.

**Cadenza** (`docs/src/lib/cadenza/`) — the shared caption engine: `buildTrack(text)` → word-timed
track; `normalize.ts` display→spoken (`numberToWords`, `toSpoken`, a fixed ~20-entry `ABBREV` table);
`cadence.ts` a punctuation→pause table. **It is a real workspace package** consumed both as root CJS
(`require('@slidewright/cadenza')`, `read-along-build.js:39`) and docs ESM (`@/lib/cadenza`).

**Two divergent narration *producers*** (the load-bearing surprise — the straw-man's "one producer,
three consumers" is false today):
- **Live Studio "Present":** `narrationFor = getNote(md) || narrateChart(md) || slideToSpeech(md)`
  (`PresentOverlay.tsx:26`), applied to **raw Markdown** — never rendered HTML.
- **Export / `.vtt` / `readAlong`:** narrates **authored speaker NOTES only**
  (`lattice-emulator.js:2536`, `share-export.ts:562-565` → `buildReadAlong(notes, …)`), and writes
  nothing when a slide has no note. `slideToSpeech`/`narrateChart` never run at export. So a funnel
  slide with no note exports an *empty* read-along while Studio speaks its conversion rate.

**The audio constraint (decisive):** Kokoro-82M has **no SSML** (`2026-07-09…md §8`). The only levers
on the real voice are the spoken *string*, its punctuation density, and playback speed. `cadence.ts`'s
pause table moves only the caption *highlight* estimate, never the audio. So all naturalness must be
baked into the string, and any claim about audio pacing/"naturalness" is **UNVERIFIABLE in this
sandbox** (no TTS here) — HARD RULE #23. We may claim what the spoken *string* is; not how it sounds.

## 2. The five-lens review — convergent findings

Linguist + phonetician (design personas) and red-team + Munger-inversion + independent-checker
(the HARD RULE #25 adversarial trio) each verified against the real sources. Convergence:

1. **The reported robot is mostly a `normalize.ts` lexicon gap, not a manifest-field problem** (red
   team F5, phonetician §1, linguist P5). `4.2×`, `−18d` (U+2212, not ASCII `-`), `+9%` (leading sign
   breaks the percent regex), `+2pp`, `bps`, `§1798.140`, `·`, `→` all pass through raw or mis-parsed
   by `spokenCore` (`normalize.ts:99-127`). Fixing them to "four point two **times**", "**down**
   eighteen days", "**up** nine percent", "**section** seventeen-forty" is **component-blind, one file,
   zero manifest edits** — and it fixes the user's exact example.
2. **A declarative role-plan cannot express the 5 hardened narrators** (red team F3). They exist for
   *arithmetic not in the Markdown* (`round(next/prev*100)`, `niceCeil(max)`, two-pass state
   inference) — none is a role order or connective. So the "escape hatch to JS" is *all five*, and what
   a declarative layer would cover is exactly the simple label/value reordering `slideToSpeech` + the
   §3.1 punctuation fix already handle adequately — the design `2026-07-09…md §3.2` **deliberately
   deferred** as "speculative genericity for a pattern proven once."
3. **The order/treatment genuinely differs per component, and only the slot knows** (linguist §2, all).
   The same `1.` is a drop-me tile ordinal in kpi/stats but a speak-me "First…" step ordinal in
   list-steps — one regex cannot serve both, and today's blunt strip is wrong for steps. The mirror in
   legal: `§1798.140` must be a *digit-grouped reference string*, the **opposite** of the kpi rule that
   a number is a *quantity*. Same glyphs, inverse treatment. **This is the real case for a
   per-component contract** — sharper than the straw-man's version.
4. **The inline-code two-kinds distinction is NOT derivable from the slot selector** (red team F4,
   phonetician §4). A status pill `` `On plan` `` (speak) and a coordinate `` `5, 60` `` (suppress) and
   a transition `` `submit => 2` `` (translate) are the same `li>code` selector; the disambiguation
   lives in per-transform token grammars the manifest doesn't encode. And the *same* role ("the metric
   number") is a bare `ol` lead in kpi but a backtick pill in funnel — token kind isn't stable per role.
5. **The two producers must be unified before the "read article" export can narrate parity** (Munger,
   red team F2, checker §1). Today the export is notes-only; a `speech` field would improve Present and
   do nothing for the reader-mode export.

## 3. What the review KILLED

- **Axis A — "the transform emits the spoken form once, both SVG and speech consume it."** Dead
  (red team F1, checker §1). Studio has only raw Markdown at narration time; the export producer is
  CJS consuming text, not HTML. There is **no channel** from a transform's computed number to either
  narrator — and the manifest `transform` DSL that would carry it is marked *"PROTOTYPE: not yet wired
  into the render pipeline"* (`manifest.schema.json:471`), so it isn't a shipping precedent to copy.
  **Consequence:** narration reads Markdown. A computed fact reaches speech only if the transform
  authors it back into Markdown, or the author typed it.
- **"A `speech` block on all 56 manifests" as the *starting point*.** It re-opens the §10/§11 drift
  class ×56 (a third/fourth copy of each transform's grammar, in JSON, un-unit-testable across the
  wall), and front-loads the deferred design while the actual token-reading pain stays unfixed.
- **A universal prosody rule** ("front the topic, stress the number"). Correct for kpi, wrong for
  big-number/stats (number-lead) and legal (reference-string). Order is component-semantic.

## 4. What the review DISCOVERED (reuse — HARD RULE #15)

- **The "read article" reader-mode already exists and is already sanitized** (checker §5):
  `player-core.mjs buildArticle()` → `prose-projection.mjs projectDeckToProse()`, fed by
  DOMPurify-sanitized DOM (`caps.sanitize = sanitizeSlideHtml`, `share-export.ts:335`). HARD RULE #22
  is satisfied on that path. The user's export ambition is a substrate to reuse, not build.
- **`prose-projection.mjs` is already component-aware** (checker §3): kpi/stats → `<dl>` value→label,
  tables re-hosted, quotes → blockquote+cite, chrome skipped via `SKIP_SELECTOR`. A
  **`projectDeckToSpeech(sections)` sibling** is the natural single home for HTML-side narration, and
  the seam that lets *one* component-aware parse feed both the article and the captions.
- **Cadenza crosses the CJS/ESM wall cleanly** (checker §2). A shared speech kernel placed *in Cadenza*
  is importable both ways — unlike `niceCeil`/`splitSentences`, which are hand-copied only because they
  live in *unpackaged* `lib/**` modules. This removes the wall that caused the §10/§11 drift bugs —
  *if* shared logic lives in Cadenza.
- **`adapt.priority`/`droppable`/`keepTogether` is already a per-component role model** (checker §3):
  kpi declares `priority:[title,kpis]`, `droppable:[status-pills]`, `keepTogether:[value+label]` —
  spoken order + shed-as-chrome + the number/label pairing, already authored. Reuse it; don't invent an
  order model.
- **The anti-rot gate has a precedent** (checker §4, Munger #4): the density `domSelector` render-time
  coverage test (`manifest.schema.json:583-587`, `2026-07-10-overflow-cause-highlighting.md §10`).

## 5. Load-bearing invariants (any version of this MUST hold)

From the Munger inversion (§"3–5 load-bearing invariants") and red team, these are non-negotiable:

1. **Never say less than `slideToSpeech`.** Any semantic narrator returns the set of source lines it
   consumed; a shared wrapper flattens everything unconsumed through the generic path and appends it
   (`speakLeftover`, `chart-narration.ts:201-213`). Enforced by the framework, not per-narrator
   discipline — three narrators forgot it independently (§10).
2. **Zero re-derivation of computed facts.** A spoken computed number comes from the transform that
   renders it, or it isn't spoken. No arithmetic on slide data in the speech layer or the manifest.
   Gate it in `check-ownership.js` (the rule that would have caught the hand-copied `niceCeil`).
3. **Reordering only within one authored unit.** A plan may reorder an `li` and its nested children
   (the AST parent-child the transform already established), never across siblings — else value binds
   to the wrong label.
4. **One narration source before one semantic layer.** Unify Present and export on the same producer
   *before* adding a manifest contract, or the block silently no-ops for the export consumer.
5. **Prove one component end-to-end, verified, before the second.** Audio marked UNVERIFIED; the spoken
   *string* (unit-tested) and the caption *text* in the real overlay (Playwright) are the only claims.
6. **Any HTML speech consumer routes through the shared sanitizer** and, if a CLI export builder is
   added, extends the HARD RULE #22 allowlist (red team F9 — a `lib/core` HTML export is outside the
   current `docs/src`-scoped gate).

## 6. Recommended design — phased, smallest-win-first

**Phase 0 — latent-bug fixes (ship independently of everything below; HARD RULE #18).**
Real defects found while tracing, unrelated to the redesign:
- Unicode minus `−` (U+2212) silently dropped by `normalize.ts` (`:79,124` accept only ASCII `-`) —
  *a decline is spoken as flat/positive.* Highest severity: it inverts meaning.
- A numeric range `1,200-1,500` read "twelve hundred **minus** fifteen hundred."
- A statute `§1798.140` read as a quantity "one thousand seven hundred ninety-eight point one-forty."
- `v.` over-splits a sentence in `segment.ts` ("DPC v. Meta" → two cues).

**Phase 1 — the component-blind normalizer + the generic-path connective (most of the felt win, ~0
manifest edits).** In Cadenza `normalize.ts`: a units/deltas/symbols layer (`×`→"times", `pp`→
"percentage points", `bps`→"basis points", `Nd`→"days", signed `+/−`→"up/down", `§`→"section",
`·`→light break) and a **layered, data-not-code pronunciation lexicon** (engine default ← domain pack
`legal`/`finance` ← deck override), validated like `transform` (closed `mode` set, no JS). In
`slideToSpeech`: make the terminator rule **role-aware** — a nested `- Title`/`  - body` pair joins
with `:`; sibling bullets join `,`/`; ` with a period only on the last; headings keep `.`. This turns
a 3-bullet list from 3 sentences (3 prosody resets) into one breath group, and fixes value-before-label
where the slot is value-lead — without any manifest change.

**Phase 2 — unify the two producers.** Add `projectDeckToSpeech(sections)` beside `projectDeckToProse`
in `prose-projection.mjs`; derive the export's `slideTexts[i]` from it (component prose, sanitized),
not notes-only. Now Present and the "read article" export narrate the same component-aware source.

**Phase 3 — a *minimal* per-component `speech` hint, one bucket at a time, only where Phase 1 falls
short.** A small, closed-vocabulary block (§7) reusing the `adapt` role model — NOT a general NLG DSL.
Migrate kpi first, end-to-end through both producers, gated (§4 render-time coverage +
`specimenVoice`-style "heard-and-approved" attestation). The 5 existing narrators stay JS behind the
`NARRATORS` registry; they are the reference, not candidates for declarative rewrite.

## 7. The `speech` vocabulary (Phase 3 — closed, data-only)

From the linguist's model — small enough for a `validateTransform`-style gate, expressive enough for
every before→after in §8. Named `speech` (not `caption`; `caption` is taken by `stressDoc.caption` /
`variantDocs.caption`).

- **Role tags (6):** `frame` (title) · `given` (topic label) · `new` (focus value) · `aside`
  (pill/subtitle/gloss) · `machine` (structural token — suppress/translate) · `chrome` (never spoken).
- **Order primitive (1):** `lead` — an ordered list of roles, e.g. kpi `["given","new"]`,
  stats/big-number `["new","given"]`.
- **Connectives (closed, keyed, 7):** `bind`→`:` · `apposition`→∅ · `tag`→` — ` · `coordinate`→`,` ·
  `record`→`;` · `terminal`→`.` · `target`→the one sanctioned lexical connective "against a target of"
  (adding a lexical key needs a schema entry + justification).
- **List ops (3):** `serial` (A, B, and C — reuse `joinWithAnd`) · `records` · `steps` (ordinal-led).
- **Number modes (3):** `quantity` (Cadenza expansion) · `reference` (digit-grouped, e.g. legal cite) ·
  `ordinal` (step index → "first").
- **Per-token escapes (2, data):** `say` (inline misaki-IPA / literal override — the one markup Kokoro
  accepts) · `drop` (suppress a routing-only pill).

**Selecting a connective must depend on the authored structure present** (a target bullet exists →
"against a target of"; absent → omit) — never emitted unconditionally by role (Munger #3, dangling
"against a target of.").

## 8. Per-semantic-part taxonomy & before→after

| Part | Manifest anchor | Rule | Before (today) → After |
|---|---|---|---|
| title `h2` | `slots.title` | spoken first, `.` | (unchanged; already good) |
| eyebrow `p>code` | `slots.eyebrow` | first, soft; `·`→light break | "Financial · Q4 2026" (·raw) → "Financial, Q four twenty twenty-six." |
| card header/body `- T`/`  - b` | HARD RULE #5 | "T: b" (colon) | "Title. body." → "Title: body." |
| kpi tile (value-lead `ol>li`) | `slots.kpis` | `lead:[given,new]`, `bind` | "…dollars. Total revenue." → "Total revenue: two point four billion dollars." |
| stats tile | `slots.tiles` | `lead:[new,given]`, apposition | "…times. signal recall." → "Four point two times signal recall." |
| big-number | `slots.number` | number-lead | (number is the theme) → "Four point two billion dollars — up from three point one billion." |
| ordered STEP | list-steps `slots.steps` | `steps` (speak ordinal) | "Assess risk." → "First, assess risk." |
| table | `slots.table` | header-bound row-major | "Row Holds Budget dash dash dash…" (chrome leak!) → "Row A label — Holds: one cell per column; Budget: twelve words." |
| legal citation `§…` | citation-card `slots.citation` | `reference` number | "one thousand seven hundred ninety-eight point one-forty" → "section seventeen ninety-eight point one-forty, subsection o." |
| state transition `=>` | (transform token) | `machine` translate | "submit equals greater than two" → "on submit, go to state two." |
| status pills, page nums, masthead | chrome | `chrome` never spoken | (varies) → silent |

## 9. Verification honesty

Everything about **audio prosody / pacing / "sounds natural" is UNVERIFIED** — no Kokoro/OpenRouter TTS
runs in this sandbox (HARD RULE #23; consistent with `2026-07-09…md §5/§8`). Even "a colon pauses
better than a period" is a documented community folk-technique, **not** spec — the design must not
encode it as proven. Verifiable and therefore the only claims a future PR may make: the display→spoken
**string** (unit tests over `normalize`/plans) and the caption **text** in the real Present overlay
(Playwright). Every "natural" claim is marked UNVERIFIED until heard on a real voice by a human.

## 10. Decisions recorded (2026-07-11 review)

The three scope forks were put to the owner after the five-lens review. Answers:

1. **First slice → DESIGN ONLY for now.** This doc is the deliverable; no code ships this round.
   Phases 0–3 remain the recommended build order *when* implementation is authorized — Phase 0
   (latent-meaning bug fixes) and Phase 1 (component-blind normalizer + role-aware generic connective)
   first, since they bank the user's exact motivating example with the least risk and ~0 manifest churn.
2. **Producer unification (Phase 2) → YES, unify.** When build begins, add `projectDeckToSpeech(sections)`
   beside `projectDeckToProse` so the export / "read article" path narrates the same sanitized,
   component-aware source as live Present — not speaker-notes-only. This is the prerequisite for the
   read-article ambition and is the owner's chosen direction.
3. **Manifest-contract ambition (Phase 3) → PENDING; pros/cons requested.** Recorded below; no option
   locked. Recommendation stands at **A (minimal role-hint)**.

### Phase 3 pros/cons (the per-component hint)

Two facts hold for all three options and don't discriminate: the 5 chart narrators stay JS regardless
(they speak *computed* facts no declarative layer expresses), and the Phase 1 generic-path fix happens
regardless. The real question is where the *non-inferable* per-component phrasing lives.

| | **A. Minimal role-hint** (reuse `adapt`) | **B. Fuller `speech` DSL** (§7) | **C. No manifest field** |
|---|---|---|---|
| Shape | `lead` order + `number-mode` + `machine`/`chrome` flags, on the existing `adapt` role model | full closed vocabulary: 6 roles + ordering + 7 connectives + list ops + number modes + per-token escapes | narrators stay JS behind the registry; normalizer + generic connective carry the rest |
| Pros | smallest new surface → least rot ×56; reuses an authored model (#15); captures exactly the non-inferable facts; trivial closed-enum gate; per-bucket migration | most expressive; one consistent contract; per-token `say`/`drop` handles the inline-code two-kinds case where it's expressible | zero new schema / migration / rot; cheapest; a new computed-fact component just adds a JS narrator |
| Cons | truly bespoke phrasing (legal gloss, table header-binding) still needs JS walkers; risk of earning little over Phase 1 if too thin | largest surface → the §3.2 "speculative genericity" the war-diary deferred + the inversion's rot fear; more sample-fit-not-deck-fit failure modes; baked-English connectives are monolingual to unwind; still doesn't remove JS for computed facts / bespoke walkers | the non-inferable cases (legal `§` = reference vs metric = quantity — indistinguishable selectors) get smeared into per-component JS instead of data; scales to ~20 JS narrators if many buckets need bespoke phrasing |

**Decisive discriminator (A vs C):** a legal citation (`p:first-of-type > code`) and an eyebrow
(`p > code`) are structurally near-identical, so the generic path cannot infer "read this number as a
digit-grouped reference, not a quantity." That bit must be declared *somewhere*: C forces it into JS
(logic-as-code); A declares it as one gated field (`number-mode: reference`); B declares it too but
inside a much larger contract carried across 56 files. **Recommendation: A** — captures the
non-inferable facts with the least surface to rot, leaving computed facts and the two genuinely bespoke
buckets (table, legal gloss) in JS. Decision deferred to the owner; not locked.
