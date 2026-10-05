---
origin: 2540
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2540
---

# Sharing lessons — the HTML player and PowerPoint

why now   — the curriculum in engineering/decisions/2026-10-05-studio-lessons.md lists a Sharing track
            (the HTML player, PowerPoint); #2540 shipped Basics, Building and Polish.
where     — a new lessons/sharing.ts track, lines in lessons/lines.ts, catalog rows, recorded with
            `node tools/record-lesson-voice.mjs`; Share sheet anchors as needed.
done when — "How do I share a link that plays?" and "How do I get PowerPoint?" lessons exist, voiced,
            with the export itself left to the user (a lesson never downloads for them).
evidence  — tools/screenshot.js-style captures at 1440/820/390 mid-lesson; clip bytes per lesson.
verify    — tier 0 gates + lessons e2e.
