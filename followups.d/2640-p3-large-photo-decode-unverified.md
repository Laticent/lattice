---
origin: 2640
priority: P3
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# Decoding a very large phone photo on a low-memory device is unverified

why now   — The importer decodes a photo to a canvas before re-encoding it. Playwright's desktop and
            emulated engines handled the 24-megapixel fixture, but no real Android or iOS device
            was available, so a 48 or 108 MP photo on a low-memory phone is UNVERIFIED (HARD RULE #23).
where     — `docs/src/components/studio/media-import.ts` `importImage` / `decode`. The refusal path
            for a decode that fails exists and names the cause; whether the failure happens at a
            size a real phone hits is the open question.

done when — The importer is run on a real Android and a real iPhone with a 48 MP or larger photo, and either imports it or refuses it with a message that names the cause; the result is recorded here.
