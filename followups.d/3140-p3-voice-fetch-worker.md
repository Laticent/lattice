---
origin: 3140
priority: P3
recorded: 2026-11-11
area: website
severity: low
swimlane: engineering/decisions/2026-11-11-voice-synthesis-spine.md
deferred: large — the rungs' fetch reads a sealed key from IndexedDB and feeds the model-gone and billing latches, all main-thread today; moving them into a worker is its own change with its own review
source: https://github.com/Laticent/lattice/pull/3140
---
# Move the voice rungs' network fetch and Gemini's decode into a worker

why now   — §3.2 of the spine note proposed a voice worker for the whole per-clip pipeline; #3140 moved only
            the export's packing (the measured cost). Gemini's base64 decode (`charCodeAt` loop) and the PCM-to-WAV
            copies still run on the main thread on the live reading path.
where     — docs/src/playground/voice-model.js (`openRouterRung`, `geminiTtsRung`, `pcmBlobFromResponse`)
done when — a live narrated read on Gemini shows no long task from decoding a clip, measured in real Chromium.
evidence  — a long-task trace of Present reading a Gemini deck, before and after.
verify    — tier 1 checker (it touches the engine every voice reads through).
