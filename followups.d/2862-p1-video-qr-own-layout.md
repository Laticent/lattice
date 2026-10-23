---
origin: 2862
priority: P1
recorded: 2026-10-22
area: imagery
severity: medium
swimlane: engineering/decisions/2026-10-22-venue-conformance.md §6
source: https://github.com/Laticent/lattice/pull/2862
---

# video qr sits under the QR floor from huddle and clips its caption; it needs its own layout

why now   — the harness names it: its code is a fixed 8rem (10% of the slide at every venue) and "Scan to watch" is clipped under the poster at laptop upward. #2862 tried the shared QR sizing and it clipped at laptop, so that edit was backed out.
where     — lib/components/imagery/video/video.styles.css (`.video-qr`, `.video-aside`); the shared floor is `--qc-qr` in lib/components/connect/_qr-card/qr-general.css.
done when — `npm run check:venue-conformance -- --only=video` shows no `video qr` row, and the `KNOWN` rule for it in tools/check-venue-conformance.js is deleted.
evidence  — the harness table, and a rendered PDF via SendUserFile at huddle and hall.
verify    — tier 2 maker-checker (shared QR sizing).
