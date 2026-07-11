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
| `canopylabs/orpheus-3b-0.1-ft` | yes, 7 voices\* | the model's own GitHub README |
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

\* **Orpheus's README-sourced roster had 8 voices; one didn't actually work.**
This whole table was sourced from documentation, not a live round-trip — no
OpenRouter connection was available while writing it, an explicit caveat in
the PR. The asset-caching work below finally had a real key, and hitting the
live API turned that caveat into a concrete finding: `zoe` (either casing)
consistently 500s on OpenRouter's hosted Orpheus endpoint while the other 7
voices synthesize fine — not a transient failure, confirmed on 3 separate
direct calls. Dropped from the curated roster rather than shipped as an
option that always fails to generate a sample (or, for a live/uncached
narration attempt, always fails to speak at all).

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

## Asset-caching: "Play sample" stops spending credits on every click

Follow-up, raised directly: "i want to ensure we get all these sounds and add
them to the repository as assets... playing sample should eat into your
credits. the danger of course is if these voices are removed so we need to
guard against that somehow." Deferred from the voice-map-expansion PR above per
HARD RULE #17 — real architecture work, not a same-branch add-on.

**The design.** A single JSON catalog
(`docs/src/playground/tts-voice-catalog.json`) is now the one source of truth
for the curated voice map — previously duplicated inline in `TtsSettings.tsx`.
It's read by three consumers that otherwise couldn't share a `.ts` module:
the browser bundle (`docs/src/components/studio/tts-voice-catalog.ts`, the
logic layer `TtsSettings.tsx` and `read-aloud.ts` both import), and two Node
tools (`tools/generate-voice-samples.mjs`, `tools/check-ownership.js`). Each
engine entry carries a `requiresAsset` flag: `true` for a paid cloud engine
whose preview should be cached (today: `grok`, `gemini`, `orpheus`); `false`
for an engine that doesn't need it — either because there's no live model
behind it yet (`openai`, kept for if one is added), or because it's
**Kokoro, which runs on-device and never spends credits — when it can run at
all.** It doesn't load on iPhone or on a device with too little memory
(`kokoroSupported()`/`probeKokoroCache()` already gate this, and the picker
disables with an explanatory hint there — see the earlier "disabled if no
model is enabled" work above). Caching a sample wouldn't close that gap: real
narration would still fail on those devices, so a cached preview would be
actively misleading (sounds fine to audition, doesn't actually work). Kokoro
was deliberately *excluded* from the asset cache rather than pre-generated
(which would also mean running the WASM model server-side — a different
problem the credit-protection ask never called for).

**Generation.** `tools/generate-voice-samples.mjs` mirrors
`tools/component-gen-eval.mjs`'s conventions exactly (HARD RULE #24): reads
`OPEN_ROUTER_KEY` from the environment only, requires `OPENROUTER_ALLOW_SPEND=1`
to actually spend (otherwise prints the plan and exits), supports `--limit`
for a cheap first validation and `--engine` to regenerate one engine, and is
registered in `SANCTIONED_OPENROUTER_SPENDERS`. It writes
`docs/public/voice-samples/<engine>/<voice-id>.<mp3|wav>` — one fixed sample
("This is how your slides will sound.") per curated voice, at the default
speed only (speed is a runtime multiplier on cheap synthesis, not worth an
asset per speed step). This is on-demand tooling, not a build step — most
checkouts won't have a funded `OPEN_ROUTER_KEY` and the directory will simply
be absent for them (the gate below treats that as fine, not an error). This
session's sandbox *did* have one configured, so the real 22 samples (5 Grok +
10 Gemini + 7 Orpheus — `zoe` dropped, below) were generated and committed as
part of this change, validated first with `--limit 1` per the script's own
guidance.

**The catalog-drift guard.** Before spending anything, the generator fetches
`GET /api/v1/models?output_modalities=speech` and **skips** (not fails) any
`requiresAsset` engine whose `modelId` isn't on the live list — a model
OpenRouter discontinued doesn't corrupt the asset set or burn credits trying;
existing cached files for that engine are left alone and the skip is logged.
This is the direct answer to "the danger is if these voices are removed": the
cache is what a removed voice degrades *into* (the last-known-good sample
keeps playing) rather than something that breaks when a voice disappears.

**Playback becomes local-first.** `read-aloud.ts`'s `previewTtsVoice()` now
checks `cachedSampleUrl(model, voice, speed)` first — a curated voice on a
`requiresAsset` engine at 1x speed resolves to the on-disk path and plays
directly via a plain `<audio>` element (10s timeout, matching the live path's
existing timeout discipline). Only when there's no cached file — free text, an
uncurated model, a non-default speed, or the cached play itself fails — does
it fall through to the existing live `voice-model.js` path. No API call, no
cost, no timeout risk, and instant for the common case (picking one of the
dropdown voices at the default speed, which is the overwhelming majority of
"Play sample" clicks).

**The build-time gate.** `checkVoiceSampleAssets` in `tools/check-ownership.js`
keeps the checked-in assets honest against the catalog: an **absent**
`docs/public/voice-samples/` is not an error (the directory is opt-in,
generated tooling — most checkouts, including CI without the secret, won't
have it), but once present, every `requiresAsset` engine's directory must
exist with exactly its roster's files — no missing voice, no
stale/orphaned file left behind by a roster change, no directory for an
engine that no longer exists or no longer needs caching (e.g. a stale
`kokoro/` directory would now fail the gate, since kokoro's `requiresAsset`
is `false`).

**Known limitation.** This caches the **preview** only. Actual deck
narration through a model/voice that gets pulled from OpenRouter's catalog
still hits the live API and still fails at narration time — the cache
doesn't (and structurally can't, without shipping a full narration-audio
CDN) protect the real read-aloud path, only the "hear what this sounds
like before you commit to it" button.

