---
status: proposed
summary: Design record for making TTS/read-along captions sound natural by teaching narration the slide's semantics. A five-lens review (linguist + phonetician personas, red-team + Munger-inversion + independent-checker trio) reframed the ask — a `speech` field on all 56 manifests. A SECOND adversarial trio, run against this doc itself, then found load-bearing errors in the synthesis (see §11) and corrected the recommendation: the verifiable win is a component-blind normalizer lexicon fix; the natural value→label reorder lives on the DOM projection path keyed on `data-class` (no manifest field); a per-component `speech` field is NOT recommended. A first-pass census of all 56 manifests (§12) then found the design rested on a partial sample — it refuted a shipped claim (mixed reference/quantity components DO exist), re-scoped Phase 1 to need a legal/finance domain lexicon, and surfaced a per-item hard edge no option fixes; the recommendation is the current best read, provisional until a full authoring-semantics census is complete.
companion:
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-08-read-along-export-manifest.md
  - ./2026-07-03-semantic-html-accessibility.md
---

# A manifest-declared `speech` contract for natural TTS captions — design record (2026-07-11)

> **Symptom.** Read-aloud / read-along narration sounds robotic: a KPI tile authored `1. $2.4B` /
> `- Total revenue` is spoken *"two point four billion dollars. Total revenue."* — value before its
> label, a full stop wedged between the two, and tokens like `+9%`, `4.2×`, `−18d`, `§1798.140(o)`
> reaching the voice as raw glyphs. **Root cause:** the manifest already names every slide's semantic
> parts (via `slots`, `adapt`), but narration never reads that knowledge — it flattens Markdown in
> document order. **Decision (this doc):** don't jump to "a `speech` block on 56 manifests." Two rounds
> of adversarial review (five lenses on the design, then a second trio on THIS doc — §11) converged on a
> smaller, verified plan: fix the token lexicon component-blind (the one deterministically-verifiable
> win), do the natural value→label reorder on the DOM projection path where component identity already
> lives (`data-class`), and add NO manifest field until a real case demands it. This is the design
> record and the corrected plan; the forks at the end await a scope call.

This doc records a design; it ships no code. It is the deliverable of the design request
("adding a caption entry to each component manifest … I need a red team on this, inversion and
independent checker … personas of linguist and phonics experts") — and of the follow-up request to
red-team, invert, and independently check **this doc itself** (§11).

## 1. What exists today (verified against source)

**Two narration tiers, live path only:**
- `slideToSpeech(markdown)` (`docs/src/components/studio/read-aloud.ts:41-74`) — the generic fallback.
  Flattens a slide's Markdown in document order (after `raw.trim()` at `:46`, which discards
  indentation), strips markup, and appends a period to every structural line (`:59`) so Kokoro takes a
  breath — a **deliberate** anti-run-on choice, documented at `:56-58`. It already strips the `1.`
  ordered marker (`:70`), so the live path does not say "one"; the residual robot is **value-before-label
  order + a full stop between the parts**.
- `chart-narration.ts` — 5 hand-written narrators (funnel `:266`, journey-weighted `:341`, radar,
  quadrant, state-chart), each re-deriving its transform's parse off raw Markdown (`:5-12`) and phrasing
  a *computed* fact. Proven, heavily hardened (`2026-07-09-cadenza-narration-quality.md` §10/§11). The
  other 8 buckets get only the flatten.

**Cadenza** (`docs/src/lib/cadenza/`) — the shared caption engine. `normalize.ts` does display→spoken
(`numberToWords` `:70`, `toSpoken` `:87`, a fixed **16-entry** `ABBREV` `:27-32`); `cadence.ts` a
punctuation→pause table that moves only the caption *highlight* estimate, never the audio. It is a real
dual CJS/ESM package (`@slidewright/cadenza`) consumed by root CJS (`read-along-build.js:39`) and docs
ESM (`read-aloud.ts:2`).

**Two divergent narration producers** (verified — the straw-man's "one producer, three consumers" is
false):
- **Live Studio "Present":** `narrationFor = getNote(md) || narrateChart(md) || slideToSpeech(md)`
  (`PresentOverlay.tsx:26`), on **raw Markdown** — never rendered HTML.
- **Export / `.vtt` / `readAlong`:** narrates authored speaker **NOTES only**
  (`share-export.ts:562-565`, `lattice-emulator.js:2536-2539` → `buildReadAlong(notes, …)`), and writes
  nothing when a slide has no note (`read-along-build.js:55` skips empty entries).

