---
status: proposed
summary: Cadenza — a pure, framework-free caption/timeline/delivery ENGINE for reading a Lattice deck aloud with synchronized captions. Text → cues → words (each carrying a DISPLAY form and a SPOKEN form) with start/end ms; hybrid timing (a deterministic text ESTIMATE baseline, re-anchored by measured TTS sentence spans); a pure clock→active-word CURSOR; WebVTT/SRT export. It owns NO audio and NO DOM — it emits a timeline and reads an injected clock (the voice ladder's WebAudio time, a plain timer for a silent read-along, or a scrub bar); highlighting is the consumer's job. Zero Lattice deps, import-boundary gated, Vitest-tested — lives docs-side beside its consumers (the Vetrina shape, docs/src/lib/cadenza/), designed to SPIN OFF as its own open-source library. Ships REAL value on its own, with no AI: accessibility captions, a presenter rehearsal read-along, and a .vtt export edition. It is the substrate the separate, gated "self-delivering presentation" bet (2026-07-07-self-delivering-presentation.md) consumes — but it is decoupled from it by construction and must not be held hostage to it (the split was forced by the adversarial trio: the clean library ships now; the AI narrative is a prove-it-first bet). Delivery surfaces: a small voice-ladder instrumentation to expose sentence onset/duration + eyes-free transport. Reuses the correct primitives (notes-core boundary, the voice ladder, describe: as a text source) and treats today's read-aloud/rehearsal code as PRIOR ART, not foundation. Design only; nothing built.
companion:
  - ./2026-07-07-self-delivering-presentation.md
---

# Cadenza — the caption / timeline / delivery engine (2026-07-07)

> **What it is.** Give Cadenza text — a speaker note, a paragraph, a whole deck's narration — and it
> returns a **timed caption track**: cues (caption lines), each split into words with a *display* form and
> a *spoken* form and `{ startMs, endMs }`. A pure **cursor** maps any clock time to the active word. It
> **owns no audio and no DOM** — it emits a timeline and reads a clock you inject. Highlighting, playback,
> and *what to say* are the consumer's job. Cadenza just does time. (*cadenza*, Italian: cadence.)

**This doc is the ENGINE.** It ships **real value with no AI**: accessibility captions, a presenter
rehearsal read-along, and a `.vtt` export edition. The ambitious *"a deck that delivers its own argument"*
vision lives in a **separate, gated** companion — `2026-07-07-self-delivering-presentation.md` — which
*consumes* Cadenza. The split was forced by an adversarial trio (§9): a clean, spin-off-able library must
not be held hostage to an unproven bet, so Cadenza stands alone and ships first. Design only; nothing built.

---

## 1. Why Cadenza ships on its own

The engine delivers three real things the moment it exists, none needing a model:

- **Accessibility captions** — a standard `.vtt` of a deck's narration, consumable by any player / AT.
- **A presenter rehearsal read-along** — captions + a word highlight synced to the read-aloud voice, so a
  presenter hears and follows their talk track (a rehearsal *mirror*, §6).
- **A silent read-along** — the estimate-driven highlight works with *no audio at all* (a low-vision or
  dyslexic reader follows at their own pace).

None of these require deciding *what to say* intelligently — they time text a human already wrote (a
speaker note, on-slide prose). That is exactly why the engine is separable from the AI narrative and worth
building first (stack the win). It is also **designed to spin off** as its own zero-dependency library.

## 2. The timing model — hybrid (estimate baseline + measured re-anchor)

A pure text **estimate** is always available (offline, no audio) — it *is* the silent read-along and the
caption clock. When TTS plays, each sentence's **measured onset + duration** re-anchors its words:

```
scale = Dₖ / estimatedDurationₖ
word.startMs = Tₖ + (word.estStart − cueStart) · scale    // cueStart == sentence start (one cue == one sentence)
word.endMs   = Tₖ + (word.estEnd   − cueStart) · scale
```

The relative rhythm inside a sentence stays the estimate's; the absolute anchor + total match real audio.
No forced-alignment dependency for v1; **one cue == one sentence**, so the anchor unit is unambiguous
(sub-sentence caption-line wrapping is deferred, §8). `at(timeMs)` binary-searches the flat word list —
O(log n), cheap for a 60fps highlight loop.

## 3. Display form vs spoken form

A word carries **two forms**: displayed (`$4.2M`, `Q3`, `18.5%`) and spoken ("four point two million
dollars," "Q three," "eighteen point five percent"). They diverge in *length* — one caption token can be
five spoken words — so **the timed word set is the SPOKEN set, and the caption renders the DISPLAY glyphs
over it.** Normalization (a deterministic, reversible expansion of numbers/units/known acronyms) runs
**upstream of segmentation**, or the highlight mis-maps on every number. `Word = { display, spoken,
startMs, endMs, charOffset }`; timing is computed on `spoken`.

## 4. Interop — WebVTT primary, honestly scoped

WebVTT (`.vtt`) is the caption standard — the **lines** are universally consumed by `<track>`, AT, and any
player. WebVTT *also* defines karaoke cue-timestamps (`<00:00:01.234>` + `<c>` spans) for word timing, but
**native players / most screen readers ignore them for highlighting** — the karaoke layer needs a JS
consumer (our cursor) driving `cuechange`. So: **lines are universal; the word highlight is opt-in
machinery on top.** SRT is a lesser line-only export.

## 5. Module shape (pure ESM core — designed to spin off)

```
docs/src/lib/cadenza/        ← pure ESM/TS, fs-free, zero Lattice deps, import-boundary gated (the Vetrina shape)
  track.ts     CaptionTrack — cues[] each with words[] { display, spoken, startMs, endMs, charOffset }
  segment.ts   the CANONICAL segmenter — retires THREE live copies (voice-model.splitSentences,
               read-aloud.ts splitForCaption) to re-exports (HARD RULE #15)
  normalize.ts the deterministic display→spoken expansion, reversible
  cadence.ts   the ESTIMATOR — text → per-word/per-cue durations from ONE curated cadence model
  cursor.ts    at(timeMs) → { cueIndex, wordIndex }; align(cueIndex, onsetMs, durationMs) → re-anchor
  vtt.ts       WebVTT (karaoke) + SRT
  index.ts     the public surface (framework-free — zero deps)
```

**Placement — docs-side, the Vetrina precedent (packaging validated).** The repo root `lib/` is **CJS**
(no `package.json` `"type"`; 115 CJS modules), consumed by runtime docs only through generated esbuild
bundles — a root-`lib/` Cadenza would hit exactly that CJS/re-export wall. Cadenza's immediate consumers
(`voice-model.js`, `read-aloud.ts`) are **docs-side ESM**, and Cadenza is modeled on **Vetrina**, which
already lives at `docs/src/lib/vetrina/` as pure ESM/TS, Vitest-tested (`*.test.ts`), framework-free,
spin-off-able, with an import-boundary gate in `tools/check-ownership.js`. So Cadenza lives beside it at
`docs/src/lib/cadenza/`: `docs/package.json` is `"type": "module"` + `vitest`, so it is served to runtime
docs directly and the docs-side segmenters re-export from it cleanly. *(The earlier "root `lib/` pure ESM,
the `resolve-spectrum.js` shape" claim was wrong — `resolve-spectrum.js` is CJS, imported only by a Vitest
test. Corrected here.)* An engine-side `.vtt` export (root-`lib` CJS, Node) is a later cross-consumption
concern — the timing core is pure, so a thin CJS bridge or dual-publish handles it when stage 4 lands.

## 6. Delivery surfaces (drivers on one clock)

The voice is the existing **voice ladder** (`voice-model.js`: OpenRouter TTS → in-browser Kokoro → silent
floor; the user's own key). Word sync needs a **small instrumentation** of that ladder: expose each
sentence's measured onset (`ctx.currentTime` at `src.start(0)`, `:412`) + duration (`audioBuf.duration`,
`:403`), threaded through `playBlob` and keyed to the *prefetched* sentence. **Trio correction:** not a
3-field read — `playBlob` takes only `(blob, signal)` and knows nothing of the sentence, so a timing
callback must be threaded in. The failure it prevents: keying the onset to `onSentence` fire-time makes the
highlight *lead* the voice by the decode gap.

Other drivers ride Cadenza's one clock: synced captions + word highlight; **eyes-free transport**
(skip/replay/scrub/speed + non-suppressible boundary announcements — a first-class requirement, not a
Later: without it an eyes-free listener is stranded); optionally the Vetrina pointer (meaning-bearing or
cut). **A live caption is a rehearsal *mirror*, not a teleprompter crutch** — designed to build
independence from the exact words (fades as mastered), never to induce reading over delivering.

## 7. What Cadenza is NOT

- **Not a decider of *what to say*.** It times text it's given. Choosing/​composing the narration —
  policy, explanation, the argument — is the companion bet's job, not the engine's.
- **Not a player, not a renderer.** No `AudioContext`, no `<audio>`, no highlight DOM, no CSS. It returns a
  timeline + indices; the consumer paints and plays.
- **Not forced alignment; not a second note source; not a second cadence.** One segmenter, one cadence
  constant, one clock. (Three reading speeds exist today — `SPEAK_WPM=135`, `WORDS_PER_MINUTE=155`, and the
  Cadenza preset — reconciled to the estimator's single constant.)

## 8. Reuse vs. build fresh; open questions

**Prior art, not foundation** (owner direction): `read-aloud.ts` (`slideToSpeech` + teleprompter) and
`drawing-board-rehearsal.js` are prior art — their *ideas* inform Cadenza; their code is not extended. The
correct primitives Cadenza builds on: `notes-core.js` (the note/`describe:` boundary, HARD RULE #1), the
`voice-model.js` voice ladder, and `describe:` as a *text source* when a consumer wants it.

Open: **RTL/CJK** (an `Intl.Segmenter` `granularity:'word'` pass at the `segment.js` seam — Latin/space-
delimited today); **reduced motion** (the highlight is content cadence — opacity/weight only, a `still`
collapse to a static caption); **sub-sentence caption lines** (how a measured sentence span apportions
across child cues — v1 sidesteps via one cue == one sentence).

## 9. Staged plan + relationships

1. **This design doc.** Design only.
2. **The Cadenza core** `docs/src/lib/cadenza/` (§5) — Vitest-tested: estimate determinism, re-anchor math, display↔
   spoken normalization round-trip, VTT/SRT, the 3-way segmenter de-dup. Import-boundary + ESM gate.
3. **Delivery** — the voice-ladder instrumentation (§6) + synced captions/word highlight + eyes-free
   transport, wired into a real surface (Practice / a reader). Real-surface verified (HARD RULE #23).
4. **`.vtt` export** — the accessibility caption artifact next to PDF/HTML.

**Consumed by** `2026-07-07-self-delivering-presentation.md` (the gated AI-narrative bet) — Cadenza builds,
tests, and ships against a **hand-written `NarrationPlan`, no model, zero Lattice deps**; the AI drafter is
a *consumer* of Cadenza, never a dependency of it (enforced by the import-boundary gate). **Related:**
`2026-07-04-accessible-descriptions.md` (the `describe:` channel Cadenza can read as a text source),
`2026-06-14-read-aloud-kokoro.md` (the voice ladder), `docs/src/lib/vetrina/` (the pointer + the
self-contained-library shape Cadenza mirrors).

## 10. Review history

Cadenza's shape was hardened across several adversarial rounds (a first critic, the full trio, a four-lens
DSL/expert pass, and a north-star trio). The findings that shaped **the engine** are folded above:
`voice-model` has no clock today (§6); the cue==sentence anchor unit (§2); the pure-ESM packaging + the
wrong `resolve-spectrum` precedent (§5); the third duplicate segmenter (§5); the display-vs-spoken word
gap (§3); one cadence source (§7). The rounds' findings about the **AI narrative, trust, and the DSL** live
with that work in `2026-07-07-self-delivering-presentation.md` — including the trio call that forced this
very split (Cadenza ships alone; the narrative is a prove-it-first bet).
