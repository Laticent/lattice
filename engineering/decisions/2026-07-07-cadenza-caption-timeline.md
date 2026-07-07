---
status: proposed
summary: The self-delivering presentation — a deck that delivers its ARGUMENT aloud (the throughline, the "so what", the arc, the close) as a talk worth hearing, so a blind listener, a driver, and a presenter rehearsing all get the same thing. Reframed (owner direction) from "read the slides aloud" to an Apple-style bet on what people will need, not what they ask for; today's read-aloud/rehearsal code is PRIOR ART, not the foundation. The unlock: the expert canon says derivation can't manufacture the arc/so-what — so we DON'T derive it, we AI-DRAFT it and a HUMAN CONFIRMS it (the proven author-owned/AI-accelerated/human-confirmed model from the describe: channel, applied to the whole talk). The trust architecture is what makes the boldness safe: facts are STRUCTURE-FIRST (never hallucinated numbers), the model DRAFTS but never owns correctness, nothing speaks unconfirmed, and the craft invariants hold (no invisible authoring markers, real structural anchoring, one segmenter/one cadence/one clock). CADENZA is the timing/caption engine underneath (text → cues → words with display/spoken forms + start/end ms; hybrid timing: estimate baseline re-anchored by measured TTS; pure clock→word cursor; WebVTT/SRT). The narration DSL is designed to carry RHETORIC (throughline, bridge, turn, hold, close), sparse authoring over an AI draft, with register/facts derived+confirmed (never a hand-authored lie). Honest ceiling kept: not a replacement for a skilled human delivering live to a specific room — but a genuinely good talk when no such human is present (async, accessibility, driving, rehearsal). Design only; nothing built. Review ledgers (first critic · trio · four-lens expert) at §12-14.
---

# The self-delivering presentation — Cadenza and the narration engine (2026-07-07)

> **The north star.** A Lattice deck can **deliver its own argument aloud** — the throughline, the "so
> what," the arc, the turn, the close — as **a talk worth hearing.** A blind listener, someone driving,
> and a presenter rehearsing all get the *same* thing: the deck presented, by voice. The AI **drafts** the
> spoken narrative; a **human confirms** it (the presenter is editor-in-chief). This is design only —
> nothing is built. The name **Cadenza** (Italian, *cadence*) is the timing/caption engine underneath it.

This ADR was reshaped several times with the owner and hardened by three adversarial review rounds
(a first critic, the full trio, and a four-lens pass including a presentation-design expert). The **craft
and trust findings** from those rounds are kept as the quality bar (they're what make an ambitious feature
*safe*, not incrementalism). The **"defer / smallest-slice / wire today's half-baked read-aloud" framing is
retired** on the owner's direction: we build the future clean, and treat the existing read-aloud/rehearsal
code as **prior art, not foundation.** Ledgers: §12 (first critic), §13 (trio), §14 (four-lens/expert).

---

## 1. Why this, why now — the bet

The modest version of this feature is "read the slides aloud." The presentation canon is blunt that this
is the *wrong* target: **"slides are not the show" (Reynolds)** — the meaning of a good deck lives in the
speaker's mouth, and the sharpest consequence is an inversion worth stating plainly:

> **The better (sparser) the deck, the worse it reads aloud** — because more of its meaning was carried by
> the presenter. Reading slide contents aloud rewards the bullet-heavy "slideument" experts condemn.

