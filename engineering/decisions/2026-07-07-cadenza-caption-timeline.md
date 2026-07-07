---
status: proposed
summary: Cadenza — a separate, pure, framework-free library (the Vetrina/notes-core shape) that turns a slide's or deck's narration text into a TIMED CAPTION TRACK (readable caption lines, each split into words carrying start/end times) so a consumer can highlight the word being spoken now. One data model, three payoffs — accessibility closed captions (WebVTT/SRT, with WebVTT's own karaoke word-timestamp syntax), a read-along word highlight with NO audio required, and the clock a future text-to-speech feature rides. Timing is a HYBRID two-tier model mirroring the voice ladder: a deterministic text ESTIMATE is the always-available baseline (offline, no audio), and when TTS plays each sentence's MEASURED onset + duration re-anchors its words proportionally within the measured span — no forced-alignment dependency for v1. The library owns NO audio and NO DOM: it emits a timeline plus a pure clock->active-word cursor the consumer ticks off any clock (WebAudio time, a plain timer, or a scrub bar). Reuses the STORYBOARD WINS — the three-layer authoring model Vetrina proved: a low-level total primitive (CaptionTrack + cursor), a declarative DESCRIPTOR (narration + cadence intent as round-trippable data, the Step[] analog), and an ergonomic fluent BUILDER that compiles to it. The CORE is designed to SPIN OFF as its own zero-dependency open-source library — it imports nothing Lattice-specific (import-boundary gate), so the notes-core reuse (HARD RULE #1) lives in a thin Lattice ADAPTER at the edge, never in the core. Lands the read-aloud ADR's two deferred items ("streaming + clock sync", "pause-beats as silences / modeled delivery") and is held to Vetrina's bar (designed by subtraction, hardened by the adversarial trio before the winner ships). Design only; nothing is built yet.
---

# Cadenza — the caption-timeline library (2026-07-07)

> **What it is.** Give Cadenza a slide's narration (its speaker note, or a prose fallback) and it
> returns a **CaptionTrack**: an ordered list of **cues** (caption lines you'd actually display),
> each split into **words** with `{ startMs, endMs }`. A tiny, pure **cursor** maps any clock time
> to "the cue and word that are active right now." That single artifact serves three consumers at
> once — a screen reader / video player (via a standard **WebVTT** file), a read-along **word
> highlight** in the UI, and a future **text-to-speech** run that needs to know when to fall silent
> and which word it's on.

This is the **design contract**, in the shape of the Vetrina ADR: the model, the API surface, the
timing math, what is deliberately left out, and why. **Scope of this doc is design only** — no code
lands with it. The build is staged in §11.

The name follows the house aesthetic (Vetrina, Indaco, Cuoio): *cadenza* is Italian for **cadence** —
the timing-and-pacing curve that is the whole point of the library.

---

## 1. Why this is a middle layer, not a from-scratch build

The instinct on hearing "closed captions with word timing and TTS" is that it's a large new
subsystem. It isn't — because the two hard halves already exist in the tree, and the piece missing
between them is exactly this timeline. Cadenza is the **connective tissue**, and naming it as its own
library keeps that tissue pure, testable in Node, and reusable by every render path (the same
discipline that makes `notes-core.js` and `lint-core.js` load-bearing).

| The half that exists | Where | What it already gives us |
|---|---|---|
| **The script** — what to speak, per slide | `lib/authoring/notes-core.js` | The single source of truth for the note/non-note boundary (HARD RULE #1). Cadenza **consumes** it; it never re-derives what a note is. |
| **Playback + a clock** — audio, sentence by sentence | `docs/src/playground/voice-model.js` | `speak({ onSentence })` already segments into sentences, prefetches one ahead, plays over an owned WebAudio context, and can abort mid-note. It exposes the two facts a highlighter needs: **when each sentence starts** and **a `currentTime` to poll**. |
| **The estimate primitive** — in miniature | `docs/src/lib/vetrina/storyboard.ts` (`readMs`) | A sentence-level reading estimate (`≈ 300 + 200·words`). Cadenza generalizes it to **word granularity** — which is what makes a read-along work with *no audio at all*. |

The read-aloud decision doc (`2026-06-14-read-aloud-kokoro.md`) even names the two open items this
library closes, in its own §Later:

- **"Streaming + clock sync"** (its Open Q #2) — keep the highlight in lockstep with the per-slide
  dwell/pause clock over both the OpenRouter response stream and Kokoro's splitter.
- **"Pause-beats as silences (modeled delivery)"** — thread the rehearsal plan's timed beats
  (`pause` / `eye` / `breathe`) into the narration so the voice holds its breath where the coach says
  "let the number land," instead of a flat TTS dump.

Cadenza is where both of those live, because both are fundamentally **"a timeline of when words and
silences happen"** — a data problem, upstream of any audio.

---

## 2. The one idea — a timeline is data; the clock is someone else's

Cadenza **produces a timeline and reads a clock. It never owns audio and never touches the DOM.**
That single constraint is what keeps it a clean library rather than a tangle bolted onto Practice
mode, and it is the direct analogue of Vetrina's "theater vs. substance":

- **The timeline is pure data** — `CaptionTrack` is plain objects with millisecond timings and
  character offsets back into the source text. It computes identically in Node, a CI gate, and the
  browser (the `notes-core` / `lint-core` property).
- **The clock is injected.** The consumer decides what drives time: the WebAudio `currentTime` while
  TTS plays, a plain `requestAnimationFrame` timer for a silent read-along, or a user dragging a
  scrub bar. Cadenza's `cursor.at(timeMs)` is a pure function of the timeline; it does not start,
  stop, or know about audio.
- **Highlighting is the consumer's job.** Cadenza hands back `{ cueIndex, wordIndex }`; the UI
  toggles a class. Cadenza ships no CSS and imports nothing but its own modules (an import-boundary
  gate enforces it, exactly as Vetrina's core is fenced to its folder).

Two properties fall out, and they are the entire value:

1. **It works with zero audio.** Captions and a read-along highlight are available the instant you
   have text — no TTS, no network, no model download. That is a genuine **accessibility** win on its
   own (a deaf-blind reader gets a WebVTT file; a low-vision reader gets a synced read-along at their
   own pace), not merely a TTS accessory.
2. **The same timeline drives real speech.** When TTS *is* playing, the measured audio re-anchors the
   estimate (§6), so the highlight tracks the actual voice — and the same cue boundaries tell the
   voice where the authored silences go.

---

## 3. Three ways to author, one timeline — the storyboard wins, reused

We are not inventing an authoring model; we are **reusing the one Vetrina proved**. Its
storyboard/scene/primitive stack (a *low-level total primitive*, a *declarative descriptor as data*,
and a *fluent recording builder* on top) is a genuine win — it lets a layer optimize for authoring
without ever losing the escape hatch, because everything compiles down to the same substrate. Cadenza
adopts the same three layers, one timeline:

| Layer | What it is | Reach for it when |
|---|---|---|
| **`CaptionTrack` + `cursor`** (the primitive) | the total substrate — cues/words/times as data + the pure clock→word map. Everything below compiles to this. | you have timings already (a measured track, an imported `.vtt`) and just need to play/scan/export them. |
| **`Script` descriptor** (the DSL as data) | narration + *cadence intent* as a round-trippable, serializable data model — an ordered list of `Line`s carrying text and typed pacing hints (`emphasis`, `pause`, `beat`, `rate`). The **`Step[]` analog**. | you're describing narration declaratively (a deck's notes → a script) and want it to survive a round-trip through storage or the wire. |
| **`script()…build()`** (the fluent builder) | an ergonomic recorder; `build()` ≡ compile the recorded `Line[]` to a `Script`, then to a `CaptionTrack`. The **`scene()` analog**. | you're hand-authoring cadence and want chaining + readability. |

They **compose and are isomorphic** (Vetrina's discipline: `scene()` is *defined as*
`storyboard(seed, this.toData())`, one interpreter, no drift). So `script().say('…').pause(400).emphasize('never').build()`
lowers to the same `Script` descriptor a deck import produces, which lowers to the same `CaptionTrack`
the cursor plays. A descriptor is the **serialization boundary** — the thing a `.lattice` project or a
future collaboration layer stores, exactly as a `Step[]` is for Vetrina.

The **cadence model (§5.6) is the descriptor's vocabulary** — the typed pacing hints are a small,
curated set (not raw ms), mirroring how Vetrina froze its five-gesture alphabet. A new hint must earn a
new *meaning*, or it doesn't join the set.

## 4. Built to spin off — the core is a standalone library

The stated intent is that Cadenza **eventually spins off as its own open-source library**, the way
Vetrina was designed to. That is a *design constraint now*, not a someday-refactor — it dictates where
the seams go, so extraction later is a `git mv`, not a rewrite:

- **The core imports nothing Lattice-specific.** `track` · `segment` · `cadence` · `script` · `cursor`
  · `vtt` depend only on the DOM-free JS runtime (like Vetrina's core, which imports nothing but the DOM — and
  Cadenza needs even less: it's pure data, no DOM). An **import-boundary gate fails the build** if
  anything in the core reaches outside the folder, so the fence can't rot (the same mechanism that
  keeps Vetrina self-contained).
- **Lattice reuse lives in ADAPTERS at the edge, never in the core.** The `notes-core` reuse (HARD
  RULE #1) and the rehearsal-beats reuse are **adapters** that feed *plain text and typed hints* into
  the standalone core — they sit *outside* the fenced core (in the Lattice consumer), so the core has
  zero Lattice knowledge. Cadenza-the-library takes a string and gives a track; Cadenza-in-Lattice
  wires the note boundary and the coach beats to it. This is the only way "don't reinvent `notes-core`"
  and "spin off a clean core" both hold: reuse at the seam, purity at the center.
- **Framework-free, zero-dep, buildless-friendly, richly documented.** A plain `<script type="module">`
  is enough; a README carries the contract; the public surface is small and named. The bar is Vetrina's,
  explicitly (§ the excellence bar, below).
- **Its own name + license posture.** `cadenza` is a self-titled folder today and an
  independently-publishable package tomorrow (its own README, its own semver, MIT-or-similar), depending
  on nothing in this repo.

**The excellence bar.** This is held to the Vetrina standard, not merely "it works": designed by
**subtraction** (every layer must justify its existence against the primitive), and — because a shared
timing kernel that a future TTS + accessibility surface both depend on is real blast radius and
genuinely novel — the *design* is hardened by the **adversarial trio** (red team + Munger inversion +
independent checker) before the winner ships, per HARD RULE #25. The subtraction targets are already
visible: no second note source, no player, no renderer, no forced alignment in v1 (§8). If a layer or a
field can't earn its place against the `CaptionTrack` primitive, it's cut.

## 5. The axes

| Axis | What it decides |
|---|---|
| **Granularity** | Word-level vs. line/cue-level vs. both (nested). |
| **Timing source** | Estimated from text vs. measured from audio vs. hybrid. |
| **Audio coupling** | Owns playback vs. audio-agnostic (reads an injected clock). |
| **Input** | Raw text vs. a slide vs. a whole deck; where the script comes from. |
| **Interop / output** | A bespoke JS object only vs. a standard caption file (WebVTT/SRT). |
| **Cadence model** | A raw ms-per-word knob vs. a small curated pacing model + authored pauses. |
| **Placement** | Docs-side (next to voice-model) vs. engine-side pure core (shared, gated). |

### 5.1 Granularity — **both, nested**

Closed captions are displayed as **lines** (a readable phrase — the WebVTT/SRT unit, ~1–2 lines, a
few seconds each). A karaoke highlight needs **words**. These are not competing choices; they nest.
A `cue` is a caption line with a start/end; it contains `words[]`, each with its own start/end inside
the cue. Display renders cues; the highlight walks words within the active cue. One model, both
consumers.

### 5.2 Timing source — **hybrid (decided)**

The crux, and the decided fork. Three candidates:

| Candidate | Strength | Weakness | Verdict |
|---|---|---|---|
| **Estimate-only** | Pure, deterministic, offline, zero deps; works with no audio. | Word timings drift from the real voice on long/uneven sentences. | The **baseline**, but not the whole answer. |
| **Measured-only** | Tracks the real voice exactly. | Needs audio to exist *at all* — no captions before playback, nothing offline; and today's engines give sentence spans, not word timestamps. | Rejected as the sole source — it strands the accessibility case. |
| **Hybrid** | Estimate is always available; measurement refines it when present. | A little more machinery (a re-anchor step). | **Decided.** |

The **hybrid** mirrors the voice ladder's own philosophy ("a great default, refined by reality, never
owning correctness"). The estimate is computed purely from text and is always present. When TTS
plays, each sentence reports its **measured onset and duration** (which `voice-model` already knows —
it awaits each sentence's audio), and Cadenza **rescales that sentence's word estimates to fill the
measured span** (§6). Words highlight *proportionally within the measured sentence* — accurate to the
sentence boundary, smoothly interpolated within it. This needs **no forced-alignment dependency**
(WhisperX-class) for v1; true per-word acoustic alignment is a documented Later (§12).

### 5.3 Audio coupling — **agnostic** (see §2).

### 5.4 Input — **text, with a deck/slide convenience that reuses `notes-core`**

The core operates on a **string** (the narration). But authors think in slides and decks, so Cadenza
offers a convenience layer: given rendered slide HTML (or the markdown the renderer paginates from),
pull each slide's **speaker note via `notes-core.extractSlideNotes`**, fall back to the slide's prose
snippet where a note is absent (the same fallback the rehearsal planner already makes), and emit a
**per-slide track** plus a **deck timeline** (tracks concatenated, slide boundaries carried as cue
metadata). Reusing `notes-core` is non-negotiable: HARD RULE #1 says the note boundary is
single-source, and a caption is a *projection of the note*, so it must agree on what the note is.

### 5.5 Interop — **WebVTT is the primary output** (and it is *not* incidental)

WebVTT (`.vtt`) is the web standard every `<video>`/`<track>`, screen reader, and player already
understands. Crucially, WebVTT has a **native karaoke syntax** — inline cue timestamps
(`<00:00:01.234>`) with `<c>…</c>` classed spans — which is *exactly* the "current word" mechanism,
standardized. So one `.vtt` file carries **all three** payloads:

- the caption **lines** (accessibility, consumable by assistive tech and any video player);
- the **word timings** (the highlight data, as standard cue timestamps);
- a **clock** a TTS run can read.

That is a strong reason to make WebVTT a first-class *output shape of the model*, not a lossy
after-the-fact serializer: the model already holds cues-with-words-with-times, which is precisely
what a karaoke VTT encodes. **SRT** (`.srt`, line-level only, no word timing) is offered as a lesser
export for tools that don't speak VTT. This also gives the **engine side** a natural artifact: a
`.vtt` sidecar next to the exported PDF/HTML (paralleling how `notes-core` already emits per-page PDF
note annotations), independent of any docs-site UI.

### 5.6 Cadence model — **a small curated pacing model, not a raw knob**

"Cadence" is the pacing curve, and it should be *curated* the way the read-aloud speed is
(`slow | moderate | fast`), not a raw ms-per-word the eye can't reason about. The estimator is built
from a few typed inputs:

- a **base rate** (words/min) selected by a curated preset;
- **punctuation pauses** — a comma < a period < a paragraph break (the natural breath points);
- **length weighting** — longer/multisyllabic words take proportionally longer (a cheap
  syllable/character heuristic, not a pronunciation dictionary);
- **authored silences** — the rehearsal plan's timed beats (`pause` / `eye` / `breathe`) inserted as
  explicit gaps between cues. This is the "modeled delivery" the read-aloud ADR deferred: Cadenza is
  the home for it because a beat is just a silent cue in the timeline.

### 5.7 Placement — **engine-side spinnable core (`lib/cadenza/`) + a thin Lattice adapter (`lib/caption/`)**

`notes-core` lives engine-side in `lib/authoring/` because it is pure and shared across render paths;
`voice-model` lives docs-side because it is a browser-playback concern. Cadenza's **core is pure**
(text → timeline is fs-free and deterministic) and is needed by **both** the docs-site Practice
highlight *and* a potential engine-side `.vtt` export — so the pure core belongs **engine-side**, in
its own gated folder `lib/cadenza/`. The Lattice-coupled `notes-core` reuse is a **separate adapter**
(`lib/caption/deck.js`) *outside* that fence (§4), so the core spins off clean. This is the `notes-core`
pattern exactly: one pure core, surfaced by each path through its own channel — here with the extra
discipline that the core carries zero Lattice knowledge, for the eventual extraction.

---

## 6. The timing math (the one non-obvious part)

Everything else is plumbing; this is the idea worth pinning down.

**Estimate (always).** For a cue of words `w₁…wₙ`, assign each word a *weight* from the cadence model
(base duration scaled by length/syllables), add the punctuation pause after the word that carries the
terminator, and lay the words end-to-end from the cue's start. The cue's estimated duration is the
sum. This is a pure function of `(text, cadencePreset)` — deterministic, unit-testable, offline. It
is `readMs` generalized from "how long is this sentence" to "when is each word."

**Re-anchor (when measured).** When TTS reports that sentence *k* actually started at `Tₖ` and lasted
`Dₖ`, rescale that sentence's words so they exactly fill `[Tₖ, Tₖ + Dₖ]`:

```
scale = Dₖ / estimatedDurationₖ
word.startMs = Tₖ + (word.estStart − cueEstStart) · scale
word.endMs   = Tₖ + (word.estEnd   − cueEstStart) · scale
```

So the *relative* rhythm within a sentence stays the estimate's (which is fine — words inside one
breath group are close), while the *absolute* anchor and total match the real audio. No per-word
acoustic timestamps are required; the sentence boundary is the anchor `voice-model` already produces.

**Cursor.** `at(timeMs)` binary-searches the flat word list for the active word and its cue. Because
the timeline is monotonic and pre-sorted, this is O(log n) per tick — cheap enough for a 60fps
`requestAnimationFrame` highlight loop.

---

## 7. The module shape (design, not built)

A self-contained `lib/cadenza/` (import-boundary gated to its folder, like Vetrina's core), mirroring
Vetrina's "pure data model + thin runtime" split *and* its three-layer authoring stack (§3). The core
imports nothing Lattice-specific (§4); the one Lattice-coupled module — the `notes-core` adapter — sits
**outside** the fenced core so the core stays spin-off-clean:

```
lib/cadenza/                     ← the spinnable core (zero Lattice deps; import-boundary gated)
  track.js     the CaptionTrack PRIMITIVE — cues[] each with words[] { text, startMs, endMs, charOffset }
  segment.js   the CANONICAL segmenter — text -> cues (lines) -> words. voice-model.splitSentences
               becomes a re-export of this (retires a live duplication — HARD RULE #15).
  cadence.js   the ESTIMATOR — text -> per-word/per-cue durations from the curated cadence model
               (WPM preset + punctuation pauses + length weighting + authored beat silences).
  script.js    the DESCRIPTOR (Line[] as data — the Step[] analog) + the fluent BUILDER script()…build()
               (the scene() analog); build() lowers Line[] -> Script -> CaptionTrack. One interpreter.
  cursor.js    the pure clock->active-word map: at(timeMs) -> { cueIndex, wordIndex }; and
               align(track, sentenceIndex, onsetMs, durationMs) -> re-anchored track (§6).
  vtt.js       WebVTT (with karaoke cue timestamps) + SRT serialization.
  index.js     the public surface (framework-free — zero deps).

lib/caption/                     ← the Lattice ADAPTER layer (outside the fence; may import lib internals)
  deck.js      pull each slide's note via notes-core, feed text+hints into cadenza, emit per-slide
               tracks + a deck timeline (slide boundaries as cue metadata). The only notes-core coupling.
```

**Public surface (illustrative — the impl PR owns the exact signatures).** All three layers are
reachable, and they are isomorphic (§3):

```js
import { buildTrack, script, makeCursor, toVtt, toSrt } from 'lib/cadenza';

// LAYER 3 (fluent builder) — hand-authored cadence, chained + readable
const track = script('moderate')
  .say('Revenue grew forty percent.').pause(500)   // authored silence — "let the number land"
  .say('That is our fastest quarter ever.').emphasize('fastest')
  .build();

// LAYER 1 (primitive) — you already have text; estimate straight to a track
const t2 = buildTrack(noteText, { cadence: 'moderate' });

// a pure cursor the consumer ticks off ANY clock
const cursor = makeCursor(track);
const { cueIndex, wordIndex } = cursor.at(currentTimeMs);

// refine against real audio as each sentence plays (from voice-model.onSentence + measured onset)
cursor.align(sentenceIndex, onsetMs, durationMs);

// export the standard caption artifact (all three payloads in one file)
const vtt = toVtt(track);   // karaoke word timings included
```

The docs-side consumer (a follow-on, not this doc) wires `voice-model.speak({ onSentence })` to
`cursor.align`, runs a `requestAnimationFrame` loop reading the WebAudio `currentTime`, and toggles a
highlight class on the active word — and, when nothing is connected (the silent floor), drives the
*same* cursor off a plain timer so the read-along still works with no audio.

---

## 8. Non-goals (what Cadenza is NOT)

- **Not a player.** It owns no `AudioContext`, no `<audio>`, no playback. `voice-model` plays; Cadenza
  times. (If these ever merge, Cadenza stays the pure timeline underneath.)
- **Not a renderer.** It ships no CSS, no highlight DOM, no caption widget. It returns indices; the
  consumer paints. (Studio/Practice styling is the consumer's, governed by the visual contract.)
- **Not forced alignment.** No acoustic word-level timestamping in v1 (no WhisperX / no phoneme
  model). Sentence-anchored proportional timing is the v1 fidelity; true alignment is §12.
- **Not a second note source.** It never re-defines what a speaker note is — `notes-core` owns that
  boundary (HARD RULE #1). A caption is a projection of the note.
- **Not translation / not authoring.** It times the words that are there; it does not rewrite,
  translate, or summarize them (the voice model's verbatim-TTS discipline).

---

## 9. Accessibility — this is a first-class a11y feature, not a TTS byproduct

The framing in the ask was "support both accessibility and eventual TTS," and the design deliberately
makes **accessibility standalone-valuable** so it doesn't wait on TTS:

- **Closed captions as a real artifact.** WebVTT is the WCAG-recognized caption format; a `.vtt`
  sidecar (or an in-player `<track>`) means a deck's narration is consumable by assistive tech and any
  standard player — with no audio pipeline in the loop.
- **Read-along with no audio.** The estimate-driven cursor lets a low-vision or dyslexic reader follow
  a synced word highlight at their own pace, silently. This is the case measured-only timing would
  strand, and it is a big part of why hybrid is the decision.
- **Sibling to `describe:`, not a duplicate of it.** The accessibility-description channel
  (`2026-07-04-accessible-descriptions.md`) is the *objective* text alternative of what a slide
  *shows*; a caption is the *timed* rendering of what the presenter *says*. Opposite registers, same
  spirit — Cadenza captions the note, `describe:` alt-texts the visuals. They compose; neither
  replaces the other.

---

## 10. Relationships

- **Consumes** `lib/authoring/notes-core.js` — the note boundary (HARD RULE #1). Cadenza adds no new
  note semantics.
- **Feeds / is fed by** `docs/src/playground/voice-model.js` — it lands that ADR's deferred "streaming
  + clock sync" and "pause-beats as silences"; and `splitSentences` becomes a re-export of Cadenza's
  canonical `segment.js` (retires a duplication, HARD RULE #15).
- **Shaped like** `docs/src/lib/vetrina/` — the pure-data-model + thin-runtime split, the
  self-contained import-boundary gate, the zero-dep core, the rich README. Generalizes its `readMs`.
- **Adjacent to** `2026-06-16-narrative-step-model.md` — both put a *time/sequence axis* over a deck.
  The step model sequences **reveals**; Cadenza sequences **words/silences**. A natural future join:
  a step boundary is an authored pause-beat in the caption timeline (the presenter advances, the voice
  waits). Out of scope here; noted so the two don't reinvent a shared clock later.
- **Sibling to** `2026-07-04-accessible-descriptions.md` — the other half of deck accessibility (§9).

---

## 11. Staged plan (each its own increment / branch — HARD RULE #17)

1. **This design doc** (here). Design only; no code.
2. **The spinnable core** — `lib/cadenza/` (`track` · `segment` · `cadence` · `script` · `cursor` ·
   `vtt`) with Node unit tests: estimate determinism, re-anchor math, VTT/SRT round-trip, the
   descriptor↔builder isomorphism (`script().build()` ≡ its `Script` data), and a parity test that
   `voice-model.splitSentences` and `segment.js` agree (the de-dup). The import-boundary gate (zero
   Lattice deps) lands here. No UI, no visual surface — fully verifiable in Node.
3. **The Lattice adapter + convenience** — `lib/caption/deck.js` over `notes-core` (outside the core
   fence), + an engine-side `.vtt` sidecar export option next to PDF/HTML.
4. **The docs-side consumer** — wire the read-along word highlight into Practice mode over the live
   `voice-model` clock (and the silent-timer fallback). This one has a real visual surface and needs
   real-surface verification (HARD RULE #23) + a per-feature demo (HARD RULE #9).
5. **Modeled delivery** — thread the rehearsal plan's timed beats into the timeline as authored
   silences (closes the read-aloud ADR's deferred item).
6. **True per-word alignment** (Later, §12) — only if v1's sentence-anchored fidelity proves
   insufficient in practice.

## 12. Later / open questions

- **True acoustic word alignment.** If proportional-within-sentence highlight visibly drifts on real
  decks, add an optional forced-alignment rung (a WASM aligner, or word-timestamp metadata if a TTS
  engine ever returns it) — a *refinement rung* on the same cursor, exactly as Kokoro is a rung on the
  voice ladder. Deliberately deferred; may never be needed.
- **Segmentation quality.** The v1 segmenter inherits `splitSentences`' simple terminator rule
  (over-splitting an abbreviation costs only a tiny gap, never a correctness bug). If caption *line*
  breaks need to be tighter than sentence breaks (VTT lines are often sub-sentence), `segment.js` may
  grow a line-wrapping pass under the sentence layer.
- **Cadence preset defaults.** Confirm the base WPM + punctuation-pause constants read naturally
  against real speaker notes and against measured TTS (tune the estimate so the *unanchored* timeline
  already feels right, since that's the offline/accessibility experience).
- **Deck-vs-slide timeline seams.** How a deck timeline handles navigation (does the clock reset per
  slide, or run continuously?) — a consumer question the `deck.js` + Practice wiring settles in stage
  3–4, not here.

## 13. Gates (for each build increment when it lands)

Pure-core stages: `lint` · unit · `build:check` green; the segmenter parity test; maker-checker on the
timing kernel (it's shared, measurement-adjacent logic — real blast radius). The `.vtt` export and the
Practice consumer add: a per-feature demo deck (#9), CHANGELOG `## Unreleased` (#10), and — for the
Practice highlight — real-surface visual verification (#23), not a jsdom stand-in. No exported PDF/PPTX
bytes change in stages 2–3 (the `.vtt` sidecar is additive), so no export sign-off is triggered until
a stage actually alters an existing artifact's bytes.
