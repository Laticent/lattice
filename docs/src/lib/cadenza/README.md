# Cadenza

**A pure caption/timeline engine: give it text, get back timed words.**

Cadenza turns narration text into a **timed caption track** — cues (caption lines),
each split into words carrying a *display* form and a *spoken* form with start/end
milliseconds — plus a pure **cursor** that maps any clock time to the word active
right now. It **owns no audio and no DOM**: it emits a timeline and reads a clock you
inject; playback, highlighting, and *deciding what to say* are the caller's job.

Zero dependencies, framework-free, `node:`-and-relative imports only (an
import-boundary gate enforces it) — designed to spin off as its own library. The
full design contract is
[`engineering/decisions/2026-07-07-cadenza-caption-timeline.md`](../../../../engineering/decisions/2026-07-07-cadenza-caption-timeline.md).

## 60-second start

```ts
import { buildTrack, makeReader, toVtt } from './cadenza';

// 1. Text → an estimated timeline (offline, no audio needed).
const track = buildTrack('Revenue grew to $4.2M. We beat plan by eight points.', { pace: 'moderate' });

// 2. Drive a read-along highlight off ANY clock (a plain timer here).
const reader = makeReader({
  track,
  onWord: (active) => highlight(active),   // { cueIndex, wordIndex } | null
});
const t0 = performance.now();
function frame() {
  reader.sync(performance.now() - t0);     // the host owns the loop + the clock
  requestAnimationFrame(frame);
}

// 3. Or export a standard caption file.
const vtt = toVtt(track);
```

### Or chain it — the `narration()` front door

`buildTrack`, `makeReader`, `toVtt`, and `toSrt` each take an overlapping slice of the same
options. `narration()` collects the config once, then emits any output — **configure once, emit
many**:

```ts
import { narration } from './cadenza';

const n = narration('Revenue grew to $4.2M. We beat plan by eight points.')
  .pace('moderate')
  .lexicon(deckLexicon)
  .calibration(voiceState);   // derive the pace multiplier from a measured voice

const track  = n.toTrack();                          // === buildTrack(text, options)
const reader = n.toReader({ onWord: highlight });    // === makeReader({ track, onWord })
const vtt    = n.toVtt();                             // === toVtt(buildTrack(text, options))
```

It is **pure sugar** — each terminal is exactly the matching call, guarded by a parity test — and a
*config* builder, never a cue assembler: you can't hand-build the timeline, so the display / spoken /
timing forms can't desync, and Cadenza stays "not a decider of what to say."

## The one idea — a timeline is data; the clock is someone else's

Everything Cadenza produces is plain data. What drives *time* is injected by the
consumer, which is what lets one engine serve every surface:

- **Silent read-along** (no audio, an accessibility path) — feed `reader.sync` a
  wall-clock timer. Works with nothing but text.
- **TTS-synced** — feed it the audio clock, and call `reader.align(cueIndex,
  onsetMs, durationMs)` as each sentence's measured span arrives so the highlight
  tracks the real voice (the hybrid re-anchor; the estimate is the baseline, the
  measurement refines it).
- **Scrub** — feed it a scrub-bar position.

## The two word forms

A word carries what's **displayed** (`$4.2M`) and what's **spoken** (`four point two
million dollars`). They diverge in length — one caption token can be several spoken
words — so **timing is computed on the spoken form while the caption renders the
display glyphs.** `$4.2M` therefore dwells as long as its five spoken words take,
and the highlight still lands on the single token a reader sees.

## API

| Export | What it does |
|---|---|
| `buildTrack(text, { pace? })` | text → `CaptionTrack` (the estimate baseline). `pace`: `'slow' \| 'moderate' \| 'fast'`. |
| `makeReader({ track, onWord?, onEnd? })` | the read-along driver: `sync(nowMs)` emits `onWord` on change + `onEnd` once; `align(...)` re-anchors; `reset()` re-arms. |
| `makeCursor(track)` | the lower-level primitive: `at(timeMs)` + `align(cueIndex, onsetMs, durationMs)`. |
| `toVtt(track)` / `toSrt(track)` | WebVTT (with karaoke word timestamps) / SRT. |
| `splitSentences` / `splitWords` | the canonical segmenter (one cue == one sentence). |
| `toSpoken` / `numberToWords` | display→spoken normalization. |
| `estimateWordMs` / `readMs` / `PACE_WPM` | the single cadence source. |

Types: `CaptionTrack`, `Cue`, `Word`, `Active`, `Reader`, `Cursor`, `Pace`.

## What Cadenza is NOT

- **Not a decider of what to say.** It times text it's given. Choosing or composing
  narration lives above it (in Lattice: the *self-delivering presentation* bet).
- **Not a player, not a renderer.** No `AudioContext`, no `<audio>`, no highlight DOM,
  no CSS. It returns a timeline and indices; you paint and play.
- **Not forced alignment.** Sentence-anchored proportional timing is the fidelity;
  the internal rhythm is the estimate's, the anchor is the measurement's.

## Files

```
segment.ts    text → sentences → words (lookbehind terminator rule; decimals stay intact)
normalize.ts  display → spoken (money / percent / numbers / abbreviations)
cadence.ts    the one cadence source — per-word estimate + punctuation pauses
track.ts      CaptionTrack model + buildTrack (the estimate baseline)
cursor.ts     at(timeMs) + align() (the hybrid re-anchor, monotonic tail-shift)
reader.ts     the read-along driver — sync/align/onWord/onEnd
vtt.ts        WebVTT (karaoke) + SRT
index.ts      the public surface
```

Every module is pure and unit-tested (`*.test.ts`, run with `vitest`). The core
stays self-contained by a build gate (`checkCadenzaBoundary` in
`tools/check-ownership.js`): a non-relative, non-`node:` import fails the build.