## Redesign: dynamic voice rosters, a rich model picker, no more free text

Raised directly, reacting to the shipped asset-caching work above: "a curated
list with no voice model drop down. that's terrible. also, for models that
don't have voice model at all we should not enable the voice drop down at all
i need you to get or find the voice list for each model and test them and
cache them if they work" — followed, mid-investigation, by a screenshot of the
Workspace's existing OpenRouter chat-model picker (search + Featured/Value/
Free/All tabs + priced, vendor-grouped rows) with: "we should also adopt this
control for voice models too where play is next to the model and you have all
the pricing... no one should be typing in a mode[l] name really. if we don't
know the voice name is prefilled and disabled — think about it. design it
first."

**The root-cause discovery.** Researching MAI-Voice-2 and Voxtral to answer
"get or find the voice list" turned up something that invalidated the whole
prior approach: OpenRouter's own `GET /api/v1/models?output_modalities=speech`
response — the SAME endpoint `listOpenRouterVoiceModels()` already called for
the model list — carries a `supported_voices` field per model. Authoritative,
live, and (live-verified) correct for 8 of the 9 current models, including two
that third-party vendor docs described as pure voice-cloning with no presets
at all (Zonos: "clones a voice from a reference audio sample"; CSM-1B: "a
numeric speaker slot") — both turned out to have real, working named presets
on OpenRouter's hosted integration, confirmed with direct API calls
(`american_female`/`british_male` for Zonos, `conversational_a`/`read_speech_a`
for CSM-1B, etc.). The earlier "no named-voice concept" categorization for
both was wrong — sourced from the underlying model's general capability, not
what OpenRouter's specific hosted endpoint actually exposes.

**The pivot: voice rosters are no longer hand-typed.** Every dropdown now
derives from the live `supported_voices` array (`voice-model.js`'s
`listOpenRouterVoiceModels()`, extended to also carry `promptPerM`/
`completionPerM`/`voices`), not a JSON file scraped from documentation. This
retroactively explains the `zoe` bug from the previous round: a hand-curated
roster sourced from Orpheus's GitHub README included a voice id OpenRouter's
own hosted endpoint never actually lists — the live field would have caught it
on day one. `tts-voice-catalog.json` shrank to ONLY what genuinely needs
hand-maintenance: which live model a cache-directory slug maps to
(`modelId`, now an exact match — each entry is one pinned release, not an
evolving family, so no fuzzy prefix rules are needed), whether it's worth
asset-caching (`requiresAsset`), the provider's actual audio format
(`audioFormat`), and the bounded featured subset that got a pre-generated
sample (`cachedVoices`). `tts-voice-catalog.ts` gained `prettyVoiceLabel()` —
a DERIVED label (decoding Kokoro's documented `<lang><gender>_<name>`
convention and the Azure/MAI `locale-Name[:Model]` convention, title-casing
everything else) instead of a hand-typed one, so a label can never go stale
against a roster it didn't write.

**The one hand-maintained exception: `mai-voice-2`.** OpenRouter's own
`supported_voices` field for this model is a non-exhaustive 4-item SAMPLE, not
the real roster (confirmed: Microsoft's own docs publish 44 voices across
15+ languages). `voiceOverride` in the JSON supplements (never replaces) the
live field for this one engine — the English-locale subset, individually
live-verified against the hosted endpoint one voice at a time (format
confirmed as `en-US-Harper:MAI-Voice-2`, locale segment case-insensitive).
`en-AU-Lisa` consistently 502'd on 3 separate calls (not transient) and is
excluded from the cached set but kept in the override so it still appears in
the dropdown — an honest reflection of OpenRouter's own outage, not something
to hide.

**No more free text — ever, for a model OpenRouter lists.** `VoicePicker`
always renders a `<Select>` when the (live + override) roster is non-empty —
which is every one of the 9 models today — and a DISABLED, explained field
(no typing) when it's empty. The `OTHER` sentinel, the "Other (enter a voice
id)…" option, and the whole free-text-preservation branch of `resolveVoice`
are retired; `resolveVoice`/`voiceResetOnModelChange` now take the
already-resolved roster directly (pure, no catalog lookup inside) and return a
plain string, never an `{select, other}` pair.