**The audio constraint:** Kokoro-82M has **no SSML** (`2026-07-09…md §8`). The only levers on the real
voice are the spoken *string*, punctuation density, and speed. So naturalness must be baked into the
string, and any claim about audio pacing / "sounds natural" is **UNVERIFIABLE in this sandbox** (no TTS
here) — HARD RULE #23. We may claim what the spoken *string* is; never how it sounds.

## 2. The five-lens review — convergent findings (corrected in §11)

Linguist + phonetician personas and a red-team + Munger-inversion + independent-checker trio verified
against source. Convergence, as later corrected by the second pass (§11):

1. **The deterministically-fixable win is a component-blind `normalize.ts` lexicon gap.** `spokenCore`'s
   matchers (`normalize.ts:99-127`) are all whole-token anchored (`^…$`), so any token carrying a stray
   glyph matches nothing and is returned **unchanged** (`:127`): `4.2×`, `+9%` (leading sign fails the
   percent branch), `−18d` (U+2212, not ASCII `-`), `·`, `§`, `pp`, `bps` all reach the voice as raw
   glyphs. Mapping them to words ("times", "up nine percent", "down eighteen days", "section") is
   component-blind, one file, and **unit-testable on the string** (no audio dependency). This is the
   honest first win. **It fixes tokens, not order** (corrected in §11 — the original draft overstated it
   as also fixing the value/label order).
2. **The order/treatment genuinely differs per component, and it is NOT inferable from the generic
   markdown flatten.** The same `1.` is a drop-me tile ordinal in kpi/stats but a speak-me "First…" step
   ordinal in list-steps; a legal `§` number is a reference string, a kpi number is a quantity. Which
   applies depends on **component identity** — available on the rendered DOM (`data-class`), not to the
   markdown-only `slideToSpeech`.
3. **The inline-code two-kinds distinction is not derivable from a slot selector** (a status pill
   `` `On plan` `` = speak; a coordinate `` `5, 60` `` = suppress; a transition `` `submit => 2` `` =
   translate are all `li>code`); the disambiguation lives in per-transform token grammars.
4. **The two producers must be unified before the "read article" export narrates parity** — today the
   export is notes-only.

## 3. What the review killed (Axis A — narrowed in §11)

- **"The transform emits the spoken form once, both SVG and speech consume it."** Two parts, and only
  the first survives as an absolute:
  - **The manifest `transform` DSL is an unwired prototype** — *"PROTOTYPE: not yet wired into the render
    pipeline"* (`manifest.schema.json:471`; confirmed unwired at `lib/components/index.js:431-433`, only
    `validateTransform` runs at load). So there is no transform-output stage to tag with a spoken form.
    This kill stands.
  - **"No channel from rendered output to EITHER narrator" was too strong** (§11/F5). True for the
    **live** consumer (`PresentOverlay` has only raw Markdown). **False for the export/article consumer:**
    `player-core.mjs buildArticle()` (`:615-618`) → `projectDeckToProse()` consumes the **post-transform,
    sanitized DOM** (`prose-projection.mjs`). That IS a rendered-output→narration channel — and Phase 2
    below builds its speech sibling on it. The kill is narrowed to the DSL, not the DOM.
