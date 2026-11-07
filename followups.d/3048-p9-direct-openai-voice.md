---
origin: 3048
priority: P9
recorded: 2026-11-07
area: website
severity: medium
swimlane: engineering/decisions/2026-11-07-studio-model-spine.md
deferred: large — out of scope by owner decision 2 (2026-11-07): a direct OpenAI voice needs a speech transport whose models all shut down on 2027-01-06, and the named replacement does not serve the speech endpoint
source: https://github.com/Laticent/lattice/pull/3048 (rewritten by the model spine, feat/model-spine, owner decision 2)
---
# Read-aloud on a direct OpenAI key

why now   — the model spine gives voice its own provider axis (OpenRouter, Gemini direct,
            Kokoro). OpenAI direct is the one direct provider without a voice. OpenAI's
            `/v1/audio/speech` models `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` (all dated
            variants) are deprecated and shut down on 2027-01-06, and the replacement OpenAI
            names, `gpt-realtime-2.1-mini`, is not supported on `/v1/audio/speech`. So OpenAI
            TTS must be implemented in a follow-up on whatever transport OpenAI supports then
            (the Realtime API, most likely), not on `/audio/speech`.
where     — docs/src/playground/voice-model.js (a cloud rung in `cloudRungs`, beside Gemini);
            docs/src/components/studio/ai/provider-registry.js (OpenAI's voice capability);
            the narration-store clip keys (a provider dimension).
done when — with only an OpenAI key saved, choosing an OpenAI voice in Workspace → AI → Voice
            model speaks through OpenAI, and nothing bills OpenRouter.
evidence  — a mocked e2e (page.route on api.openai.com); one live sample under $0.05 with the
            owner's OK.
verify    — tier 1 checker.