**`TtsModelPicker` — the rich picker adopted from the chat-model picker.** A
new component mirrors `ModelPicker.tsx`'s exact interaction shape (collapsed
summary + meta line → expand → search + Featured/Value/Free/All tabs →
vendor-grouped, priced rows), via a new `tts-catalog.js` that reuses
`or-catalog.js`'s generic helpers (`vendorOf`/`shortName`/`fmtPrice`/
`groupByVendor`/`inSet`/`isFreeModel` — all pure functions over the same
`{id, name, promptPerM, completionPerM}` shape regardless of chat vs. speech;
HARD RULE #15) and adds only what TTS genuinely needs: `TTS_FEATURED`/
`TTS_VALUE` curated sets, and a single-price-dimension meta line (`ttsPriceLabel`
— TTS has no meaningful "completion" cost the way a chat completion does; every
live model reports `completion: 0`). The one addition the chat picker doesn't
need: an inline ▶ Play button per row that previews that model's current (or
default) voice directly — browsing the list is itself auditioning, closing the
"play is next to the model" gap without a separate pick-model-then-pick-voice-
then-click-a-different-button round trip.

**A filesystem-safety fix caught mid-build.** MAI-Voice-2's voice ids carry a
literal `:` (`en-US-Harper:MAI-Voice-2`) — writing that straight to disk as a
filename would have broken any Windows checkout of this repo. Both
`tools/generate-voice-samples.mjs` (writing) and `tts-voice-catalog.ts`'s
`cachedSampleUrl` (reading) now sanitize `:` → `_` identically before touching
the filesystem/URL, and `checkVoiceSampleAssets` checks the sanitized name too.

**Kokoro, reconsidered and reverted.** Since `hexgrad/kokoro-82m` is ALSO
selectable as a paid hosted CLOUD model (a real, if tiny, per-character
OpenRouter charge — distinct from the free on-device WASM execution path that
shares its voice namespace), caching it for the cloud picker seemed like a
real gap to close. In practice, the hosted endpoint was observed consistently
timing out during this round of generation — including `af_heart`, which had
worked minutes earlier in the same session — provider-side instability, not a
per-voice defect. Rather than commit samples generated against a flaky
endpoint, Kokoro stays `requiresAsset: false` (its original on-device-only
resting state); this is logged as a revisit-when-stable item, not abandoned.

**Final counts.** 51 samples committed across 8 cached engines: grok (5, now
lowercase — matching OpenRouter's own casing, `Eve`→`eve` etc.), gemini (10,
unchanged), orpheus (7, unchanged — OpenRouter's own list still excludes
`zoe`, independently reconfirming the earlier finding), mai-voice-2 (6),
zonos-transformer (4), zonos-hybrid (4), csm (7, including `none` — a real,
distinct, deterministic no-fixed-persona option, not a broken response), and
voxtral (8, English-only `en_paul_*`; `gb_oliver_*`/`gb_jane_*`/`fr_marie_*`
live and work too, just uncached). Every model OpenRouter's catalog lists now
has a working dropdown; nothing requires typing a voice id blind.

