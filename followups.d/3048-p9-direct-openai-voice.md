---
origin: 3048
priority: P9
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7
deferred: large — a second speech transport in voice-model.js (OpenAI's /audio/speech voices, formats and price), its voice catalog in the picker, and narration-cache keys per provider
source: https://github.com/Laticent/lattice/pull/3048
---
# Read-aloud on a direct OpenAI key

why now   — the direct-provider keys (§7 step 2) run every text faculty on OpenAI, Anthropic or
            Gemini, but the cloud voice still needs an OpenRouter key. OpenAI is the only one of
            the three with speech.
where     — docs/src/playground/voice-model.js (the openrouter-tts rung); TtsModelPicker.tsx;
            narration-store keys.
done when — with only an OpenAI key saved, Workspace → Play sample speaks through OpenAI.
evidence  — a live sample under $0.05, and a mocked e2e.
verify    — tier 1 checker.
