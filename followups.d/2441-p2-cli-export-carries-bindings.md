---
origin: 2441
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2441
---

# The CLI export carries each slide's narration binding, as the Studio's share does

why now   — A deck exported from the Studio carries each chart slide's binding (`refs`, from
            `narrateChartScript`) and its player plays the chart's scene; the same deck exported by
            `lattice-emulator.js` (and so `lattice video`) carries none, so its Guide falls back to
            matching the narration's words (the text path). Measured by reading: the emulator calls
            `narrateChart`, not `narrateChartScript`, and `voiceDeck` (`lib/export/narrate-kokoro.mjs`)
            builds each slide as `{ text, track, clips, emphasis }` with no `refs`. Found by the
            checker on the #2441 port (2026-09-28). Storyboards step 5 owns the export plumbing.
where     — lattice-emulator.js (the chart-narration pass near `narrateChart`, and the identity test
            the Studio applies: keep a slide's refs only while its final text is the narrator's text),
            lib/export/narrate-kokoro.mjs `voiceDeck` (carry `refs` beside `emphasis`),
            lib/export/player-core.mjs `guideDeliveryOf` (already reads `slides[i].refs`).
done when — a CLI-exported chart deck's HTML carries `"refs":[[` and its player focuses each stage
            its narration names from the binding; an unbound deck's export is byte-identical.
evidence  — the CLI export of examples/delivery-scenes.md played in Chromium, one frame per stage.
verify    — tier 0 gates, test/unit/export/player-guide.test.js, the export played in a browser.
