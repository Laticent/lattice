---
origin: 3079
priority: P3
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-08-studio-ai-routes-ux.md
deferred: off-path — voice synthesis has never booked spend (OpenRouter and Gemini TTS calls record no cost today); this PR adds per-selection spend for chat and the image reader without changing that
source: https://github.com/Laticent/lattice/pull/3079 (routes redesign, Spend section)
---
# Book voice spend against the voice model's route

why now   — Workspace › AI now lists this session's spend per selection (`readSpendByUse` in
            docs/src/components/studio/ai/spend.js): chat and the image reader, each on its route.
            The design's Spend section also lists "Voice · <route>", but no read-aloud or Present
            call books a cost, so voice spend shows nowhere (the narrated export quotes its own).
where     — docs/src/playground/voice-model.js (the OpenRouter and Gemini rungs: a per-character
            estimate from `ttsCostPerMChars`, since neither returns a cost), the `recordSpend(...,
            { kind: 'voice', route })` call, and the Spend list's label in WorkspaceSheet.tsx.
done when — a read on a cloud voice adds an estimated "Voice · <route>" row, marked "≈", and a
            cached clip adds nothing.
