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

## Follow-up: model-specific voice dropdowns, hear-before-you-commit, disabled-until-available

Post-review feedback sharpened the TTS section further:

- **Voice ids are model-specific, so the picker is now too.** A raw free-text
  "voice id" field made it easy to pick a Kokoro id for an OpenAI model (or vice
  versa) and get a confusing failure. `voicesForModel(modelId)` (`TtsSettings.tsx`)
  maps a cloud model to its curated roster — Kokoro's own list for
  `hexgrad/kokoro-82m` (and the unset connect-time default), OpenAI's
  publicly-documented six (`alloy`/`echo`/`fable`/`onyx`/`nova`/`shimmer`) for an
  `openai/*` model, `[]` (a plain free-text fallback) for anything unrecognized —
  guessing a wrong roster is worse than admitting we don't know it. Picking a new
  cloud MODEL resets the voice to that model's own default when the current pick
  isn't on its roster, so a stale cross-model id can't linger silently.
- **Picking a voice is itself "a way to hear it."** Selecting a CURATED voice from
  either dropdown now auto-plays a short sample immediately (gated on that tier
  actually being available); the free-text "Other" path doesn't auto-fire on every
  keystroke, so the manual **Play sample** button covers it (and replays). Loading
  Kokoro also auto-previews its default voice the moment it finishes.
- **Every TTS control is disabled until that tier has a model available** — the
  Cloud model/voice/speed/preview controls until OpenRouter is connected, the
  On-device voice/speed/preview controls until Kokoro is downloaded — each with an
  inline hint explaining why, mirroring how `ModelPicker.tsx` already hides itself
  entirely behind a Connect button rather than offering a picker with nothing to
  pick. A voice/model/speed pick made BEFORE a tier went unavailable (or restored
  from a backup) is untouched and still takes effect the moment that tier becomes
  available again — disabling only blocks new edits while there's no model to
  apply them to, it never clears a stored preference.

## Adversarial trio (red team + Munger inversion + independent checker), pre-merge

Run against the branch as it stood after the follow-up above — every finding
below was independently verified (reproduced or traced), not assumed.

**Fixed:**

- **Stale TTS availability on a live disconnect (red team, Medium — reproduced).**
  `TtsSettings.tsx` fetched `voiceAvailability()` once on mount and never re-checked
  it. Clicking Disconnect in the Model section of the SAME open Workspace sheet left
  the TTS model/voice/speed/preview controls enabled against a dead connection — a
  visible contradiction with the Model/Spend sections, which correctly re-render on
  the same event. Fixed with a `db-model-changed`/`db-voice-changed` listener that
  re-fetches availability, mirroring `useArchitectStatus`'s own pattern in
  `architect.ts`. Covered by a new test that flips the mocked availability and
  dispatches the event mid-render.
- **`.slice(0, 300)` can split a surrogate pair (red team, Low-Medium —
  reproduced).** `String.slice` counts UTF-16 code units, not characters; an
  on-device instruction ending on an emoji or any astral-plane character exactly at
  the 300-unit boundary was truncated mid-codepoint. Fixed with
  `truncateCodePoints` (iterates via `Array.from`, which splits by code point) in
  both `studio-store.ts`'s load/save and the live-typing handler in
  `WorkspaceSheet.tsx`. Residual, deliberately unfixed: the textarea's native
  `maxLength={300}` is itself UTF-16-unit-based and can pre-empt this at the
  browser level during live typing before our JS ever runs — closing that fully
  would mean abandoning `maxLength` for hand-rolled per-keystroke limiting, judged
  not worth it for this edge case.
- **`pickOrModel`'s roster-reset blanked the field without persisting the clear
  (independent checker, Low — reproduced by trace).** Switching to a model with an
  UNRECOGNIZED voice roster (`voicesForModel` → `[]`) unconditionally ran the reset
  branch, calling `setOrVoiceOther('')` (blanking the visible free-text field) but
  never `setTtsOrVoice('')` (the persisted value was untouched) — so the old value
  silently reappeared on the next reload while the screen showed empty. Fixed by
  extracting the decision into `voiceResetOnModelChange` (returns `null` — not an
  empty-string reset — when the new roster is empty, since free text is valid for
  any model and there's nothing to reset FROM/TO), now unit-tested directly.
- **No unmount cleanup for an in-flight preview (red team, Low).** Unlike
  `useReadAloud`'s cleanup (`voiceRef.current?.stop()`), `TtsSettings.tsx` had none
  — closing the Workspace sheet mid-preview let the sample play to its natural end.
  Fixed with a `stopTtsPreview()` bridge function + unmount effect, mirroring the
  existing pattern.

**Not fixed — reasoned as acceptable, or explicit prior direction:**

- **Standing instructions duplication/drift risk (Munger inversion).** Two
  independent fields with no sync affordance means a user who tunes their cloud
  voice guide must remember to separately update the on-device one. This is the
  DIRECT consequence of the "fully separate namespaces" + "separate capped field"
  decisions made explicitly with the user earlier in this design — not an oversight
  to patch here. A sync/reminder UX is a legitimate future request, not a
  correctness bug.
- **Every TTS control disables until its tier is available, blocking
  pre-configuration (Munger inversion).** A brand-new user can't pick a voice from
  the (static, connection-independent) curated roster before connecting/
  downloading, unlike a design that let curated browsing stay open while gating
  only Play-sample/actual-use. This mirrors `ModelPicker.tsx`'s established
  precedent and was built in direct response to the user's explicit request
  ("configuration should be disabled if no model is enabled") — not reversed here,
  but the tradeoff (real, and un-weighed in the original ask) is recorded for
  reconsideration if pre-configuration turns out to matter in practice.
- **kokoro-js loaded from an unpinned CDN, no SRI (Munger inversion).**
  `voice-model.js`'s `KOKORO_URL` (`https://esm.run/kokoro-js`) and the same import
  in `kokoro-worker.js` predate this PR — it's an inherited pattern from
  `architect-model.js`'s own CDN usage, not introduced here. Off this PR's path per
  HARD RULE #18; logged as a candidate follow-up (a version-pinned URL and/or a
  subresource-integrity hash), not fixed in this diff.
