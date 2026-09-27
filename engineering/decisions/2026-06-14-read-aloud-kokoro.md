---
status: proposed
summary: A free, boardroom-quality read-aloud voice via a VoiceModel ladder (OpenRouter TTS then Kokoro WASM), banning speechSynthesis
---

# Read-aloud — one consistent voice, never the per-device lottery (2026-06-14)

> **Status: design.** Decides *how* Lattice speaks a deck aloud at near-zero
> cost and at boardroom quality. The shipped feature must **not** lean on the
> browser's built-in `speechSynthesis` (banned in production — kept only as a
> dev/test stand-in), because that ships "whatever each device happens to have,"
> a different mediocre voice everywhere. Instead, a **voice ladder** (sibling to
> the model ladder in `architect-model.js`) gives one consistent, good voice:
>
> - **`openrouter-tts` — primary, hosted.** OpenRouter shipped a real TTS
>   endpoint in 2026 (`POST /api/v1/audio/speech`, OpenAI-compatible:
>   gpt-4o-mini-tts, Gemini Flash TTS, Voxtral). It reuses the **exact browser
>   OAuth key + CORS** the Drawing Board already uses for the AI architect, so it
>   needs **no new infra** and costs the *project* **$0** (billed to the user's
>   own OpenRouter credit, ~0.6¢/slide). Best voice, smallest diff.
> - **`kokoro-wasm` — free fallback, in-browser.** Kokoro-82M (ONNX, Apache-2.0)
>   runs in the browser via WASM/WebGPU for users **without** an OpenRouter key:
>   $0, offline, private, no account — still miles past `speechSynthesis`.
> - **`speechSynthesis`** → dev/test only. **`silent`** → the floor.
>
> First surface: **Practice / Rehearsal mode** (current browser app); second:
> the **Tauri authoring preview** (gains a native Kokoro rung later). **Build
> scope decided (2026-06-14): (B) the full two-rung ladder in one PR** —
> `openrouter-tts` + `kokoro-wasm` + `silent`, so no-key users are covered
> immediately. See §Build scope. **Status: shipped** — the ladder lives in
> `docs/src/playground/voice-model.js` and is wired into Practice mode's HUD
> (`drawing-board-practice.js`); the speaker note rides `notes-core` via the
> authoring-core browser bundle (HARD RULE #1).

## The ask

A "read out loud" capability with a *great* voice, **free or near-free**, that
does **not** depend on the browser's built-in speech for the shipped feature
(that's fine only as a prototyping stand-in). OpenRouter was floated as the
provider — and as of 2026 that instinct is correct (it wasn't, a year ago). Of
the doors people reach for, one is *now open* and one stays a dead end.

### The open door — OpenRouter audio-OUTPUT models (corrected 2026-06-15)

We already use OpenRouter (`architect-model.js`, `openRouterBackend`), and it is
the natural reach. **Correction:** an earlier draft of this doc claimed OpenRouter
shipped a `POST /api/v1/audio/speech` TTS route serving `gpt-4o-mini-tts`. **That
was wrong** — OpenRouter has *no* TTS models and no working `/audio/speech` route
(the path 401s but routes no model), so the first cut of the cloud rung failed on
*every* device, not just iOS. What OpenRouter *does* offer is **audio-output chat
models** — `openai/gpt-audio-mini` (cheapest) and `openai/gpt-audio` — that speak
via the **chat-completions** endpoint:

```
POST /api/v1/chat/completions
{ model:'openai/gpt-audio-mini', modalities:['text','audio'],
  audio:{ voice:'nova', format:'wav' }, stream:true,   // stream is MANDATORY
  messages:[ {role:'system', content:'…verbatim TTS engine…'}, {role:'user', content:<note>} ] }
```

The spoken audio arrives as **base64 deltas** in `choices[].delta.audio.data` over
SSE, concatenated client-side into a WAV Blob. Voices: alloy · echo · fable · onyx
· nova · shimmer. (Docs: `openrouter.ai/docs/guides/overview/multimodal/audio`.)

Crucially for *this* codebase: `architect-model.js` already authenticates to
OpenRouter **from the browser** via OAuth PKCE, stores the key in `localStorage`,
and all endpoints are **CORS-enabled for browser use** (verified: the speech path
returns `access-control-allow-origin: *`). So the cloud voice is a **`fetch` on
infrastructure we already have** — no proxy, no server, no new secret — which keeps
OpenRouter the **primary** rung; only the endpoint + payload shape changed.

### The dead end that stays dead — you cannot tap Siri / Assistant from the web

The only hook a browser gives a page to platform voices is the **Web Speech
API** (`speechSynthesis`), and it is exactly what we ruled out:

- **iPhone / Safari** — `getVoices()` exposes the iOS *system* voices (Samantha,
  plus any "Enhanced/Premium" voices the user has manually downloaded). It does
  **not** expose the **Siri** voice — Apple reserves it; you can't select it, and
  a page can't invoke Siri-the-assistant at all. (Even native iOS apps can't use
  the literal Siri voice for arbitrary text.) It's also flaky: needs a user
  gesture, `getVoices()` populates late (wait for `voiceschanged`), truncates long
  utterances, and stops on screen-lock.
- **Android / Chrome (Pixel, LG, Samsung)** — same single door: whatever system
  TTS engine is set (usually Google TTS, sometimes the OEM's). LG is just Android;
  there's no special LG hook. Quality is uncontrollable and varies per device. The
  good Google neural voices live in Assistant, which the web can't reach either.

The deeper point: `speechSynthesis` means we ship **no voice at all** — we ship
"whatever each user's phone happens to have," a different, mostly-mediocre voice
on every device, none of them the assistant voice people picture. That's the
opposite of a boardroom product, and it's why the ban is correct. **We choose
one consistent voice (hosted via OpenRouter, or shipped via Kokoro) — we never
borrow the per-device lottery.**

## The axes

| Axis | What it decides |
|---|---|
| **Runtime location** | Hosted API (OpenRouter) vs. in-browser (WASM/WebGPU) vs. native sidecar. |
| **Voice quality** | "Robotic but clear" vs. boardroom-natural prosody. The whole point. |
| **Cost** | Per-character API billing vs. $0 marginal. Constraint: free/near-free. |
| **Infra** | Reuses existing browser auth vs. needs a server proxy vs. ships weights. |
| **Offline + privacy** | Runs with no network and no deck text leaving the device. |
| **Account gating** | Works for anyone vs. needs a connected key + credit. |

## Candidates

| Engine | Quality | Cost | Runs where | Infra fit (static site) | Verdict |
|---|---|---|---|---|---|
| **OpenRouter TTS** (gpt-4o-mini-tts / Gemini Flash TTS) | **Excellent**, natural | ~0.6¢/slide on **user's** key; **$0 to project** | Hosted; **browser-direct via existing OAuth + CORS** | **Trivial** — reuses architect key | **Primary rung** |
| **Kokoro-82M** (`kokoro-js`, ONNX) | **Excellent** for its size; natural prosody | **$0**, no key | In-browser WASM/WebGPU (and native later) | Good — ships ~80 MB weights, no backend | **Free-fallback rung** |
| Piper | Good, clear, a touch robotic | $0 | WASM / native sidecar | Good but below the bar | Backup if Kokoro packaging hurts |
| Google / Azure / Polly free tiers | Excellent | 1M–5M free chars/mo, then cheap | Server | **Poor** — no browser CORS + secret key ⇒ needs a Worker proxy | Out unless we add a proxy |
| Edge-TTS (unofficial MS) | Outstanding | $0, gray-area | Server only (no CORS) | Poor + ToS risk | Out |
| Web Speech API | Poor/inconsistent | $0 | Browser only | n/a | The banned door; **test stand-in only** |

## Decision — a two-rung browser voice ladder

> **Updated 2026-09-27:** on a desktop (fine-pointer) device, `auto` now puts on-device
> Kokoro FIRST once it is loaded, unless the author picked a cloud model. A read starts the
> download. A Workspace switch can also route the cloud default to the cheapest paid voice.
> See [2026-09-27-voice-default-and-cheapest-toggle.md](2026-09-27-voice-default-and-cheapest-toggle.md).

A `VoiceModel` (the playground's `docs/src/playground/voice-model.js`),
structured as the model ladder's twin — one interface, backends behind
capability/connection detection:

```
speak({ text, voice, signal, onSentence })  →  audio playback, resolves when done
  backends (preference order):
    openrouter-tts  — OpenRouter /audio/speech (gpt-4o-mini-tts)  (PRIMARY when a
                                                                   key is connected)
    kokoro-wasm     — Kokoro ONNX in-browser (WebGPU→WASM)        (FREE fallback,
                                                                   no account/offline)
    speechSynthesis — OS Web Speech API                           (DEV/TEST ONLY)
    silent          — the floor: no audio, never throws
```

App code calls `speak()` and never branches on the backend, exactly as it never
branches on the generation backend today. The two production rungs are
**complementary, not redundant** — each one's weakness is the other's strength:

- **`openrouter-tts`** — top voice, near-zero integration (a `fetch` on the
  existing OAuth key), $0 to the project. Costs the *user* pennies, needs
  network, and needs them to have connected OpenRouter (Practice/architect
  already prompt this).
- **`kokoro-wasm`** — covers the no-account / offline / privacy-max case for
  free, via the **same** onnxruntime/transformers.js + Worker + CDN-on-demand
  stack the universal model tier already loads from `esm.run`. Cost is a one-time
  ~80 MB (q8) → ~330 MB (fp32) download + client compute (can run slower than
  realtime on weak/mobile devices).
- **Deterministic floor** — when no rung is ready, the surface degrades to
  silent/text, never breaks. Same "the model never owns correctness" discipline
  as the generation ladder.

## Cost — the actual numbers

**OpenRouter `gpt-audio-mini`** (the corrected model): ~$0.60/1M text-input +
$0.60/1M audio-output tokens (`gpt-audio` is ~13× pricier at $2.5/$10 text and
$32/1M audio). Audio output dominates; for real decks (speaker notes ~50 words/slide
≈ 20 s of audio) it lands in the **sub-cent-per-slide** range, ≈ **~10¢** for a
20-slide read-through.

- **Cost to the project: $0** — billed to each user's own OpenRouter credit (BYO
  key, the same OAuth connection the AI architect uses). `gpt-audio-mini` is the
  cheaper default; `gpt-audio` is the higher-fidelity step-up.

**Kokoro in-browser:** **$0 marginal, forever, for everyone.** The only cost is
the one-time model download per user (~80–330 MB by dtype) and their device's
CPU/GPU doing synthesis. Both rungs satisfy the free/near-free constraint.

## First surface — Practice / Rehearsal mode

Practice mode (`drawing-board-practice.js`) is the ideal first home because the
voice has both a **script** and a **clock** already computed for it:

- **What to speak.** Prefer the slide's **speaker note** (the real talk track —
  `notes-core.js` is the single source for the note boundary; HARD RULE #1).
  Fall back to the slide's prose **snippet** that the rehearsal planner already
  derives (`drawing-board-rehearsal.js`, `snippetOf`). So the voice reads what
  you'd actually *say*, not the on-slide bullets.
- **When to speak.** *v1 narrates the note per slide* and barges in on
  navigation. The richer prize — riding the plan's timed `beats`
  (`pause` / `eye` / `breathe` / …) so the voice falls silent exactly where the
  coach says "let the number land," turning a read-aloud run into a *modeled
  delivery* of the rehearsal plan rather than a flat TTS dump — is the obvious
  next refinement (§Later), **not** in the shipped v1. The adapter splits on
  sentences precisely so those inter-sentence silences can be inserted later.
- **Controls + barge-in.** A play / pause-resume control in the bottom HUD (real
  pause that keeps position, not a stop); navigating slides (`go()`) aborts the
  current utterance via the `signal` and starts the new slide's — no overlap.
  Stays in lockstep with the existing one-slide-at-a-time stage.

This makes read-aloud feel native to the feature instead of bolted on: Practice
already *coaches* pacing; now it can *demonstrate* it.

### Second surface — Tauri authoring preview

Once the adapter exists, the natural next home is a "read the current slide"
control in the **Tauri editor preview** — hear awkward phrasing by ear while
writing. Same `VoiceModel.speak()`, no script/clock to honor (it just reads the
note or visible prose on demand), so it's a thin add. In the desktop app it can
add a **native** Kokoro rung (§Later); in the web playground it rides the same
browser rungs — the adapter hides which. Listed after Practice only because
Practice ships in the browser today while the Tauri shell has no code yet.

## Build scope — decided: (B) full ladder in one PR

The architecture (two-rung ladder) is settled. **Decision (2026-06-14): build
the full ladder in one PR** — `openrouter-tts` + `kokoro-wasm` + `silent`
together, wired into Practice mode, so users without an OpenRouter key get a real
neural voice immediately. The alternatives considered and rejected:

- **(A) OpenRouter-first.** Smallest diff, but leaves no-key users on the
  `speechSynthesis` floor until a follow-up — and the user is sold on Kokoro, so
  ship both now.
- **(C) Doc only.** Superseded — we're building.

## Configuration — the Voice settings tab (shipped 2026-06-14)

The drawer's once-deferred voice picker shipped as a fourth Settings tab,
**Voice** (`drawing-board-settings.js` → `voiceSection`), backed by **one shared
`VoiceModel`** created in `drawing-board.astro` and passed to *both* Practice and
Settings (so a pref set in the drawer takes effect in Practice immediately, and a
single Kokoro worker / download is shared — never two). It carries:

- **Voice source** — a segmented `Auto · Cloud · On-device · Off` over
  `setRungPref()`, plus an "In use:" line showing the *live* rung (which can differ
  from the preference when a preferred rung isn't ready — e.g. `On-device` selected
  but not yet downloaded falls back to cloud; addresses **Open Q #4**, the
  active-rung disclosure).
- **Curated voice pickers with samples** — the strongest English voices for each
  rung (cloud: `nova`/`alloy`/…; Kokoro: `af_heart`/`af_bella`/… — *not* all 54,
  which is overwhelming), each row a select + a **play-sample** button
  (`previewVoice({rung, voice})`, which auditions an explicit voice off the auto
  ladder). Samples are enabled only when the rung is ready (cloud connected /
  Kokoro loaded).
- **On-device download/remove** — Kokoro's deliberate ~80 MB fetch with a progress
  bar (mirrors the AI tier's `runLoad`), and a Kokoro-scoped `removeKokoro()` that
  deletes only the voice weights from Cache Storage.

### The iOS worker — same-origin, not `blob:`

A phone bug drove a structural fix. The Kokoro worker was built from a
`URL.createObjectURL(blob)` — an **opaque-origin** worker — and Safari/iOS
**refuses a cross-origin `import()` from an opaque origin**. So on iOS the worker's
`import('https://esm.run/kokoro-js')` always threw, the rung fell back to loading
onnxruntime-web + the ~80 MB model **on the main thread**, and the memory spike
**reloaded the tab** — kicking the user out of Practice right after the download
"succeeded." The fix: extract the worker to `kokoro-worker.js` and instantiate it
the Vite way — `new Worker(new URL('./kokoro-worker.js', import.meta.url), {type:
'module'})` — so Vite emits it as a **hashed same-origin asset**. A same-origin
worker *is* allowed the cross-origin runtime import (esm.run sends permissive
CORS), so kokoro-js stays CDN-loaded (no npm dep) **and** the model loads off the
main thread on iOS. The blob path is gone; `loadMain` (the main-thread loader)
survives only as a desktop last resort, reached when the worker can't be
constructed **or** errors during load. Crucially, that fallback is **gated off on
a coarse pointer (phone/tablet)** — a main-thread load is the very OOM-reload we're
fixing, so on mobile a worker failure surfaces an error (the UI offers cloud /
retry) instead of silently re-OOM'ing the tab.

**iOS playback — WebAudio, not `<audio>`.** A separate Safari rule bit playback
even once the model loaded: iOS blocks programmatic playback that fires *after* the
async download + synth (the tap's gesture is gone), so it played **nothing**
("downloaded but not audible"). A silent-clip unlock of an `<audio>` element was
**not enough** on the test devices, so playback moved to **WebAudio**: one owned
`AudioContext`, `decodeAudioData` → an `AudioBufferSourceNode`. `VoiceModel.unlock()`
**resumes the context synchronously on the tap** (read-aloud button + play-sample),
which blesses it for the buffer that plays a moment later; WebAudio also routes
through the channel that **ignores the hardware ringer/silent switch**, and
`decodeAudioData` handles both the Kokoro WAV and the OpenRouter MP3 (and would
surface genuinely empty audio rather than fail quietly). Pause/resume is
`AudioContext.suspend()/resume()` — mid-clip, no offset bookkeeping. Verified on
desktop that `wavBlob()` output decodes and plays to `ended`; iOS audibility is the
on-device check.

Two smaller fixes rode along: the Practice button now reads a **Cache-Storage
probe** (`detectKokoroCached()` — the same signal the On-device tab lists
"Downloaded on this device" from), so a cached-but-not-loaded model shows "ready",
not a misleading "download ~80 MB" glyph; and the load/error copy says "voice," not
"download," since a cache load isn't a download.

**Resolution — on-device is desktop-only; cloud is the iOS/mobile path.** The
same-origin worker fixed the *desktop* off-main-thread load, but stacking mobile
mitigations on top (q4 weights, a gated main-thread fallback) to chase a reliable
*on-device* voice on Safari/iOS hit diminishing returns — even a lighter model +
onnxruntime is a lot for a phone tab, and audibility was a separate fight. So the
on-device voice is now **desktop-only** (`kokoroSupported() = !coarsePointer()`):
the Voice tab drops the download UI and the On-device source chip on a coarse
pointer and points to the cloud voice; Practice's read control, when nothing is
connected on mobile, prompts to connect the cloud voice (opening Settings → Voice)
instead of summoning Kokoro; and `pickRung` never selects Kokoro on mobile even if
weights are cached. **The cloud voice is the iOS/mobile path** — no download, no
memory load, and now audible there via the WebAudio playback above. The earlier
q4-on-mobile download was reverted (desktop loads q8, or fp32 on WebGPU); the
worker's coarse-pointer main-thread-fallback gate stays as defense-in-depth but is
moot now that on-device isn't offered on mobile.

## Later (out of scope here, noted for the ladder)

- **Pause-beats as silences ("modeled delivery").** Thread the plan's timed
  `beats` into `speak()` so the voice holds its breath on each `pause` cue.
  Sentence-granular synthesis already gives the seams; what's missing is mapping
  the time-based beats onto sentence boundaries. The v1 ships a flat per-slide
  narration without this.
- **Active-rung disclosure (privacy).** `openrouter-tts` sends note text
  off-device; surface which rung is live (cloud vs. local) so privacy-sensitive
  users can choose — Open Question #4, deferred with the voice picker.
- **Tauri-native Kokoro backend.** The same `.onnx` weights run in a Rust sidecar
  (onnxruntime / a Kokoro crate) for the desktop app — a new backend on the same
  `VoiceModel` interface, no UX change, fully offline, no CDN. Additive to the
  browser rungs.
- **Docs-site accessibility read-aloud.** A general "read this page/deck aloud"
  affordance outside Practice — a natural follow-on once the adapter exists.
- ~~**Voice picker.**~~ **Shipped** — see §Configuration above (Settings → Voice).
  Still later: Kokoro voice *blends*, and surfacing the full 54-voice / 8-language
  set behind a "more voices" expander (the shipped picker is a curated English
  subset).

## Open questions

1. **Default OpenRouter voice + model.** `gpt-4o-mini-tts` (cheapest, OpenAI
   voices) vs. Gemini Flash TTS (pricier, 70+ languages, multi-speaker) — pick a
   default that reads boardroom-natural; expose the rest via the voice picker.
2. **Streaming + clock sync.** Stream PCM sentence-by-sentence for low
   time-to-first-audio; confirm it stays in sync with the per-slide dwell/pause
   clock for long notes, over both the OpenRouter response stream and Kokoro's
   `TextSplitterStream`.
3. **Kokoro quantization / first-load UX.** Which dtype balances quality vs.
   download (`q8` ~80 MB vs. `fp32` ~330 MB) on mobile WASM? Mirror the
   generation tier's progress UI / "summon" affordance so the one-time fetch is
   explicit, never a silent stall on first play.
4. **Privacy disclosure.** `openrouter-tts` sends note text off-device (to
   OpenRouter → the model provider); `kokoro-wasm` does not. Surface which rung
   is active so privacy-sensitive users can pick the local one.
