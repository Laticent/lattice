---
status: proposed
summary: Read-aloud & captions for Lattice, reshaped by an adversarial trio (red team + Munger inversion + independent checker) into TWO products on one shared engine that must NEVER fuse. (1) CADENZA — a pure, framework-free caption/timeline engine (text → cues → words with start/end ms; hybrid timing: text estimate baseline re-anchored by measured TTS sentence spans; a pure clock→active-word cursor; WebVTT/SRT out). (2) v1 = PRESENTER REHEARSAL CAPTION — a sentence-level caption/highlight on the existing Practice stage, over the note Practice already speaks, VERBATIM, on the existing estimate timer; mostly wiring existing parts + a thin highlight UI, no planner, no derivation, no accessibility claim. (3) the ANCHOR (later, separate) = an ACCESSIBLE self-narrating deck that reads the CONFIRMED describe: channel (objective, structure-first, human-confirmed) on the accessible-descriptions ADR's safety rails — never an auto-derived blend of the subjective speaker note with objective facts (the trio's central finding: merging them re-introduces the exact 'a wrong description is worse than none' defect that ADR fixed). The semantics-aware NARRATION PLANNER (per-element READ/EXPLAIN/GLOSS/ANNOUNCE/SKIP) is the anchor's net-new capability — NOT pure (needs DOM bbox), NOT shipped (deterministic chart-data derivation is deferred), so it is a project, not a v1 slice. Drops the earlier 'same experience blind or driving / audio-complete' and 'deterministic chart-insight' overclaims. Design only; nothing built.
---

# Cadenza — the caption/timeline engine, and the read-aloud products on it (2026-07-07)

> **What this is.** A design for reading a Lattice deck aloud with synchronized captions. It began as
> "caption the speaker-note timeline," widened (with the owner) toward "a deck that presents itself
> eyes-free," and was then reshaped by the full adversarial trio (HARD RULE #25) into a **cleanly split**
> plan: one pure engine (**Cadenza**), a small honest **v1** (presenter-rehearsal captions), and a
> separate, safety-railed **anchor** (an accessible self-narrating deck). **This doc is design only —
> nothing is built.** The review ledgers are §12 (first critic) + §13 (the trio).

The name follows the house aesthetic (Vetrina, Indaco, Cuoio): *cadenza* is Italian for **cadence** — the
timing/pacing curve the engine computes.

---

## 1. The one load-bearing decision — two products, one engine, never fused

The design was quietly **two products fused into one**, and the fusion was a defect. The trio's central
finding: a self-narrating *accessibility* track and a presenter's *rehearsal* track draw on **opposite
correctness rules**, and blending them re-introduces the exact hazard the accessible-descriptions ADR
(`2026-07-04`) spent its whole adversarial budget fixing — *"a wrong description is worse than none"* for
someone who can't see the slide. So the plan splits, and the two halves **must not fuse**:

