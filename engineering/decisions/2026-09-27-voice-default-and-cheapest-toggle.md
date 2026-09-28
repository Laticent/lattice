---
status: shipped
summary: The Studio's voice defaults, re-decided on measured bills. Hosted Kokoro stays the cloud default because Gemini 3.8 Flash TTS, which lists $0.50/M, bills ~$18.50/M characters once its audio-output tokens are counted (~30× Kokoro's $0.62/M). On desktop the on-device Kokoro voice now comes first on `auto`. A new Workspace switch, "Always use the cheapest voice" (off by default), ranks paid models on full cost, lets the better voice win inside a 10% band, skips free tiers, and never overrides a model the author picked. The whole Gemini TTS family is now requested as PCM.
---

# Voice defaults and the cheapest-voice switch

## The ask

The owner asked for three things (2026-09-27):

1. Make Gemini Flash the default voice model in the Studio and the CLI, on the premise that
   it is the best and the cheapest OpenRouter speech model.
2. On desktop, default to the on-device Kokoro voice.
3. Add a Workspace switch that always picks the cheapest voice. It is off by default.
   Within 10% on price, the better voice wins. A model the author picked always wins over it.

## What the measurement changed

The catalog makes Gemini look cheapest: `google/gemini-3.8-flash-tts` lists **$0.50/M** for
its input. But the Gemini TTS family also lists a `completion` price, which it charges for
the **audio it produces**, and that line is nearly the whole bill. One 289-character
paragraph, sent to each model once through `.scratch/tts-probe.mjs` (throwaway, not
committed, HARD RULE #24), and read back from OpenRouter's `/generation` record:

| Model | Tokens billed | Billed | Per 1M characters |
|---|---|---|---|
| `google/gemini-3.8-flash-tts` | 55 prompt + 591 audio | $0.005347 | **$18.50** |
| `hexgrad/kokoro-82m` | input only | $0.000179 | **$0.62** |

So Gemini costs about 30× what Kokoro does. On a ~10,000-character deck that is ~$0.19
against ~$0.006. Given these numbers, the owner kept **hosted Kokoro as the cloud default**.

The CLI part of the ask needed no change. The CLI never picks a voice: `lattice video` only
reads the narration the Studio already baked into an HTML export.

Two more facts came out of the same probe:

- **Gemini 3.8 answers PCM only.** `response_format: "mp3"` returns a 400 error: *"Gemini TTS
  only supports response_format="pcm""*. Before this change, `PCM_ONLY_MODELS` named only
  3.1, so an author who picked either 3.8 model in the voice picker got a failed request
  for every clip. `isPcmOnlyModel()` now matches the whole `google/gemini-*-tts` family.
  The Set stays pinned to the sample catalog, as its sync test requires.
- **Kokoro's listed price is not its bill.** The catalog lists $4/M, but OpenRouter billed
  $0.62/M characters. Kokoro wins the ranking on either number.

## Decision

**Desktop default.** `pickRung()` in `docs/src/playground/voice-model.js` puts the on-device
Kokoro voice first on `auto` when three conditions hold: the pointer is fine (a desktop,
not a phone), the model is loaded, and the author has **not** picked a cloud model. When a
read begins, `summonDefaultVoice()` starts the ~80 MB download in the background. The read
in progress keeps its voice: the cloud voice when a key is connected, captions only when
none is. The next read moves to the local voice. A passive status read never starts the
download, so opening a panel costs nothing. The owner chose every desktop browser, not only
the desktop app, knowing that a new visitor with no key hears nothing until the download
lands. Four guards contain the background download:

- **One shared load.** The rung's `load()` is not re-entrant, so the background default and
  the Settings download button share one in-flight load. Progress reaches every caller, and
  any caller's Cancel cancels it.
- **No main-thread fallback.** A background load never falls back to running onnxruntime on
  the main thread, which would cause jank in the middle of a live read.
- **One try per session.** A failed or canceled load turns the background default off for
  the rest of the session, so a browser that can't load the model doesn't retry on every
  read, and a read never overrides the author's Cancel.
- **Test voices are left alone.** An injected test voice never triggers a download.

**WebGPU needs an adapter, not just the API.** The deployed preview in headless Chromium
exposes `navigator.gpu`, but `requestAdapter()` returns null. The old `'gpu' in navigator`
test picked the fp32 WebGPU build there, downloaded ~330 MB, and then failed to load, so the
desktop default never came up (measured 2026-09-28). Real desktops land there too: Linux
without GPU acceleration, VMs, blocklisted GPUs. The rung now asks for an adapter and
otherwise loads the ~80 MB q8 WASM build.

**The export follows the rehearsal.** When the author's active voice is on-device, turning
on narrated export defaults to the on-device narrator, even with a cloud key connected.
Those clips are already on disk, and defaulting to the cloud voice would quote and bill
the whole deck again.

**The cheapest-voice switch.** The switch sits under Workspace → General → Narration in
Present, and `lattice-cheapest-voice` stores it (`narration-prefs.js`). When it is on,
`orModel()` resolves in this order:

1. a stored pick (`lattice-<prefix>-voice-or-model`), which always wins;
2. `pickCheapestTtsModel(liveCatalog)` from `docs/src/playground/tts-cost.js`;
3. `DEFAULT_OR_TTS_MODEL`, while the catalog is loading or unreachable.

The ranker applies four rules:

- **Full cost.** Cost is `promptPerM + completionPerM × 2.04`, using the audio-token rate
  measured above.
- **No free tiers.** Every `:free` model is rate-limited, and hitting the limit halfway
  through a deck stalls it.
- **The 10% band.** Every model within 10% of the cheapest is a candidate, and the best
  entry in `TTS_QUALITY_RANK` wins.
- **Deterministic ties.** Anything still tied breaks on cost, then on id.

`TTS_QUALITY_RANK` is an editorial order, not a measurement. It only decides ties inside the
10% band.

The pick resolves from the catalog at creation and the moment the setting turns on, not at
the first sentence. `openRouterRung` reads the model once per sentence, so a pick landing
in the middle of a read would switch voices partway through. When the pick moves the model
off the default, `orVoice()` falls back to a voice the picked model publishes. The default
`af_heart` is a Kokoro voice, and any other model rejects it.

Today the switch picks `hexgrad/kokoro-82m`. The next paid voices are Orpheus and CSM at
$7/M, well outside the band.

**The export quote counts full cost.** The narrated-export quote now prices a model with
`ttsCostPerMChars`, not its input price, which undercounted Gemini by about 37×.
`returnsUncompressed()` also matches the Gemini TTS family, so Gemini 3.8's size and time
estimates account for the audio encoding step.

## Not done

- **Gemini 3.8 has no sample-catalog engine.** The picker still lists both 3.8 models live,
  and they now synthesize correctly. But neither has committed "Play sample" clips, and
  neither is in `tts-voice-catalog.json`. Adding them means a paid run of
  `tools/generate-voice-samples.mjs` (opt-in, HARD RULE #24), which is out of scope here.
- **The listed prices can mislead.** The ranker estimates from them. If OpenRouter's listed
  price for a model drifts far from what it bills, as Kokoro's has, the ranking follows the
  listing, not the bill.
