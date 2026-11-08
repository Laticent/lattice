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
(`followups.d/3079-p3-library-pages-on-the-voice-spine.md`).

## 6. Providers, curation and the Gemini voice

`docs/src/lib/provider-registry.js` is the one table of what each provider does (chat, voice, key,
on-device) and its curated families. Curation is a preference over the provider's LIVE list
(`curate`, `curatedDefault`): curated matches first, every live model kept, no pinned ids, so a
retired id stops matching and a new release in the family is picked up. The Gemini families match
any version from 3 up, newest version first (by `created` when the list has it, else by the version
in the id, a GA id before a preview of the same version): today that is the GA
`gemini-3.8-flash-lite-tts` (the default) and `gemini-3.8-flash-tts`, and an account that only lists
`gemini-3.1-flash-tts-preview` gets that instead of no recommendation at all. Gemini 2.5 ids are listed but not curated. The direct chat default prefers the curated family inside the existing price rule (a
fallback still never moves the author up in price).

The direct Gemini voice (`gemini-tts` rung, `voice-model.js`) calls
`models/<id>:generateContent` with `responseModalities: ['AUDIO']` and
`speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`, on the Gemini key only. A response
with a RIFF header is returned as is; headerless L16 (the documented default) is wrapped into WAV. The
model list comes from the live `/v1beta/models`. The voice roster is read from `/v1beta/voices`
(never hand-typed), but Google documents no such list endpoint, so on a real key the roster may be
empty and Gemini speaks in the model's default voice; how to offer a voice choice there is an open
owner decision (PR #3079). Until the model list answers, the rung uses `gemini-3.8-flash-lite-tts`.

**A retired voice model turns read-aloud off; nothing stands in.** Providers retire TTS models with
little notice. When a speech call answers 404, or 400 naming the model as not found, unsupported,
deprecated or without endpoints (`isModelGoneError`; a bad key is not this), the voice model records
the model as gone for the page: the selection reads `unavailable` with reason `model-gone`, the voice
card shows "Model retired", the author gets one notice saying where to choose another, and the rung
is not asked again (one notice, not a 404 per sentence). Another model is unaffected; a reload asks
the provider again. The owner's follow-up (`followups.d/3079-p1-model-guard-rails.md`) makes the
model ids a hotfixable config file, checks them nightly, and gives chat the same rule.

Clips key under their own rung name, so they never collide with an OpenRouter clip.

## 7. Workspace › AI, the chip and Present

Workspace › AI is three sections (`AiModelSections.tsx`): **Chat model**, **Voice model** and
**Providers & keys**. Each selection is a fixed-height card — source glyph, name, where it runs, a
fixed-width readiness badge, Change — and Change opens the chooser in place. The chat chooser's
Source switch (Cloud / On-device) only filters; picking a provider or a model selects it. A missing
key is actionable on the card ("Add a key" scrolls to Providers & keys); a rejected key is an alert
on the card. Spend and the standing instructions follow the ACTIVE selection's source. Narration
prefs moved from General to Voice model › More narration settings. The image model (which model
reads the author's photos) is its own setting, so it sits under the chat card, not behind Change.

The cards lay out by their OWN width (a container query, `@[26rem]`), not the viewport's, because
the Workspace sheet is narrow on a wide screen too. Wide: name and meta stacked, the badge in its
own column, Change with its label. Narrow (a phone, ~360px of card): the name takes the whole top
line, the badge moves under it beside the meta, and Change becomes an icon. The badge keeps a fixed
width in both, so readiness still changes in place. Before this, the badge squeezed the name on a
phone ("Claude Sonn…").

**Providers & keys** is one row per provider: OpenRouter, Gemini, Anthropic, OpenAI and On-device
(`ApiKeyPanel.tsx`). A row says whether it holds a key (`Key …ab12`, `No key`, or rejected) and
what it is in use for (chat, voice, both), read from the two selections. A keyed row offers Replace
and Remove, plus "Use for chat" when chat runs elsewhere; an empty row offers Add ("Paste a key" on OpenRouter's row),
which opens the key field inline on that row. OpenRouter's row carries the one-click sign-in. With no key stored
anywhere, OpenRouter's field starts open, so the first run is one paste. On-device needs no key and
its row only reports what it is in use for.

The chat chip names the selected model for every selection, on-device included, with a source
glyph and a "Models & keys…" link; its list writes the same chat selection. Because the chip sets
the GLOBAL selection, it reaches every source the Workspace does: a source switch lists each
provider holding a key plus On-device. Picking a provider selects it at once, on the model last
picked there (`selectChat` also remembers the model it is leaving; every write and the migration
already do, so this only covers a record written by hand, such as a test fixture). On-device lists the three engines in place of the catalog,
and picking one selects it, loaded or not; a model that is not loaded reads so in the chip and
loads under Models & keys. The chip's "Featured" lens showing one model in review was the e2e mock
catalog (two `test/*` models), not curation over-filtering: `OR_FEATURED` matches by family
prefix against the live list, and the direct providers open on All. Present's voice pill
names the selected voice ("Heart · on-device") and reads "Loading voice… n%" while it warms.
`lib/model-name.ts` is the one model-name formatter.

**First frame.** `useArchitectStatus` seeds needs-key / ready from storage synchronously; the
skeleton has the real section shapes; the Spend rows keep their shape while the account read is in
flight; value text sits left-aligned in fixed boxes so a value arriving moves nothing.

## 8. A loop the spine exposed, fixed

`lib/openrouter-key.js` announced `db-model-changed` after every key load, including a load that
failed transiently (the secrets store unreachable). Every listener re-read the key, which retried
the load, which failed and announced again: a loop that starved the page. A transient failure now
leaves the key "not known yet" (read as `warming`), announces only a change, and is retried at most
once a second by a read.

### Found by the independent review of the spine

- **`pin()` read its snapshot after an await.** For a direct provider with no stored model,
  `pin()` awaits the catalog to derive the default. The snapshot (`generation`, readiness) was
  read after that await, so a switch during the fetch made the pinned turn report the NEW
  selection while running the old backend, and `chatComplete` branches on that `generation`.
  The snapshot is now read in the same tick as the pick.
- **A pick made while storage refuses writes was lost.** `writeLS` kept a memory copy, but
  `readLS` preferred what storage still held. Refused writes now win over storage on this page.
- **An unreadable record was re-migrated.** A `v: 2` record from a newer tab (or an unknown
  provider) failed to parse and was overwritten by a migration from legacy keys, usually the
  default. A record that exists is now never migrated or overwritten; it reads as the default.
- **A transient key-store failure was retried only by a read.** §8's fix stopped the announce
  loop, but nothing retried on its own. The slot now retries with a backoff (1 s doubling to
  30 s), one timer at most, and announces when the key opens.

## 9. Evidence

- **Unit:** `lib/model-selection.test.ts` (migration once, reload, normalization, cross-tab
  events), `lib/provider-registry.test.ts`, `lib/model-name.test.ts`,
  `ai/architect-model.spine.test.ts` (reload, no substitution, unseal race, needs-key, mid-turn
  switch, chip and cost credited to the answering model, cross-tab, saving a key selects chat and,
  when stranded, voice; on-device warm only from cache), `playground/voice-model.spine.test.ts`
  (no implicit Kokoro, voice independent of chat, voice unseal race, Gemini request shape and WAV,
  curated default from the live list), `read-aloud.normalize-voice.test.ts`,
  `ChatCost.test.tsx` (chip label, the chip's source switch), `WorkspaceSheet.test.tsx` (one row
  per provider),
  `test/unit/playground/architect-model.test.js`.
- **e2e** (`docs/e2e/model-spine.spec.ts`, providers mocked): reload persistence for chat and
  voice; a mid-turn switch keeps the answerer; cross-tab sync; the chip equals the model that
  answered and is the global selection; the unseal race does not substitute; voice independent of
  chat; Present reads in the selected voice; saving a key activates chat and the stranded voice;
  the chip reaches a saved provider and the on-device models; Present's first read waits for the
  on-device voice and its pill reads "Loading voice… 42%" (a stand-in for kokoro-js reports 42%
  and holds the load until the test releases it). Run on Chromium (1440 and 390), WebKit (tablet
  and phone) and Gecko.
- **CLS** on opening Workspace › AI: gated at 1440, 820 and 390 in `model-spine.spec.ts` (Chromium,
  OpenRouter key, mocked). The test sums every `layout-shift` entry from just after the tab click until both
  cards read ready and the image model has painted, including the ones Chromium marks as following
  input, and requires 0. It was 0.085 at 820 before the skeleton fix. Making the image-model block a
  static import (the sheet itself is lazy) removed a Suspense placeholder 150px shorter than the
  block, which would otherwise have pushed the Voice model section down after it opened.
- **Route budget:** +3565 bytes of Studio eager JS against `main` 644f177, declared in
  `docs/route-budget.d/3079-model-spine.md`: the synchronous selection store and the key-state read
  the first frame needs. The chooser, provider rows and chip switch ship in the lazy Workspace and
  chat chunks.
- **Not verified:** a live provider (the owner's call; HARD RULE #24), and real Safari on iOS.