- **"A `speech` block on all 56 manifests" as the starting point.** Re-opens the §10/§11 drift class ×56
  (a copy of each transform's grammar in JSON, across the CJS/ESM wall) while the actual token pain stays
  unfixed. Still killed.

## 4. What the review discovered (reuse — HARD RULE #15; corrected in §11)

- **The "read article" reader-mode already exists and is sanitized by its caller.** `buildArticle()` →
  `projectDeckToProse()` (`prose-projection.mjs`); the projector documents "the caller MUST sanitize"
  and the caller passes `sanitizeSlideHtml` (`share-export.ts:336`). HARD RULE #22 is satisfied by that
  caller-sanitizes pattern; the projector adds no new sink.
- **`prose-projection.mjs` already keys on component identity** — `componentOf(section)` reads
  `data-class` (`:45-46`) and branches `if (component === 'kpi' || component === 'stats')` (`:189`),
  emitting `<dt>value</dt><dd>label</dd>` (`:104`). **This is the load-bearing reuse:** a
  `projectDeckToSpeech(sections)` sibling can key number-mode AND speech-order on `data-class`, exactly
  as `projectStats` already does — so the value→label reorder needs **no manifest field** (§11/F2).
- **Cadenza crosses the CJS/ESM wall cleanly** — a real dual package (`import → index.ts`,
  `require → dist/index.cjs`). A shared speech kernel placed there is importable both ways (unlike the
  hand-copied `niceCeil`/`splitSentences`, which live in *unpackaged* `lib/**`). Caveat: the CJS side is
  a built `dist/`, so a new kernel needs the Cadenza build re-run.
- **`adapt.priority`/`droppable`/`keepTogether` is an OVERFLOW model, not a speak-order model**
  (corrected §11/F6). `priority` = keep-order when shedding; `droppable` = shed-first on overflow;
  `keepTogether` = don't split visually. It does **not** encode narration order, and `droppable:
  [status-pills]` would wrongly suppress a pill the review says to speak. A `lead`/order fact is genuinely
  new — not a reuse of `adapt`.
- **The anti-rot gate precedent** — the density `domSelector` render-time coverage test
  (`manifest.schema.json:583-587`).

## 5. Load-bearing invariants

1. **Never say less than `slideToSpeech`.** Any semantic narrator returns the set of source lines it
   consumed; a shared wrapper flattens the rest through the generic path and appends it (`speakLeftover`,
   `chart-narration.ts:201-213`). Framework-enforced, not per-narrator discipline.
2. **No NEW re-derivation of computed facts outside the sanctioned `NARRATORS` registry.** (Reworded per
   §11/F4 — the original absolute "zero re-derivation" contradicted keeping the 5 narrators, which
   re-derive transform math *by design*, e.g. `niceCeil` hand-copied in radar/quadrant transforms and
   `chart-narration.ts`.) The 5 are the grandfathered exception, gated against drift; nothing new may add
   arithmetic on slide data in the speech layer or a manifest.
3. **Reordering only within one authored unit**, from the AST parent/child the projection already
   resolves — never across siblings.
4. **One narration source before one semantic layer** — unify Present and export, or a semantic layer
   silently no-ops for the export consumer.
5. **Prove one component end-to-end, verified, before the second.** The spoken *string* (unit tests) and
   the caption *text* in the real overlay (Playwright) are the only claims; audio is UNVERIFIED.
6. **Any HTML speech consumer routes through the shared sanitizer** (the caller-sanitizes contract),
   and a CLI export builder extends the HARD RULE #22 allowlist.

## 6. Recommended plan — corrected, verifiable-first

**Phase 1 — the component-blind normalizer lexicon (the one deterministically-verifiable win).**
In Cadenza `normalize.ts`, add a units/deltas/symbols layer so raw-glyph passthroughs become words:
`×`→"times", signed `+`/`−` (incl. U+2212)→"up"/"down", `pp`→"percentage points", `bps`→"basis points",
`Nd`→"days", `§`→"section", `·`→a light break; and a layered, data-not-code pronunciation lexicon
(engine default ← domain pack `legal`/`finance` ← deck override), validated like `transform` (closed
`mode` set, no JS). **This fixes tokens, not order.** Its audio benefit (does a colon pause better than a
period?) is NOT claimed — that is the unverifiable folk-technique §9 disclaims. Ship only the string
behavior as verified. **Do NOT** add the generic-path connective/reorder the first draft proposed: it
can't reorder (§11/F1), it reverses a deliberate anti-run-on design (`read-aloud.ts:56-58`), and it needs
indentation `slideToSpeech` currently trims (`:46`).

**Phase 2 — producer unification + the natural reorder, on the DOM projection.** Add
`projectDeckToSpeech(sections)` beside `projectDeckToProse` in `prose-projection.mjs`, keyed on
`componentOf(data-class)` (the `projectStats` precedent): a kpi/stats section narrates **label then
value** ("Total revenue: two point four billion dollars"); a legal citation narrates its number as a
reference; chrome is skipped via `SKIP_SELECTOR`. Derive the export's `slideTexts[i]` from it (not
notes-only). This is where the motivating KPI reorder actually lives — because component identity lives
on the DOM, not in the markdown flatten — and it serves BOTH the article export and the captions. Honest
caveat: the live Present path is markdown-only today, so giving *it* the DOM-projected narration (so live
and export match) is the real work of unification, not a free rename.

**Phase 3 — a per-component `speech` field: NOT recommended.** A first-pass census of all 56 manifests
(§12) tested the case that would justify it — a component mixing a reference number and a quantity number.
That case DOES exist (`authority-chain`, `regulatory-update`, `statute-stack`, `redline`), refuting the
draft's "not shown to exist" claim. But reading them shows it does NOT justify a manifest field: the
distinction is carried by the **token glyph** (`§`/`U.S.C.`/`C.F.R.`/`Art.` = reference vs `$`/`%` =
quantity), so it belongs in the Phase 1 **legal/finance domain lexicon** (component-blind), not a
per-component field. The one genuinely unresolvable residual — a **bare** number that is a year vs a
quantity (`Congress, 1998`), intermixed with quantities in a single `ol > li` slot — is **per-item**, so a
per-slot/per-component `number-mode` field would not fix it either; it needs a token heuristic (4-digit
19xx/20xx → year) or is left to the voice and flagged. Net: the census **strengthens Phase 1's lexicon and
further weakens A**. See §10 and §12.

**Also: the genuine defects found while tracing (log, fix independently; HARD RULE #18).** Not
"latent-meaning" bugs as the first draft framed them (that framing was wrong — §11/F3), but raw-glyph
passthroughs that reach the voice unmapped: U+2212 minus, ranges (`1,200-1,500`), `×`, `§`(+parens). Each
passes through *unchanged*; what Kokoro does with the raw glyph is TTS-side and UNVERIFIED. The one real
segmenter issue — `v.` over-splitting a sentence (`segment.ts:20-27`) — is an **already-documented,
accepted tradeoff** (`segment.ts:9-12`), not a new find.

## 7. The `speech` vocabulary (only if Phase 3 is ever built — closed, data-only)

Retained for completeness; not recommended (§10). Named `speech` (not `caption`; taken by
`stressDoc.caption`/`variantDocs.caption`). Role tags (`frame`/`given`/`new`/`aside`/`machine`/`chrome`);
one order primitive (`lead`); a closed keyed connective set; list ops; number modes
(`quantity`/`reference`/`ordinal`); two per-token escapes (`say`/`drop`). A connective must be selected
from the authored structure present, never emitted unconditionally.

## 8. Per-semantic-part taxonomy & before→after

Order/treatment differs per component; the "after" strings are **targets, not verified output** (audio
UNVERIFIED, §9), and the reorder ones are Phase 2 (projection), not Phase 1.

| Part | Manifest anchor | Rule | Today (string) → Target |
|---|---|---|---|
| title `h2` | `slots.title` | first, `.` | (already good) |
| eyebrow `p>code` | `slots.eyebrow` | first, soft; `·`→light break | "Financial · Q4 2026" (·raw) → "Financial, Q four twenty twenty-six." |
| card header/body `- T`/`  - b` | HARD RULE #5 | "T: b" (Phase 2, needs indent) | "Title. body." → "Title: body." |
| kpi tile (value-lead `ol>li`) | `slots.kpis` | reorder label→value (Phase 2, `data-class`) | "…dollars. Total revenue." → "Total revenue: two point four billion dollars." |
| stats tile | `slots.tiles` | apposition (Phase 2) | "…four point two ×. signal recall." (× raw today) → "Four point two times signal recall." |
| ordered STEP | list-steps `slots.steps` | speak ordinal | "Assess risk." → "First, assess risk." |
| table | compare-table `slots.table` (selector `table`) | header-bound row-major (JS walker) | pipes/`---` read literally → "Row A label — Holds: one cell per column; Budget: twelve words." |
| legal citation `§…` | citation-card `slots.citation` (`p:first-of-type>code`) | `reference`; keyed on `data-class` | `§1798.140(o)` raw glyphs → "section seventeen ninety-eight point one-forty, subsection o." |
| state transition `=>` | (transform token) | `machine` translate (JS narrator) | `=>` raw → "on submit, go to state two." |
| status pills, page nums, masthead | chrome / `SKIP_SELECTOR` | never spoken (pills: spoken as aside) | varies → suppressed |

## 9. Verification honesty

Everything about **audio prosody / pacing / "sounds natural" is UNVERIFIED** — no Kokoro/OpenRouter TTS
runs in this sandbox (HARD RULE #23). "A colon pauses better than a period" is a documented community
folk-technique, **not** spec — the plan must not bank on it (the first draft did, §11/F1). Verifiable and
therefore the only claims: the display→spoken **string** (unit tests over `normalize`/projection) and the
caption **text** in the real overlay (Playwright). Every "natural" claim is UNVERIFIED until heard on a
real voice by a human.

## 10. Decisions recorded (2026-07-11) & the corrected recommendation

Owner's answers to the three scope forks:
1. **First slice → DESIGN ONLY for now.** No code ships this round; this doc is the deliverable.
2. **Producer unification (Phase 2) → YES, unify.** `projectDeckToSpeech` on the sanitized, component-
   aware DOM — the owner's chosen direction, and (post-§11) the slice that actually delivers the natural
   KPI reorder to both surfaces.
3. **Manifest-contract ambition (Phase 3) → pros/cons requested; recommendation corrected below.**

### Phase 3 pros/cons — corrected recommendation: **C (no manifest field)**

The first draft recommended **A** (a minimal role-hint) on a "decisive discriminator": a legal citation
(`p:first-of-type > code`) and an eyebrow (`p > code`) are structurally near-identical, so number-mode
must be declared. **The second trio refuted that** (§11/F2): number-mode is inferable from **component
identity** — `componentOf(data-class)` on the export path already tells a `citation-card` from a `kpi`
(`prose-projection.mjs:45,189`), exactly as `projectStats` keys on it. So C covers the discriminator's
case with no new field.

| | **A. Minimal role-hint** | **B. Fuller `speech` DSL** | **C. No manifest field (RECOMMENDED)** |
|---|---|---|---|
| Shape | `lead` + `number-mode` + `machine`/`chrome` on manifests | full closed vocabulary ×56 | narrators stay JS; normalizer + `projectDeckToSpeech` keyed on `data-class` carry the rest |
| Pros | small surface | most expressive | zero new schema/migration/rot; number-mode & order come from `data-class` (verified reuse); a computed-fact component just adds a JS narrator |
| Cons | its justifying discriminator is refuted (§11/F2 + §12: the real mixed case is token-glyph-driven or per-item, neither of which a per-slot field fixes); still needs JS walkers for table/legal-gloss | the §3.2 "speculative genericity" the war-diary deferred, ×56; monolingual baked connectives; still doesn't remove JS | the residual it can't fully cover — a bare year-vs-quantity number intermixed in one slot (§12) — is per-item, so A wouldn't fix it either; a token heuristic + domain lexicon is the answer |

**Recommendation: C** (reinforced by the §12 census). Build number-mode and the value→label reorder into
`projectDeckToSpeech` keyed on `data-class` (Phase 2); keep the 5 computed-fact narrators in JS; ship the
normalizer lexicon — now scoped to include a **legal/finance domain pronunciation pack** the census showed
is needed (Phase 1). The mixed reference/quantity case the draft treated as A's justification turns out to
be token-glyph-driven (→ the lexicon) or per-item (→ a token heuristic), neither of which a per-slot
`speech` field resolves — so A is not the escalation it was framed as. Decision is the owner's; not locked,
and it should not be locked until the full authoring-semantics census (§12) is complete.

## 11. Second adversarial pass — the trio found errors in THIS doc's synthesis

The owner asked whether the doc itself (not just the straw-man) had been red-teamed, inverted, and
independently checked. It had not — the first five lenses hardened the *input*; the synthesis and
recommendation were the orchestrator's own, unreviewed. A genuinely independent trio (three fresh agents,
blind to each other, each verifying against source) was then run against the committed doc. It found the
synthesis directionally sound but with load-bearing errors, all fixed above:

- **F1 (CRITICAL, red team + inversion converged) — "Phase 0+1 banks the motivating KPI example" was
  false.** A generic-path connective change cannot *reorder*; the value→label reorder is
  component-semantic (kpi reverses, a normal `- **Title**`/`  - body` card does not) and needs component
  identity the markdown-only `slideToSpeech` lacks. Best case Phase 1 could produce was "two point four
  billion dollars **:** total revenue" — still value-first. **Fix:** the reorder moved to Phase 2 (DOM
  projection, `data-class`); Phase 1 is now the token lexicon only, explicitly NOT claiming the reorder.
- **F2 (HIGH, red team; inversion + checker converged) — recommendation A's discriminator was refuted.**
  `prose-projection.mjs` already resolves component identity from `data-class` (`:45,:189`), so number-
  mode is inferable without a manifest field. **Fix:** recommendation flipped A → **C**; A reserved for
  an unproven intra-component mixed-number case.
- **F3 (HIGH, checker + red team) — the Phase 0 "latent bugs" were mostly misdiagnosed.** `normalize.ts`'s
  anchored regexes pass compound tokens through **unchanged** — `§1798.140(o)` does NOT match the number
  regex and is NOT read as a quantity (verified in Node); `−18d` is passed **raw**, not "silently dropped
  → inverts meaning"; the "twelve hundred minus" example is impossible (`integerToWords` says "one
  thousand two hundred"). The real issue is raw-glyph passthrough (TTS-side, UNVERIFIED); `v.` over-split
  is an already-documented tradeoff, not a new find. **Fix:** §6 reframed; the overstated
  "inverts-meaning / highest-severity" framing removed.
- **F4 (MEDIUM) — invariant #2 "zero re-derivation" was self-contradictory** with keeping the 5 narrators
  (which re-derive by design). **Fix:** reworded to "no NEW re-derivation outside the sanctioned registry;
  the 5 are grandfathered."
- **F5 (MEDIUM) — the Axis A kill over-generalized.** "No channel to either narrator" is false for the
  export/article consumer, which consumes post-transform sanitized DOM. **Fix:** §3 narrowed to the
  unwired transform DSL.
- **F6 (MEDIUM) — the `adapt` reuse was overstated.** It is an overflow-priority model, not a speak-order
  model, and `droppable` would suppress a pill the review says to speak. **Fix:** §4 corrected;
  `lead`/order acknowledged as genuinely new.

**A verifier error, logged for honesty:** the independent checker claimed no manifest declares a
`slots.table`; `compare-table` declares exactly that (`selector: "table"`, verified). The verifiers err
too — which is why each correction above was re-verified against source before being folded in, not
taken on the reviewer's word.

**Net:** the doc's *direction* (component-blind lexicon fix + producer unification on the DOM projection)
is verified and sound; the first draft's *headline sell* ("Phase 0+1 banks the KPI example") and its
*Phase-3 = A* recommendation were wrong and are corrected here. The honest, verifiable win is the
normalizer lexicon; the natural reorder is a Phase-2 projection keyed on `data-class`; no manifest field
is recommended.

## 12. Census gap — the design rests on a partial sample (open)

Asked whether these decisions rest on a full profile of all component manifests and their authoring
semantics, the honest answer is **no.** The design was built from the schema, the 5 hardened narrators,
the shared narration code, and ~6–8 manifests (kpi, stats, big-number, compare-table, citation-card,
list-steps, list-tabular) across 5 of 13 buckets. The other ~48 and whole buckets (math, code, diagram,
connect, most of inventory/comparison/legal, chart's non-narrated members) were reasoned from the schema,
not read.

A **first-pass mechanical census** (slot inventory + a token-class scan of every manifest's
skeleton/sample/variant samples across all 56) was then run, and it immediately moved the design:

- **It refuted a shipped claim.** "No component mixes a reference and a quantity number" was false —
  `authority-chain`, `regulatory-update`, `statute-stack` (legal) and `redline` (comparison) all do.
- **It re-scoped Phase 1.** The reference/quantity distinction is token-glyph-driven (`§`, `U.S.C.`,
  `C.F.R.`, `Art.`, `·`, date forms), so Phase 1's normalizer needs a real **legal/finance domain
  pronunciation pack**, not just the boardroom units the draft scoped from one exemplar.
- **It surfaced a hard edge no option covered.** A bare year vs a quantity (`Congress, 1998`) intermixed
  with `$245M` in one `ol > li` slot is disambiguable by neither token, `data-class`, nor slot — and it's
  per-*item*, so option A (a per-slot field) would not fix it. It needs a token heuristic or is flagged.

**What is still NOT done (the real next step):** a full authoring-semantics census — reading every
manifest AND its `<name>.docs.md` across all 13 buckets, cataloging per-slot the narratable structure and
number/token kinds (math's TeX, code's fenced source + focus lines, connect's QR/contact data, glossary's
`dl`, chart's non-narrated members, the roadmap/gantt/kanban token grammars, etc.). The §8 taxonomy and
the phase scoping should be treated as **provisional** until that census is complete; the recommendation
(C + a domain-lexicon-scoped Phase 1) is the current best read, not a locked conclusion.
