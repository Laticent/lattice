---
status: in-progress
summary: The Studio picked its chat model and its read-aloud voice from readiness ladders on every call, so who answered depended on timing (a key still unsealing, Kokoro loaded or not, an in-memory on-device pick lost on reload). The model spine replaces both ladders with one stored chat selection and one stored voice selection, resolved without substitution, pinned per chat turn and per read, synced across tabs, and painted from storage on the first frame.
---

# Studio model spine — one stored selection for chat, one for voice

## 1. The problem

The owner reported that the Studio's chat and voice models changed without being asked, that
Workspace → AI mixed chat and voice settings, that the sheet jumped, and that Present spoke in
an unexpected voice. Three audits (chat, voice, UX) traced every symptom to one cause: there was
no stored choice. Chat ran `pickBackend()` and voice ran `pickRung()` on every call, and both
picked whatever was ready at that moment.

| # | Root cause | Effect |
|---|---|---|
| R1 | The chat's on-device pick lived in a `let` in `architect-model.js` | An on-device pick was lost on reload |
| R2 | `pickBackend()` ran on every agent round, and the model id was re-read per request | The model could change mid-turn; cost and the chip named whatever was set at the end |
| R3 | Saving or switching a key forced `setStudioTier('auto')` | Adding a key silently ended on-device chat |
| R4 | A chosen direct provider whose key was not open yet fell down the ladder | "Chose Anthropic, got Chrome's built-in model" |
| R5 | The voice engine came from pointer type, Kokoro readiness, "ever stored a cloud model" and key readiness; the voice-rung setter was never called | Present's voice differed by device and timing |
| R6 | The voice panel rendered as `TtsSettings tier={sideView}` | Looking at the chat's On-device tab changed the voice panel |
| R7 | Cloud voice was hard-wired to OpenRouter | A Gemini key could never drive Gemini speech |
| R8 | The display read different state than execution; no `storage` listener; no ordering guard on status refreshes | The UI named one model while another answered; other tabs drifted |
| R9 | The skeleton's shape did not match the real layout; the voice section rendered `null` until loaded | Layout shift on open; voice section pop-in |

## 2. The spine

**Two records, one module** (`docs/src/lib/model-selection.js`), in localStorage, read
synchronously:

```
chat:  { v:1, source:'cloud'|'device', provider, model, last:{ [provider]: model } }
voice: { v:1, source:'cloud'|'device', provider, model, voice, last:{ [provider]: { model, voice } } }
```

`model: ''` means the provider's curated default. `last` remembers the author's last pick per
provider, so switching back restores it; it replaces the per-provider `lattice-db-${p}-model` keys.

**Rules.**

1. **Exactly one of each.** A selection writes the record. Selecting a model makes it active at
   once: there is no "selected but not active" state. The one write that is not a pick is the
   voice-id normalization (rule 7).
2. **Resolve, never ladder.** `resolve()` (`ai/architect-model.js`) and `resolveVoice()`
   (`playground/voice-model.js`) return the selected backend and a state: `ready`, `warming`,
   `needs-key` or `unavailable`. They never substitute another backend or provider. A chat that
   cannot answer gets the floor (no reply) and a notice naming the state; a voice that cannot
   speak is silent. The model-off floor switch stays.
3. **Pinned per turn and per read.** `chatComplete` calls `pin()` once per turn: every agent
   round answers on the pinned backend and model, and the reply, its cost and the chip are
   credited to the model that answered, including the OpenRouter dead-model self-heal, which now
   reports the model it actually used. A read awaits `prepareSelectedVoice()` (open the key, or
   load the selected Kokoro off the main thread), then pins its rung; a pinned rung that stops
   being ready goes silent for the rest of the read instead of switching voice.
4. **Survives reload and tabs.** The records are read on every call. `watchSelectionStorage`
   turns another tab's write into `db-model-changed` / `db-voice-changed` here, and a key change in
   another tab does the same. `useArchitectStatus` and `TtsSettings` sequence-guard their
   refreshes, so an older answer never paints over a newer one.
5. **First frame is final.** Surfaces seed from the stored record synchronously. Readiness
   changes in place, as a badge, never as a reflow.