**Independent-checker finding: a migration regression for existing users.**
This redesign's own casing migration (Grok's `Eve`→`eve`, matching OpenRouter's
live field) exposed a real gap: nothing re-validated a voice id a user had
already saved under the OLD casing once the live roster loaded. The mount
effect set `orVoice`/`kokoroVoice` straight from storage and never revisited
them — `resolveVoice` was imported but only wired into the model-row Play
button, not into the load path. A returning user with `Eve` in
`localStorage` would see a blank-looking picker and "Play sample" would send
the stale, wrong-case id straight to the live API (a real error on upgrade,
not a cosmetic one) — the same class of bug the whole redesign set out to
prevent, just triggered by this PR's own migration instead of an external
catalog change. Fixed with a `prefsLoaded`-gated reconciliation effect
(`TtsSettings.tsx`) that resolves the stored voice against the live roster
once BOTH have actually loaded — gated specifically so a roster arriving
before the stored value can't overwrite a real pick with the roster's default
(that ordering race would have been a second, worse bug). Covered by a
regression test that fails without the fix (verified by temporarily
reverting it) and passes with it.

## What's explicitly out of scope

- **On-device speech-to-text / dictation (Whisper or otherwise).** Nothing here
  wires up audio-in. If a "dictate your instructions" feature is wanted later, it's
  a new, separate capability — not a rename of the existing TTS ladder.
- **A live, exhaustive Kokoro voice catalog — no longer true, corrected above.**
  The original build shipped a 10-voice hand-curated subset with a free-text
  escape hatch, reasoning Kokoro exposed no simple live-list endpoint. The
  redesign found it does (`supported_voices`, the same field every other engine
  uses) — Kokoro's picker is now the full live 54-voice roster like everything
  else; only the 10-voice CACHE remains a bounded, hand-picked subset.

## Follow-up: the Speed slider worked on models that don't support speed at all

Raised directly, from a screenshot of the Workspace's Voice section: a "voice
model that doesn't exist" (a listed, selectable model whose real playback
fails), a Speed slider enabled for a model that doesn't support speed, and a
slider that accepts values a model silently can't honor — "we cannot look
inept to the user." Asked for a full evaluation of what's actually available,
and a redesign of the slider.

**The investigation was empirical, not documentation-sourced** (the earlier
`zoe`/roster lesson applies here too) — this session had a funded
`OPEN_ROUTER_KEY`, so every claim below is a live round trip, not a guess:

1. **OpenRouter's own `supported_parameters` field never lists `speed` for any
   of the 9 TTS models** — not diagnostic on its own (it's a generic
   completions-params list, and TTS `speed` isn't a completions param at all),
   but it ruled out a cheap catalog-only answer and forced a real test.
2. **Live A/B: synth the same short sentence at `speed` unset, `0.6`, and
   `1.6`, measure real audio duration with `ffprobe`.** A model whose `speed`
   genuinely works produces a duration inversely proportional to the
   multiplier; a model that ignores it produces noise.
3. **A repeat baseline (two identical, speed-less calls) measured each model's
   OWN take-to-take duration variance** — the noise floor a real speed effect
   must clear. This mattered: Orpheus/CSM/Voxtral's 0.6x/1.6x readings moved,
   just not more than their own ~17-51% natural variance (CSM's own variance
   hit 51% — this model's duration is close to non-deterministic regardless of
   any parameter), and in Orpheus/Voxtral's case the direction was backwards
   from what a real multiplier would produce.
4. **Result: only 4 of 9 engines genuinely respond to `speed`** — Kokoro
   (near-exact multiplier match: 0.6x/1.6x landed within a few percent of the
   mathematically expected duration), MAI-Voice-2 and both Zonos variants
   (large, monotonic, correctly-directed swings well beyond their noise
   floors, though not perfectly linear at the extremes). Grok, Gemini,
   Orpheus, CSM, and Voxtral silently ignore it — no error, just no effect,
   which is exactly what makes an always-enabled slider on those five look
   broken rather than absent.
5. **A boundary probe on the 4 working engines** (`speed` 0.1/0.25/2/3/4/10)
   found Kokoro and Zonos both 422 outside roughly `[0.25, 4]`; MAI-Voice-2
   never errored even at the extremes tested but plateaus around a ~1.5s floor
   past roughly `3x`. The Studio's existing `0.75-1.5` UI range sits safely
   inside all three — the RANGE was never the bug, only which models the
   control was offered on at all.
6. **The "voice model that doesn't exist" report turned out to be
   `voice-model.js`'s live playback path, not the picker.** Gemini's speech
   endpoint 400s on `response_format:"mp3"` and only returns raw PCM — already
   known and handled in `tools/generate-voice-samples.mjs` (the asset
   generator requests `pcm` and wraps it in a WAV container for this one
   model), but that fix never made it into the LIVE runtime path
   (`openRouterRung.synth`), which hardcoded `mp3` for every model. Gemini
   showed up as a real, priced, 30-voice model in the picker — selectable,
   seemingly there — and then failed on every actual "Play sample" or
   narration call. Fixed by mirroring the generator's recipe at runtime: probe
   the response's `Content-Type` for the real sample rate/channels (never
   hardcoded — a per-model quirk), wrap the raw PCM in a 44-byte WAV header,
   return a blob-like object `decodeAudioData` can play directly — comparable
   to what Kokoro's own `wavBlob()` produces from its Float32 samples, but
   deliberately NOT the same real-`Blob` shape (independent-checker correction:
   an earlier draft of this note overclaimed that; see the replay-safety fix
   below for why the distinction matters).

