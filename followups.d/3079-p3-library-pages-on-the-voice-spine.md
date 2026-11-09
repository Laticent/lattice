---
origin: 3079
priority: P3
recorded: 2026-11-07
area: website
severity: low
swimlane: engineering/decisions/2026-11-07-studio-model-spine.md
deferred: off-path — the /cadenza and /suono library pages are reference pages outside the Studio; the spine brief scoped the Studio
source: https://github.com/Laticent/lattice/pull/3079 (owner review of the model-spine checkpoint, deviation 2)
---
# Move /cadenza and /suono onto the voice spine

why now   — the Studio's voice is a stored selection resolved without a ladder. The two library
            pages still call `createVoiceModel` without a `selection`, so they keep the old
            `pickRung` ladder (desktop Kokoro default, cloud when a key happens to be open,
            `allowBrowserVoice` on /cadenza). They never read or write the Studio's selection
            records (they use the `db` voice prefs), so the Studio is unaffected.
where     — docs/src/pages/libraries/cadenza/index.astro, docs/src/pages/libraries/suono/index.astro,
            docs/src/playground/voice-model.js (the `!selection` branch of pickRung and the
            legacy `voiceKeys` prefs, both deletable once these pages move).
done when — both pages pass a page-scoped selection; the `!selection` ladder and `setRungPref`
            are deleted from voice-model.js.
evidence  — voice-model unit tests without the legacy ladder; the two pages' e2e.
verify    — tier 1 checker.
