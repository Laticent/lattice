---
origin: 2443
priority: P3
recorded: 2026-09-28
area: website
severity: low
swimlane: engineering/decisions/2026-09-27-voice-default-and-cheapest-toggle.md
source: https://github.com/Laticent/lattice/pull/2443
---

# Present's voice button says "Aria" for every cloud voice

why now   — Found driving the cheapest-voice switch on the #2443 preview: the switch picked
            `canopylabs/orpheus-3b-0.1-ft · tara`, every speech request carried `tara`, and the
            button still read "Aria · cloud". The label predates #2443 (any author who picks a
            non-Kokoro voice sees it); the switch only reaches it once a non-Kokoro model is the
            cheapest, which it is not today.
where     — `docs/src/components/studio/PresentOverlay.tsx:1554` hard-codes `'Aria · local'` /
            `'Aria · cloud'`. The real name is available from `voiceMeta(modelId, voiceId)` in
            `tts-voice-catalog.ts`, fed by the voice model's `orModel()` / `orVoice()` /
            `kokoroVoice()`.
done when — the button names the voice that is actually speaking, on both rungs, and a test
            pins it for a non-Kokoro cloud voice.
evidence  — a Present screenshot with a non-Kokoro cloud voice showing its own name.
verify    — tier 1: the unit test; tier 2: the Present overlay on the docs preview.