**The fix.** `tts-voice-catalog.json` gains a `speedSupport: boolean` per
engine (a genuinely hand-maintained fact, like `requiresAsset`/`audioFormat` —
OpenRouter's catalog doesn't expose it) plus a `_speedNote` recording the
measurement each verdict rests on. `tts-voice-catalog.ts` exports
`speedSupported(modelId)`, defaulting `false` for an uncataloged model — the
same "admit we don't know" stance `NO_VOICES_HINT` already takes for an empty
voice roster, now mirrored as `NO_SPEED_HINT`. `TtsSettings.tsx`'s new
`SpeedSection` renders the real, existing slider ONLY when the active model
supports it; otherwise it renders no slider at all — a plain fixed-pace note
in its place, not a disabled-but-visible control stuck at an arbitrary value.
This directly answers "maybe this shouldn't even be a slider": for the 5
engines that don't support it, it isn't one anymore; for the 4 that do, a
slider is the technically honest control (live-tested as smooth and
proportional, not stepped), so it stays a slider there rather than becoming
stepped chips for every engine regardless of what the data shows.

**What's explicitly not changed.** The `0.75-1.5` UI range (already safely
inside every supported engine's real working range — narrowing/widening it
wasn't the bug). No model-picker badge surfacing speed support before you
select a model — the Speed section's own disabled-state note already explains
it the moment you do, and a picker-row indicator is a legitimate future nicety
rather than something the "look inept" complaint required.

## Adversarial trio (red team + Munger inversion + independent checker), pre-merge — round 2

Requested explicitly before merge, having been skipped in the initial pass
(HARD RULE #25 applies: `voice-model.js` is a shared module used by both the
Studio and the older Drawing Board surface, and this was a 9-file change
touching a catalog schema, UI gating, a runtime response-format fix, AND a
buffer-lifecycle fix — squarely the "multi-file refactor touching a shared
module" MAKER-CHECKER trigger). Three independent agents, no shared context,
each pointed at the real diff (`git diff origin/main...HEAD`) rather than this
doc's own description of it.

**Fixed — Munger inversion, highest severity: a stale cross-model `speed`
silently forces a live, billed call for a model that can't use it.**
`speed` is a single value shared across every model (unlike voice, it's never
reset on a model switch — `pickOrModel` only resets voice). Separately,
`cachedSampleUrl` (pre-existing, untouched by the first pass) only serves the
free, committed local sample at `speed === 1`. Chain the two together: pick
1.3x on Kokoro, switch to any `speedSupport:false` engine, click "Play sample"
on a CACHED voice — the stale 1.3x forces the live paid path for a value that
could never have changed that model's audio at all. The first pass's own
Speed-section redesign made this WORSE, not better: it removed the slider (the
one visible cue a non-default speed was even set) for exactly the five models
where the leak bites. Fixed in `previewTtsVoice` (`read-aloud.ts`), the single
choke point both "Play sample" and a model-row preview funnel through: `speed`
is now clamped to `1` before either the cache lookup or the live fallback
whenever the target model's `speedSupported()` is false. Covered by three new
tests in `read-aloud.test.ts` (clamps for an unsupported model, passes a real
speed through unchanged for a supported one, defaults an omitted speed to 1),
each confirmed to fail without the fix by temporarily reverting it.

**Fixed — independent checker: the PR's own core deliverable (hide the slider
for an unsupported model) had no test at the RENDERED level.** Every existing
slider-presence assertion in `WorkspaceSheet.test.tsx` exercised only the
default model (Kokoro, `speedSupport:true`); a regression that always rendered
the slider — or crashed `SpeedSection` outright for an unsupported model —
would have passed CI untouched. Added two tests asserting the actual DOM: no
`role="slider"` + the fixed-pace note for Grok (`speedSupport:false`), a real
enabled slider + no note for Kokoro (`speedSupport:true`). Confirmed both catch
a regression by temporarily hardcoding `SpeedSection`'s support check to
`true` and watching the negative-case test fail as expected.

