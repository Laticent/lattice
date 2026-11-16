---
origin: 3183
priority: P5
recorded: 2026-11-13
area: website
severity: medium
swimlane: engineering/decisions/2026-10-12-library-media-assets.md §3
deferred: blocked — MAX_LATTICE_MEDIA_BYTES is a number the owner set; changing it is the owner's call
source: https://github.com/Laticent/lattice/pull/3183
---

# With originals as the Library default, a .lattice reaches its 128 MB photo cap at about 25 to 40 phone photos

why now   — PR 3183 made Keep original the Library's default. A phone photo is now stored at 3 to 6 MB instead of about 1 MB,
            and MAX_LATTICE_MEDIA_BYTES (128 MB, lib/packages/limits.js) was sized as "about 60 photos at the 2 MB the importer
            can produce". A deck past the cap ships the photos that fit and names the rest.
where     — lib/packages/limits.js (MAX_LATTICE_MEDIA_BYTES, MAX_EMBEDDED_MEDIA_BYTES), the Studio's and the CLI's readers and
            writers that share it, and iOS storage quota for the Library.
done when — the owner has chosen a cap for originals (or kept 128 MB) with the measured photo count it allows and the iOS
            storage behavior at that size; writer and reader read the same constant as today.
evidence  — a 50-photo phone deck written and reopened at the chosen cap in Chromium, Firefox and WebKit.
verify    — tier 1 checker.
