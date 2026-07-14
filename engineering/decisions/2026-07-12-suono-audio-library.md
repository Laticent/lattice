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
- **Audio quality — declick.** A synth/TTS clip rarely starts or ends on a zero-crossing, so playing
  it raw steps from silence straight to a non-zero sample — a discontinuity the ear hears as a
  click/pop, worst on decks that narrate many short fragments back to back ("53 / 14 / 4 / 1"), and
  packed tighter by a shorter breath gap. `play()` routes every clip through a `GainNode` that ramps
  0→1 at the head and 1→0 at the tail (default 8 ms, clamped to half the clip) — inaudible as a fade,
  but it removes the step so no surface ever ships clicky audio (`fadeMs` opt-out). The clamp math is
  a pure, unit-tested helper (`envelope.ts`); the ramp scheduling is browser-only.
- **Audio quality — route keep-alive (Bluetooth / CarPlay).** Declick fixes the *waveform* edge at a
  clip boundary; it does nothing about the *transport* going idle. On a Bluetooth / Apple CarPlay
  route iOS drops the A2DP link to a low-power state when the rendered stream is digital silence for a
  beat between per-sentence clips, and the wake-up transient on the next clip is heard as choppiness +
  a pop on its first word (an on-device report; worst on many-short-fragment slides, the same shape
  declick's worst case has). The `stage` now holds a continuous, sub-audible looping noise source on
  the destination (`keepAlive`, default on; `keepAliveGain`, device-tunable ≈ -56 dBFS) so the route
  never idles. It is deliberately OUTSIDE `activeSources` (a `stopAll()`/barge-in must NOT stop it —
  keeping the route warm across a barge-in is the point) and outside the play-clock, so caption sync
  is provably unaffected — unit-covered. **Lifecycle (checker finding):** it must not run for the whole
  tab — the read-aloud stage is a singleton that's never `dispose()`d, so an only-stops-on-dispose
  warmer would pin the link + iOS media session awake forever after one read (battery / audio-ducking).
  Stopping on `stop()` is wrong too (a barge-in re-plays immediately → the pop returns). So it's armed on
  play()/unlock(), held across barge-ins and inter-clip gaps, and RELEASED by an idle timer
  (`keepAliveIdleMs`, default 30 s — above the produce watchdog so it never fires mid-read) once no clip
  is active, then re-armed on the next play. Note this is web-only leverage: the app cannot see or set the
  Bluetooth codec/bitrate (the OS owns that), and cannot reliably detect the route from JS on iOS
  Safari, so route-detection + source-bitrate reduction were rejected as unbuildable on this platform;
  an always-on, detection-free keep-alive is the tractable fix. Audible sign-off is device-only (#23).

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

## 6a. Batching, concurrency & the instance model (why one context, many sources)

A recurring question for a shared library: does it *batch* playback, and does it *reuse or
recreate* audio objects? The answers are a deliberate design, not an accident:

- **Sequential batch — playing many clips in order — IS the sequencer.** `stage.sequence({ items,
  produce })` is exactly "play this batch of N files back to back," with prefetch, breath gaps, and
  barge-in. `warm(items)` **preloads** a batch (bytes *and* decoded buffers) so a later play skips the
  full cold start. This is the batching Lattice needs.
- **Concurrent batch — playing clips AT ONCE (layering/mixing) — is a scheduler POLICY, not a core
  capability.** The hardened `stage` (owned context, decode+cache, iOS unlock, declick, clock) is
  concurrency-agnostic; the *sequencer* is what serializes. The stage already permits overlapping
  `play()` (each call returns its own `PlayHandle`; `stopAll()` and `dispose()` track **every** live
  source, not just the latest — the multi-play-safety fix in this line of work). So a future consumer
  wanting layered audio adds a *second scheduler over the same stage* — it never touches the hardened
  core. **Lattice must never mix voices**, so no concurrent player ships here; a full mixer/effects/bus
  graph stays out of the core by design (§3) — that's a different, much larger library.
- **The instance model — reuse the expensive, recreate only the cheap-and-mandatory:**

  | Resource | Suono | Why |
  |---|---|---|
  | `AudioContext` | **one, reused forever** | Browsers cap ~6/page and each is costly to create; one-per-clip is the anti-pattern. |
  | Decoded `AudioBuffer` | **cached & reused** (keyed) | Decoding is the real CPU cost; one buffer feeds many source nodes. |
  | Source bytes | **cached + in-flight dedup** | Skips re-synth / re-fetch. |
  | `AudioBufferSourceNode` | **new per play** | Web Audio spec: source nodes are one-shot — you *cannot* restart one. Trivially cheap, GC'd on `onended`. |
  | `GainNode` (declick) | **new per play** | Bound to its per-play source; pooling saves nothing measurable. |

  There is no more performant model available: the per-play allocations are unavoidable and
  negligible, and everything expensive is already reused. This holds for both Lattice and broader
  npm use.

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
2. **Migrate consumers onto Suono — sub-sliced, because the seam moved.** The slice-1 sketch assumed
   Suono adoption happens *inside* `voice-model.js`. It can't: `voice-model.js` is required by a
   plain-`node --test` suite, so it must stay node-loadable and **cannot `import` the TS Suono**. So
   the seam is the *consumer* (the app layer), and `voice-model.js` becomes a pure byte SOURCE. And
   there are FOUR consumers (`read-aloud.ts`, `cadenza.astro`, the two Drawing-Board modules), so this
   migrates in sub-slices, non-breakingly:
   - **2a — Studio read-aloud → Suono. ✅ DONE.** `voice-model.js` gained `synthOne(text) → {rung,
     bytes, key}` (the byte source; picks the rung, shares the byte cache, plays nothing — node-tested)
     + `speakThis` (the speechSynthesis parallel path). `read-aloud.ts` now owns a shared Suono
     `stage` + `sequence` (`produce = voice.synthOne`, `onItemStart → reader.align`, highlight rides
     `stage.clockMs()`), replacing the hand-rolled RAF/mode scheduler; #947's per-voice pace
     calibration folds into the new `onItemStart`. `voice.speak()`/`playBlob` STAY (the other three
     surfaces still use them), so it's additive + behavior-neutral. **Verified on real headless
     Chromium** (real `AudioContext`: the word-highlight rode the real audio clock across a 4-sentence
     read to `onFinish`) — closing the UNVERIFIED-stage caveat for the core paths. (Audible hardware
     output + iOS-Safari ringer/`audioSession` remain device-only.)
     - **2a-fix — reliable, pop-free pause/resume (device bug, IMG_2978).** On-device testing surfaced
       two faults the headless harness can't hear: a **pop** on pause/resume, and — worse — **resume
       played the captions but not the audio** on iPhone/Safari. Root cause: pausing leaned on
       `AudioContext.suspend()/resume()` to freeze the in-flight `AudioBufferSourceNode`, which iOS
       silently fails to re-start on resume, and the hard suspend/resume steps the waveform at a
       non-zero sample (the pop). Fix: pause a live clip by **fading it out + stopping it** (recording
       the offset), and resume by **arming a fresh source from that offset** (fading back in) — playback
       is now deterministic, not dependent on the engine un-freezing a source. `PlayHandle` gained
       `pause()`/`resume()`; `makeSequence` tracks the on-stage handle and routes through it (a
       between-clips pause still just freezes `clockMs()` via the context). `onStart` fires **once**
       (never on a resume re-arm — a second onset would re-anchor the caption cursor and corrupt the
       #947 pace calibration), and a stale (pause-stopped) source's late `onended` is ignored via a
       generation token, so a run never settles early. New stage/sequence unit tests + a strengthened
       `read-aloud` nightly (freeze → resume → progress-past-paused-cue → second cycle → finish-once)
       lock it in; the **audible** pop-gone / sound-resumes claim is device-only (HARD RULE #23) and
       signed off on the #950 preview.
       - **Independent checker (maker-checker, HARD RULE #25).** A checker bug-hunt of the rewrite
         confirmed the premature-settle / double-fire / offset-accounting / abort-while-paused paths are
         airtight, and surfaced one real (minor) issue: the caption clock froze at the *deferred*
         `ctx.suspend()` (~fade+8ms after the tap), so it drifted ahead of the tap-resumed audio and
         **accumulated** across cycles. Fixed by a **play-clock offset** recorded at the pause tap
         (`clockMs()` subtracts paused wall-time; `Onset.onsetMs` moved to the same play-clock frame so
         the offset cancels in `clockMs − onsetMs` and never leaks into a later run), plus a
         `resumeClock()` in `finish()` so a stop/barge-in *while paused* never leaves the clock frozen,
         a resume-at-clip-end short-circuit, and a guarded `currentTime` read (never-throws). New unit
         test asserts the clock freezes at the tap and resumes drift-free.
       - **Security (CodeQL).** The nightly harness's throwaway file server was flagged
         `js/path-injection` (a request URL joined into a filesystem path). Replaced with a fixed
         two-file allowlist — no request data reaches the filesystem.
       - **2a-fix — unmute mid-slide resumes audio on the current slide (device report IMG_2982).**
         Muting mid-read stops the paid TTS and falls to the caption estimate; the old code only let a
         later *unmute* take effect on the NEXT slide (a deliberate dodge of "restart snaps the
         highlight to word 0"). The user's expectation is plain: *unmute → the sound returns and is
         heard here*. Now unmute resumes the CLOCKED read from the current sentence — re-speaking it
         from its start, holding the highlight there until the onset — so the correction is at most one
         sentence, never a word-0 snap. Implemented by factoring the clocked-read setup into one
         `startClocked(voice, fromCue, holdMs)` (fresh play = `(voice, 0, 0)`; resume = `(voice,
         currentCue, alignedStartOfCue)`), a generalized "hold the highlight at `holdMs` until the
         first onset" (was hard-coded to 0), a `Reader.trackNow()` to read the live aligned cue start,
         and a `lastCueRef` anchor robust to an unmute landing in a between-words gap. New nightly test
         drives mute → estimate → unmute → clocked-audio → finish-once (mode `audio → silent → audio`);
         audible return is device-only (HARD RULE #23).
   - **2b — REFRAMED once the Drawing Board was declared dead (`2026-07-03-studio-succession.md`).**
     The sketch listed "the other three consumers" (`cadenza.astro`, Drawing-Board practice/present),
     but you don't migrate code that's about to be `git rm`'d: the two Drawing-Board consumers are on a
     FROZEN, soon-removed surface (`drawing-board-present.js` doesn't even touch voice-model — it goes
     through `presenter-window.js`; only `drawing-board-practice.js` calls `voice.speak`). So 2b shrank
     to the one *surviving* non-Studio consumer: **`cadenza.astro` (the /cadenza `noindex` demo) →
     Suono. ✅ DONE.** Its inline script now builds a `stage.sequence({ produce: voice.synthOne, … })`
     with the browser-voice (speechSynthesis) rung on the parallel `speakThis` path, exactly as
     read-aloud does; the clocked path is **verified on the real /cadenza page** (a mocked TTS endpoint
     → the highlight rides Suono's clock, no console errors; audible output device-only).
   - **2c-final — voice-model's own playback REMOVED; the gate allowlist is ZERO. ✅ DONE.** With the
     Drawing Board declared dead, `voice-model.js` was reduced to a **byte source**: its blob-playback
     engine (`getCtx`/`playBlob`/`speak` + the sentence scheduler + the raw `AudioContext`, plus
     `unlock`/`audioTimeMs`/`audioState`/`outputLatencyMs`/`speaking`/`paused`/`previewVoice`) is deleted;
     `pause`/`resume`/`stop` slim to speechSynthesis-only; `synthOne`/`speakThis`/`warm`/the rung ladder
     stay. The Voice-tab "play sample" audition moved onto Suono — voice-model exposes `synthSample()`
     (bytes only) and the read-aloud bridge plays them on the shared stage (the `<audio>` cached-sample
     fast path is untouched). The two frozen Drawing-Board consumers were stripped: `drawing-board-
     practice.js` loses its read-aloud narration, `drawing-board-settings.js` its sample audition (a
     sanctioned retirement refactor, `2026-07-03-studio-succession.md`). Net: **no module outside Suono
     creates a raw `AudioContext` or plays audio**, so `SANCTIONED_LEGACY_AUDIO` is now empty — the
     `checkAudioPlaybackBoundary` gate guards a zero allowlist (a new raw-audio consumer fails outright).
     Verified: voice-model tests 64/64 (node 16 + vitest 48), docs suite green, typecheck/lint/build:check
     clean; the **audible** Voice-tab audition is device-only (its Suono path is unit-verified + mirrors
     the verified /cadenza clocked path).
     - **Independent checker (maker-checker).** Confirmed the byte-source refactor, cache/dedup
       preservation, gate emptying, and frozen-surface strips are correct and complete. Folded findings:
       (a) routing the audition through the **shared** module-singleton stage coupled the clocks — a
       one-off play's `finish()→resumeClock()` could clear a *paused* read-along's stage-global freeze;
       fixed by scoping `finish()`'s unfreeze to the handle that actually paused (`clockFrozenHere`), with
       a shared-stage isolation unit test (not reachable today — Present-fullscreen and the Workspace
       Voice tab can't co-exist — but a real latent footgun); (b) the audition watchdog now `stop()`s its
       orphaned source; (c) dropped the dead `voice`/`openVoiceSettings` args the frozen `drawing-board.astro`
       still passed to `createPractice`, plus stale test-mock props. **Noted, not fixed (device-only):** on
       a *first-ever* audition of an uncached voice, `stage.unlock()` runs after an `await getVoice()`
       dynamic import, so iOS may lose the gesture and the sample stays silent (the watchdog reports it) —
       not a regression (the old path didn't unlock synchronously either); the common cached-sample
       `<audio>` path is unaffected.
   - **2c — the guardrail landed EARLY (doesn't wait for voice-model's removal).** The repo-wide gate
     (§6) is now live as `checkAudioPlaybackBoundary` (`tools/check-ownership.js`, via `build:check`):
     no raw `AudioContext` and no voice-model imperative playback (`.speak({…})` / `.playBlob()`)
     anywhere in `docs/src` outside Suono, on an allowlist + anti-rot ratchet. With `cadenza.astro`
     migrated, the allowlist is down to **two grandfathered entries**: `voice-model.js` (the legacy
     provider — its `getCtx`/`speak`/`playBlob` stay until nothing needs them) and
     `drawing-board-practice.js` (frozen; dies with the Drawing Board's removal, not a migration). Both
     entries drop to zero mechanically as those surfaces are retired — a stale entry fails the gate, so
     the list can't rot. The **final** removal of `voice-model.js`'s playback is what remains, gated on
     the Drawing Board's data-safe deletion (the succession plan), not on more Suono migration.
3. **Library-shape packaging** (optional, when a root-CJS or Tauri consumer actually needs it) —
   the `package.json` + workspace + esbuild/`tsc` `dist/` + freshness-gate recipe from
   `2026-07-08-library-shape-cadenza-vetrina.md`, applied to Suono. Non-goal until there's a
   `require()` consumer; the browser/docs surfaces need only the alias.

Until slice 2 lands, `voice-model.js` keeps its own context (correct, and the reason the repo-wide
gate is sequenced after, not now). This doc commits to *retiring* that duplication via Suono rather
than growing a second audio engine beside it.

## 8a. Adversarial-trio hardening (red team + Munger inversion + independent checker)

Before the human merge, the full trio (HARD RULE #25) ran against the shipping diff. The pure kernels
and the scheduler mechanics held; the trio's real findings were folded (with regression tests):

- **Never-rejects / never-hangs holes closed.** `keyOf`/`gapMs` throwing no longer rejects the run
  (guarded → uncached / no-breath); the `decode` step is now raced against abort + a watchdog, so a
  hung `arrayBuffer()`/decode can't wedge the run forever.
- **Resource bounds.** The decode-bomb guard checks the *declared* size before reading (the OOM
  window was upstream of it) — the **encoded-size `maxDecodeBytes` is the pre-allocation front-line**;
  a caller facing untrusted compressed audio should set it low. The decoded-cache byte budget (256 MiB
  default) is a **retention cap** (bounds steady-state cache growth), *not* an allocation guard —
  `decodeAudioData` allocates the PCM before the cache sees it, so it can't stop a single hostile
  clip's transient decode (an honest limit surfaced by the second red-team pass; a single clip over
  the whole budget is simply never retained). Concurrency (refined across two more red-team rounds to
  an *honest* bound): the run (foreground) caps at `concurrency` (≤16); warm (background) caps at a
  **smaller** ceiling (≤4) and **yields to the run** via a shared `liveProduce` gate, so warm-during-play
  is bounded ≤16 aggregate. Warm-*before*-play can transiently reach run + warm-in-flight (≤20) — the
  run is deliberately ungated (gating it could skip an item), so `play()` drains the warm QUEUE and the
  small warm ceiling caps the in-flight overshoot. Decode-ahead is **awaited inside the warm slot**, so
  concurrent `decodeAudioData` allocations are bounded by the warm ceiling, not a fire-and-forget pile.
  `warm()` no longer creates the `AudioContext` pre-gesture. **Accepted residuals** (inherent to
  un-cancelable WebAudio decode): a deck of genuinely-hung producers crawls at ~timeout-per-item, a
  barge-in over a hung decode orphans that one read, and the decoded budget can't stop a single hostile
  clip's transient decode OOM (encoded `maxDecodeBytes` is the front-line) — all adversarial-input only.
- **Declick degrades, doesn't fail.** The gain ramp is wrapped in its own try/catch → a plain connect
  (no fade, still plays) on a flaky/partial engine — restoring the reliability `voice-model` had.
- **Boundary gate hardened.** `checkSuonoBoundary` catches side-effect (`import 'x'`), dynamic
  (`import('x')`), `require('x')`, AND multi-line `import { … } from 'x'`. Round 3 tightened it further:
  it strips comments first (so a `;` hidden in a comment can't stop the gap-match and let a host import
  slip) and excludes `=`/backtick from the gap (so an `export const X = \`… from 'y'\`` template can't
  false-positive) — both red-team-found and probe-verified.

**Migration constraints surfaced (must hold for the slice-2 migration to be "thin"):**

- **`onState` now emits a terminal event on `stop()`/barge-in, carrying `aborted`** — Cadenza's
  synth-failed→silent fallback distinguishes "stopped" from "ended with no audio" on exactly this.
- **Clock convention documented:** `Onset.onsetMs` is RAW and `clockMs()` is latency-compensated, so
  `clockMs() - onsetMs` is the heard-elapsed time (latency once). A migration that keeps
  `voice-model`'s manual `- lat` would double-subtract — the convention is now spelled out on both.
- **`speechSynthesis` cannot cross the bytes-only boundary** (it produces no bytes; it plays itself),
  so voice-model retains a *parallel* branch for that rung and forwards pause/resume/stop to it. The
  §2 stack diagram is the blob-rung path; "thin consumer" means *thinner*, not literally one path.
- **The "don't warm an expensive local source" judgment stays with the caller** (documented on
  `warm()`) — Suono can't tell a network producer from a CPU-bound one.

## 8b. Adversarial-trio hardening — the read-aloud migration + device fixes (PR #950)

Re-run of the full trio (HARD RULE #25) against what actually ships in PR #950 (the read-aloud→Suono
migration plus the pause/resume + unmute-resume device fixes), since that work is high-blast-radius and
device-unverifiable here. All three lenses confirmed the core clock/pause/resume math, the
`startClocked` refactor faithfulness, the `gen`/`consumedSec` accounting, `activeHandle` routing, and
the never-rejects contract are correct. Three CONFIRMED, reachable defects were folded (with tests):

- **Frozen-clock leak across a barge-in (red team, HIGH).** Pausing BETWEEN clips (while a sentence is
  still synthesizing → no live handle) froze the shared singleton play-clock via `stage.suspend()`, but
  `sequence.stop()` never unfroze it — so a Stop/Next-slide without an intervening resume left the NEXT
  read's caption frozen at word 0 until some later clip finished. Fix: `sequence.stop()` calls
  `stage.resume()` when it was paused (idempotent for the live-clip path, which already unfreezes via the
  handle's `finish → resumeClock`). Regression test in `sequence.test.ts`.
- **Audible audio while muted (independent checker, MEDIUM).** The mute effect only suppressed audio
  when `playing`, so a mute tapped WHILE PAUSED was dropped and the paused-but-live sequence resumed
  audibly on the next play despite the mute. Fix: the mute effect now acts when the audio is live —
  `playing OR paused` — in audio mode. Nightly test `pause → mute → play stays silent`.
- **Voice-blind resume cache key (red team, MEDIUM).** A slide muted-at-play never set `voiceLabelRef`,
  so a later unmute-resume built the decoded-cache key with an EMPTY voice identity → a stale-voice clip
  could replay after a voice switch. Fix: the model/voice label + calibration key now resolve for any
  clocked voice BEFORE the muted branch, so the resume key is content-complete.

**Accepted / noted, not fixed here** (recorded so they aren't lost): the *audible* resume on a
cold-suspended iOS context is the real merge gate — the #950 device sign-off must exercise a real
cold-context resume + a fast double-tap, not a warm happy path (no automated test can see it); the rung
BADGE can go stale on a mid-session ladder change (OpenRouter key revoked mid-read) because the Suono
`onState` doesn't carry the per-sentence rung (rare regression vs. `voice.speak`'s per-event
`setRung`); the ~≤8 ms declick overlap on a rapid pause→resume and the pause-exactly-at-a-clip-boundary
blip are cosmetic device-only residuals; the module-singleton stage means two concurrent readers would
share one context (latent, not reachable in Present today). The unmute "re-speak the current sentence"
backward jog is by design (bounded to ≤1 sentence, strictly better than the shipped-before "silent
until next slide").

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
