---
origin: 3061
priority: P3
recorded: 2026-11-10
area: statement
severity: low
swimlane: engineering/decisions/2026-11-06-gift-link-cli.md §5
deferred: blocked — HARD RULE #8: a new layout graduates into the long-running galleries in a separate commit after review
source: https://github.com/Laticent/lattice/pull/3061
---

# Graduate a gift-card exemplar into the baseline gallery

why now   — `gift-card` shipped with its own gallery and demo deck; the baseline gallery has no exemplar yet.
where     — test/integration/baseline-decks/gallery.md (one gift-card slide, a fake link).
done when — the slide is in the gallery and the pixel check shows zero drift on every other slide.
evidence  — pixel-check output.
verify    — tier 1, the gates.
