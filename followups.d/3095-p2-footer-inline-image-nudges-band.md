---
origin: 3095
priority: P2
recorded: 2026-11-08
area: engine
severity: low
swimlane: engineering/decisions/2026-11-08-anchor-chrome.md
deferred: off-path — an inline image in `footer:` text; unchanged by #3095
---

# An inline image in `footer:` nudges the page number and rail down

why now   — the footer band's row is a fixed height since #3095, but a taller inline run in the footer text (an `<img>`) still moves the shared baseline, so the page number and rail drop 3px at hd and 6px in story, and the page number's box ends 3px below the band. Identical before #3095.
where     — lib/forms/cell/stage/stage.css `section.form > .cell-footer > footer` (line height, height, overflow).
done when — a footer with an inline image leaves the band's baseline where a text-only footer puts it, asserted in footer-band.test.js.
evidence  — the checker's probe for #3095 (footer with an inline `<img>`, hd and story).
verify    — tier 1 checker.
