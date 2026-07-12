---
status: proposed
summary: Design record for making TTS/read-along captions sound natural by teaching narration the slide's semantics. A five-lens review (linguist + phonetician personas, red-team + Munger-inversion + independent-checker trio) reframed the ask — a `speech` field on all 56 manifests. A SECOND adversarial trio, run against this doc itself, then found load-bearing errors in the synthesis (see §11) and corrected the recommendation: the verifiable win is a component-blind normalizer lexicon fix; the natural value→label reorder lives on the DOM projection path keyed on `data-class` (no manifest field); a per-component `speech` field is NOT recommended. A first-pass census (§12), then a full 27-agent maker→checker→judge authoring-semantics census of all 56 manifests + their docs (§13), then CONFIRMED recommendation C (no per-component manifest field) across all 13 buckets — forcing three refinements (key the DOM projection on the full variant class, generalize its primitive to reorder/inject/skip/verbatim-guard, broaden the Phase-1 lexicon) and an explicitly-scoped JS narration tail (table-walkers, state-marker class-readers, math/diagram/video narrators). Audio naturalness remains UNVERIFIED; only the spoken-string behavior is claimed.
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

**Phase 1 — SHIPPED (2026-07-11), adversarially reviewed.** `lexicon.ts` + `normalize.ts` handle: signed
deltas gated on a delta unit (`+9%`/`−18d`/`-18d`, both minus glyphs alike; a bare `+44`/`−40` stays a
plain sign, not up/down), `pp`/`bps`/`×`/`d` units with singular-plural agreement, `§`+subsection refs
with every citation digit preserved (`§1798.100` keeps its zeros — NOT routed through `Number()`), the `·`
middot dropped, and a BASE + opt-in `legal`/`finance` domain-pack lexicon (BASE holds only
domain-unambiguous tokens — `h1`/`h2`/`coo`/`tam` were kept OUT after the review flagged heading/chemistry/
verb/name collisions). *Deferred normalizer refinements, logged not done (HARD RULE #18):* digit-GROUPED
citation reading ("seventeen ninety-eight"), section ranges (`§§1-5`), span `..`→"to", page refs
`p.15`→"page fifteen", `at-risk` de-hyphenation and size badges `S/M/L/XL` (these last two are component-
aware → belong to Phase 2/3, not the component-blind normalizer), and a sentence-terminator restore after
a period-bearing legal abbreviation at a true sentence end.

**Phase 2 — producer unification + the natural reorder, on the DOM projection.** Add
`projectDeckToSpeech(sections)` beside `projectDeckToProse` in `prose-projection.mjs`, keyed on
`componentOf(data-class)` (the `projectStats` precedent): a kpi/stats section narrates **label then
value** ("Total revenue: two point four billion dollars"); a legal citation narrates its number as a
reference; chrome is skipped via `SKIP_SELECTOR`. Derive the export's `slideTexts[i]` from it (not
notes-only). This is where the motivating KPI reorder actually lives — because component identity lives
on the DOM, not in the markdown flatten — and it serves BOTH the article export and the captions. Honest
caveat: the live Present path is markdown-only today, so giving *it* the DOM-projected narration (so live
and export match) is the real work of unification, not a free rename.