6. **Migration, once.** The first read of each record folds in `lattice-db-provider`,
   `lattice-db-or-model`, `lattice-db-${p}-model`, `lattice-studio-voice-or-model`,
   `lattice-studio-voice-or`, `lattice-studio-voice-kokoro` and the never-written
   `lattice-studio-voice-rung`, then deletes them. A record that exists is never re-migrated.
7. **Voice ids are normalized against the live roster.** A stored voice id the provider renamed
   or dropped is corrected in storage (`normalizeStoredVoice`, called from
   `normalizeVoiceSelection` in `read-aloud.ts` before a read and when the Workspace loads the
   roster), so storage, the UI and synthesis agree and no known-invalid id is ever sent. It never
   changes which provider or model is selected.

## 3. Owner decisions (2026-11-07)

1. **Workspace › AI is the one global setting.** The chat chip writes the same chat selection.
   Every other AI faculty (theme, refine, finish, alt-text, the chart model switch) uses the chat
   selection. Fabricate is unchanged beyond what the shared store forces.
2. **OpenAI voice is out of scope.** `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` shut down on
   2027-01-06, and the named replacement `gpt-realtime-2.1-mini` does not serve
   `/v1/audio/speech` (`followups.d/3048-p9-direct-openai-voice.md`).
3. **"When something is set you use it."** Saving a key makes that provider's chat model active
   (the author's last pick for it, else its curated default). If that provider offers voice and
   the current voice needs a key that is missing or unavailable, its default voice is selected
   too; otherwise voice is left alone. Chat and voice stay independent.
4. **Keys.** No real key appears in tests or `docs/**` (HARD RULE #24); every provider is mocked.

**Checkpoint answers.** A new user with no keys reads `needs-key` on OpenRouter; the built-in
Prompt API is never an implicit default (its availability is an async probe). A selected
on-device chat model is warmed at boot only when its weights are already in Cache Storage
(`detectCachedWeights`, no network request), reading `warming` with progress; otherwise it reads
`unavailable` with a Load button. The first read on a selected Kokoro waits for it, visibly.

## 4. What this supersedes

- **`2026-06-29-studio-tier-precedence.md` (Policy B)** — the ladder and its `explicitTierWins`
  flag are gone. "Connection ≠ active" survives in a stronger form: only a selection is active.
- **`2026-11-06-studio-byok-key-lifecycle.md` §7** — saving a key no longer calls
  `setStudioTier('auto')`; it selects the provider's chat model (decision 3). Removing a key no
  longer returns the tier to OpenRouter: the selection stays and reads `needs-key`, because
  moving the author to another provider is the substitution this note removes. The claim that
  OpenAI was the only direct provider with speech is corrected in place.
- **`2026-09-27-voice-default-and-cheapest-toggle.md`** — the implicit desktop on-device default
  and "picking any cloud model disables on-device forever" are gone; the author selects the voice
  engine. The cheapest-voice switch remains the meaning of "no voice model chosen".
- **`2026-07-09-studio-cloud-ondevice-config-split.md`** — the voice section no longer sits under
  the chat's Cloud / On-device view switch.
- **`2026-06-29-studio-model-liveness.md`** — its note that the Studio defaults to the Haiku alias
  is stale; the default is the Sonnet `~latest` alias (`DEFAULT_OR_MODEL`).

**Kept:** no `speechSynthesis` in production; the export voice belongs to the artifact (the
export narrator now defaults to the selected voice); voice rosters are live, never hand-typed;
Suono stays a byte source; a chosen direct provider never bills OpenRouter; HARD RULE #24.

## 5. Scope limits

The `/cadenza` and `/suono` library pages create a voice model without a selection and keep the
old pref ladder. They never read or write the Studio's selection records
(`followups.d/3048-p10-library-pages-on-the-voice-spine.md`).

## 6. Evidence

Unit: `lib/model-selection.test.ts`, `ai/architect-model.spine.test.ts`,
`playground/voice-model.spine.test.ts`, `read-aloud.normalize-voice.test.ts`,
`test/unit/playground/architect-model.test.js` (chat selection — who answers).