So the bet is not "narrate the contents." It is **"deliver the argument"** — the one thing that makes a
presentation exceptional and the one thing reading-aloud misses: the throughline (Anderson's spine,
Knaflic's Big Idea, Minto's answer-first), the "so what," the WIIFY / Point B (Weissman), the tension→
resolution turn (Duarte), the memorable close (the Heaths' S.T.A.R.). Nobody will *ask* for "my deck should
be able to present itself as a great talk" — the same way nobody asked for the storyboard/Vetrina
self-driving walkthrough before it existed. We build what they'll need. That is the innovation.

## 2. The unlock — draft the narrative, don't derive it

The expert lens delivered the pivotal finding: **derivation is structurally incapable of the arc.**
Per-slide, per-element derivation is *local and audience-blind*; the throughline, the "so what," and the
close are *global and adaptive*. You cannot compute them from the slide.

The old design treated that as a ceiling ("faithful but rhetorically modest, and we honestly decline to
fake it"). **The north star's answer is different: don't derive the narrative — AI-draft it, human-confirm
it.** The model *proposes* the spoken argument (the throughline, the bridges, the close); the author
*edits and confirms* it. This is exactly the model already proven in the `describe:` accessibility channel
— **author-owned, AI-accelerated, human-confirmed** — lifted from one alt-text field to the whole talk. It
is what gets us past "modest" to "exceptional" without asking a machine to own correctness.

## 3. The trust architecture — what makes the boldness safe

Being bold about the *narrative* is safe only because we are strict about *truth*. Four invariants,
carried from the review rounds, are the price of ambition:

1. **Facts are structure-first — never invented.** Every number, quantity, and claim-of-fact in the spoken
   narrative traces to the data that drew the slide (the chart's series, the big number, the table). The
   model may *phrase* a fact; it may never *source* one. A hallucinated figure spoken with confidence to a
   listener who can't see the slide is the cardinal failure ("a wrong description is worse than none").
2. **The model drafts; it never owns correctness.** Every AI-drafted narrative is a *proposal*. Nothing is
   spoken as the deck's voice until a human confirms it; unconfirmed drafts don't ship and don't play.
3. **Objective facts and subjective framing stay legible.** The persuasive framing is the author's (and,
   once confirmed, that's exactly what a blind listener *should* get — the same talk everyone gets, not a
   dry inventory). But the *facts* it carries remain structure-first and checkable, so "confirm" is a real
   act, not a rubber stamp over a plausible fabrication. The `describe:` objective channel still exists as
   the WCAG text-alternative for assistive tech parsing the export; the *talk* is the richer experience.
4. **The craft invariants hold** (from the trio/four-lens, kept regardless of framing): no invisible
   authoring markers; anchoring reuses real structural identity, never invented ids; one segmenter, one
   cadence source, one clock, one gated billing path (the user spends their own key — HARD RULE #24).

## 4. The layers

| Layer | What it is | State |
|---|---|---|
| **The narrative** | the AI-drafted, human-confirmed spoken *argument* — the new, valuable, hard thing. Draws on slide content + structure-first facts + the author's intent/notes; expresses rhetoric. | the heart; net-new |
| **Cadenza** (§5) | the timing/caption engine: text → cues → words (display + spoken forms) with start/end ms; hybrid timing; pure clock→word cursor; WebVTT/SRT | buildable now, pure |
| **The narration DSL** (§6) | how the narrative is expressed + refined — sparse authoring over the AI draft, designed to carry *rhetoric* (throughline, bridge, turn, hold, close), facts derived+confirmed | designed from first principles |
| **Delivery surfaces** (§7) | the voice (the existing voice ladder), synced captions + word highlight, the optional pointer, eyes-free transport (skip/replay/scrub/speed) | drivers on one clock |

One engine, several **consumers** — not separate products: the **presenter** (rehearse, then deliver or
hand off); the **eyes-free listener** (blind, or driving — the equality the north star demands); the
**async recipient** ("watch this deck" with no presenter); the **accessible export** (a `.vtt` /
audio edition). The trust architecture (§3) is what lets one confirmed narrative serve all of them.

## 5. Cadenza — the timing/caption engine (the substrate)

Cadenza is a pure, framework-free library: **give it text, get back a timed caption track** — cues
(caption lines), each split into words with `{ display, spoken, startMs, endMs }` — plus a pure **cursor**
mapping any clock time to the active `{ cueIndex, wordIndex }`. It owns **no audio and no DOM**: it emits a
timeline and reads an injected clock (WebAudio `currentTime` during TTS, a plain timer for a silent
read-along, or a scrub bar). Highlighting is the consumer's job. This is the `notes-core`/`lint-core`
purity discipline; it's what lets every surface share one clock.

### 5.1 Timing — hybrid (estimate baseline + measured re-anchor)
A pure text **estimate** is always available (offline). When TTS plays, each sentence's **measured onset +
duration** re-anchors its words (`scale = Dₖ/estDurₖ`; words fill `[Tₖ, Tₖ+Dₖ]`). No forced alignment for
v1. One cue == one sentence, so the anchor unit is unambiguous.

### 5.2 Display form vs spoken form
A word carries **two forms**: displayed (`$4.2M`, `Q3`) and spoken ("four point two million dollars," "Q
three"). They diverge in length — one caption token can be five spoken words — so **the timed word set is
the SPOKEN set; the caption renders the DISPLAY glyphs over it.** Normalization (deterministic, reversible)
runs *upstream of segmentation*. `Word = { display, spoken, startMs, endMs, charOffset }`.

### 5.3 Interop — WebVTT primary, honestly scoped
WebVTT lines are universally consumed; its karaoke cue-timestamps carry word timing but native players
ignore them for highlighting, so the word highlight needs a JS consumer (our cursor). SRT is line-only.

### 5.4 Module shape (pure ESM core)
```
lib/cadenza/                 ← pure browser ESM, fs-free, zero Lattice deps, import-boundary gated
  track.js  segment.js  normalize.js  cadence.js  cursor.js  vtt.js  index.js
```
`segment.js` is the canonical segmenter (retiring the three live copies — `voice-model.splitSentences`,
`read-aloud.ts`'s `splitForCaption`). Pure ESM so Vite serves it directly (validate packaging against a
real ESM `lib/` module — the earlier `resolve-spectrum.js` precedent was wrong: it's CJS).

## 6. The narration DSL — designed to carry rhetoric

The DSL is how a narrative is *expressed and refined* — a **sparse authoring surface over the AI draft**,
not a from-scratch scripting chore. Its point of difference from the old sketch: it is built to express the
**rhetorical moves** the canon prizes, not just element disposition. Three faces, one grammar:

- **`NarrationPlan`** (data) — the compile target Cadenza consumes and the planner emits. **Compile output,
  never hand-written or persisted** (it's `dist/`-class; the deck + confirmed narrative are the source).
- **markdown authoring** (what a human touches) — a small, opt-in override surface over the AI draft.
- **`script()` builder** (programmatic) — the Vetrina `scene()` analog, for library/spin-off consumers.

**The vocabulary is two-tier.** *Disposition* verbs decide what to voice — READ (prose) · EXPLAIN (a chart
via structure-first facts) · GLOSS (speak *about* code, not its content) · ANNOUNCE (orientation, and it
must carry real orientation value or degrade to SKIP) · SKIP (decoration; the planner is **SKIP-biased
opt-in**, restraint over "narrate everything"). *Rhetoric* verbs — new, and the reason the DSL exists —
carry the argument: **throughline** (the Big Idea / deck spine), **bridge** (Minto's inter-slide transition
— "having seen the cost, now the payoff"), **turn** (the tension→resolution pivot), **hold** (a
*rhetorical* silence — "let it land" — meaningful eyes-free, unlike the retired sighted `eye` beat),
**close** (the S.T.A.R. / the ask).

**The rules that keep it honest** (from the four-lens pass, §14) — the DSL is designed so the trust
architecture is *structural*, not a discipline:
- **`register` and `confirmed` are DERIVED, not author-written** — set by which `notes-core` extractor
  produced the text + the confirm gate. The forbidden auto-fusion of unconfirmed spin with fact is
  **unrepresentable**, not merely discouraged.
- **Rhetoric verbs live on the AUTHORED/confirmed side only** — they are subjective by nature; they're
  drafted by the AI and confirmed by the human, and are never emitted onto the objective `describe:` alt
  channel that assistive tech consumes as fact.
- **READ refuses verbatim bullet lists** (prose or a governing sentence — the anti-"death by narrated
  bullets" rule); `emphasize` is capped (over-emphasis is none).
- **`spoken` is derived** (normalize.js); **`cadence` is typed/relative** (a `hold`, an emphasis mark),
  never authored raw ms (baked ms doesn't survive the §5.1 re-anchor).
- **A `narrate:` override is a CONSUMED comment** (a `describe:`-style matcher in `notes-core` + the Marpit
  parity-test update), or it is spoken aloud as a note. **No invisible postfix marker** (a `` `hush` ``
  collides with the QR grammar and is the per-element hand-authoring the narrative-step ADR §8.1 bans).
- **Anchoring reuses the narrative-step derived structural identity** — there is no stable per-*element*
  handle in the rendered model today (only per-slide `data-lattice-slide`), so invented `s3.chart` ids rot.

## 7. Delivery surfaces (drivers on one clock)

The voice is the existing **voice ladder** (`voice-model.js`: OpenRouter TTS → in-browser Kokoro → silent
floor; the user's own key). Word sync needs a small instrumentation of that ladder — expose each sentence's
measured onset (`ctx.currentTime` at `src.start(0)`) + duration (`audioBuf.duration`), threaded through
`playBlob` and keyed to the prefetched sentence (keying to `onSentence` fire-time makes the highlight *lead*
the voice by the decode gap). Other drivers — synced captions + word highlight, the optional Vetrina
pointer (meaning-bearing or cut), narrative-step reveal, and **eyes-free transport** (skip/replay/scrub/
speed + non-suppressible boundary announcements) — all ride Cadenza's one clock. Transport is a first-class
requirement, not a Later: without it an eyes-free listener is stranded.

## 8. Honest ceilings — what this is not

Ambition, bounded by honesty:

- **Not a replacement for a skilled human delivering live to a specific room.** Authentic voice, reading
  the audience, and Q&A stay human. This is a genuinely good talk *when no such human is present* — async,
  accessibility, driving, or as a rehearsal reference.
- **Audio can't be lossless for every form.** GLOSS/SKIP concede it: spatial/comparison layouts (a 2×2
  *means* position) don't fully linearize; audio is serial-no-backtrack. The narrative names what it
  summarizes rather than pretending completeness.
- **Facts are never invented; nothing speaks unconfirmed** (§3). The model proposes; the human owns.
- **A live caption is a rehearsal *mirror*, not a teleprompter crutch** — designed to build independence
  from the exact words (fades as mastered), never to induce reading over delivering.
- **The objective `describe:` channel is not replaced** — it remains the WCAG text-alternative for AT
  parsing the export; the talk is the richer, confirmed, persuasive experience layered above it.

## 9. Prior art vs. what we build fresh

Today's surfaces are **prior art that proves the appetite, not the foundation to minimally wire**:

- `docs/src/components/studio/read-aloud.ts` (flat `slideToSpeech` + teleprompter), the Practice-mode
  read-aloud wiring, and `drawing-board-rehearsal.js` (per-slide roles/dwell/beats, two-tier AI merge) are
  **prior art** — their *ideas* (two-tier draft+confirm, role-aware pacing) inform the engine; their code
  is not what we extend.
- The genuinely load-bearing, correct primitives we DO build on: `notes-core.js` (the note/`describe:`
  boundary — HARD RULE #1), the `voice-model.js` voice ladder, the `describe:` structure-first channel, and
  the narrative-step structural identity. These are correct and shared; the rest is built clean.

## 10. Staged plan (each its own branch — HARD RULE #17)

Ordered by the vision, not by what's cheapest to wire:

1. **This design doc.** Design only.
2. **Cadenza engine** `lib/cadenza/` (§5) — pure, Node-tested (estimate, re-anchor, display↔spoken
   normalization, VTT/SRT, the segmenter de-dup). The buildable substrate everything rides.
3. **The narrative draft+confirm loop** — the heart: AI drafts a slide/deck's spoken argument
   (structure-first facts + rhetoric), the author confirms/edits, it's stored as the deck's voice. The
   `describe:` author-owned/AI-accelerated/human-confirmed pattern, generalized.
4. **Delivery** — the voice-ladder instrumentation (§7) + synced captions/word highlight + eyes-free
   transport, over a real deck. Screen-on (presenter) and screen-off (eyes-free) acceptance tests.
5. **The rhetoric DSL** (§6) — the authoring surface + the rhetoric vocabulary, once the draft+confirm loop
   shows where human refinement is actually needed.
6. **Reach** — the optional pointer, narrative-step reveal, the accessible `.vtt`/audio export edition.

## 11. Open questions

- **How much narrative can the AI draft well** from a real deck (throughline, bridges, close) before the
  human edit — the quality of step 3's draft is the whole product; it needs a measured study on real decks.
- **The confirm UX** — how a presenter reviews/edits a drafted talk efficiently (per-slide? deck-level
  throughline first?) without it becoming a chore that defeats "reduce the presenter's burden."
- **Structure-first fact extraction** — the deferred chart data-table derivation (`describe:` ADR) is the
  prerequisite for a chart's *numbers* to narrate deterministically; the *insight* is the AI's draft.
- **Non-space-delimited scripts (RTL/CJK)** — `Intl.Segmenter` `granularity:'word'` at the `segment.js`
  seam. **Reduced motion** — the highlight is content cadence (opacity/weight only; a `still` collapse).

## 12. Adversarial review ledger — the first critic pass
An independent critic corrected the original narrow ADR's "reuse, nothing new" framing: `voice-model` has
no onset/duration/clock today; pinned one cue == one sentence; pure ESM core (not the notes-core CJS
channel); the third duplicate segmenter (`splitForCaption`); WebVTT reach + a `notes-core` input claim
overstated; RTL/CJK, reduced-motion, onset-ordering flagged.

## 13. Adversarial trio ledger — red team + inversion + checker
The widened direction was put through the full trio (HARD RULE #25): it forbade the auto-derived
note+fact merge ("a wrong description is worse than none"); verified `voice-model` needs onset
instrumentation (callback threaded into `playBlob`); verified accurate deterministic chart *insight* is
unbuilt (charts state facts, the AI drafts the reading); killed the "same experience / audio-complete"
overclaim; reconciled the 135/155/preset cadence collision and the three segmenters; and established the
craft rules the trust architecture (§3) now encodes. (Its "two separate products / smallest slice" framing
is superseded by the north star: one confirmed narrative serves all consumers.)

## 14. Four-lens ledger — DSL + the presentation-expert lens
The DSL got red team + inversion + checker + a **presentation-design expert** lens. Technical trio:
`register`/`confirmed` must be derived (the merge unrepresentable); one human authoring face over the
draft; verified collisions (`<!-- narrate: skip -->` is spoken today; `` `hush` `` clashes with the QR
grammar + is invisible + is banned per-element authoring); no per-element handle exists (anchor by
structural identity); authored raw-ms cadence is a defect. **Expert lens (the ambition):** the design was
*"defensively excellent and rhetorically modest"* — and that critique is what produced this whole reframe.
Its principles now shape the design: "slides are not the show" (§1); the arc/so-what/WIIFY/turn/close are
what make it exceptional and derivation can't reach them, so **AI-draft + human-confirm** does (§2);
SKIP-biased opt-in, READ refuses bullets, ANNOUNCE must orient (§6); rehearsal is a mirror not a crutch
(§8); `describe:` maps onto professional audio-description standards, with radio/audiobook craft as the bar
(§8); rhetoric is subjective → authored/confirmed side only (§6). This ledger's craft findings are kept as
the quality bar; its incremental framing is superseded by §1–§4.