| | **Cadenza** (the engine) | **A — Presenter rehearsal caption** (v1) | **B — Accessible self-narrating deck** (the anchor, later) |
|---|---|---|---|
| What | pure text → timed cues/words + cursor + WebVTT | captions/highlight of the presenter's *own note*, spoken **verbatim**, in Practice | an eyes-free spoken deck that reads the **confirmed `describe:`** channel |
| Register | none (it times whatever text it's given) | **note** — subjective, "what you'd say" | **description** — objective, "what's on the slide," human-confirmed |
| Correctness | n/a | verbatim (the voice ladder already enforces it) | structure-first, no hallucination, **confirm gate** (the ADR's apparatus) |
| Status | net-new, buildable now, pure | **v1** — mostly wiring + a thin highlight surface | a project (needs the planner; not pure; depends on deferred chart work) |

**The rule that falls out of the whole trio:** *never speak an auto-derived blend of the subjective note
and objective facts to a listener who can't see the slide.* The rehearsal product reads the note; the
accessibility product reads the confirmed description; Cadenza is the shared clock underneath. Everything
below serves that split.

## 2. Cadenza — the caption/timeline engine (the shared substrate)

Cadenza is a pure, framework-free library: **give it text, get back a timed caption track** — an ordered
list of **cues** (caption lines), each split into **words** with `{ startMs, endMs }` — plus a pure
**cursor** that maps any clock time to the active `{ cueIndex, wordIndex }`. It **owns no audio and no
DOM**: it emits a timeline and reads an injected clock (the WebAudio `currentTime` during TTS, a plain
timer for a silent read-along, or a scrub bar). Highlighting is the consumer's job — Cadenza returns
indices; the UI toggles a class. This is the `notes-core`/`lint-core` purity discipline, and it's what
lets both products (and a future `.vtt` export) share one timing core.

### 2.1 The timing model — hybrid (estimate baseline + measured re-anchor)

A pure text **estimate** is always available (offline, no audio) — it *is* the silent read-along and the
caption clock. When TTS plays, each sentence's **measured onset + duration** re-anchors its words:

```
scale = Dₖ / estimatedDurationₖ
word.startMs = Tₖ + (word.estStart − cueStart) · scale     // cueStart == sentence start (v1: one cue == one sentence)
word.endMs   = Tₖ + (word.estEnd   − cueStart) · scale
```

The relative rhythm inside a sentence stays the estimate's; the absolute anchor + total match real audio.
No forced-alignment dependency (WhisperX-class) for v1. **v1 fixes one cue == one sentence** so the anchor
unit is unambiguous; sub-sentence caption-line wrapping is deferred (§10).

### 2.2 Display form vs spoken form — the normalization gap (trio finding)

A word carries **two forms**: what's **displayed** (`$4.2M`, `Q3`, `18.5%`) and what's **spoken**
("four point two million dollars," "Q three," "eighteen point five percent"). These diverge in *length* —
one caption token can be five spoken words — so **the timed word set is the SPOKEN set, and the caption
renders the DISPLAY glyphs over it.** Normalization (a deterministic, reversible expansion of
numbers/units/known acronyms) happens **upstream of segmentation**, or the word-highlight mis-maps on
every number and currency. This is a real gap the first draft missed; the `Word` shape is
`{ display, spoken, startMs, endMs, charOffset }`, and timing is computed on `spoken`.

### 2.3 Interop — WebVTT primary, honestly scoped

WebVTT (`.vtt`) is the standard for captions — the **lines** are universally consumed (`<track>`, AT, any
player). WebVTT *also* defines karaoke cue-timestamps (`<00:00:01.234>` + `<c>` spans) for word timing —
but **native players/most screen readers ignore them for highlighting**; the karaoke layer needs a JS
consumer (our cursor) driving `cuechange`. So: **lines are universal; the word highlight is opt-in
machinery on top.** SRT is a lesser line-only export.

### 2.4 Module shape (pure ESM core; the placement claim, re-grounded)

```
lib/cadenza/                 ← pure browser ESM, fs-free, zero Lattice deps, import-boundary gated
  track.js     CaptionTrack — cues[] each with words[] { display, spoken, startMs, endMs, charOffset }
  segment.js   the CANONICAL segmenter — retires THREE live copies (voice-model.splitSentences,
               read-aloud.ts splitForCaption) to re-exports (HARD RULE #15)
  normalize.js the deterministic display→spoken expansion (numbers/units/acronyms), reversible
  cadence.js   the ESTIMATOR — text → per-word/per-cue durations from ONE curated cadence model
  cursor.js    at(timeMs) → { cueIndex, wordIndex }; align(cueIndex, onsetMs, durationMs) → re-anchor
  vtt.js       WebVTT (karaoke) + SRT
  index.js     the public surface (framework-free — zero deps)
```

**Authoring-format constraint (trio fix):** the core is pure browser ESM (no `module.exports`, no Node
built-ins on any re-exported path) so Vite serves/bundles it directly — deliberately **not** the
`notes-core` channel (CJS reached only through a generated esbuild bundle, out of which you can't cleanly
re-export). *The earlier draft cited `lib/core/resolve-spectrum.js` as the "pure ESM" precedent; that was
wrong — it is CJS and imported only by a Vitest test. The constraint stands; the packaging must be
validated against a real Vite-served ESM `lib/` module at build time, not asserted from a bad example.*

## 3. v1 — the presenter rehearsal caption (the small honest slice)

**Decided (owner, aligned):** v1 is a **sentence-level caption/highlight on the existing Practice stage**,
over the note Practice already speaks, **verbatim**, driven by the **existing estimate timer**. The
checker verified this is *mostly wiring existing parts + a thin highlight surface*:

- **Already built (wire it):** the audio (`voice.speak`, wired into Practice), the note text
  (`noteFor` → `notesFromHtml`, with the plan snippet as fallback), a sentence split
  (`splitForCaption`/`splitSentences`), an estimate teleprompter that already works
  (`useReadAloud` in `read-aloud.ts`), autoplay/nav.
- **Net-new (build it):** there is **no synced caption/word-highlight on the Practice stage today** — no
  timeline, no cursor DOM. v1 adds a thin caption/highlight surface on the Practice stage, riding the note.

**What v1 deliberately is NOT** (the trio's scope cut): no narration planner, no per-element policies, no
chart/`describe:` derivation, no engine-side pure core required yet, no VTT export, no drivers (pointer/
reveal), no AI polish, and **no accessibility claim** — it is a *presenter aid*, captions of authored
prose, honestly verifiable on the real Practice surface (HARD RULE #23). Word-level timing + the measured
audio re-anchor + the pure `lib/cadenza/` core are **refinement rungs after v1**, not the floor.

**One cadence source of truth (trio fix).** Three reading speeds exist today — `SPEAK_WPM = 135`
(rehearsal), `WORDS_PER_MINUTE = 155` (read-aloud), and Cadenza's preset. v1 must pick **one** for the
Practice surface (so the dwell coach and the caption highlight can't visibly desync) and retire the
others; the estimator's constant is that single source.

**A rehearsal *mirror*, not a teleprompter (expert lens, §14).** A live caption's failure mode is the
*teleprompter crutch* — it induces *reading* over *delivering*, killing the eye contact and authenticity
that make a talk land (Gallo/Anderson). v1's job is to help the presenter *internalize* the note, so the
caption should be designed to build independence from the exact words (e.g. a "fades as you master it"
mode), never to be leaned on during the real delivery.

## 4. The governing rules (from the adversarial trio)

These constrain *both* products and every later stage. They are the inversion's highest-leverage rules,
kept as binding design constraints:

1. **Never fuse the registers.** No auto-derived blend of the subjective note and objective facts is ever
   spoken to a blind listener. Rehearsal reads the note; accessibility reads the confirmed `describe:` (§1).
2. **EXPLAIN derives only from structured data or human-confirmed `describe:`.** The model may *smooth*
   facts the deterministic backbone already produced, never *source* one; polish is span-diffed against
   the floor (numbers/units/proper-nouns/negations pinned), and a mismatch falls back to the floor.
3. **The audio track alone must beat a naive screen reader, screen-off, as the anchor's acceptance test.**
   Visual drivers (highlight, pointer) never count toward the accessibility contract.
4. **The narration planner is a pure, DOM-free, Node-testable core; its utterance list is the transferable
   asset; a UI is one consumer** — *except* geometry (`bbox`, for a pointer) which is DOM-only and lives
   docs-side (§5).
5. **The deterministic floor ships unedited; no per-slide confidence UI** — surface only the one genuinely
   under-derivable element to fix ("needs a `describe:`"). Silence means trust.
6. **One canonical everything** — one segmenter, one cadence constant, one clock, one structural
   derivation, one gated billing path (reuse the rehearsal planner's `gate`; HARD RULE #24).
7. **Eyes-free transport (skip/replay/scrub/speed) and non-suppressible boundary ANNOUNCE are anchor v1
   requirements, not Later** — without them a blind listener is stranded and the anchor is false.

## 5. The narration planner (product B's capability — deferred, a project, not a slice)

The anchor (B) needs a capability neither product A nor Cadenza provides: turning a *semantically
structured* slide into an ordered spoken **plan** — utterances each `{ display, spoken, policy,
sourceElement, kind, bbox? }` — with a **policy per element**:

| Policy | Applies to | Behavior |
|---|---|---|
| **READ** | title, body, quote, list | speak the words |
| **EXPLAIN** | chart, big-number, table (data) | speak the confirmed `describe:` / structured equivalent — never pixels, never an invented insight |
| **GLOSS** | code, complex diagram | speak *about* it ("a 12-line function that…"), not its content |
| **ANNOUNCE** | slide title, section, chart/table onset | orientation — non-suppressible (rule 7) |
| **SKIP** | eyebrow, pagination, logo, background, decoration | silent |

**Why it is a project, not v1 (checker-verified):**
- **Not pure.** Per-element *policy + text* can be derived from rendered `<section>` HTML (the
  `notes-core`/rehearsal shape), but **`bbox` is DOM-only** — it exists only in the live browser after
  layout. So the planner *splits*: a pure text/policy core + a docs-side geometry layer for any pointer
  driver. It cannot be the single pure engine-side core the first draft imagined.
- **Not shipped.** "Accurate deterministic chart narration from the data" is **not achievable today**:
  the `describe:` ADR **explicitly defers** engine-derived chart data-tables; structure-first is currently
  "enforced at the prompt" (AI, not deterministic, not `$0`). The *numbers* are derivable; the **insight**
  (the Q4 spike, the Q3 dip) is not deterministic. So for a chart the honest v1-of-B behavior is
  **ANNOUNCE + read a confirmed `describe:` if present**, never a synthesized trend.
- **Not a rehearsal.js reimpl (checker correction).** `drawing-board-rehearsal.js` classifies **whole
  slides** into a role and weights **time**; the planner descends to **per-element utterances**. The
  reusable parts are the *role/component→policy idea* and the *two-tier discipline*, not the module.

**Honest scope — not "audio-complete."** The design's own vocabulary (GLOSS/SKIP) concedes the medium
can't be complete: spatial/comparison layouts (a 2×2 *means* position) don't losslessly linearize, and
audio is serial-no-backtrack where sight is random-access. So B targets **"a faithful, honestly-scoped
audio artifact that names what's lost per form,"** not "the same experience blind or driving." The earlier
"same experience / audio-complete" framing is dropped.

## 6. What already exists — the reuse map (and the collisions to resolve)

| Surface | What it gives | Reuse / collision |
|---|---|---|
| `docs/src/playground/drawing-board-rehearsal.js` | 2-tier planner: per-slide role/dwell/why + timed **beats** (`pause`/`eye`/`breathe`/`transition`/`emphasis`), `SPEAK_WPM=135`, gated AI merge | reuse the **gate** + two-tier discipline; **beats ≠ silences**: an `eye` beat ("look up, read the room") is meaningless eyes-free — only `pause`/`breathe` map to audio silence |
| `docs/src/components/studio/read-aloud.ts` | `slideToSpeech` (strips markdown to flat prose, **no semantics**), teleprompter highlight `155 wpm`, voice-ladder playback, autoplay | port the *teleprompter approach* to Practice for v1; retire `splitForCaption`; reconcile 155↔135↔preset to one constant |
| `docs/src/playground/voice-model.js` | the voice ladder (`speak`/`splitSentences`/`onSentence`) | needs onset/duration instrumentation for word-sync (§7); `splitSentences` → re-export of `segment.js` |
| `lib/authoring/notes-core.js` | the note boundary + `describe:` extraction (HARD RULE #1) | the single source both products consume for "what is a note" / "what is a description" |
| `2026-07-04-accessible-descriptions.md` | the `describe:` channel (objective, structure-first, confirm gate) | **B reads this, verbatim-confirmed** — the safety rails |
| `2026-06-16-narrative-step-model.md` | derived-not-authored reveals; the anti-wizbang line §8 | a step boundary is an authored pause in the timeline; one structural derivation feeds both |
| `docs/src/lib/vetrina/` | the pointer/cursor | the *optional* pointer driver for B — meaning-bearing or cut (§8); never counts as accessibility |

## 7. Voice-model instrumentation (a refinement rung, not v1) — small but real plumbing

For word-accurate sync (post-v1), `voice-model` must surface what it discards today: `onSentence` fires
with the **text only**, **before** playback (`:463`); `audioBuf.duration` (`:403`) is dropped; `audioCtx`
(`:351`) is private. The fix reads `ctx.currentTime` at `src.start(0)` (`:412`, the true onset) and
`audioBuf.duration`, and enriches the callback to `onSentence({ index, text, onsetMs, durationMs })`.
**Trio correction:** this is **not** a 3-field read — `playBlob` receives only `(blob, signal)` and knows
nothing of the sentence, so a timing callback must be **threaded into `playBlob`** and keyed to the
*prefetched* sentence. Localized, but real plumbing across two functions. The failure it prevents: keying
the onset to `onSentence` fire-time makes the highlight **lead the voice** by the decode gap.

## 8. Non-goals (what this design refuses)

- **No merged "delivery" register** — the blend of subjective note + objective facts is the defect, not a
  feature (§1, rule 1). Two registers exist *because* they have opposite correctness rules.
- **No "same experience blind or driving" / "audio-complete" claim** — the medium can't keep it (§5).
- **No deterministic chart-*insight* narration** — deferred, unbuilt; charts ANNOUNCE + read confirmed
  `describe:` (§5).
- **No planner, derivation, drivers, VTT, or AI polish in v1** — v1 is verbatim rehearsal captions (§3).
- **No forced alignment** — sentence-anchored proportional timing is the fidelity (§2.1).
- **No second note source / no re-defining a note or a description** — `notes-core` owns both boundaries.
- **No auto-export or auto-speech of unconfirmed AI text to a blind listener** — the confirm gate holds.
- **No pointer/reveal spectacle** — meaning-bearing + degradable, or cut (narrative-step §8).
- **Neither product produces the delivered talk (expert lens, §14).** "Slides are not the show" (Reynolds).
  Product A is a rehearsal *mirror* of the presenter's own note; Product B is a faithful accessible audio
  *edition*. Read-aloud carries the arc/"so what"/WIIFY/close only insofar as an author wrote them — the
  machine never invents them. Corollary inversion to state plainly: **the sparser (better) the deck, the
  more meaning read-aloud loses**, because more of it lived in the speaker.
- **No "narrate everything" default** — the planner is **SKIP-biased opt-in** (restraint / signal over
  noise), not `narrate: on` opt-out. READ refuses verbatim bullet lists (prose or a governing sentence);
  ANNOUNCE must carry real orientation value or degrade to SKIP (reading every title is the agenda-slide
  antipattern); `emphasize` is capped (over-emphasis is no emphasis).

## 9. Staged plan (each its own increment / branch — HARD RULE #17)

1. **This design doc.** Design only.
2. **v1 — presenter rehearsal caption** (§3): a sentence caption/highlight on the Practice stage over the
   verbatim note, on one reconciled cadence constant. Wiring + a thin surface; real-surface verified.
3. **Cadenza pure core** `lib/cadenza/` (`track`/`segment`/`normalize`/`cadence`/`cursor`/`vtt`) with Node
   tests: estimate determinism, re-anchor math, display↔spoken normalization round-trip, VTT/SRT, and the
   3-way segmenter parity (retire `splitSentences` + `splitForCaption`). Import-boundary + ESM gate.
4. **Word-level sync** — the `voice-model` instrumentation (§7) + swap v1's sentence highlight for the
   measured word cursor. Real-surface (screen-on) verification.
5. **The narration planner** (product B, §5) — pure text/policy core + docs-side geometry; charts ANNOUNCE
   + confirmed `describe:`; **screen-OFF acceptance test** (rule 3); eyes-free transport + boundary
   ANNOUNCE (rule 7). A project with its own ADR.
6. **Drivers** (B) — element highlight, the optional Vetrina pointer, narrative-step reveal.

## 10. Later / open questions

- **Deterministic chart data-tables** — the deferred `describe:` work that would let a chart's *numbers*
  (not insight) narrate without a model; prerequisite for richer EXPLAIN.
- **Non-space-delimited scripts (RTL / CJK / Thai)** — the estimator/segmenter are Latin/space-delimited;
  an `Intl.Segmenter` `granularity:'word'` pass is the first extension (one seam, `segment.js`). Flagged,
  not solved. (Adjacent: `2026-06-16-rtl-vertical-text-support.md`.)
- **Reduced motion** — the highlight is content cadence, not vestibular motion: opacity/weight only, never
  sweep/scale; a `still` escape hatch collapses it to a static caption.
- **Sub-sentence caption lines** — if VTT lines need to be tighter than sentences, define how a measured
  sentence span apportions across child cues (v1 sidesteps via one cue == one sentence).
- **The narration DSL — its shape, from first principles (four-lens review, §14).** A serializable
  narration descriptor (`NarrationPlan`) + a fluent builder (the Vetrina `Step[]`/`scene()` analog). The
  review fixed its shape so it can't become the thing the trio forbade:
  - **`NarrationPlan` is compile OUTPUT** the (future) planner emits — never hand-written, never persisted
    (it's `dist/`-class; the deck is always the source, the plan is recompiled).
  - **`register` / `confirmed` are DERIVED and non-authorable** — set by *which `notes-core` extractor
    produced the text* (`notesFromHtml` → note, `descriptionFromHtml` → description) + the confirm gate. So
    the forbidden note+description merge and an unconfirmed EXPLAIN are **unrepresentable**, not merely
    labeled. No verb turns note text into `description` register.
  - **One human authoring face** — sparse markdown *overrides* over a working derived default, a bounded
    closed set `{skip, unskip, correct-spoken, add-`describe:`, coarse hold}`. `spoken` is derived
    (`normalize.js`); `cadence` is typed/relative (a `hold`, an emphasis mark), **never raw ms** in authored
    input (baked ms doesn't survive the §2.1 re-anchor); emphasis anchors to the post-normalize spoken token
    set. The builder is a deferred *code-only* hatch, not a promoted authoring route (a `.pause().emphasize()`
    chain is the per-element animation pane the narrative-step ADR §8.1 bans).
  - **A `narrate:` override is a CONSUMED comment, cloned from `describe:`** in `notes-core` (a
    `NARRATE_MATCHER` + exclusion in `notesFromHtml` + a reader + the Marpit parity-test update) — **or it is
    spoken aloud as a note** (verified: `notes-core` treats any non-pragma, non-`describe:` comment as a
    note). **No `` `hush` `` postfix** — it collides with the QR grammar's opposite meaning, reintroduces the
    invisible-marker anti-pattern that ADR rejected, and is per-element hand-authoring (narrative-step §8.1).
  - **Anchoring reuses the narrative-step derived structural identity** (document-order/role), because the
    rendered model has a stable per-*slide* handle (`data-lattice-slide`) but **no per-*element* handle** —
    a hand-assigned `s3.chart` id is invented and rots on edit.
- **Rhetoric on the subjective side only (open fork for the owner).** The expert lens (§14) is clear that
  what makes narration *exceptional* — a deck-level throughline / Big Idea, inter-slide bridges, the turn,
  the callback, the deliberate hold, the close — is **subjective rhetoric** derivation cannot produce. These
  could be a Product-A authored "talk-script/throughline" layer, but they must stay **forbidden on Product
  B's `describe:`-fed accessibility plan** (they'd re-open the merge). Whether to build that authored
  rhetoric layer at all is an owner call, flagged not decided.

## 11. Gates (per increment)

Pure-core stages: `lint` · unit · `build:check` green; the 3-way segmenter parity + normalization
round-trip tests; maker-checker on the timing kernel (shared, measurement-adjacent — real blast radius).
v1 + later consumers add: a per-feature demo (#9), CHANGELOG `## Unreleased` (#10), real-surface
verification (#23) — screen-**on** for the rehearsal highlight, screen-**off** for the anchor's audio
track (rule 3). No exported PDF/PPTX bytes change until a stage alters an existing artifact, so export
sign-off triggers only there.

## 12. Adversarial review ledger — the first critic pass

An independent critic + fact-check against the real code (before the trio) corrected the original
narrow ADR's oversold "reuse, nothing new" framing to "reuse the split, instrument the clock":
(1) `voice-model` does not expose onset/duration/clock today; (2) the cue-vs-sentence anchor unit was
conflated → pinned one cue == one sentence; (3) a module-format trap in the `splitSentences` re-export →
pure ESM core; (4) a third duplicate segmenter (`splitForCaption`) added to the de-dup; (5) the fluent
builder deferred (no v1 consumer); (6) the confusingly-named adapter folder; (7) overstated WebVTT reach +
a wrong `notes-core` input claim; (8) RTL/CJK, reduced-motion, onset-ordering added to open questions.

## 13. Adversarial trio ledger — what the red team + inversion + checker changed

The widened "presenter for your ears" direction was put through the full trio (HARD RULE #25). It
reshaped the plan structurally; the net effect was to **split one fused product into two that must not
fuse**, cut the v1 scope to something real, and drop two overclaims. What it caught:

1. **The merged "delivery" register reversed the accessible-descriptions ADR's central finding** (all
   three flagged). Merging subjective note + objective facts + auto-derivation + no confirm gate = "a wrong
   description is worse than none," spoken to the listener who can't catch it. **Fixed:** §1 splits the
   products; rule 1 forbids the blend; B reads the confirmed `describe:`.
2. **Rehearsal-first optimizes the *sighted* presenter and validates none of the anchor.** **Fixed:** v1 is
   scoped as an honest *presenter aid* (§3), not the accessibility path; the anchor (B) is separate with a
   screen-off acceptance test (rule 3).
3. **"Accurate `$0` deterministic chart narration" is unachievable today** (checker-verified: chart
   data-tables deferred; insight isn't deterministic). **Fixed:** claim dropped (§5, §8); charts ANNOUNCE +
   confirmed `describe:`.
4. **"Same experience blind or driving / audio-complete" is an overclaim the medium refutes** (GLOSS/SKIP
   concede it). **Fixed:** reframed to "a faithful, honestly-scoped audio artifact" (§5, §8).
5. **Three narration systems colliding** — 135/155/preset wpm, three segmenters, two taxonomies, beats≠
   silences (`eye` is meaningless eyes-free). **Fixed:** one cadence constant (§3), one segmenter (§2.4),
   the beats/silences distinction (§6).
6. **Scope creep** — planner/pointer/reveal/VTT/AI-polish/spin-off loaded into "v1." **Fixed:** cut to the
   verbatim-note caption (§3); everything else staged (§9).
7. **The planner is genuinely new and NOT pure** (`bbox` is DOM-only) and NOT a rehearsal.js reimpl.
   **Fixed:** §5 documents it as a split, deferred project.
8. **Factual fixes:** the `resolve-spectrum.js` ESM precedent was wrong (§2.4); `voice-model`
   instrumentation needs a callback threaded into `playBlob`, not a field read (§7); and the
   **display-form vs spoken-form** gap ("$4.2M" = one token, five spoken words) breaks the single-word-set
   model — added to Cadenza's `Word` shape and normalization (§2.2).

Verdict carried forward: the split is sound; the shared engine (Cadenza) is buildable now; the anchor is a
real project on the `describe:` safety rails, not a v1 slice. The screen-off acceptance test (rule 3) is the
guard that keeps a shipped presenter aid from being mistaken for the accessibility anchor.

## 14. Four-lens review — the DSL + the presentation-expert lens

The narration DSL was put through a second four-lens pass: red team + Munger inversion + independent
checker + a **presentation-design-expert lens** (how the canon — Reynolds, Duarte, Knaflic, Minto,
Anderson/Gallo, Tufte, Weissman — judges an *exceptional* presentation).

**Technical trio (converged):**
1. **`register`/`confirmed` must be DERIVED, not author-written** — else the forbidden merge and an
   unconfirmed EXPLAIN are hand-signable. Fixed in the DSL shape (§10): derived from which `notes-core`
   extractor produced the text; the merge is *unrepresentable*.
2. **One human authoring face** — sparse markdown overrides over a derived default; `NarrationPlan` is
   compile output (never hand-written/persisted); the builder is a deferred code-only hatch (§10).
3. **Verified collisions:** `<!-- narrate: skip -->` is spoken aloud today (needs a `describe:`-style
   consumed matcher); `` `hush` `` collides with the QR grammar + is invisible + is the per-element
   hand-authoring the narrative-step ADR bans. Dropped (§10).
4. **No stable per-element handle exists** in the rendered model (only per-slide `data-lattice-slide`) —
   anchoring must reuse the narrative-step derived structural identity, not invented ids (§10).
5. **Authored cadence as raw ms is a defect** — mechanics, a second cadence source, and it doesn't survive
   the §2.1 re-anchor; hints become typed/relative, resolved by the one estimator (§10).

**Presentation-expert lens (the ambition):** the design was *"defensively excellent and rhetorically
modest"* — safe, but walled off from what makes a talk exceptional (the throughline, the "so what," the
WIIFY, the turn, the close). "Slides are not the show" (Reynolds); **the sparser/better the deck, the more
meaning read-aloud loses.** Concrete folds: neither product is the delivered talk (§8); SKIP-biased opt-in,
READ refuses bullet lists, ANNOUNCE must carry orientation (§8); a rehearsal *mirror* not a teleprompter
crutch (§3); `describe:` maps almost exactly onto professional audio-description standards (B's strongest
alignment), with radio/audiobook craft (recap/foreshadow/chapter transport) as the bar above "beat a screen
reader." The rhetorical moves that make it exceptional are **subjective**, so they belong on the authored
side only and stay forbidden on B's `describe:`-fed plan (§10 open fork).

*Framing note: this ledger records what the review found against today's code. The owner's direction is to
build the future clean rather than wire today's half-baked read-aloud surfaces — so the craft + trust
findings here are kept as the quality bar, while the "defer / smallest-slice / reuse-existing" framing is
superseded by a forthcoming north-star pass aimed at the expert "exceptional" standard.*
