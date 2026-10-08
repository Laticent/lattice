---
origin: 2608
priority: P2
recorded: 2026-10-08
area: engine
severity: low
swimlane: engineering/typography.md
source: https://github.com/Laticent/lattice/pull/2608
---

# Correct the stale 0.95 orientation-boundary comments

why now   — two comments still say square starts at aspect 0.95 and that the
            0.9-vs-0.95 seam is open; the engine now derives orientation from
            lib/adaptive/families.js (BOUNDARIES [0.5, 0.9, 1.05]), so the seam
            is closed and the comments mislead anyone tuning type scales
where     — lib/typography/scale.js header (the "landscape / square / portrait"
            block and the parenthetical about families.js);
            lib/engine/css.js, the orientation name doc comment that says
            'square' (0.95–1.05) · 'portrait' (< 0.95)
done when — both comments state the 0.9 / 1.05 boundaries and cite families.js;
            `grep -rn "0\.95" lib/typography lib/engine/css.js` shows no stale
            boundary claim; no code changes
evidence  — the comment diff, plus a one-line node check printing
            orientationFor(0.92) === 'square'
verify    — tier 0 gates, because it is comment-only
