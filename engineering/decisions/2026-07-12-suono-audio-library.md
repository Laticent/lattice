---
status: proposed
summary: >
  Suono — a framework-free, zero-dependency AUDIO PLAYBACK + SEQUENCING library, the third
  spin-off-able sibling beside Cadenza (caption timeline) and Vetrina (walkthrough). Today all
  real audio lives in ONE file, docs/src/playground/voice-model.js, and ~40% of it is a
  general-purpose WebAudio engine (owned AudioContext, decode + buffer/blob cache, in-flight
  dedup, bounded pause-gated concurrency scheduler, iOS unlock + ringer-switch fix,
  latency-compensated clock, WAV/PCM encode) entangled with ~60% Lattice-specific glue (the TTS
  rung ladder, OpenRouter fetch, the Kokoro worker, localStorage prefs, "what to say"). New
  surfaces re-implementing playback would each re-derive the hard iOS/latency/cost hardening,
  badly. DECISION: extract the general 40% into docs/src/lib/suono/ with the SAME contract shape
  Cadenza set — "a clip is bytes; playback, sequencing, and the audio clock are the library's;
  deciding what to synthesize is yours." The core idea mirrors Cadenza's "the timeline is data;
  the clock is someone else's," and the two COMPOSE: Suono owns the real WebAudio clock Cadenza's
  cursor rides and emits the measured sentence onsets Cadenza re-anchors to. Boundary: bytes-only
  — Suono NEVER fetches a URL, touches the network, holds a key, or imports remote code, so HARD
  RULE #24 (our OpenRouter key) is satisfied by construction and there is no SSRF surface. The
  TTS ladder + prefs stay ABOVE it in Lattice (voice-model.js becomes a thin Suono consumer, a
  later slice). Enforcement is a gate: an import-boundary gate now (checkSuonoBoundary, mirroring
  checkCadenzaBoundary), and — once voice-model is migrated — a repo-wide "no raw AudioContext /
  new Audio() / speechSynthesis outside Suono" ownership gate that makes "everyone doing their
  own thing" fail the build. This doc is the DESIGN + the skeleton (types, the pure encode/cache
  kernels, the browser stage, the sequencer, README, boundary gate); the voice-model migration
  and library-shape packaging are named follow-up slices, each its own PR (HARD RULE #17).
companion:
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-06-14-read-aloud-kokoro.md
---

# Suono — the audio playback / sequencing engine (2026-07-12)

> **What it is.** Give Suono audio *bytes* (a `Blob`, an `ArrayBuffer`, an MP3 the network handed
> you, raw PCM off a worker) and it plays them **reliably** — one owned `AudioContext`, decode +
> buffer cache, iOS unlock, the ringer-switch fix, a latency-compensated clock. Give it an ordered
> *sequence* of items plus a `produce(item)` you own, and it schedules synth-ahead, plays them
> with tuned "breath" gaps, and hands back the measured onset of each clip. It **owns no network,
> no key, no model, and no idea what a "sentence" or a "voice" is** — that lives above it. Suono
> just does audio. (*suono*, Italian: sound / "I play".)

**This doc is the ENGINE + skeleton.** It ships as the third member of the spin-off-able trio
(Cadenza, Vetrina, Suono): zero-dependency, framework-free, import-boundary gated, Vitest-tested,
living docs-side beside its consumers (`docs/src/lib/suono/`). The **voice-model migration** (making
`voice-model.js` a thin Suono consumer) and **library-shape packaging** (the `package.json` +
workspace + `dist/` recipe from `2026-07-08-library-shape-cadenza-vetrina.md`) are named follow-up
slices below, each its own PR.

---

## 1. Why this exists — one file, two jobs, no seam

Every byte of audio in Lattice today plays through one module: `docs/src/playground/voice-model.js`
(~1180 lines). Reading it end to end (see the 2026-07-11 audio investigation) shows it is really
**two libraries fused with no seam:**

| The general 40% (→ Suono) | The Lattice-specific 60% (stays above) |
|---|---|
| One owned `AudioContext`, lazy, never per-utterance, never closed | The rung ladder (openrouter → kokoro → speechSynthesis → silent) |
| `decodeAudioData` (callback form for old Safari), fresh-`ArrayBuffer` replay safety | OpenRouter `/audio/speech` fetch + the BYO-key handshake |
| Blob cache (bounded FIFO) + in-flight synth dedup | The CDN-loaded Kokoro model + its same-origin worker |
| The bounded, **pause-gated** concurrency scheduler (cost control) | localStorage voice / model / speed prefs, the `db-voice-changed` bus |
| iOS unlock (gesture-sync, `audioSession='playback'` ringer fix) | Sentence segmentation of narration text, "what to say" |
| The latency-compensated `audioTimeMs()` / `outputLatencyMs()` clock | The React `useReadAloud` hook + Present autoplay chaining |
| WAV encode (Kokoro PCM) + PCM-response wrapping | The voice-sample catalog + preview UI |

The consequence: a **new surface that wants audio** — a future export preview player, a Studio
"listen to this section," a Tauri desktop narrator — has nowhere to get the hard part. It either
imports `voice-model.js` (dragging OpenRouter, Kokoro, and the prefs bus it doesn't want) or
re-implements playback and **re-derives every trap** — the iOS ambient-vs-playback session bug, the
detached-`ArrayBuffer`-on-replay bug, the paused-scheduler-still-billing bug — each of which cost a
real adversarial-review cycle to find the first time. That is the "everyone doing their own thing"
the architect flagged. Suono is the seam.

## 2. The core idea — a clip is bytes; the clock is the library's

Cadenza's one idea is *"the timeline is data; the clock is someone else's."* Suono is the mirror:

> **A clip is bytes. Playback, sequencing, and the audio clock are the library's. Deciding what to
> synthesize is yours.**

And they **compose into one contract** instead of the hand-wiring `read-aloud.ts` does today:

- Suono owns the **real WebAudio clock** (`clockMs()`), the thing Cadenza's cursor must ride to
  track a real voice. Today `read-aloud.ts` reaches into `voice.audioTimeMs()` by hand.
- Suono emits each clip's **measured onset + duration** (`onItemStart`), which is exactly the anchor
  Cadenza's `reader.align(cueIndex, onsetMs, durationMs)` consumes. Today `voice-model.js`'s
  `onSentenceTiming` and `read-aloud.ts`'s `reader.align` are wired sentence-by-sentence in app code.

So the intended stack is:

```
  Cadenza  (timeline data: cues → words, the estimate + the align() re-anchor)
     ▲  onItemStart({ onsetMs, durationMs })  +  clockMs()   ← the seam this doc formalizes
  Suono    (plays the bytes, owns the clock, schedules the sequence)
     ▲  produce(item) → bytes
  Lattice  (the rung ladder: which model/voice, OpenRouter/Kokoro, the prefs)  ← stays app-side
```

## 3. Scope — what Suono is, and is deliberately NOT

**Is:** decode + play arbitrary audio bytes on one owned context; sequence an ordered set with
prefetch + breath gaps + barge-in + pause/resume; a byte cache + a decoded-buffer cache + in-flight
dedup; the WebAudio clock + output latency; iOS/Safari unlock + ringer fix; WAV/PCM encoding.

**Is NOT (v1, on purpose):**

- **Not a fetcher.** It never takes a URL, never hits the network, never holds a key. Bytes in,
  sound out. (§6 — this is the security boundary, not just a scoping nicety.)
- **Not a synthesizer / not a decider.** It does not know TTS, models, voices, or "sentences." A
  caller's `produce(item)` returns bytes; a caller's `keyOf(item)` names them for the cache.
- **Not effects / EQ / mixing / capture.** No tone-shaping (which is why the name is *Suono*, not
  *Timbro*), no microphone, no multi-track mixer. One sequence plays at a time. These are real
  libraries of their own; folding them in now would balloon the surface for zero current use.
- **Not a renderer.** No DOM, no highlight, no transport UI. That's the caller's (and Cadenza does
  the timing).
- **Not streaming.** Whole clips only in v1. Chunked/streamed synthesis is a plausible v2 and the
  `produce → bytes` seam leaves room for it, but it is out of scope here.

## 4. The API — a low-level "stage" + a declarative "sequence"

Two layers, exactly paralleling Cadenza's low-level `makeCursor` and higher `makeReader`.

### 4.1 The stage — owns the context + plays one clip

```ts
const stage = createStage({ compensateLatency: true });
stage.unlock();                              // CALL SYNCHRONOUSLY in the user gesture (iOS)
stage.state();                               // 'none' | 'suspended' | 'running'
stage.clockMs();  stage.latencyMs();         // the clock + latency Cadenza's cursor rides
const buf   = await stage.decode(bytes, key?);        // Bytes → cached AudioBuffer
const voice = stage.play(buf, { onStart, signal });   // → { stop() }; onStart fires at TRUE start
stage.suspend();  stage.resume();            // context-level pause (mid-clip, no offset bookkeeping)
stage.dispose();                             // rare; release the context
```

`Bytes` = `Blob | ArrayBuffer | BlobLike` (the `{ size, type, arrayBuffer() }` duck type the
PCM-wrap path already uses — it lets a worker hand back raw bytes with no `Blob` round-trip and lets
tests run under node). `onStart({ onsetMs, durationMs })` is read at `src.start(0)`, **not** at
schedule time, so a caption cursor can't lead the voice by the decode gap.

### 4.2 The sequence — the "DSL" (all data, like a `CaptionTrack`)

```ts
const seq = stage.sequence({
  items,                                     // T[] — opaque to Suono
  produce: (item, { signal }) => Promise<Bytes | null>,   // YOUR synth / byte source
  keyOf:   (item) => string,                 // cache identity; omit → no caching for this run
  gapMs:   (item, next) => number,           // "breath" inserted AFTER item (0 = none)
  concurrency: 3,                            // bounded synth-ahead (never fire-all)
  onItemStart: ({ index, onsetMs, durationMs }) => {},    // → Cadenza reader.align(index, …)
  onState:     ({ playing, index, error }) => {},         // lifecycle; never throws
});
seq.play();  seq.pause();  seq.resume();  seq.stop();
seq.warm(items, { signal, concurrency: 1 });  // prefetch bytes into the cache, no playback
```

The "DSL" is that descriptor — declarative data the caller hands in, the way Cadenza hands you a
track. `produce` is where the Lattice rung ladder plugs in; `keyOf` is where Lattice's
`rung+model+voice+speed+text` key plugs in. **Suono never learns what those mean** — it caches by
the opaque string, dedups in-flight `produce` calls for the same key, schedules with bounded
concurrency, pause-gates the scheduler (so a pause can't silently synthesize — and bill — the rest
of the deck), inserts the gap, and forwards the measured onset. Every hard-won behavior in §5 is
captured *inside* this call; the caller writes none of it.

## 5. Best practices captured INSIDE the library (not re-derived per surface)

Each of these is a real bug voice-model.js paid for once. In Suono they are the library's job:

- **Performance.** One owned context (never per-utterance, never closed, auto-resume). A **decoded
  `AudioBuffer` cache** keyed like the byte cache — this closes the one real gap the 2026-07-11
  investigation found (today every replay re-runs `decodeAudioData` even on a byte-cache hit). Byte
  cache (bounded FIFO) + **in-flight dedup** (two identical items in one batch join one `produce`).
  Bounded **synth-ahead** concurrency, refilled as slots free. Transferable PCM from workers.
- **Cost control.** The scheduler is **pause-gated**: pausing stops refilling `produce` slots, so a
  "pause to think" can't run the whole remaining sequence through a paid backend in the background.
  A separate, smaller `warm()` budget so cross-boundary prefetch can't double the ceiling.
- **Correctness / resilience.** The sequence contract **never rejects** — a `produce` failure or a
  decode failure degrades to silence and reports via `onState.error`, it never breaks the surface.
  **Barge-in** via `AbortController` (a new `play()`/`stop()` cancels the prior run first). A
  **watchdog** resolves a hung `produce` (skip the item, keep going) instead of freezing the rest.
- **iOS / Safari.** `unlock()` promotes `navigator.audioSession = 'playback'` (the ringer-switch
  fix — a bare context renders through the *ambient* session the mute switch silences), resumes the
  suspended context, and ticks a 1-sample buffer — all synchronously in the gesture. Decode uses the
  **callback form** of `decodeAudioData` (older Safari lacks the promise form). `arrayBuffer()`
  returns a **fresh copy** per call (`decodeAudioData` detaches its input; the cache replays).
- **Caption sync.** `clockMs()` + `latencyMs()` are exposed and latency is subtracted so a highlight
  tracks the ear, not the buffer; `onItemStart` carries the *measured* onset for `reader.align`.

## 6. Security posture — the boundary IS the safety

Cadenza's safety is "no import escapes the folder." Suono adds a second, stronger invariant that
falls out of §3's "not a fetcher":

1. **Bytes-only — no network, no URL, no key, ever.** Suono has no `fetch`, takes no URL, and holds
   no credential. This is not a convention; it is the design. Two payoffs:
   - **HARD RULE #24 (our `OPEN_ROUTER_KEY`) is satisfied by construction.** The key cannot leak
     through code that has no network and no key parameter. The OpenRouter fetch stays in Lattice's
     `produce`, above the library.
   - **No SSRF surface.** A caller (or a malicious deck that reaches `produce`) cannot make Suono
     request an arbitrary host, because Suono requests nothing.
2. **No remote code.** Suono never `import()`s a CDN URL. The Kokoro `esm.run` import + its worker
   stay in Lattice's adapter (`voice-model.js` / `kokoro-worker.js`), outside the boundary.
3. **Decode-bomb guard.** `decode()` rejects bytes over a configurable cap (default 32 MB) before
   handing them to `decodeAudioData`, so a pathological "clip" can't OOM the tab.
4. **Zero-dependency, pure core.** `encode.*` and `cache.*` are `node:`-and-relative only and
   Vitest-tested without a browser; the browser-only `stage` isolates every `window`/`AudioContext`
   touch behind a capability check (SSR-safe: no top-level browser access).

**Enforcement (the "can't have everyone doing their own thing" mechanism):**

- **Now:** `checkSuonoBoundary` in `tools/check-ownership.js` (via `build:check`), a byte-for-byte
  copy of `checkCadenzaBoundary`: any import in `docs/src/lib/suono/` that isn't `./x` or `node:`
  fails the build. This is the spin-off contract.
- **Follow-up (after the voice-model migration):** a repo-wide ownership gate that fails on any
  `new AudioContext` / `webkitAudioContext`, `new Audio(`, or `speechSynthesis` reference **outside**
  `docs/src/lib/suono/` (allowlisting the library itself, plus a shrinking, dated exemption for
  `voice-model.js` until it's fully migrated). It cannot land *before* the migration — voice-model
  legitimately still owns a context until then — so it is sequenced after, exactly like the margin /
  hex / preview-sink allowlists (HARD RULE #15 shape). This gate is what makes a fourth surface
  physically unable to open its own context.

## 7. What the skeleton in this PR contains

`docs/src/lib/suono/`:

```
types.ts       the public contract (Bytes, Stage, Sequence, options, callbacks)
encode.ts      encodeWav (Float32 PCM → WAV) + wrapPcm (raw PCM response → WAV) — PURE, node-safe
cache.ts       createBoundedCache (FIFO) + createInflight (in-flight dedup) — PURE, node-safe
stage.ts       createStage — the owned AudioContext, decode+cache, play, unlock, clock (browser)
sequence.ts    makeSequence — the bounded, pause-gated, abortable scheduler over an injected stage
index.ts       the public barrel
README.md      the 60-second start + the "what it is NOT" contract
*.test.ts      Vitest for the pure kernels + the scheduler (a fake stage; no real audio device)
```

The scheduler depends on an **injected stage interface**, not a live context, so its logic
(concurrency, pause-gating, dedup, barge-in, gap insertion, never-reject) is fully unit-tested under
node with a fake player. `stage.ts`'s real `AudioContext` path is browser-only and **UNVERIFIED**
from this sandbox (HARD RULE #23) — it is a faithful lift of `voice-model.js`'s already
browser-proven `getCtx`/`unlock`/`playBlob`, and gets real-surface verification when the voice-model
migration wires it into the Playground.

## 8. Build order (slices — each its own branch → PR, each builds against `main` alone, #17)

1. **This PR — the library + boundary gate + ADR.** Suono lands as docs-side TS consumed via the
   `@/lib/suono` alias (no `package.json` yet — a bare co-located manifest with a `dist` `exports`
   map would split the docs toolchain, per `2026-07-08-library-shape` finding #1; packaging waits
   for slice 3). Pure kernels tested; scheduler tested with a fake stage; `checkSuonoBoundary` green.
2. **Migrate `voice-model.js` onto Suono.** Replace its `getCtx`/`unlock`/`playBlob`/`speak`
   scheduler internals with a Suono `stage` + `sequence`; the rung ladder, OpenRouter fetch, Kokoro
   worker, and prefs stay. Net deletion in `voice-model.js`. Verified on the **real Playground**
   (drive read-aloud on the actual docs build — the surface HARD RULE #23 demands), dark + light,
   desktop + a coarse-pointer check. Then add the repo-wide "no raw AudioContext outside Suono" gate
   (§6), with voice-model now clean.
3. **Library-shape packaging** (optional, when a root-CJS or Tauri consumer actually needs it) —
   the `package.json` + workspace + esbuild/`tsc` `dist/` + freshness-gate recipe from
   `2026-07-08-library-shape-cadenza-vetrina.md`, applied to Suono. Non-goal until there's a
   `require()` consumer; the browser/docs surfaces need only the alias.

Until slice 2 lands, `voice-model.js` keeps its own context (correct, and the reason the repo-wide
gate is sequenced after, not now). This doc commits to *retiring* that duplication via Suono rather
than growing a second audio engine beside it.

## 9. Alternatives weighed

- **Playback-only kernel (no sequencer).** Smaller surface, but every consumer re-implements the
  scheduler + cost control + dedup — the exact fragmentation this exists to kill. Rejected: the
  scheduler is the load-bearing, bug-dense part; a library that omits it isn't worth the seam.
- **Full generalization incl. a source/rung registry.** Absorb the ladder shape (register named
  sources with `ready()`/`synth()`). More powerful, but it bakes Lattice's TTS assumptions
  (rung names, availability semantics) into a "general" library and drags the network/key concern
  back over the boundary. Rejected: `produce(item) → bytes` already generalizes "a source" without
  Suono knowing it's TTS at all.
- **Leave it in `voice-model.js`.** Zero work, but the next surface pays the whole iOS/latency/cost
  tax again. Rejected — this doc exists because the architect called that outcome.
