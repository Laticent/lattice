---
origin: 2853
priority: P2
recorded: 2026-10-21
area: website
severity: medium
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2853
---

# Drive the Library's Import button on a real iPhone

why now   — the sheet (Take Photo, Photo Library, Choose Files) and "a photo lands on Images" were never driven on a
            phone. #2853 pins only the input's `accept` and absent `capture`. UNVERIFIED (HARD RULE #23).
where     — the Library header on the branch preview or main, any iPhone.
done when — all three picker choices are offered and a photo taken or chosen lands on Media → Images.
evidence  — a phone screenshot of the picker, and of the photo on Images.
verify    — the owner, or a session with a device.
