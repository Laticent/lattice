---
status: in-progress
summary: Narrated export is slow, and live narration and the export each run their own synthesis loops. This audits every TTS path (Present, prefetch, export, CLI, player) and proposes one synthesis spine for all of them. It is host-agnostic and runs off the main thread, with one scheduler per provider that adapts its concurrency, honors Retry-After and heals itself, plus a concurrency cap the user can set. Packing several sentences into one request is an experiment gated on measurements, and the sentence stays the unit of cache and timing.
---

# One synthesis spine for every voice

**Status:** IN PROGRESS. The owner settled §8's four decisions on 2026-11-11. S0–S3 are built on this
note's PR (#3140), with the changes §9 lists. S4 (packing) failed its gate and is not built.

**The answer, first.** The export is slow for five reasons, and none of them is on-device Kokoro
specifically. Every sentence is its own request. Three separate concurrency budgets of 3 compete
for one provider and share no in-flight dedup. Nothing reads `Retry-After` or backs off adaptively,
and a live failure retries once after a fixed 300 ms. The mp3 encode, base64 and `data:`-URI
assembly run synchronously on the main thread, about 0.1 s per clip. And a voice change between
rehearsal and export misses the cache for the whole deck.

The fix is one **synthesis spine**: a host-agnostic library that owns provider adapters, one
scheduler per provider, the clip cache and the encoder. It runs in a worker, and Present, prefetch,
the export bake and the voice audition all call it. The exported player does not: it stays
self-contained and plays the clips the export baked into it (§4). The sentence stays the unit of cache, timing and billing. Packing several sentences into one
request is a transport-level experiment that ships only if measurements say it wins (§5).

## 1. What runs today

Three scouts mapped this on 2026-11-11 against `main` at `d505251c`. Every claim below has a
pointer; line numbers are from that commit.

**One selection, one voice-model instance.** `docs/src/lib/model-selection.js` stores the voice
selection (`{source, provider, model, voice}`, `:32`). `createVoiceModel` (`docs/src/playground/voice-model.js:895`)
resolves it with no substitution (`resolveVoice`, `:1248`) to one of three byte-producing "rungs"
(adapters):

| Rung | Endpoint | Where it runs | Returns |
|---|---|---|---|
| OpenRouter | `POST openrouter.ai/api/v1/audio/speech` (`:57`, `:416`) | main thread | mp3, or PCM for `PCM_ONLY_MODELS` (`:347`) |
| Gemini, own key | `…/v1beta/models/<id>:generateContent` (`:538`) | main thread, including a `charCodeAt` base64 decode (`:501`) | PCM → WAV |
| Kokoro, on-device | `esm.run/kokoro-js` in a module worker (`:721`, `:747`) | worker; strictly serial (`createSerialQueue`, `:656`) | Float32 → WAV on the main thread (`:753`) |

Speed is a separate localStorage key, not part of the selection (`:174`).

**Three callers, three loops.**

- **Live playback.** Suono's `stage.sequence({produce})` (`read-aloud.ts:953`) calls `synthOne`
  (`voice-model.js:1496`), which goes through `fetchClip` (`:1414`) and `startRequest` (`:1366`).
  Suono gives it 3 slots (`lib/suono/sequence.ts:24`).
- **Prefetch.** `warm` (`:1680`) drives `pumpWarmQueue` with `WARM_CONCURRENCY = 3` (`:301`).
- **Export bake.** `bakeNarration` (`narration-bake.ts:655`) runs `BAKE_CONCURRENCY = 3` workers
  (`:513`) over `synthFor` (`voice-model.js:1775`). That bypasses `startRequest`, so the bake does
  not join in-flight live requests (`:1841`).
- **CLI** `lattice video --narrate` runs Node Kokoro, one `await` per sentence
  (`lib/export/narrate-kokoro.mjs:76`).

**Failure handling.**

- **Live.** It waits up to 20 s (`SYNTH_WAIT_MS`, `:314`), then retries any fast failure once after
  300 ms (`:322`). It never looks at the status code (`:1408`).
- **Bake.** It makes 3 attempts with `[600, 2400]` ms backoff (`narration-bake.ts:517-518`) and a
  45 s timeout (`:532`). A terminal-error regex stops the run (`:526`).