**Phase 2 — SHIPPED (2026-07-11), adversarially reviewed.** `projectDeckToSpeech(sections)` +
the export producer (`writeCaptionsSidecar`, now async): a note-free deck now narrates its slides. Primitive
by component: kpi/stats reorder to label-first (the metric NAME fronted, value focal, secondary lines
trailing); quote reads verbatim + attribution; a `<dl>` ledger (wifi/contact) reads "term: definition"; a
table reads header-bound ONLY when a real header row exists (else linear, no fabricated binding); a
chart/diagram/math visual is SKIPPED (heading + eyebrow + figcaption only, never the SVG). The export
sanitizes each section (HARD RULE #22) before projecting, and merges `note ?? projected` via the shared,
tested `mergeNarration` only when the projection aligns 1:1 with the authored slides. *Scope honesty
(a review finding):* this makes the **export** narrate component prose — it is NOT full producer
unification. The live Present path still narrates from markdown (`slideToSpeech`/`narrateChart`), so the
same deck narrates differently in Present vs. the exported `.vtt`, and for the 5 chart narrators the export
(which skips the visual) is *poorer* than Present until Phase 3 gives Present the DOM projection and adds
the chart narrators to the export. *F-B (variant keying) is deferred to Phase 3*, where the
variant-sensitive narrators (state markers, list-tabular pills, obligation-matrix `heat`) live; Phase 2's
primitives key on the component only. Trio findings folded: WebVTT payload escaping (`&`/`<`/`>`, so deck
prose like "R&D"/"5<10" can't corrupt a cue), the delta-first / value-in-wrapper KPI reorder bugs, the
headerless-table fabrication, dropped `<dl>`/figcaption prose, the 3-level list text-mash, `--strip-notes`
suppressing projection too, and surfacing the misalignment fallback + swallowed projection errors.

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

**This census is now COMPLETE — see §13.** It was run as a 27-agent maker→checker→judge fan-out (one
maker + one independent checker per bucket, one judge). It **confirmed recommendation C** (no per-component
manifest field) across all 13 buckets and forced three refinements + an explicitly-scoped JS narration
tail. §8 and the phase scoping below should be read together with §13.

## 13. Full authoring-semantics census — deck-wide synthesis (2026-07-11)

This closes the §12 census gap: every manifest AND its `<name>.docs.md` was profiled across all 13 buckets
(maker + independent checker per bucket; checker corrections treated as authoritative). The verdict on the
§10 recommendation: **C (no per-component manifest field) SURVIVES and is strengthened** — no component
needs a field. What the census *does* force is a broader lexicon, a variant-aware projection key, a
generalized set of Phase-2 projection ops, and explicit acknowledgment of a JS narration **tail** (tables,
state-markers, math, diagram, video, connect) that C anticipates but the §6 phasing does not yet scope.

### 13.1 Per-bucket profile (compact)

| Bucket | Path today | Decision-relevant reality | Beyond C + lexicon + reorder? |
|---|---|---|---|
| anchor | generic flatten | eyebrow visually above heading (flex order:-1) but DOM-after → data-class reorder; qr transform strips the URL on the DOM (hazard is markdown-only); numbered CSS counter can double with an authored ordinal | Reorder keyed on data-class incl. `qr`/`numbered` variant. **Supports C.** |
| statement | generic flatten | split-panel is variant-polymorphic: SAME selectors → ordinal-semantic vs label, hero-number vs prose, verbatim vs frame; `<em>`/`—` leak on markdown path; big-number given→new already natural | **Projection must key on FULL class (variant), not componentOf first token.** |
| inventory | generic flatten | checklist [x]/[-]/[ ]/[/] semantic is the load-bearing signal; glossary is a runtime ul→**table**; pill vocab splits (actors=name, cards-stack=status); auto-numbers are markers not sequence | **State-marker reader + table-walker (glossary).** |
| comparison | generic flatten | redline inline `<del>`/`<ins>` → garbled doubled clause (+ rl-old/rl-new positional variants); verdict-grid/pricing state semantic dropped to CSS class; **[ ]=fail overloads checklist's [ ]=todo**; compare-table is a real `<table>` | **State-marker class-reader (component-keyed) + table-walker + redline diff-resolver.** |
| progression | generic flatten | list-steps prefix-word (STEP/PHASE/RANK) is CSS-only, recoverable only from the variant; 4/12 variants DELETE the badge; **list-criteria renders the same ordinal badge on ul (semantic-free) and ol (rank)** | Variant-aware ordinal synthesis; branch on ol/ul. |
| evidence | generic flatten | kpi/stats value-lead ol → value→label reorder (kpi.manifest declares `keepTogether:[value+label]`); kpi ALSO has a MIXED meta line (reference target + delta) + droppable status pills; stats is the clean minimal reorder | Reorder keyed on data-class. **Strongest support for C**, but kpi ≠ stats (kpi needs the MIXED split too). |
| imagery | h2 + eyebrow only | image = background, no alt (nothing to speak, suppress url()); **video = computed provider/QR synthesis from a bare URL** + poster/caption marker suppression; `reel` multi-clip iteration | **Video narrator / provider-synthesis rule (genuine gap).** |
| chart | 5 narrators (funnel/journey-weighted/radar/quadrant/state-chart) | 9 of ~14 members UNCOVERED (gantt/kanban/map/roadmap/timeline-list/piechart/progress/word-cloud + non-weighted journey, radar `quadrant`); roadmap is a **table**; narrateRadar/Quadrant fire ONLY when the eyebrow lacks an explicit range | Table-walker (roadmap); more narrators for uncovered members. Coordinates/weights must not read as counts. |
| diagram | **h2 + eyebrow only — graph is SILENT** | fence dropped (read-aloud.ts:47-51); substance is topology; NONE of the 5 fire on `_class:diagram`; DSL markup would read as garbage if unfenced | **Bespoke SVG `<text>` walker / DSL parser — NO path today.** |
| math | **h2 + eyebrow; reads raw TeX** | `$$…$$`→KaTeX span tree, unspeakable by lexicon OR reorder; legend `$sym$ — def`; theorem prefix-words; derivation **table**; `p` selector doesn't isolate equation from prose (use `p:has(.katex-display)`) | **Skip-equation projection rule OR a dedicated narrator — NO path today.** |
| code | h2 (fence suppressed, correct) | no computed facts; reorder inert; compare-code labels ship in transformed `.code-col>p>code`, NOT the manifest's stale h3 | Key projection on the shipped DOM. **Supports C.** |
| legal | generic flatten (gibberish on tables) | obligation-matrix + statute-stack `lane` are **tables** with row×col×cell walk + marker→word + **heat inverts [x] to exposure**; citations need the domain pack (§/U.S.C./C.F.R./Art./bill ids); pull-quote HIDES a gloss the flatten speaks; **bare year as a status pill** | **Domain lexicon (as scoped) + table-walker + heat-variant valence flip.** |
| connect | generic flatten | **contact STRIPS email/phone/url keys → unlabeled ledger** needing INJECTION + per-span classification (reorder is inert/wrong); wifi is already dt:dd (reorder no-op); contact DROPS its h2 entirely; opaque-credential guard | **Label injection + content classification — reorder primitive insufficient.** |

### 13.2 Cross-cutting findings

**F-A — C's core is confirmed.** No component in any bucket needs a per-component manifest field. The
reference/quantity/role discriminator is always carried by data-class + variant + token-glyph + the
transform's shipped DOM. The bare-year-vs-quantity residual (§12) recurs across legal but stays
**per-item** (a 19xx/20xx→year token heuristic), which a per-slot field would not fix either.
**Recommendation C is strengthened, not overturned.**

**F-B — "keyed on data-class" must mean the FULL class string.** `componentOf` (`prose-projection.mjs:45-47`)
returns only the first token (verified: `dc.split(/\s+/).filter(Boolean)[0]`), but list-tabular
(role|value|type|status), split-panel, map (value|category), and obligation-matrix `heat` resolve their
spoken role ONLY on the VARIANT. As-implemented, the Phase-2 projection cannot resolve these. This is the
census's sharpest "data-class alone is insufficient" case and the one concrete change Phase 2 requires.

**F-C — Phase 2 needs {reorder | inject | skip | verbatim-guard}, not just reorder.** kpi/stats reorder;
wifi is a no-op (already label:value); **contact needs label INJECTION** into an unlabeled ledger (and
`filter(Boolean)` makes position unstable → per-span content classification); math/diagram/canvas/QR need
SKIP; quote/redline/citation blockquotes/wifi passwords need a VERBATIM guard so the normalizer never
rewrites them. The primitive is selected per data-class.

**F-D — a JS narration TAIL, fully mapped, that C anticipates but §6 does not scope.** (1) **Table-walkers**:
roadmap, obligation-matrix, gantt, glossary, statute-stack `lane`, math derivation — §8 lists only
compare-table. (2) **State-marker class-readers**: checklist, verdict-grid, pricing, obligation-matrix,
roadmap — the [x]/[-]/[ ]/[/] semantic is dropped to a CSS class then the marker is stripped
(verified: `stateClassesFor` + "strips the marker", `plugins.js:530-630`); the map is
**component/variant-keyed** ([ ]=fail vs todo; heat inverts). (3) **Dedicated narrators/skip-rules**: math
(equation), diagram (mermaid), video (provider). Each is a JS narrator/walker keyed on data-class —
consistent with C ("a computed-fact component adds a JS narrator"), so the plan should state the tail
explicitly rather than imply the 5 narrators + Phase-1/2 cover the deck.

**F-E — the domain lexicon is broader than "legal/finance."** Beyond §/U.S.C./C.F.R./Art./bill-ids/$/%, the
census requires: `×`/`−`(U+2212)/`pp`/`bps`/magnitude suffixes; chart status de-hyphenation
(`at-risk`→"at risk"); size badges (S/M/L/XL); span `..`→"to"; page refs `p.15`; date/quarter/duration
forms; coordinate/bit-range/weight SUPPRESSION (`3, 70` is not "three, seventy"); URL/credential/identifier
guards; leaked `<em>`/`<del>`/`<sup>`; routing-pill (`qr`/`caption`/`poster`) suppression; leading-zero
ordinals (`01`→"one", never "oh-one"). The full kind list is in the workflow judgment (scratchpad
`census-report.md` companion output).

**F-F — two producers narrate different content until unified.** The markdown path (slideToSpeech reads raw
markdown) and the DOM projection diverge in BOTH directions: pull-quote (citation-card) visually HIDES a
gloss the flatten speaks; QR variants keep the URL in markdown but strip it in the DOM. This confirms the
doc's Phase-2 direction (narrate the sanitized, component-aware DOM) and reinforces that giving the live
Present path the DOM projection is the real unification work, not a rename.

### 13.3 Corrected plan deltas (fold into §6/§8 when built) and the honest caveat

Adopt three refinements and scope the tail: (i) **key Phase-2 projection on the full variant class**, not
`componentOf`'s first token (F-B); (ii) **generalize the projection primitive** to
`{reorder | inject | skip | verbatim-guard}` selected per data-class (F-C); (iii) **broaden Phase-1's
lexicon** to the full F-E kind set. And **scope the JS narration tail explicitly** (F-D): table-walkers
(×6 surfaces), state-marker class-readers (×5, component/variant-keyed valence), and dedicated
math/diagram/video narrators — all keyed on data-class, consistent with C, but real work §6 did not list.

**Caveat (the judge's own, and the standing discipline):** the maker profiles carried some off-by-one line
citations and cross-bucket token contamination (checker-flagged: SOC 2/SSO between pricing and verdict-grid;
`$1.2M`/`−18d` between kpi and stats). The token/structure **kinds and the C verdict are solid** (the two
sharpest new claims, F-B and F-D.2, were re-verified against source before landing here); **exact
string→line attributions must be re-verified before any of this enters code.** Audio naturalness remains
UNVERIFIED (HARD RULE #23) — only display→spoken string/text behavior is ever claimed.

### 13.4 Phase 3 (state-marker reading) — SHIPPED (2026-07-11), adversarially reviewed

The first tail item — **state-marker class-reading** — is implemented in `projectDeckToSpeech`: a stripped
`[x]/[-]/[ ]/[/]` marker's surviving CSS class (`plugins.js` `stateClassesFor` → sem) becomes a spoken word
via a **COMPONENT-KEYED** `WORD_MAPS` (F-D.2's non-negotiable). The Munger-inversion + red-team pass proved
a *flat* map was confidently wrong: obligation-matrix `[ ]` = **exempt** (relief) rendered to the SAME
`state-todo` class as checklist `[ ]` = "not started", and a global `todo → "pending"` narrated exempt as
its near-antonym — worse than the silent drop. Fixed by keying the register per component: checklist
completion (`done`/`to do`/`partial`), verdict-grid & pricing inclusion (`yes`/`no` · `included`/`not
included`), obligation-matrix obligation (`applies`/`exempt`/`partial`). The `heat` variant only recolors —
marker MEANINGS are identical — so it reads the same words (the earlier "suppress heat" special-case was
removed; suppression would have dropped the whole matrix body). The reader is scoped to a direct-child
badge/state span plus one `<p>` wrapper (loose lists), so a parent card never inherits a child's state.
Tests render **real engine output** (not hand-written classes) so a renderer class rename fails a test.
**Corrections vs the census:** `roadmap` is a phantom in the F-D "×5" — no renderer emits state classes for
it, so it is correctly not covered (×4: checklist, verdict-grid, pricing, obligation-matrix). *Deferred:* the
deeper table-walkers (gantt/roadmap geometry), math-equation / mermaid-graph narration, video provider
synthesis, and the redundant "…complete: done" case where a label already lexicalizes its state.

### 13.5 Producer unification — the live Present path (SHIPPED, 2026-07-11)

The "real unification work" §13.3 flagged is done for **prose**: Studio Present's read-aloud
now narrates the **component-aware DOM projection**, not the raw-markdown flatten, so live and
export speak a deck identically (the KPI reorder, the citation-card hidden gloss, and the QR
URL-strip all resolve to the DOM's version). The **same shared kernel** runs on both surfaces —
`projectDeckToSpeech` is exposed at the top level of the browser `player-core` bundle (it was
already bundled, only reachable internally via `buildArticle`) and driven from a new
`docs/src/components/studio/narration-projection.ts` that reuses the export's `buildDeckRender`
(engine + theme glue) → `splitSections` → sanitize (HARD RULE #22) → project. So no projection
byte lives twice (HARD RULE #1/#15). Present precomputes the deck's narration `string[]` on open,
index-aligned to the presented set, async with the markdown flatten as the instant fallback until
it lands; a length mismatch (autosplit) drops the projection wholesale, the same guard the export's
`mergeNarration` applies. Precedence is unchanged: authored note → chart computed-facts
(`narrateChart`) → projection.

*Scope honesty (the chart caveat, confirmed with the user):* this unifies **prose**. Charts stay
on their richer markdown `narrateChart` on **both** surfaces — and the EXPORT still narrates a
chart from the visual-skipping projection, so a chart still narrates differently in Present (rich)
vs. the exported `.vtt` (poorer). **[RESOLVED in §13.6 — Gap 1 shipped, #902.]** Bringing
`narrateChart` into the shared kernel so the export gains it is the remaining unification, deferred
to its own branch (it moves browser-TS chart logic into `lib/`, HARD RULE #1) and tracked as a
follow-on issue. A second follow-on: the docs-site
client-side caption export (`share-export.ts shareCaptions`) is still **notes-only** — it never got
the projection the CLI export did in Phase 2 — but changing its `.vtt` bytes is an export-artifact
change gated on sign-off (QUALITY BAR), so it is out of this live-playback PR.

*Verification (HARD RULE #23):* the projection **string** pipeline is exercised through the REAL
`player-core` bundle in a DOM env (`narration-projection.test.ts`) — the exact strings Present feeds
`buildTrack`. Live browser Present **audio** is UNVERIFIED (no TTS in CI); only the spoken text is
claimed.

### 13.6 Chart-narration parity — the export gains `narrateChart` (SHIPPED, 2026-07-12, #902 Gap 1)

The chart caveat §13.5 left open is now closed. The 7 markdown chart narrators
(`narrateFunnel`, `narrateJourneyWeighted`, `narrateRadar`, `narrateQuadrant`,
`narrateStateChart`, `narrateStateChartInference`, `narrateChart`) moved out of the
browser-only `docs/src/components/studio/chart-narration.ts` into the shared kernel
`lib/core/chart-narration.js` (CJS), building on the `slideToSpeech` base that Phase 1
(§13.5's precursor) had already moved to `lib/core/slide-speech.js`. Both surfaces now
call the SAME kernel — no second copy of the narrator logic to drift.

**Honest scope of "identical" (an adversarial-review correction).** The kernel makes a
*given chart slide's Markdown* narrate identically wherever it runs. The two surfaces
still align that kernel to *different* per-slide splits: Present narrates `narrateChart(set[i])`
where `set` is the Studio's `---`-based slide model (`docs/.../lint.ts splitSlides`,
literal `---` only), while the export aligns to the engine's **rendered sections**
(heading-aware, all thematic-break forms). They agree on WHICH Markdown is a chart slide
whenever each rendered section is its own `---` block — the Studio's own model and the
house authoring convention, and every committed chart deck. So parity holds **by
convention (explicit `---` per section), not literally by construction**; a deck that
merges a chart with other content under one `---` block on one surface but splits it on
the other (a `split: headings` deck with no `---`, or a `***`/setext-adjacent break)
would narrate that slide differently. The EXPORT's own internal alignment, by contrast,
IS by construction (see below).

- **Approach = Option B (owner-confirmed):** move the proven markdown narrators into the
  kernel and have the export run them per chart slide, exactly as Present does. Rejected
  Option A (recover chart data from the rendered DOM): the computed facts (funnel
  conversion %, the auto-fit scale, an inferred start/terminal state) often aren't in the
  DOM at all, and recovering them would force every chart transform to emit its data first.
- **Home = `lib/core`, not cadenza.** The narrators are Lattice-component-specific; cadenza
  stays a domain-agnostic, spin-off-able engine. `chart-narration.js` depends on cadenza's
  `numberToWords` / `toSpokenText` (the CLI's existing `require('@slidewright/cadenza')`
  pattern) plus the shared `slideToSpeech`.
- **Browser sharing — the bundling decision.** The narration kernel rides ALONG in the
  existing `read-along-core` bundle (`tools/build-read-along-core.js` → `read-along-core.generated.js`)
  rather than a dedicated one: `chart-narration` needs cadenza, which the `.vtt` producer in
  that bundle already inlines, so adding it REUSES that one cadenza copy instead of a second
  bundle inlining another. Present (`PresentOverlay.tsx`) and `read-aloud.ts`'s `slideToSpeech`
  re-export now import from the generated bundle (the established `@/playground/*.generated.js`
  static-import pattern); the docs-side `chart-narration.ts` + its 953-line duplicate are
  deleted (HARD RULE #1).
- **Export wiring.** `lattice-emulator.js writeCaptionsSidecar` runs `narrateChart` per chart
  slide and, when it fires (non-null), substitutes its full-slide narration for the figure
  projection at that index — at the PROJECTION precedence level, so `mergeNarration` still lets
  an inline caption / front-matter caption / speaker note win, exactly as Present's `narrationAt`
  orders `note → chart → projection`.
- **Alignment is engine-faithful, not a parallel splitter (a red-team correction).** The first
  cut recovered per-slide source with `bakeSplits` + the `---`-only `splitSlides`, guarded only by
  a section-count match. A red-team review reproduced a real misalignment: the engine splits on the
  markdown-it `hr` token — *every* thematic-break form (`---`, `***`, `___`), keeps an empty middle
  section, and treats a setext underline (`text`\n`---`) as an H2, never a break — while the
  `---`-only splitter disagrees on each; two disagreements of opposite sign restore an equal COUNT
  while offsetting the index MAPPING, binding a chart's computed numbers onto the wrong slide
  (worse than a crash for an accessibility artifact). Replaced by `lib/core/section-source-split.js`
  `splitSourceToSections`, which derives the split from the engine's OWN boundary source of truth:
  bake headings boundaries → `---`, then group the body on markdown-it's `hr` tokens (the same
  parser + the same `splitOnHr` grouping, empties preserved, `lib/engine/slides.js`). So `blocks[i]
  ⇔ rendered section i` **by construction** — it cannot drift from the render. Verified by a test
  that renders each fixture through the real engine and asserts `blocks.length === section count`,
  including the two red-team trigger decks. The count guard stays as belt-and-suspenders: autosplit
  / focus-step expansion ADD sections *after* this split, so a mismatch stands chart narration down
  (a logged note — the export narrates those charts from the heading-only projection; Present, which
  is markdown-indexed, still narrates them richly) rather than misalign.
- **The narrators REPLACE the base narration for their slide** (not append) — identical contract
  on both surfaces.

*Verification (HARD RULE #23):* the narrators are pinned by a faithful port of the browser
oracle to `test/unit/core/chart-narration.test.js` (node:test, 61 cases) against the CJS source;
the engine-faithful alignment is pinned by `test/unit/core/section-source-split.test.js` (the
grouping contract) and `test/unit/core/chart-narration-export-parity.test.js` (which renders each
fixture through the REAL engine and asserts the recovered blocks equal the rendered section count,
including the red-team trigger decks); the browser bundle Present actually loads is smoke-tested by
`docs/src/components/studio/chart-narration.test.ts`. The end-to-end `.vtt` was produced via the REAL
CLI export (`node lattice-emulator.js … --captions`) and the chart narration confirmed present in the
deck-level and per-slide `.vtt` (the export sign-off artifact). Live browser Present **audio** stays
UNVERIFIED (no TTS in CI); only the spoken STRING is claimed. Real-browser Studio Present (the sandbox
blocks browser egress) is UNVERIFIED for this change — the shared kernel guarantees the string is
identical to the CLI's, which IS verified.

*Tracked follow-up (not in this change):* `niceCeil` now has a third copy (`radar.transform.js`,
`quadrant.transform.js`, and the narrator kernel) — deliberate here (importing from `lib/components`
would invert the `lib/core` layering) and cross-checked only via the narrators' scale-expectation
tests, not a byte-diff. The clean resolution is to hoist `niceCeil` into `lib/core` and have all three
import it (the same #1 pattern the rest of this change applies); logged as off-path for its own branch
rather than pulled into this diff (HARD RULE #18).

---

## §14 Say-as lexicon expansion — periods, breadth, and the case-sensitive tier (2026-07-11, SHIPPED)

Follow-up from a real complaint: `FY26` was read "F Y 26". The token fell through
every branch (whole-token lexicon is keyed `fy`, not `fy26`; no number pattern
matches a letter-prefixed token) and reached the TTS raw, which spells the unknown.
Two gaps: **no period parser** for the FY/Q/H+year class, and a **thin acronym list**.
(Also surfaced: the `DOMAINS` packs are dormant — `buildTrack` calls `toSpoken`
without threading `domains` — so only BASE is live. Wiring an opt-in for the packs is
a tracked follow-up; everyday business terms went into always-on BASE, since the
boardroom *is* the domain.)

**Say-as taxonomy** — three treatments, encoded in the spoken *value* (no type field):
EXPAND a phrase (the house default for initialisms — a deck is read to be understood),
say as a WORD where the expansion is absurd to speak (`EBITDA`→"ee bit dah"), SPELL
only where neither fits (`UI`→"U I").

**Three confirmed choices** (one `AskUserQuestion` round):
1. **Initialisms EXPAND to words** — `ARR`→"annual recurring revenue", not "A R R".
2. **Fiscal periods read SEMANTIC, short year** — `FY26`→"fiscal year twenty-six"
   (two-digit literal, no century inference), `Q3`→"third quarter" (a behavior change
   from "Q three"), `H1`→"first half". Leading-zero years read as years, not a
   dropped-zero cardinal (`FY05`→"…oh five", `FY00`→"…two thousand"). Four-digit
   years read as full cardinals (`FY2026`→"…two thousand twenty-six"); a natural
   year-pair reading is a logged refinement.
3. **Case-sensitive tier (`BASE_CASED`) for word-collisions** — fires only on the
   acronym's canonical case, so the lower-case word never expands (`COGS`→"cost of
   goods sold" but `cogs` stays the machine part; `CY`→"calendar year" but the name
   "Cy" stays).

**Deliberately EXCLUDED** (a wrong expansion is worse than none). The cased tier's
hard limit is that it *still fires in the all-caps register* of titles/eyebrows/CTAs,
so a key that is also a common word there is unsafe — the adversarial-checker pass
(HARD RULE #25) caught `IT`/`US` reading "ABOUT US"→"…United States" / "WHY IT
MATTERS"→"…information technology", so both were pulled. Also out: `IP`
(intellectual-property vs internet-protocol), `AR`, `OR`. `TAM`/`SAM`/`SOM` are kept
as the market-sizing trio, the all-caps "SAM"-as-a-person collision the accepted
cost. The old Phase-1 `h1`/`h2` ban is now met differently: a bare half reads via a
**case-sensitive, anchored** `H1`/`H2` pattern, so lowercase `h2` and `H2O` never
become "second half" — the concern that removed them from BASE.

*Verification (HARD RULE #23):* string behavior is pinned in `normalize.test.ts`
(period patterns, expansions, case-sensitivity, the `fy26`/`h2`/`H2O` negatives).
Audio naturalness is UNVERIFIED (no TTS in CI); only the display→spoken string is
claimed. Both the live Present read-aloud and the CLI/export captions share the one
`@slidewright/cadenza` normalizer, so the change lands on both surfaces.

---

## §15 Author acronym registry + conservative defaults (2026-07-11, SHIPPED) — post-trio

The narration direction was stress-tested by the full adversarial trio (red team +
Munger inversion + independent checker), TWICE — once on the *direction*, once on the
*build plan*. The unanimous verdict reshaped the approach: a deck-blind global table
that expands ambiguous acronyms is a boardroom faceplant (`SAM` is a real ticker; `CRO`
= revenue-officer vs conversion-rate-optimization; `CMO` = marketing-officer vs
collateralized-mortgage-obligation). The fix is **reference material the author owns**.

**The model — two layers.** *Layer 1* selects a slide's caption TEXT; *Layer 2* expands
the acronyms WITHIN it. This §15 ships Layer 2 (the registry); Layer 1 (per-slide
`<!-- caption -->` + a front-matter `captions:` map) is the tracked follow-up.

**Layer 2 — the `acronyms:` registry (SHIPPED).**

```yaml
acronyms:
  CRO: chief revenue officer                       # string = expansion
  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }
  EBITDA:
    expansion: ee bit dah                          # block object (comma-safe definition)
    definition: "Earnings before interest, taxes, depreciation, and amortization."
```

- Value is a **string** (expansion) or an **object** `{ expansion (req), definition? }` —
  never a positional array (all three checkers flagged the comma foot-gun). Digit-leading
  terms (`5G`, `3PL`) allowed. `definition` is stored for a future glossary; narration
  speaks only the `expansion`.
- **Parsed once** in the shared `lib/core/resolve-captions.mjs` (the house has no YAML
  parser and its flat readers can't see a nested block — the `resolve-color-mode`
  precedent). Both producers consume the same source, so they can't drift (#904).
- **Precedence:** the deck registry beats the built-in dictionary AND every pattern —
  a whole-token, case-sensitive match consulted first in `spokenCore`. The author owns
  their vocabulary, even overriding `FY26`.
- Threaded through **both** narrators and **all three** `buildTrack` sites — export
  (`buildReadAlong`), live playback (`useReadAloud`), and the autoplay prefetch
  (`warmNarration`, so its cache key matches playback).

**Conservative built-in defaults (SHIPPED).** The always-on dictionary now holds ONLY
tokens that are UNAMBIGUOUS in a presentation. The genuinely-bimodal `CRO`/`CMO` are
**demoted to the (preserved) opt-in `finance` pack** — not deleted (#18) — so the author
reclaims the meaning they want via the registry. Everything monosemic stays (the
case-gated market-sizing trio `TAM/SAM/SOM`, `COGS`, `CAC`, `GTM`, the roles, the fiscal
parser). A **collision-guard test** encodes the rule as CI: no always-on key expands a
common English word (the `IT`/`US`/`IP` lesson) or a bimodal acronym.

**Bounded scope.** The always-on table is a *closed set* — tokens that are (a) not
ordinary words OR names in any register incl. all-caps, (b) not derivable by a generic
normalizer, (c) unambiguous **within a SaaS/tech-growth boardroom** (the house domain).
The honest scope is (c), NOT "every boardroom": a token that flips meaning in a whole
customer industry — finance/real-estate, IT-infra, defense/gov, arts/education, design —
is demoted to the opt-in `finance` pack or the author's `acronyms:` registry. A
three-lens audit (red team + inversion + checker, 2026-07-11) applied the CRO/CMO bar
consistently and pulled the cross-domain bimodals it had missed: **`LTV`** (loan-to-value),
**`SMB`** (Server Message Block), **`MFA`** (Master of Fine Arts), **`CAC`** (Common Access
Card / CAC-40), **`EPS`** (Encapsulated PostScript), **`SAM`** (SAM.gov / surface-to-air
missile), **`SOM`** (System-on-Module). `LTV` is not even pack-safe (bimodal *within*
finance: loan-to-value vs lifetime value) so it is registry-only; `API`/`GTM`/`NPS` stay
with a documented foreign-domain residual. Added, unambiguous: `DAU`/`SKU`/`NDA`/`MAU`;
rejected traps: `SOW` (the verb "sow"), `MSA` (Metropolitan Statistical Area). **Axis (c)
is now enforced**, not just disciplined: a `KNOWN_BIMODAL` denylist test asserts every one
of these passes through untouched, so re-adding a bimodal to always-on fails CI, not a
boardroom. Everything deck-specific is the author's `acronyms:` to declare; the table does
not chase the long tail.

**Deferred to the captions/discoverability follow-up (§16 — SHIPPED):** Layer 1
(per-slide `<!-- caption -->` + a front-matter `captions:` map) and the discovery lint
shipped in §16 below. The locale guard **shipped** in §17 below (#919). Still open: the
glossary surface that consumes `definition`. Audio remains UNVERIFIED (no TTS in CI) —
only the display→spoken string is claimed (HARD RULE #23).

## §16 Captions Layer 1 — per-slide caption + front-matter map + discovery lint (2026-07-11, SHIPPED)

Layer 2 (§15) selects how a slide's acronyms are SPOKEN; Layer 1 selects WHICH words a
slide reads. Both narration producers now resolve a single precedence chain, highest first:

1. **a slide's inline `<!-- caption: … -->`** — its exact read-as text, a new consumed
   comment channel alongside `note:`/`describe:`;
2. **a front-matter `captions:` entry** for that slide (keyed by 1-based author slide number);
3. **the speaker note**;
4. **the component-aware DOM projection**.

**One boundary, both producers (HARD RULE #1).** The channel is defined once in
`lib/authoring/notes-core.js` (`isCaptionComment`/`captionFromHtml`/`extractSlideCaptions`) —
the same module that owns the note/`describe:` boundary — so a `caption:` comment is NEVER
embedded as a PDF speaker note and NEVER read as one (verified on the real `.vtt`: the
caption narrates, the note still rides in the PDF). The front-matter block is parsed once in
the shared `lib/core/resolve-captions.mjs` (`parseCaptions` → `Map<number,string>`), beside
the `acronyms:` parser. The export producer threads both through `mergeNarration`; the live
Present overlay resolves them in `narrationAt`. A caption REPLACES a slide's narration, so
multiple caption comments are **last-wins** (an override supersedes, not concatenates).

**`caption:` is a reserved comment prefix.** Alongside `note:` and `describe:`, a comment whose
body begins `caption:` is a consumed structured channel, not a free-form speaker note — so an
existing note that happened to start with the literal word "caption:" would now be read as
narration, not embedded as a PDF note. No committed deck does this (only the demo, intentionally),
and it mirrors the accepted `describe:` precedent, but authors should treat `note:`/`describe:`/
`caption:` as reserved leading words. Disclosed in the CHANGELOG.

**The lens-filtering design problem, resolved by mapping through original indices.** A
front-matter `captions:` map is keyed by the author's slide NUMBER, but Present's reader
lenses (`exec`/`onepager`) filter and reorder the slide set, so the position in the filtered
set no longer equals the author's number. Rather than restrict captions to the `full` lens
(surprising — a caption would vanish under a filtered view) or require authors to assign
stable slide ids (typing burden the whole §15 design fought), `presentationSet` is refactored
around a shared `presentationPairs` core that carries each shown slide's ORIGINAL deck index,
exposed as `presentationIndices`. `narrationAt` resolves a number-keyed caption through that
original index, so it binds to the right slide under ANY lens. `presentationSet`'s `string[]`
signature (and the projection's reference-equality guard) is unchanged.

**`--strip-notes` and captions compose — they don't fight.** `--strip-notes` is a PRIVACY flag: it
removes the presenter's private NOTE channel (and the derived projection). A caption is the
OPPOSITE — public-facing narration the author deliberately opts into with `--captions` (it's the
caption track viewers read). So captions (inline AND front-matter) are NOT stripped: `--captions
--strip-notes` ships a deck WITH captions but WITHOUT the private notes — the reasonable workflow.
(This corrects a first-pass over-reach that blanked captions under strip; the adversarial trio
flagged the half-implemented "silent" invariant, and the principled fix is that captions, being
public content, are simply unaffected by the note strip. To ship without a caption track, omit
`--captions`.)

**Front-matter caption keys are unsafe under autosplit, so the export drops them there.** The
number-keyed `captions:` map assumes rendered-section index + 1 = the author's slide number — true
until `autosplit: on` (portrait/mobile) divides an over-capacity slide into several sections,
shifting every later index. The live path maps through the original source index
(`presentationIndices`); the export has no such map at the sidecar, so under autosplit it DROPS the
front-matter map (with a console note) rather than misbind a caption to the wrong slide. Inline
`<!-- caption: -->` is unaffected — it rides physically with its section. (A future export-side
author-number map would let front-matter captions work under autosplit too; tracked, not built.)

**Two `parseCaptions` edges, by design:** a lone YAML block/folded-scalar indicator (`3: >`, `4: |`)
is skipped — the flat parser can't read its deeper continuation lines, so it stores nothing rather
than narrate the bare glyph; and a leading-zero key (`03:`) is `Number()`-normalized to `3` (so
`03:` and `3:` collide, last-wins) — harmless, since the consumer looks up by integer.

**Discovery lint — the affordance all three trio lenses asked for.** `cadenza`'s new
`unmatchedAcronyms(text, opts)` returns the multi-letter all-caps tokens a deck's narration
passes through UNCHANGED — neither the built-in lexicon nor the deck's `acronyms:` registry
expands them, so a TTS spells them letter-by-letter. `tools/lint-deck.js` surfaces them as a
**non-blocking** `narration-acronyms` suggestion (never affects the exit code; off under
`--all`), so an author learns what to register without ever hearing audio. It lives in the
Node CLI layer (which can `require` the cadenza package + the shared parser); the pure,
browser-safe `lint-core` cannot reach cadenza (HARD RULE #7). The signal is a display-string
HEURISTIC — an intentional all-caps word (a shouted "GROWTH") may still appear; the hint is
advisory and the author skips what they meant. Common format/web initialisms (`PDF`, `HTML`,
`VTT`, `JSON`, `URL`, `API`, …) that legitimately read letter-by-letter are on a curated
skip-list in the lint so the hint fires on genuinely deck-specific tokens, not noise.

**Still deferred:** the glossary surface that reads a registry entry's `definition` (stored,
unused), and a locale guard. **UNVERIFIED:** audio naturalness and the in-overlay live
composition (no TTS in CI); the spoken-STRING primitives (`getCaption`, `parseCaptions`,
`presentationIndices`, `mergeNarration`, `unmatchedAcronyms`) are unit-tested and the export
chain is verified on the real `.vtt` (HARD RULE #23).

### §16.1 Follow-up — captions strip separately + a Studio caption editor (2026-07-11, SHIPPED)

Two owner-requested refinements landed just after §16 merged (they missed the merge train, so
they ship as their own PR on the same feature line — HARD RULE #17):

**Captions get their OWN strip control — the compose model above is refined, not reversed.** §16
resolved that `--strip-notes` leaves captions alone (a caption is public, a note is private). The
missing half was a way to strip the *caption* channel independently. New flag **`--strip-captions`**
does exactly that, ORTHOGONAL to `--strip-notes`: it scrubs the read-as OVERRIDES — inline
`<!-- caption: -->` AND the front-matter `captions:` map — from the two surfaces where caption text
lands in output: the read-along `.vtt` (those slides fall back to note → projection) and the
re-embedded `source` (envelope + PDF attachment, via the new `notes-core.stripCaptionsFromSource`,
which is structural — it matches the `caption:` prefix, needing no rendered-body set unlike the note
strip). The two strips compose: `--strip-captions` alone → note/projection track; `--strip-captions
--strip-notes` → projection-only, then silent. Caption comments never reach the rendered HTML/PDF
bytes regardless (they're removed by the unconditional `stripCommentNodes` pass), so those two are
the whole leak surface. Verified on the real `.vtt` (inline + front-matter caption words gone, note
words retained) and the `pdfdetach`-extracted embedded source (caption comments gone, notes kept).

**A Caption field in the Studio slide drawer.** The per-slide "This slide" drawer (`SlideContext.tsx`)
already edited the speaker note and the `describe:` accessibility text; it now has a **Caption** field
in the Notes tab, wired to the existing `slide-caption.ts` `getCaption`/`setCaption`, so an author
sets a slide's read-as line by typing rather than hand-writing the comment. It writes only the
`<!-- caption: -->` channel (highest narration precedence), never the presenter-note field, and joins
the Reset baseline. Component-tested (the caption commits as its own comment and coexists with the
note); the live overlay composition remains typecheck-only (no TTS in CI).

**Adversarial trio (red team + Munger inversion + independent checker) — findings folded before merge.**
The core privacy invariant held under all three (no active caption leak, no hang, no crash; the strip
is a strict superset of the reader). Fixed: the front-matter block stripper is now **top-level only**
(a nested key named `captions` under another mapping is preserved) and **byte-preserving** (a CRLF deck
keeps its line endings — the old `split(/\r?\n/)`+`join('\n')` rewrote them); the player-envelope
`config` drops any `captions` key under the flag (belt-and-braces — the engine's shallow parse doesn't
surface the map, but an inline form would echo); the Studio caption sanitizer neutralizes the abrupt
`--!>` close as well as `-->`. Pinned by new tests: a committed **integration** test proves the
orthogonality on the real `.vtt` (caption gone, note retained; both flags → silent) and the reverse
(the note strip keeps captions). Two behaviors documented rather than changed: (1) stripping a caption
that was *masking* a note lets the **note** narrate — call out in the flag help + CHANGELOG, and the
Studio note field shows an override hint when a caption is set; (2) **`describe:` is deliberately NOT a
strippable channel** — it is a screen-reader accessibility equivalent (WCAG), not private presenter
content, so `--strip-notes`/`--strip-captions` leave it intact by design (no `--strip-descriptions`).

## §17 Locale guard — don't anglicize a non-English deck's narration (2026-07-12, SHIPPED, #919)

The §16 deferral is closed. Cadenza's say-as machinery — the built-in lexicon (`lexicon.ts`),
`numberToWords`, and the fiscal/period parser (`FY26` → "fiscal year twenty-six", `40%` → "forty
percent", `1,024` → "one thousand twenty-four") — is all **US-English**. Applied to a deck authored
in another language it silently injects English words into the spoken narration (and shifts caption
timing, since a longer spoken form takes longer). A defensive fix: no current user hits it (English
decks are the norm), so priority:low, but the mangling is real once a non-English deck exists.

**Signal (owner-confirmed): reuse the Marp `lang:` front-matter directive.** It already exists in the
engine's directive allow-list (`lib/engine/directives.js`) and sets the document language for
accessibility, so the deck's language lives in one authored place — no new key to learn or lint.
`isEnglishLang(lang)` (Cadenza's own policy): absent / `en` / any `en-*` region → English (the default,
**byte-identical to today**); anything else → non-English → the guard fires. Rejected a dedicated
`narration-locale:` key (redundant — it would almost always equal `lang:`) and inferring from the
voice/model (the export caption path is voice-agnostic — it times off `pace`, not a voice).

**Behavior (owner-confirmed): bypass the English machinery, KEEP the author registry.** In
`toSpoken`, a non-English deck skips the built-in lexicon + fiscal parser + number-to-words and passes
the display token through — but the author's own `acronyms:` registry still applies (it fires first,
on the whole token AND the punctuation-peeled core, so `CRO` and `CRO,` both expand). The distinction
is deliberate: "don't inject English WE chose," not "strip the author's own expansions" (they'd author
those in their language). English decks reach none of this — the `english` branch is the unchanged
code path.

**Threading (HARD RULE #1).** The language lives once: `frontMatterLang(md)` in
`lib/core/resolve-captions.mjs` (re-exported to the docs via the shared shim), symmetric with
`acronymSpokenMap`/`frontMatterCaptions`. Cadenza owns the *policy* (`isEnglishLang`) since it decides
which decks its English say-as applies to; the producers just extract `lang` and pass the raw string
through `buildTrack` → `toSpoken`. All three caption producers thread it: the CLI/PDF export
(`writeCaptionsSidecar` → `buildReadAlong`), the docs-site in-browser `.vtt` download
(`share-export.ts shareCaptions`), and live Studio Present (`read-aloud.ts` `useReadAloud`/
`warmNarration`, fed by `PresentOverlay`) — so all three agree.

*Verification (HARD RULE #23):* pinned by `isEnglishLang`/`toSpoken` guard cases in cadenza's
`normalize.test.ts` (non-English tokens pass through; English unchanged; author registry honored in
both), `frontMatterLang` cases in `resolve-captions.test.js`, and an end-to-end real-CLI export of a
`lang: fr` deck (its `.vtt` reads the authored French verbatim; the same deck without `lang:` expands
`FY26`/`40%` to English — a byte difference in the caption timing). Audio stays UNVERIFIED (no TTS in
CI) — only the spoken STRING is claimed. Real-browser Studio Present is UNVERIFIED (sandbox blocks
egress); the shared kernel makes its spoken string identical to the CLI's, which IS verified.

*Out of scope (noted, not fixed):* the chart narrators (`lib/core/chart-narration.js`) emit English
prose ("forty percent of the prior stage") by construction — they are English-only pilots (§13.6), a
separate layer from this lexicon/normalizer guard. A non-English deck's chart slide would still narrate
those computed facts in English; locale-aware narrator templates are a deeper, separate follow-up.

## §18 Auto-glossary — the acronym registry's `definition` gets a surface (2026-07-12, #920, owner-confirmed design)

The §16 deferral "the glossary surface that consumes `definition`" is designed and confirmed. The
author acronym registry (`acronyms:` front-matter, #905) stores an optional `definition` per term
that `lib/core/resolve-captions.mjs` parses and carries but nothing consumed — narration speaks only
the `expansion`. This gives `definition` a home.

**The design model — the two open axes and the confirmed picks.**

*Axis 1 — the surface (where a definition appears).* Candidates: (a) a generated glossary appendix
slide reusing the shipped `glossary` component; (b) an on-hover tooltip / `<abbr title>` on first use;
(c) an `<abbr>`/`aria-description` on first use; (d) an export-manifest field only. **Confirmed: (a) +
(d) — a generated glossary slide AND the manifest field.** (a) is highest-value/lowest-risk and reuses
a shipped component (HARD RULE #15); because it's a *source* transform → a normal slide, every surface
(PDF/PPTX/HTML/Studio) renders it by construction — no per-surface work. (d) rides along cheaply: the
term→definition map in the export manifest lets a downstream tool read it without parsing the slide.
Rejected (b)/(c): they reach only interactive HTML (not the PDF/PPTX a boardroom deck ships as) and
need first-use detection + hover UI for a "working gloss" that a reference page serves better.

*Axis 2 — the trigger (how an author opts in).* Candidates: (a) a placed empty `<!-- _class: glossary
auto -->` marker; (b) a deck-level front-matter flag; (c) a CLI/export flag. **Confirmed: (b) —
front-matter `glossary: auto`.** Simplest to author, one deck-level switch, and (unlike a CLI flag) it
lives in the source so every surface agrees. The generated glossary appends at the end of the deck (a
reference appendix); a future "placed marker" for mid-deck control is an easy follow-on if wanted.

*The Studio affordance (owner-requested follow-up).* `glossary: auto` also gets a first-class
**toggle in the deck-setup drawer** — the front matter is the source of truth, the switch is the UI
that writes it. Added as a binary field in the shared config panel (`docs/src/playground/deck-config.js`,
the `createConfigPanel` schema every deck-settings surface mounts), alongside `autosplit`/`paginate`:
on ⇔ `glossary: auto` in the front matter, off removes the key (a deck at the default carries none).
Unlike `autosplit` (export-only), the auto-glossary DOES appear in the live preview (the transform runs
at the shared render chokepoint), so its hint carries no "export only" caveat but does name the
prerequisite — an `acronyms:` registry with at least one definition — so the toggle doesn't read as
broken on a deck without one.

**Shape.** A shared source transform `lib/core/glossary-auto` (ESM, reusing `resolve-captions`'s
`parseNarrationFrontMatter`): when the deck's front-matter carries `glossary: auto` AND the registry
has ≥1 entry with a `definition`, it appends a `<!-- _class: glossary -->` slide whose body is the
entries — sorted alphabetically by term — as the component's nested `- Term` / `  - Definition` list
(the runtime auto-derives the A–Z range pill). Entries with only an `expansion` (no `definition`) are
omitted — there's nothing to define. No qualifying entries → no slide (a no-op, never an empty
glossary). Wired at the two render chokepoints so BOTH surfaces get it from one transform (HARD RULE
#1): the CLI/export builds `rawMd` through it (alongside `preprocessMermaid`), and the docs site runs
it in `render-engine.ts` `renderMarkdown` (the single point every docs render surface — Studio preview,
Share/export — passes through). The export manifest (`lib/core/lattice-doc.js buildManifest`) gains an
optional `glossary` projection carrying the term→definition entries.

*Verification plan (HARD RULE #23):* unit tests on the transform (the append fires only on `glossary:
auto` + definitions; alphabetical sort; expansion-only entries omitted; the emitted markdown renders
through the real `glossary` component to a term/definition table) and the manifest field; an
end-to-end real-CLI render of a demo deck showing the generated glossary slide. Live Studio Present is
UNVERIFIED in the sandbox (blocks browser egress); the shared transform makes its output identical to
the CLI's, which is verified. Out of scope (noted): a placed mid-deck marker; the manifest projection
carries only on the `glossary: auto` opt-in (so a deck that merely defines terms stays byte-identical),
and it's present on both export surfaces (CLI + docs Share) for parity; and multi-slide alphabetical
splitting for a very long registry. On that last point the honest limitation is that a registry with
more defined terms than fit one slide currently overflows a single generated glossary slide (the
emulator prints its standard overflow warning and exports it clipped — the Fit Spine does NOT split a
machine-generated slide, and its "trim content" remedy doesn't apply to one); a dedicated alphabetical
split across slides is the follow-on.

## §19 `big-number` narration — read the figure INTO its caption, no colon hard-stop (2026-07-12, from a live-site report)

**Symptom (live lattice.style, mobile).** On a `big-number` hero slide (a giant "0" with the
caption "boxes to drag — you write Markdown, the engine designs the slide."), the read-aloud
spoke ONLY the number — "zero" — and dropped the caption. The on-screen slide and the caption
line were both correct; only the *spoken* string was wrong.

**Root cause (in the projection text, not the audio layer).** `big-number` authors the figure and
its caption as a bare nested list — `- 0` / `  - caption` — NOT the `<strong>`-wrapped tile a
`kpi`/`stats` uses. It carried no dedicated speech walker, so it fell through to the generic
nested-list join (`renderListItems`), which emits `head: body` — correct for a genuine
*label: value* item, but here it produced **"0: boxes to drag…"**. A colon immediately after a
one-glyph token is a known TTS hazard: many voices treat it as a hard stop (as in a list label or
a clock time) and stop after the token — so the voice said "zero" and skipped the rest. This is a
*text-projection* defect, confirmed by rendering the real deck through the engine + projection:
`"…0: boxes…"` before, `"…0 boxes…"` after.

**Fix.** A dedicated `speakBigNumber(stage)` walker: read each `value` straight into its `caption`
as `"value caption"` (space, no colon), drop a trailing separator glyph on the figure so no stray
colon/dash lands between number and caption, and preserve any intro/eyebrow prose (mirroring
`speakStats`' `pre` capture, so switching off the generic walker can't drop the eyebrow). Dispatched
in `projectDeckToSpeech` exactly like `kpi`/`quote` (`big-number → speakBigNumber || speakGeneric`),
so it rides the ONE shared projection (HARD RULE #1) — the fix lands on all three surfaces (CLI/PDF
export, Share → Captions, live Studio Present) at once. Regression-pinned in
`test/unit/transformers/prose-projection.test.js` (the reported "0 boxes" slide + the canonical "92%"
example, each asserting no `figure:` colon and the kept eyebrow).

**Scope boundary — what this does NOT fix (and why it stays separate, HARD RULE #17).** The same live
report also described a *systematic* "reads faster / skips words" behavior across OTHER slides
(e.g. a `stats` slide). That is a DIFFERENT layer: those slides' projected text is clean — a `stats`
tile reads "components: 53", a colon after a full word, which is correct label:value grammar and NOT
the tiny-token hard-stop. Rendering them through the engine confirms clean spoken strings. So the
"faster/skips" symptom is in the read-aloud *audio/highlight* layer (the silent-estimate word clock vs.
the actual voice), not the projection — and the plain browser voice reports no measured word onsets,
so its highlight rides a pure estimate that its real speaking rate won't match. That surface can only
be driven on a real device (this sandbox has no TTS and blocks browser egress), so per HARD RULE #23 it
is **UNVERIFIED here** and is tracked as separate work, not folded into this text fix.

*Logged off-path gap (HARD RULE #18, from the maker-checker pass — not fixed here).* A slide authored
with a lifted **subtitle** (a second code-only `<p>` after the `<h2>`, the documented "Subtitle labels"
pattern) drops that subtitle from narration/`.vtt`: `eyebrowOf` reads only the *first* `.masthead-lede`
`<p>`, and the subtitle sits in the sibling masthead band, not `.cell-stage`, so a component walker's
`pre` scan never sees it either. Pre-existing (unchanged by this fix) and off the big-number path, so
it's recorded here rather than pulled into this PR.

*Correction (maker-checker).* An earlier draft of this fix also added a `.masthead-lede` guard to the
`pre`-prose scan, on the theory it prevented a double-spoken eyebrow. The checker showed that guard is a
**no-op on real output** — the engine lifts the masthead into a SIBLING band, never inside `.cell-stage`,
so a stage-scoped scan never touches it; the "double" only appeared in a hand-written test fixture whose
shape the engine never produces. The guard and its claim were **reverted** — this fix is exactly the
colon change, nothing more.

---

## Follow-up (2026-07-12): pinning the "skips words / races" regression on the CLOCKED cloud voice

The scope boundary above tracked the "reads faster / skips words" symptom as a separate,
device-only investigation. A fresh live report sharpened it: it reproduces on the DEFAULT voice —
cloud Kokoro "Heart · US", the `openrouter-tts` rung — on multiple slides of the "Welcome to
Lattice" deck (`DECKS[0]`), it is **intermittent**, and **a page refresh fixes it**. It USED TO
WORK → a regression, not a new bug.

**Correction to the earlier theory.** The scope-boundary note above explained the symptom as "the
plain browser voice reports no measured word onsets, so its highlight rides a pure estimate." That
explanation does NOT cover this repro: `openrouter-tts` is a *clocked* rung — it reports a measured
onset + duration per sentence, and `read-aloud.ts` re-anchors each cue to it (`reader.align`). So the
desync lives in the **alignment / audio-clock** path (or the AudioContext lifecycle), not a pure
estimate. The two live hypotheses:

1. *Free-running clock through a synth/decode gap.* The reader rides `audioTimeMs() − base − latency`
   (the shared WebAudio clock, which advances in real time even during the silence between one
   sentence's `onended` and the next sentence's `src.start(0)`). If a mid-deck sentence's synth or
   (iOS) MP3 decode stalls, the highlight races ahead through cues on the estimate during that
   silence, then snaps back when the real onset lands and `align` shifts the tail — reading exactly
   as "skips words / moves fast." Intermittent because it is gated by per-sentence network/decode
   latency, which varies. iOS-plausible (slow MP3 decode; the user is on iPhone Safari).
2. *AudioContext wedge / mid-play text swap.* The one shared `audioCtx` is reused all session and
   never rebuilt (refresh = fresh context), and the `#904` fallback→projection text upgrade can, in a
   narrow race, swap `narrationText` while a read is in flight — tearing down and rebuilding the
   track under the still-playing audio. Fits the "sometimes no sound" half and the refresh-fixes-it
   clue.

**Ruled OUT — the sentence-index cascade.** A tempting theory was that `voice.speak()` filters the
provided spoken sentences (`providedSentences.map(trim).filter(Boolean)`), so an empty/whitespace cue
would drop out and shift every later `onSentenceTiming(index)` onto the WRONG cue — a cascading
skip/rush. This cannot happen: `buildTrack` never emits an empty cue (`splitWords` filters blanks and
skips a cue with no display words), and `toSpoken` returns `''` only for an empty token, so
`cue.words.map(w => w.spoken).join(' ')` is non-empty for every cue. Therefore
`spoken.length === track.cues.length` always and `filter(Boolean)` drops nothing — cue index i always
equals the spoken sentence index the voice times. Confirmed by reading the cadenza segmenter/normalizer;
the invariant is structural, not incidental.

**Why instrumentation before a fix (HARD RULE #23).** iOS Safari audio/timing cannot be exercised in
the sandbox (no WebAudio, no TTS, egress blocked), and a prior session shipped a speculative audio
guess a checker found to be a no-op. So this change lands **only a temporary on-device debug readout**
— gated behind `?readaloud-debug=1`, invisible in normal use — that surfaces, per read: the active
narration source (projection vs. fallback), the live rung/`AudioContext.state`/reader-clock vs.
audio-clock/active cue+word, the spoken-vs-cue count (the mismatch tell), and a per-sentence event log
of `attempt` (voice reached sentence i) vs. `timing` (its measured onset/duration landed). A gap
between an `attempt` and its `timing` is hypothesis 1's signature; a stuck `ctx` state or a mismatched
count is hypothesis 2's. Pushed to the Cloudflare PR preview so the reporter can read it off the real
iPhone; the actual fix follows once the readout names the layer. The readout is removed (or reduced to
a permanent guard) when the root cause is pinned.

### Systematic sandbox audit (deterministic layer, corpus-wide)

To treat this as the systematic issue it is — not one slide — the deterministic **text → track**
layer was audited across **144 real slides**: the Welcome deck (`DECKS[0]`, 7), the full
component/design-system gallery (`test/integration/baseline-decks/gallery.md`, 117), and a 20-slide
slice of the jargon deck (`examples/gallery-jargon.md`). For each slide: `slideToSpeech → buildTrack`,
then compare `spoken.length` (the sentences handed to the voice, after the same `map(trim).filter`
voice-model applies) against `track.cues.length`, and inspect cue shapes.

Result:

- **Invariant breaks: 0 / 144.** `spoken.length === track.cues.length` on every slide of every deck —
  the index-cascade theory is dead empirically as well as by proof.
- **Empty-spoken cues: 0 / 144.** No cue ever collapses to blank, so `filter(Boolean)` never drops one.
- **A real (secondary) systematic risk surfaced: long single cues.** Content-dense slides fold a long
  unpunctuated run (a blockquote, a run-on bullet) into ONE cue — worst cases `gallery#102` (110 words /
  ~41.6 s in a single cue), `#27` (99), `#66` (86). A cue is the re-anchor unit, so a 40 s cue gets ONE
  measured onset; its words are then distributed purely by the *estimate* stretched to the real
  duration, with no correction until the next cue. Over ~100 words, estimate-vs-real proportion error
  accumulates into a visible *within-cue* drift. This is distinct from the primary between-sentence
  race and is a candidate follow-on (sub-cue segmentation, or a better long-cue word model), tracked
  here rather than folded into the diagnostic PR.

So the deterministic layer is cleared corpus-wide, and the "skips words / races" symptom is confirmed
to live in the audio/clock layer — which is exactly what the enhanced on-device readout measures: a
`peakAhead` counter (how many cues the highlight got ahead of the last sentence the voice actually
started) plus a per-sentence `attempt`-vs-`timing` trace that ACCUMULATES across an autoplay pass, so
one run over each deck yields a full-deck trace rather than a single-slide snapshot.

### ROOT CAUSE FOUND (2026-07-12): the colon hard-stop is the "skips words / races" regression

On-device report, unambiguous: on the Welcome deck the voice "reads everything up to the `:` then
skips the rest." That is the SAME colon hard-stop this doc first met in the big-number `0: boxes`
case (#938) — but the earlier scope note was WRONG to confine it to tiny tokens. It confidently
claimed "a `stats` tile reads `components: 53`, a colon after a full word, which is correct
label:value grammar and NOT the tiny-token hard-stop." The device disproves that: Kokoro hard-stops
after ANY trailing colon, full word or not. Verified in-sandbox — `projectDeckToSpeech` on the
Welcome `stats` slide yields `"… components: 53. themes: 14. export formats: 4. source file: 1."`;
every tile is `label: value`, so the voice speaks `components / themes / export formats / source
file` and drops every NUMBER.

**This is ONE root cause for BOTH reported symptoms, and it explains every clue:**

- *"Everything after the colon is skipped"* — the voice hard-stops at the colon (direct).
- *"Reads faster / skips words"* — a hard-stopped clip is SHORT (just "components"), so `align`
  re-anchors the cue to that short measured duration and the cursor crams the whole line
  ("components 53") into it → the highlight races. The audio-clock instrumentation would have shown
  this as a large `peakAhead`; the real cause is upstream, in the text the voice was handed.
- *"Used to work" (a regression)* — #904 SWAPPED the live producer from the Markdown flatten
  (`slideToSpeech`, which emits no `label: value` colon) to the DOM projection (`projectDeckToSpeech`,
  which does). The colon entered live narration at #904.
- *Intermittent + a refresh fixes it* — the projection is async with the colon-free Markdown flatten
  as the instant fallback (#904). Tap play before the projection lands → the fallback (no colon) is
  spoken and it reads fine; after it lands → the projection (with colons) is spoken and it skips. A
  refresh re-runs the race and sometimes the fallback wins.

**Fix (the one canonical place — cadenza `toSpoken`, HARD RULE #1).** Soften a TRAILING colon (and
semicolon) to a COMMA in the SPOKEN form only. A comma is a soft prosodic pause every voice honors
without dropping the tail — and the decks are already full of commas that narrate correctly, so this
is safe by the reporter's own evidence. The DISPLAY word keeps its colon, and since the `.vtt`/caption
serializes DISPLAY glyphs (cadenza/vtt.ts), **no exported byte changes** — only the live TTS audio and
its (colon-vs-comma-identical) word-timing estimate. Verified end-to-end in-sandbox: the Welcome stats
slide now builds cues whose DISPLAY is `"components: 53."` while SPOKEN is `"components, fifty-three."`.
Fixing it in `toSpoken` (not the six projection `label: value` sites) keeps the readable colon in the
caption, catches EVERY colon source at once (stats, kpi, tables, definition lists, state words, authored
notes), and needs no per-walker restructuring. #938's big-number projection fix stays — that colon was
also a DISPLAY-grammar error (the number reads INTO its label), a different concern from this
spoken-only softening.

*Export sign-off (Quality Bar).* This changes the AUDIO path, so it is flagged for sign-off — but the
exported artifacts (`.vtt` display text + timestamps, PDF/PPTX/HTML) are byte-unchanged (confirmed: the
`.vtt` serializes `cue.words[].display`, and colon→comma leaves the word-count estimate identical, so
`test:core`/`test:export` pass unchanged). The behavior to sign off is purely "the live voice now speaks
the value," which the on-device readout confirms.

*The audio-clock instrumentation (the `?readaloud-debug=1` readout) stays* for now — it corroborates the
fix (peakAhead should fall to ~0 on the stats slides once the value is spoken) and remains useful for any
residual between-sentence drift; it is removed once this fix is confirmed clean on device.

### Follow-up (2026-07-12): doubled punctuation in `label: value` captions ("Write.: …")

On-device caption review surfaced a second, related defect: a card title that ends in an
authored period ("- Write.", "- Choose a component." on the Welcome `cards-grid` slide) rendered
as **"Write.: value"** — the projection composes `${label}: ${value}`, and when the label already
carries a terminator the colon doubles it. The prior `renderListItems` lead-strip
(`replace(/[:—–-]\s*$/, '')`) removed a trailing colon/dash but NOT a period, so the period
survived into the join.

**Fix.** One shared `labelValue(label, value)` helper (prose-projection.mjs) that strips a trailing
terminator/separator run (`.!?;:…,—–-`) from the LABEL before appending the colon, then every
`label: value` join site routes through it — `speakStats` (kpi/stats tiles), `speakTable`,
`renderListItems` (nested `- Title` / `  - body` and state markers), and the `<dl>` walker. Now
"Write." → "Write: value"; a label with no trailing punctuation is unchanged. Centralizing it means
the rule can't drift between the four walkers (the previous per-site `replace` already had). This is
a DISPLAY/caption change (unlike the colon→comma spoken softening above): it changes the projected
caption text and therefore the exported `.vtt` display glyphs — flagged for export sign-off, though
`test:core`/`test:export` pass unchanged (no fixture used a terminator-bearing label). Guarded in
`prose-projection.test.js` (the "Write." card asserts no `Write.:` and a clean `Write: …`).
