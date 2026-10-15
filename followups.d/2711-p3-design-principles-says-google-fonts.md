---
origin: 2711
priority: P3
recorded: 2026-10-15
area: docs
severity: low
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §3.5
---

# design/design-principles.md says fonts must be on Google Fonts; the font gate enforces self-hosting

why now   — A canonical doc contradicts the gate, so a theme author following it adds a CDN font that check-fonts refuses.
where     — design/design-principles.md:55; tools/check-fonts.js
done when — the principle states the self-hosted rule check-fonts enforces
evidence  — tools/check-fonts.js bars the Google CDN
verify    — npm run build:check passes; the principle matches check-fonts' header