- **Never.** Nothing anywhere parses `Retry-After`, gives 429 or 5xx their own handling, adapts
  concurrency, or opens a circuit breaker.

**Granularity.** Every path sends one request per sentence. Sentences come from cadenza's
`splitSentences` (`lib/cadenza/segment.ts:201`). The bake deduplicates only repeated sentences
(`narration-bake.ts:752`).

**Main-thread work during export, per clip:**

- `compressClip` (a lamejs mp3 encode) takes ~107 ms in a browser and ~32 s for 300 sentences
  (`narration-bake.ts:558-566`, `:788`).
- Base64 runs as chunked `String.fromCharCode` + `btoa` (`:376`).
- The `data:` string is built at `:809`.
- SHA-256 runs at `:812`.

The progress bar cannot paint and Cancel cannot be clicked while this runs (#1511).

**Cache.** The key is `JSON.stringify([rung, model, voice, speed, text])` (`voice-model.js:278`).
There is a 200-entry in-memory FIFO plus Suono's own 200, and an IndexedDB LRU with a 400 MB budget
(`narration-store.js:57`). Compressed mp3 is deliberately never banked (§9 of
`2026-08-04-shared-deck-narration-audio.md`), so every export re-encodes.

**The player** never synthesizes. It plays `data:` clips through one hidden `<audio>` element
(`lib/export/player-core.mjs:2230`), and its CSP allows `media-src data:` only
(`lib/export/player-seal.mjs:41-55`). Two pieces of code are shared with the Studio: the timing
kernels (`@laticent/ltt`, `@laticent/cadenza`) and `lib/core/narration-encode.mjs` /
`speech-pcm.mjs`. Playback itself exists twice: Suono's `AudioContext` in the Studio and `<audio>`
in the player.

**Per-engine figures are scattered across five files.** None of them holds a rate limit or a
concurrency hint:

- `tts-voice-catalog.json`
- `tts-cost.js`
- `ENGINE_BYTES_PER_CHAR` in `narration-bake.ts:254`
- `models.config.json`
- the `voice-model.js` constants

## 2. What has never been measured

These figures would set the design's numbers, and the repo has none of them. The pacing guide says
so outright (`2026-08-03-present-instant-audio-pacing-guide.md:95`, `:122-130`):

- per-request latency per cloud engine: time to first byte, and seconds per character
- the concurrency at which each provider starts returning 429
- whether packing N sentences into one request saves wall-clock time at equal concurrency
- `SECONDS_PER_SENTENCE = 1.6`, which drives the export's time estimate. It is labeled unmeasured
  (`narration-bake.ts:535`).

The live latency reservoir (`narration-latency.js`, 40 samples per voice) records latency on each
device, but nothing aggregates it. **This note therefore proposes no performance number as a
result.** §6's step S0 measures first.

## 3. The spine

*This section is the PROPOSAL. §9 says what was built, where it differs, and why.*

One library with no Studio dependencies, so the Studio, a worker and the CLI can all import it. Proposed
home: `lib/core/voice/`, with the Studio's key and storage plumbing injected rather than imported
(today `voice-model.js:27-41` imports `models-config`, `openrouter-key`, `narration-store` and
`narration-prefs` directly).

```
 Present ─┐                       ┌─ voice worker ───────────────────────────────┐
 prefetch ┼─ request(clipKey, ──▶ │ scheduler per provider                       │
 export  ─┤   lane, signal)       │   lanes: now > next > bulk                   │
 audition ┘                       │   one in-flight map (dedup across callers)   │
                                  │   adaptive concurrency + Retry-After + breaker│
                                  │ adapters: OpenRouter · Gemini · Kokoro · …    │
                                  │ post: decode → onset → (bulk) encode pool     │
                                  └──────────────▶ transferable ArrayBuffer ─────┘
```

**3.1 One engine profile per engine.** One record per engine replaces the five scattered tables:
wire format, price per character, bytes per character, default concurrency, a known rate limit (if
any), whether speed is supported, and whether the engine can report timing. The profile is data,
not code. The measurements from §6's S0 fill its defaults, and each value names its source.

**3.2 Off the main thread.** A dedicated voice worker owns the network fetch and the rest of the
per-clip pipeline:

- the Gemini base64 decode, the WAV wrap and the onset measurement (`speechOnsetMs`)
- for the bulk lane only, the mp3 encode on a small pool of 2–4 encoder workers, as #1511 step 1
  specifies
- the base64 and `data:` assembly

The main thread receives transferable `ArrayBuffer`s. Kokoro keeps its own worker, which the voice
worker drives. The constraint #1511 states holds: **the compressed copy never replaces what playback
reads.**

**3.3 One scheduler per provider, shared by every caller.** This replaces the three budgets of 3.

- **Lanes.** `now` is the sentence playing or about to play. `next` is prefetch lookahead. `bulk`
  is export and warm-the-whole-deck. A free slot always goes to the highest lane waiting, and a
  `now` request can preempt a queued `bulk` one. (On Kokoro today, bake jobs outrank prefetch
  because `synthFor` passes no priority, `voice-model.js:690`.)
- **One in-flight map** keyed by clip key, so a bake never re-requests a sentence that Present is
  already fetching, and the reverse.
- **Adaptive concurrency (AIMD: additive increase, multiplicative decrease).** It starts at the
  profile's default, adds one slot after a run of clean responses up to the user's cap, and halves
  on 429 or 503.
- **`Retry-After` honored.** A 429 pauses that provider's queue for the stated time. Without the
  header, it pauses for a jittered exponential backoff.
- **Error classes, not one regex.**
  - Terminal (401/402/403/404, quota, model gone) stops the provider and tells the user once.
  - Retryable (429, 5xx, network, timeout) goes back on the queue.
  - A 400 is not retried. Today it is retried once.
- **Circuit breaker.** After K consecutive retryable failures the provider pauses. The breaker
  probes once after a cooldown and reopens only on success. The UI says "waiting for the voice
  service", not a failure.
- **What heals means, per lane.**
  - The `bulk` lane does not give up a sentence on a transient error until its retry budget is
    spent, so an export rides out a rate-limit burst instead of refusing.
  - The `now` lane keeps today's behavior: on a miss it plays the caption on its estimated timing
    (Suono's `onStarve`), and the clip backfills for the next pass.

**3.4 The user sets the cap; Auto is the default.** Workspace › Voice gains one setting, "Parallel
requests: Auto · 1–8". Auto uses the profile's measured default and lowers itself on this device
when the scheduler has seen 429s. A manual number is a ceiling the AIMD loop works under, never a
fixed rate it hammers at.

**3.5 The cache stays per sentence.** The key keeps rung, model, voice, speed and text. The spine
fixes the cross-caller misses, not the key:

- One in-flight map closes the bake / live race.
- The export panel already prices a voice change. The spine adds one remedy: "warm in the
  background now", which spends the `bulk` lane while the author keeps editing, so Export later
  finds the clips ready.

## 4. The player

**Owner decision (2026-11-11): the player never synthesizes.** The player is an export path. When an
author chooses to export narration, the file carries that narration and works the way it does
today. "Self-contained means self-contained": no network call, no viewer key, no on-device model,
and the CSP stays `media-src data:`.

The spine therefore serves the player only through the export. It makes the bake faster and more
reliable and produces the same per-sentence clip shape, the same encoder output and the same LTT
clip records. The player's code is out of this note's scope.

This answers the "fetch alongside" and "regenerate" branches of #1935 with a no. Only the bake
branch stays open on that issue.

## 5. Packing sentences into one request, then cutting them apart

The idea: send several sentences in one request, then cut the audio back into one clip per
sentence, so the cache, the LTT (Lattice timing track) one-clip-per-cue rule and the per-sentence
re-timing all hold.

**What it could buy.**

- Fewer round trips. That matters only if per-request overhead dominates *and* the provider
  limits requests rather than characters.
- Possibly better prosody across sentence joins.
- **It does not save money.** Every engine bills per character (`tts-catalog.js:39-43`).

**What it costs, measured or found in the repo.**

- **No provider we use returns word or character timestamps or accepts SSML marks.** OpenRouter's
  `/audio/speech` takes `model, input, voice, response_format, speed` only.
- **The only audio analysis we ship is an onset detector** (`speechOnsetMs`,
  `lib/core/speech-pcm.mjs:44`). A splitter that finds the pauses between sentences has to be
  built.
- **Engines are not repeatable.** Two identical calls varied ~7% in length on Grok and ~51% on CSM
  (the catalog's `_speedNote`). Re-synthesizing one edited sentence inside a packed group would
  sound unlike its neighbors.
- **The timing model assumes a sentence-final pause in each clip.** The cut must leave about 0.7
  of the sentence pause as the clip's own tail (`CLIP_TRAILING_FRACTION`, `cadence.ts:145`). If it
  does not, every breath and emphasis hold drifts.
- **The cut must happen on PCM, before the encode.** Cutting mp3 lands on 1152-sample frames.

**Kokoro is the exception worth testing.** We run its model ourselves, and its duration predictor
computes a length for every phoneme. If kokoro-js exposes those durations (UNVERIFIED: not
installed in this checkout), packed Kokoro audio could be cut at exact sentence boundaries with no
detector. Kokoro is also the engine that most needs the help, at 4–6 s per sentence on WASM and
strictly serial.

**Recommendation: build packing as a gated experiment, not a default.**

- It applies to the `bulk` lane only.
- Its output is always per-sentence clips under per-sentence keys, so the cache and timing never
  learn it happened.
- It ships per engine only when S0's bench shows both conditions:
  - the cut lands on the right N sentences in at least 99% of a fixed corpus
  - wall-clock time drops at least 30% against unpacked requests at the same concurrency
- Anything less falls back to one sentence per request, the path that works today.

## 6. Slices, ordered by what each unblocks

| # | Slice | Unblocks | Closes / touches |
|---|---|---|---|
| S0 | **Measure.** `tools/tts-bench.mjs`: time to first byte, seconds per character, the 429 onset by concurrency, and packed vs unpacked, per engine. Free on Kokoro (Node). Cloud runs are opt-in (`OPENROUTER_ALLOW_SPEND=1`, `--limit`, cost printed; HARD RULE #24). Results go in this note. | every default in S1/S3, and the go/no-go on S4 | the unmeasured figures in §2 |
| S1 | **Engine profile** record. One source for format, price, bytes/char, concurrency, limits. Delete the dead voice ladder in the same pass. | S2, S3 | `followups.d/3079-p3-delete-the-voice-ladder.md` |
| S2 | **Voice worker + encode pool.** Fetch, decode, encode and `data:` assembly leave the main thread. | a responsive export | #1511 step 1, #1503 (the encode numbers) |
| S3 | **One scheduler per provider**: lanes, one in-flight map, AIMD, `Retry-After`, breaker, user cap | rate-limit healing, faster bake | the three budgets of 3 |
| S4 | **Packing experiment**, Kokoro first, behind S0's gate | maybe on-device speed | — |

There is no player slice: §4.

#1509 (asking providers for compressed audio directly) is complementary. Where a provider can
return aac or opus, S2's encode drops out of that engine's path entirely, and S0's bench is the
natural place to try it.

## 7. What would make this wrong

- **Providers rate-limit per account, not per request.** Then concurrency above 2–3 buys nothing,
  and the win is all in S2 and the dedup. S0 finds this out before S3 picks its defaults.
- **Workers cost more than they save.** A worker hop on a 30 KB clip could cost more than the
  encode. S2 measures the hop and keeps small work inline if it does.
- **Packing makes prosody worse.** Some engines speed up or flatten across a long input. S4's gate
  includes a listening pass, not only the cut-accuracy number.

## 8. Owner decisions (2026-11-11)

1. **Packing: a gated experiment.** S4 runs as §5 describes and ships per engine only through
   its gate.
2. **S0's paid measurement: yes, a small run.** The bench prints its planned spend before any
   paid request and runs on demand with `OPENROUTER_ALLOW_SPEND=1` (HARD RULE #24).
3. **The player: self-contained, never synthesizes.** See §4. The owner rejected both offered
   options (a shareable library, and player synthesis) in favor of "it should work as it works
   today."
4. **The PR: this note plus S0–S3 in one PR**, one commit per slice. S4 follows only if its
   gate passes.

## 9. As built (2026-11-11)

### 9.1 What the bench measured (S0)

`tools/tts-bench.mjs`, through OpenRouter, eight narration sentences (441 characters) per phase. Spend: about $0.25 on
our key, under the owner's approval.

| engine | median per sentence | ms per char | chars/s at 1 · 3 · 6 parallel | 429s | packed: cuts matched | packed vs 6 parallel |
|---|---|---|---|---|---|---|
| grok | 0.66 s | 15 | 77 · 193 · 312 | 0 | 6/7 | slower (2.5 s vs 1.5 s) |
| gemini | 2.1 s | 48 | 25 · 62 · 98 | 0 | 6/7 | slower (12.0 s vs 4.8 s) |
| orpheus | 2.9 s | 57 | 15 · 38 · 59 | 0 | 4/7 | slower (9.6 s vs 7.9 s) |
| mai-voice-2 | 1.1 s | 21 | 52 · 132 · 161 | 0 | 2/7 | faster (1.9 s vs 2.9 s) |
| voxtral | 1.2 s | 20 | 48 · 128 · 218 | 0 | 6/7 | slower (3.0 s vs 2.1 s) |
| kokoro (hosted) | 0.4 s | 10 | 77 · 293 · 234 | 0 | 6/7 | slower (1.8 s vs 1.6 s at 3) |
| csm | 5.1 s | 96 | 5.9 · 5.4 · 5.7 | 0 | refused (400) | — |
| kokoro (on-device, Node CPU) | 2.0 s | 41 | serial | — | 5/7 | 1.3x faster than sequential |

What it settles:

- **Parallel requests are the win.** Throughput grew 3–4.5x from one request to six for five of seven
  models, and no model returned a single 429, even at six. The per-model defaults in
  `voice-engine-profile.js` (`MODEL_PARALLEL`) come straight from this table.
- **CSM serializes on the provider's side.** Its latency grew with every extra request, one in eight
  timed out at three and at six, and it never said so with a 429. That is why the defaults, and the
  schedulers, are per model rather than per provider.
- **Packing fails its gate (§5) on every engine.** No engine cut cleanly at the 99% bar; the best was 6
  of 7 boundaries. Six unpacked requests in parallel beat one packed request on five of six engines. S4
  is not built.
- **On-device Kokoro cannot be cut exactly.** The kokoro-js ONNX model's only output is `waveform`, so
  the per-phoneme durations §5 hoped for are not reachable.
- **Hosted Kokoro hung once.** The first run had one request in eight hang for the full 120 s. The rerun
  had none. One hang is not enough evidence to build an attempt deadline on (§9.3).
- **Both Zonos engines are gone** from OpenRouter's live speech list. The catalog still lists them; the
  bench skipped them.

### 9.2 What was built

- **S0:** `tools/tts-bench.mjs`. It is sanctioned as an OpenRouter spender (HARD RULE #24), opt-in, and
  refuses a plan over `--max-usd`.
- **S1:** `docs/src/playground/voice-engine-profile.js`. It holds the per-model parallel defaults and the
  bytes-per-character table, moved from `narration-bake.ts`, which re-exports it. Voices, wire format
  and speed stay in the catalog; prices stay live. Each kind of fact keeps one home and says where it
  came from, instead of all moving into one file.
- **S2:** `narration-pack.js` and its worker and pool, on a worker-pool kernel
  (`docs/src/lib/worker-pool.js`) extracted from the export's picture pool, which now uses it too. Real
  Chromium export of 75 four-second clips, the same build both ways:

  | | long tasks | long-task time | wall time |
  |---|---|---|---|
  | workers | 8–10 | 2.4–2.5 s | 8.3–8.8 s |
  | main thread (worker forced to fail) | 42–50 | 4.7–5.1 s | 8.5–8.6 s |

  About a second of long task remains in both arms. It is not the packing, and it is not traced here.
- **S3:** `docs/src/playground/voice-scheduler.js`, one per cloud voice model. It has lanes, one in-flight map
  with join and promotion, per-waiter cancellation, AIMD under the author's cap, a `Retry-After` pause,
  backoff, and a breaker with one probe. `voice-model.js` routes `startRequest` (live, prefetch) and
  `synthFor` (export, audition) through it. The bake sizes its workers from the model's cap. Workspace
  › Narration › Parallel requests sets the cap.

### 9.3 Where the build differs from §3, and why

- **Per model, not per provider.** See CSM in §9.1.
- **On-device Kokoro stays off the scheduler.** Its serial queue already owns ordering (#1390
  promotion) and dropping (#1391). The maker-checker review reproduced both breaking when Kokoro ran
  through the scheduler (§9.4).
- **No attempt deadline.** The first build aborted an attempt at six times the median latency. The
  review showed that cuts off a slow but healthy long sentence and bills it again, which breaks the "a
  paid request keeps running and banks its clip" rule the live reader and the bake were built on. The
  callers' own ceilings (45 s live, patience plus 60 s grace in the bake) already bound a hung request.
  The scheduler retries only answers no provider bills: 429, 5xx, no answer.
- **No voice worker for the network fetch.** S2 moved the export's packing, the measured cost, off the
  main thread. Moving the rungs' fetch and Gemini's decode needs the sealed-key reader and the
  model-gone and billing latches off the main thread. Recorded in `followups.d/3140-p3-voice-fetch-worker.md`.
- **The voice ladder is not deleted.** It is unrelated to speed and reworks about 92 test setups. It
  stays deferred where it already was (`followups.d/3079-p3-delete-the-voice-ladder.md`).
- **Not built from §3:** the breaker's "waiting for the voice service" message, and the export panel's
  "warm in the background now" remedy. Both are UI the performance goal does not need. They are open
  for the owner on the PR's decision card.

### 9.4 What the maker-checker review changed

One `checker` reviewed S3 before it was committed and found ten issues. Three were confirmed by
reproduction, and all ten were fixed before the commit:

1. A dropped Kokoro prefetch was retried, tripped the breaker, and stalled the sentence the room was
   waiting for. Kokoro now stays off the scheduler.
2. #1390's promotion was dead on Kokoro, and its test passed only by accident. Same fix.
3. The learned deadline re-billed slow healthy requests. It was removed.
4. The bake's retries stacked on the scheduler's: up to 14 billed requests per sentence. Export lane
   retries are now 2, and only unbilled answers are retried.
5. A `synthFor` that joined another caller's request never started its patience. It now starts at once.
6. Cancelling an export could take a sentence from live playback. Cancellation is now per waiter.
7. A model-gone error cleared other models' queued work. Schedulers are now per model.
8. Promoting a running job cut its retry budget. A job now keeps the largest budget of anyone waiting.
9. A probe that failed for good left the breaker half-open. It reopens now. The new test also caught a
   real bug: failures that used up their retries never counted toward the breaker.
10. No changelog or doc. Both were added.

### 9.5 The raise loop, round 1 (2026-11-11)

The card grader set MEDIUM: the scheduler's rate-limit claim rested on a fake clock, and S2 had no independent review.
Round 1 did both, and both found something.

- **A real-surface rate-limit test** (`docs/e2e/share-narration-rate-limit.spec.ts`). It runs a 360-sentence cloud-voiced
  Studio export with Parallel requests at 6 against a mocked OpenRouter that refuses six requests mid-deck with a 429.
  Its first run caught a real defect. The next request went out 505 ms after the 429, not after the 2 s `Retry-After`,
  because **the browser cannot read `Retry-After` from OpenRouter**: its `Access-Control-Expose-Headers` lists
  `request-id`, `cf-ray` and others, but not `Retry-After` (checked against the live API's CORS headers, no key spent).
  So in production the scheduler would never see the header and would retry a rate limit after its 500 ms 5xx backoff.
  - **Fix:** a rate limit with no readable `Retry-After` pauses 2 s, doubling for each new rate limit after a pause
    ends. A burst of 429s that land together counts once, so a burst does not jump straight to the 30 s ceiling.
  - **The spec now runs both cases.** With the header hidden (OpenRouter's case), nothing new starts within 2 s. With
    it exposed at 4 s (a provider that exposes it), nothing new starts within 4 s; that arm passes only if the header
    was read.
  - **Both arms also prove the throughput claims:** more than 3 requests in flight, never more than the cap of 6,
    every sentence shipped, and exactly one request per sentence plus one per refusal.
- **An independent check of S2** (the worker-pool kernel and the picture pool rewritten onto it). It found no blocking
  defect: the picture pool keeps every invariant of the original, traced line by line. It found three small issues,
  all fixed here:
  - The time quote still charged the encode as if it were serial; it is now divided by the pack pool size.
  - The kernel's comment overstated a memory guarantee the narration caller does not get; it is corrected.
  - A worker's "no encoder" answer is now confirmed on the main thread before the export refuses.
