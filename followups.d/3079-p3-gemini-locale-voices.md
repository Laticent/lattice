---
origin: 3079
priority: P3
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-07-studio-model-spine.md
deferred: large — offering 2,084 locale-specific voices needs a language filter (deck language vs browser vs a picker), a design call the owner has not made
source: https://github.com/Laticent/lattice/pull/3079 (live Gemini voice list, 2026-11-08)
---
# Offer Gemini's locale-specific voices behind a language filter

why now   — Gemini's `/v1beta/voices` lists 2,114 prebuilt voices in 39 languages. PR #3079's picker
            offers the 30 named, multilingual ones (Achernar … Zephyr). The other 2,084 are
            locale personas (`en-us-advisor-1`, "Authoritative Advisor 1", with accent, persona,
            gender and a description) that a deck in Portuguese or Hindi may want.
where     — docs/src/playground/voice-model.js `listGeminiNamedVoices` (keep the full records, not
            only ids), docs/src/components/studio/GeminiVoicePanel.tsx, VoicePicker.
done when — the picker filters by a language (the deck's `lang:` by default) and labels a voice by
            its display name and persona; the named voices stay the default list.
evidence  — a unit test on a recorded voices page; a screenshot of the picker at 390 and 1440.
verify    — tier 1 checker.
