---
origin: 2372
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2372
---

# A second video aspect that fills a phone in landscape (fork 9)

The owner ruled on 2026-09-27 (video note §6, fork 9): b, render a second aspect rather than crop.

why now   — a 16:9 video shows bars on a ~19.5:9 phone in landscape.
where     — a ~19.5:9 canvas preset beside the existing ones (the player takes its canvas from the
            document via `resolveCanvas`); a `lattice video` option to capture it.
done when — every component holds at the new aspect (a gallery sweep, visual review), and the
            fixture deck captures at it with the same self-checks.
evidence  — the gallery at the new aspect; the fixture MP4 on a phone.
verify    — the QUALITY BAR's visual sweep; tier 1 checker for the capture change.
