---
status: in-progress
summary: The Workspace AI tab treated cloud and on-device generation as one config surface — a single "standing instructions" field fed both a full-strength OpenRouter model and a tiny on-device one, the spend/budget UI showed regardless of which tier was active even though on-device is unconditionally free, and read-aloud TTS had no Workspace UI at all (it silently ran an "auto" ladder with no voice/speed/model picker, and reused the Drawing Board's localStorage keys instead of its own). This splits the config into genuinely separate cloud and on-device namespaces, caps the on-device standing instructions to a length small local models can actually hold, gates Spend to the Cloud view, and ships a real TTS settings surface — OpenRouter voice/model/speed for cloud, Kokoro voice/speed for on-device (no Whisper: it's a speech-to-text model and can't do TTS at all).
---

# Studio AI config — segment cloud from on-device; ship TTS settings

## The problem

Raised directly: "the current structure of our ai setup doesn't segment on-device
configs from cloud. spend limits doesn't make sense for on device... instructions
for on device should have more sensible limits and so not shared... we don't have
a separate configuration for tts in the cloud or on device."

Investigation confirmed all three:

1. **One shared settings bag.** `StudioSettings` (`studio-store.ts`) and the single
   `loadInstructions()`/`saveInstructions()` pair are read into every AI call via
   `withStudioVoice()` regardless of whether the active generation tier is the cloud
   (OpenRouter, any model the user picks) or on-device (the browser's Prompt API /
   WebLLM / Transformers.js — all far smaller and weaker).
2. **Spend limits are already cloud-only in *behavior*** (`cloudBudgetBlock` only
   runs when `generation === 'openrouter'`; on-device is unconditionally free) **but
   not in the settings shape or the UI** — the Spend section renders unconditionally
   in the Workspace sheet regardless of which tier is active.
3. **TTS has a real cloud/on-device ladder in code** (`voice-model.js`:
   `openrouter-tts` → `kokoro` → banned dev fallback → silent, with `setOrVoice`/
   `setOrModel`/`setKokoroVoice`/speed-on-the-cloud-rung already wired) **but no
   Workspace UI at all.** The Studio just runs the "auto" ladder silently. The older
   Drawing Board surface *does* have a Voice settings tab — the Studio never got one.
   Worse, the Studio's read-aloud reuses the Drawing Board's `lattice-db-voice-*`
   keys, so a voice pick on one surface silently changes the other.

A fourth item needed correcting before design could proceed: the request asked for
on-device TTS to be "whisper-specific." **Whisper is a speech-to-text model — it has
no text-to-speech mode at all.** The on-device voice already wired into the Studio is
**Kokoro** (82M params, ONNX/WASM, runs in-browser), which is also, on the merits,
close to the best available option for in-browser TTS today (small, fast, Apache-2.0,
no server round-trip). Confirmed with the user: no on-device dictation/STT feature is
in scope here; Kokoro stays the on-device TTS engine.

## The axes (decided with the user)

1. **Segmentation shape** — **fully separate namespaces**, not tagged sub-objects in
   one settings blob. Cloud and on-device config each get their own localStorage
   key(s); a corrupt or cleared one can't take the other down.
2. **Spend** — stays a cloud-only concept; the Spend section now only renders in the
   Cloud view of the AI tab (the on-device view gets a one-line "always free" note
   instead of a dead-weight cap control).
3. **Language** — **stays shared.** It's a property of the *output text* (what
   locale the deck reads in), not of which model produced it — the same reasoning
   `2026-06-30-studio-output-language.md` already established for keeping it
   independent of the generation tier.
4. **Standing instructions** — **fully separate field**, not one shared field with a
   runtime truncation. The cloud field is unchanged (unlimited, as today). A new
   on-device field is capped at **300 characters** — long enough for a real style
   note, short enough that a small local model's system-prompt budget isn't blown
   by it. The cap is enforced both in the textarea (`maxLength`) and defensively at
   the point the instructions are read back into a prompt, so a value written before
   the cap existed (or restored from an old backup) can't inject an oversized block.
