# Suono

**Give it audio bytes, get reliable playback — one owned context, an audio clock, a sequence scheduler.**

Suono plays audio *bytes* (a `Blob`, an `ArrayBuffer`, raw PCM off a worker) reliably on **one owned
`AudioContext`** — with the iOS unlock, the silent-switch fix, decode + buffer caching, and a
latency-compensated clock already handled. Give it an ordered **sequence** plus a `produce(item)` you
own, and it schedules synth-ahead, plays with tuned "breath" gaps, and hands back each clip's measured
onset. It **owns no network, no key, no model, and no DOM**: deciding *what to synthesize* — and
fetching it — is the caller's job.

Zero dependencies, framework-free, `node:`-and-relative imports only (an import-boundary gate enforces
it) — the third spin-off-able sibling beside [Cadenza](../cadenza/) (caption timeline) and Vetrina
(walkthrough). Full design contract:
[`engineering/decisions/2026-07-12-suono-audio-library.md`](../../../../engineering/decisions/2026-07-12-suono-audio-library.md).

## 60-second start

```ts
import { createStage } from './suono';

const stage = createStage();          // owns ONE AudioContext, lazily

// In a click handler (iOS needs the unlock synchronous in the gesture):
button.onclick = () => {
  stage.unlock();
  seq.play();
};

const seq = stage.sequence({
  items: sentences,                            // your units of work (opaque to Suono)
  produce: (s, { signal }) => fetchTts(s, signal),   // YOUR byte source — TTS, a file, anything
  keyOf:   (s) => `${voice}:${s}`,             // cache/dedup identity
  gapMs:   (s) => (/[.!?]$/.test(s) ? 360 : 0),      // breath after a sentence
  onItemStart: ({ index, onsetMs, durationMs }) => reader.align(index, onsetMs, durationMs), // → Cadenza
});
```

Or drive one clip at the low level:

```ts
const clip = await stage.decode(mp3Bytes, cacheKey);
stage.play(clip, { onStart: ({ onsetMs }) => {}, signal });
stage.clockMs();   // the WebAudio clock a caption cursor rides
```

## The one idea — a clip is bytes; the clock is the library's

The mirror of Cadenza's *"the timeline is data; the clock is someone else's."* Suono owns the real
WebAudio clock (`clockMs()`) and emits each clip's measured onset (`onItemStart`) — exactly the anchor
[Cadenza](../cadenza/)'s `reader.align(cueIndex, onsetMs, durationMs)` consumes. The two compose:
**Suono plays and times the voice; Cadenza times the highlight; the app wires them.**

## What Suono is NOT

- **Not a fetcher.** No URL, no network, no key — bytes in, sound out. (This is the security boundary:
  it means our OpenRouter key can't leak through it, and there's no SSRF surface.)
- **Not a synthesizer / decider.** It doesn't know TTS, models, voices, or "sentences." `produce(item)`
  returns bytes; `keyOf(item)` names them.
- **Not effects / EQ / mixing / capture.** No tone-shaping (hence *suono*, not *timbro*), no mic, no
  mixer. **Batching** of multiple clips = the sequencer (sequential); **concurrency** (playing clips
  at once / layering) is a *scheduler policy*, not a core capability — the `stage` permits overlapping
  `play()` (each returns its own handle; `stopAll()` reaches them all), so a concurrent player would be
  a second scheduler over the same hardened stage, added when a real consumer needs it — never a mixer
  baked into the core.
- **Not a renderer.** No DOM, no highlight, no transport UI.
- **Not streaming.** Whole clips only in v1.

## What it captures for you (so no surface re-derives it)

- One owned context, never per-utterance, never closed. Decoded-buffer cache + byte cache + in-flight
  dedup. Bounded synth-ahead, **pause-gated** (a pause can't produce — or bill — the rest of the run).
- iOS/Safari: gesture-sync unlock, `audioSession = 'playback'` silent-switch fix, callback-form decode,
  fresh-`ArrayBuffer` replay safety.
- Never rejects: a produce/decode failure degrades to silence and reports via `onState.error`.
  Barge-in via `AbortController`; a watchdog skips a hung producer.
- Latency-compensated clock so a caption tracks the ear, not the buffer.
- **Declick:** a few-ms gain ramp at each clip's head + tail so playback never steps from/to a
  non-zero sample — the click/pop at a clip boundary, worst on many-short-fragment slides (`fadeMs`).

## API

| Export | What it does |
|---|---|
| `createStage(opts?)` | the owned context + playback. `unlock()`, `decode(bytes, key?)`, `play(clip, {onStart, signal})`, `clockMs()`, `latencyMs()`, `state()`, `suspend()`/`resume()`, `stopAll()`, `sequence(opts)`, `dispose()`. |
| `stage.sequence(opts)` / `makeSequence(stage, opts)` | the scheduler: `play`/`pause`/`resume`/`stop`/`warm`. Opts: `items`, `produce`, `keyOf?`, `gapMs?`, `concurrency?`, `onItemStart?`, `onState?`. `warm(items)` **preloads** — prefetches bytes AND decodes them, so a later play skips both. |
| `encodeWav(samples, rate)` | Float32 PCM → WAV `BlobLike` (pure, node-safe). |
| `wrapPcm(bytes, contentType)` | raw PCM response → WAV `BlobLike` (pure). |
| `createBoundedCache` / `createInflight` | the FIFO cache + in-flight dedup primitives (pure). |

Types: `Stage`, `Sequence`, `Clip`, `Bytes`, `BlobLike`, `Onset`, `SequenceOptions`, `PlayResult`, …

## Files

```
types.ts     the public contract
encode.ts    encodeWav + wrapPcm (Float32/raw PCM → WAV) — PURE, node-safe
cache.ts     createBoundedCache (FIFO) + createInflight (dedup) — PURE, node-safe
stage.ts     createStage — owned AudioContext, decode+cache, play, unlock, clock (browser)
sequence.ts  makeSequence — the bounded, pause-gated, abortable scheduler over an injected stage
index.ts     the public surface
```

The pure kernels (`encode`, `cache`) and the scheduler (`sequence`, tested against a fake stage) are
Vitest-unit-tested with no browser. `stage.ts`'s real `AudioContext` path is browser-only and gets
real-surface verification when `voice-model.js` migrates onto it (see the ADR §8). The core stays
self-contained by a build gate (`checkSuonoBoundary` in `tools/check-ownership.js`): a non-relative,
non-`node:` import fails the build.