**Fixed — red team: `PCM_ONLY_MODELS` (`voice-model.js`) is a second,
hand-maintained source of truth that can silently drift from the catalog.**
`tts-voice-catalog.json` already declares which engine needs PCM via
`audioFormat:"wav"`, and `tools/generate-voice-samples.mjs` correctly DERIVES
its format choice from that field — but the live runtime path checks a
separately-hardcoded `Set`, with only a code comment ("keep the two in sync")
holding them together. If a second engine is ever marked `audioFormat:"wav"`
without a matching add to the Set, the live path reproduces the exact bug this
PR just fixed, for a different model, with nothing to catch it. `PCM_ONLY_MODELS`
is now exported, with a new consistency test
(`test/unit/playground/voice-model.test.js`) asserting it exactly matches the
catalog's `audioFormat:"wav"` entries — confirmed to fail by temporarily
desyncing the two.

**Fixed — independent checker: a stale doc claim.** This doc originally said
the PCM-wrap helper returns "the same shape Kokoro's own `wavBlob()` already
produces" — overclaimed; it deliberately returns a duck-typed object, not a
real `Blob` (see the replay-safety fix, above, which exists BECAUSE that duck
type needs its own `.slice(0)` — a real `Blob` doesn't). Corrected in place.

**Logged, not fixed (HARD RULE #18 — off the path of this change):**
independent checker found that a model-ROW preview (clicking ▶ next to an
unselected model in `TtsModelPicker`, before actually picking it) passes its
own `model` id all the way to `previewTtsVoice`, which correctly uses it for
the CACHE lookup — but the live fallback (`voice-model.js`'s `previewVoice`)
never destructures `model` at all, so a live preview of a not-yet-selected row
actually synthesizes through whatever model is CURRENTLY active, not the row
being previewed. Confirmed pre-existing via `git show origin/main` — this
diff's `previewVoice` call signature is unchanged. A real bug, but it predates
this PR and isn't touched by it; not pulled into this diff per HARD RULE #18.
Worth a tracked follow-up: either forward `model` into `previewVoice()`'s
synth call, or have the row-preview button temporarily switch the active model
before previewing.

**Follow-up, fixed 2026-07-11 (`fix/tts-model-row-preview-uses-active-model`):**
took the first option above. `openRouterRung.synth` now accepts an optional
per-call `model` override (never persisted — `speak()`'s own narration path
never passes one, so it's unaffected); `previewVoice` resolves a single
`effModel` (the row's override when the rung is `openrouter` and one was
given, else the persisted active model as before) and uses it for BOTH the
cache key and the synth call, so a row preview can't read or write another
model's cache entry either. Confirmed backward-compatible: the main "Play
sample" button already always passes the currently-active model explicitly,
so `effModel` resolves identically there before and after. Verified by
temporarily reverting the fix and watching two new tests fail exactly as
predicted (wrong model in the live request body; a model-differentiated
preview wrongly hit the SAME cache entry), then restoring it.

**Not fixed — reasoned as acceptable, logged for awareness (Munger
inversion):** `speedSupport`/`PCM_ONLY_MODELS` are one-time, hand-typed
snapshots from a single live-tested session, with no scheduled re-verification
and no CI gate — the same staleness risk class the ORIGINAL hand-curated voice
roster had (the `zoe` lesson) before it was replaced with something
live-sourced. Unlike the roster, `speed` support isn't exposed anywhere in
OpenRouter's own catalog API (confirmed: `supported_parameters` never lists
`speed` for any of the 9 TTS models, supported or not — not diagnostic), so
there's no live signal to source this from; a wrong verdict can only be caught
by a human noticing a slider doesn't audibly do anything, or a fixed-pace note
on a model that actually gained speed support later. Recorded here as the
honest boundary of what a live-tested-but-not-live-sourced fact can guarantee,
not something this PR can close. The Drawing Board's own "Pace" control
(`cadenza.astro`) sends the same unguarded `speed` param with no
`speedSupported` gating at all — currently inert in practice (nothing in that
surface lets a user pick a cloud model other than the hardcoded Kokoro
default, which does support speed), so not urgent, but the same gap exists
there and was out of this PR's scope (Studio only).
