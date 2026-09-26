---
origin: 2361
priority: P3
recorded: 2026-09-27
---

# `check-family-tiers.js` reads the SCALE block as the OVERFLOW line

why now   — found while fixing the same bug in tools/lib/calibrate-core.js (`parseProbeLog`).
            Since LEVEL, a scaled deck's `↓ SCALE` block prints "(the OVERFLOW line reports
            them)" BEFORE the real `⚠ OVERFLOW` line, and a bare `/OVERFLOW[\s\S]*?pages?…/`
            harvests the pages in the SCALE text instead. Not caused by #2361's branch and off
            its path: check-family-tiers renders at the designed size, where no SCALE block is
            printed, so it is latent until someone runs it on a scaled deck.
where     — tools/check-family-tiers.js (the harvest regex), and the list of harvesters in
            test/unit/export/near-miss-advisory.test.js.
done when — the harvest anchors on `⚠ OVERFLOW` and stays on its line, as calibrate-core's does.
evidence  — a unit test feeding it `scaleLevelReport` output plus an OVERFLOW line.
verify    — tier 0: the unit test.
