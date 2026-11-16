---
origin: 3183
priority: P2
recorded: 2026-11-13
area: engine
severity: high
swimlane: engineering/decisions/2026-10-21-slide-pictures-png-or-jpeg.md
deferred: large — a reader change across the PDF writer and Calco, designed in 2026-10-21 and never built; it needs lastra's tone (slice 6) for toned photos and the owner's export sign-off
source: https://github.com/Laticent/lattice/pull/3183
---

# PDF, PowerPoint and LibreOffice bake a covered photo into a 2560 px slide picture

why now   — On the owner's 35-slide photo deck the PDF writer refused 30 photos as separate objects ('covered' by the image
            layout's scrim or a finish, 'filter' by a tone), so each became part of a 0.45 to 1.1 MB slide JPEG; the PDF is
            11.7 MB and the PowerPoint 15.9 MB where the photos themselves are 6.9 MB.
where     — lib/core/pdf-compose/read-slide.mjs (the 'covered' and 'filter' refusals), docs/src/lib/calco (one picture per slide),
            lastra tone for grayscale/duotone.
done when — a covered or toned photo ships once, as its original file (or a toned copy at its own size), with the scrim, wash
            and words drawn over it; the slide looks the same at slide size in both modes.
evidence  — per-slide image census before and after on two photo decks; pixel comparison of every slide.
verify    — the adversarial trio (every PDF export runs this reader); the owner's export sign-off.