- **One-time reset of any previously-set Studio voice/speed preference (red
  team).** Studio's read-aloud (word-synced narration in Present mode) already
  existed before this PR and shared `lattice-db-voice-*` keys with the Drawing
  Board; moving the Studio to its own `lattice-studio-voice-*` namespace means
  anyone who'd already picked a non-default voice/speed via the Drawing Board's
  Settings → Voice tab (and had it apply to Studio too, by virtue of the shared
  key) sees that revert to Kokoro defaults (`af_heart`, `auto`, 1.0×) once. This is
  the correct trade for the isolation this PR sets out to deliver — flagged in
  CHANGELOG.md rather than "fixed" (there is nothing to migrate: the two surfaces'
  prefs were never meant to be the same setting, they just accidentally were).

## Follow-up: stuck "Playing…" button, and a real voice roster instead of 2-of-9 models

Live use after #846 merged surfaced two more issues.

**The synth phase had no timeout — a hung network call left "Play sample" stuck
forever.** `previewVoice()`'s playback phase already had an 8s watchdog, but the
SYNTH phase (the fetch to OpenRouter, or the Kokoro worker round-trip) had none —
`await r.synth(...)` could hang indefinitely with no way out short of closing the
panel (reported live, screenshot showed the button frozen on "Playing…"). Fixed in
both `previewVoice()` (races against a 20s timeout that also aborts the
controller, so an abort-aware rung genuinely cancels) and `speak()`'s per-sentence
synth wrapper (same timeout, but WITHOUT aborting the whole session — a single
slow sentence skips forward instead of killing the rest of the narration, unlike a
self-contained preview where aborting everything is fine). Both `Promise.race`s
clear their timer the moment either side settles — an uncleared timer would
otherwise linger the full 20s on EVERY call, healthy or not, a real (if small)
leak across a long presentation; this surfaced immediately in the node test suite
going from ~0.1s to ~20s.

**The curated voice map covered only 2 of the 9 models OpenRouter's speech catalog
actually lists.** Raised directly: "my expectation is that all voices come from
the model and i should always play the sample." Investigated and confirmed
neither was fully true — the free-text-only default for 7 of 9 models, and preview
only auto-firing for curated dropdown picks, not free text. Fetched the live
catalog (`GET /api/v1/models?output_modalities=speech`) to get the real 9 model
ids, then researched each one rather than guess:

| Model | Curated? | Source |
|---|---|---|
| `hexgrad/kokoro-82m` | yes (existing 10) | well-known open model |
| `x-ai/grok-voice-tts-1.0` | yes, 5 voices | OpenRouter's own model page (direct fetch) |
| `google/gemini-3.1-flash-tts-preview` | yes, 10-of-30 subset | Google's published Gemini TTS voice set |
| `canopylabs/orpheus-3b-0.1-ft` | yes, 8 voices | the model's own GitHub README |
| `zyphra/zonos-v0.1-transformer` / `-hybrid` | **no — by design** | voice-CLONING from a reference sample, no presets at all |
| `sesame/csm-1b` | **no — by design** | numeric speaker slot + reference audio, not named voices |
| `microsoft/mai-voice-2` | no | has presets (Azure-locale format), but no enumerable list found anywhere verifiable |
| `mistralai/voxtral-mini-tts-2603` | no | "20 preset voices" stated, but no names enumerated anywhere found |

The Zonos/CSM case is architecturally different from the other two "no" rows: our
voice-id text field doesn't map onto either model's actual interface at all (one
needs an audio sample, the other a numeric slot + audio context) — `noRosterHint`
surfaces that specific reason instead of the generic "unrecognized model" message
so a user isn't left guessing why there's no dropdown. MAI-Voice-2 and Voxtral DO
have real presets, just none I could verify — same free-text fallback, honest
generic message.

**Auto-preview now covers free text too.** Extended the "picking a curated voice
plays it immediately" behavior to the free-text "Other" path — on blur/Enter, not
every keystroke (which would fire mid-typing). Every real voice selection now
previews, curated or not, closing the "i should always play the sample" gap.

**Raised but deferred to a separate PR:** pre-generating and committing sample
audio as repo assets (so "Play sample" serves a static file instead of hitting the
live paid API on every click, and survives a model/voice later being pulled from
OpenRouter's catalog). Real architecture work — asset location, a
credit-spending generator script gated the same way `tools/component-gen-eval.mjs`
is (HARD RULE #24), and a local-first-fallback-to-live playback path — not a
same-PR add-on to a bug-fix branch (HARD RULE #17).

## What's explicitly out of scope

- **On-device speech-to-text / dictation (Whisper or otherwise).** Nothing here
  wires up audio-in. If a "dictate your instructions" feature is wanted later, it's
  a new, separate capability — not a rename of the existing TTS ladder.
- **A live, exhaustive Kokoro voice catalog.** Kokoro doesn't expose one via a
  simple endpoint; the picker ships a curated subset of the well-known voice ids
  plus a free-text "other" escape hatch, rather than a claim of completeness it
  can't back up.
