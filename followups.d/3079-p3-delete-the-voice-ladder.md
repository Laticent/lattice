---
origin: 3079
priority: P3
recorded: 2026-11-09
area: website
severity: low
swimlane: engineering/decisions/2026-11-07-studio-model-spine.md
deferred: large — no production caller is left, but about 92 createVoiceModel() constructions in five test files (voice-model.test.ts, voice-model.prefetch-drop.test.ts, voice-model.kokoro-priority.test.ts, test/unit/playground/voice-model.test.js, test/unit/playground/tts-cost.test.js) use the ladder as their harness, and each needs a selection written for what it tests
source: the /cadenza and /suono move onto the voice spine (followups 3079-p3-library-pages-on-the-voice-spine, shipped)
---
# Delete the voice ladder from voice-model.js

why now   — since /cadenza and /suono pass a selection, nothing in the shipped site constructs a voice
            model without one. The `!selection` branch of `pickRung` (the auto ladder: on-device
            first on desktop, then a connected cloud voice, then speechSynthesis), `rungPref`,
            `setRungPref`, `preferOnDevice`, `explicitOrModel` and the legacy `voiceKeys` prefs are
            dead code that tests keep alive.
where     — docs/src/playground/voice-model.js, and the five test files above.
done when — `createVoiceModel` requires a selection; the ladder and the legacy prefs are deleted; each
            test that used the ladder passes a selection naming the rung it meant to test.
evidence  — the voice-model suites green without the ladder; `grep -n "rungPref\|voiceKeys"` empty.
verify    — tier 1 checker (it touches the voice engine every surface reads through).