5. **TTS** — a new, real settings surface. On-device TTS is **Kokoro only** — it's
   the one on-device engine that exists, and per the correction above, no other
   choice is currently on the table. Cloud TTS already supports any OpenRouter
   speech model; the UI now exposes that catalog instead of hardcoding
   `hexgrad/kokoro-82m`.

## The shape of the fix

- **`studio-store.ts`** — `loadInstructions`/`saveInstructions` keep the existing
  `lattice-studio-instructions` key (now explicitly documented as the CLOUD field).
  New `loadOnDeviceInstructions`/`saveOnDeviceInstructions` read/write
  `lattice-studio-ondevice-instructions`, both capped at the exported
  `ON_DEVICE_INSTRUCTIONS_MAX` (300). `StudioExport`/`exportStudioState`/
  `importStudioState` (the workspace backup contract) carry the new field too — an
  on-device standing instruction is a real user value, not a cache, so it backs up
  and restores like the cloud one.
- **`architect.ts`** — `studioVoice()`/`withStudioVoice()` take the active
  `generation` and select the cloud or on-device instructions store accordingly.
  Every deck-content call site (`runArchitect`, `refineSelection`, `chatComplete`,
  `requestFindingFix`'s `voicedModel` wrapper, `generateDescription`) already knows
  its `generation` before calling `withStudioVoice`, so this is a threading change,
  not a new lookup. The language directive is unaffected (still generation-agnostic).
  A default of `'openrouter'` on the added parameter keeps every existing caller
  (and the existing test suite) behavior-identical without an argument.
- **`voice-model.js`** — `createVoiceModel({ …, keyPrefix })` (defaulted to `'db'`
  INSIDE the function body, never in the destructuring — a defaulted destructured
  param collapses tsc's checkJs inference to only the properties that have
  defaults, the same footgun the file's existing `allowBrowserVoice` comment
  already documents): every localStorage pref key (`voice-rung`, `voice-or`,
  `voice-or-model`, `voice-kokoro`, `voice-dev-speech`, and the new `voice-speed`)
  is now built from `keyPrefix` instead of hardcoded to `lattice-db-*`. The Drawing
  Board's existing call sites pass nothing and get byte-identical keys (`db`,
  unchanged); the Studio's Voice settings and read-aloud both pass
  `keyPrefix: 'studio'`, so the two surfaces stop silently sharing voice prefs. The Kokoro rung gains native `speed` passthrough
  (kokoro-js's `generate()` accepts it, same as the cloud rung already forwards to
  OpenRouter) — both engines do real speed control, not a client-side playback-rate
  hack. A new `listOpenRouterVoiceModels()` fetches the public, unauthenticated
  `/api/v1/models?output_modalities=speech` catalog once per session (memoized,
  never throws — empty array on failure, matching every other catalog fetch's
  degrade-gracefully contract in this codebase).
- **`kokoro-worker.js`** — forwards `speed` into `tts.generate()`.
- **`read-aloud.ts`** — the Studio's lazy voice-model singleton now passes
  `keyPrefix: 'studio'`.
- **`WorkspaceSheet.tsx`** + new **`TtsSettings.tsx`** — the AI tab's existing
  Cloud/On-device switch (`genView`, from `2026-06-29-studio-tier-precedence.md`)
  now also gates Spend, Standing instructions, and a new TTS section: cloud gets an
  OpenRouter TTS model picker + voice + speed; on-device gets a curated Kokoro voice
  picker + speed, with the same confirm-then-download UX `OnDeviceTier.tsx` already
  uses for the text-generation ladder (Kokoro is a real ~80MB one-time download).
  Output language stays outside the gate — shared, as decided above.

## What's explicitly out of scope

- **On-device speech-to-text / dictation (Whisper or otherwise).** Nothing here
  wires up audio-in. If a "dictate your instructions" feature is wanted later, it's
  a new, separate capability — not a rename of the existing TTS ladder.
- **A live, exhaustive Kokoro voice catalog.** Kokoro doesn't expose one via a
  simple endpoint; the picker ships a curated subset of the well-known voice ids
  plus a free-text "other" escape hatch, rather than a claim of completeness it
  can't back up.
