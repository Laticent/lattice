---
origin: 2325
priority: P2
recorded: 2026-09-24
---

# A journey step labeled `R&D` shows `R&amp;D` on the slide

why now   — it is visible on the slide chip and in the sr-only description (and so in the
            --read article); decided in #2325 as its own fix rather than folded into the bake
where     — lib/components/chart/journey/journey.transform.js: `stripTags` keeps markdown-it's
            `&amp;`, then `escHtml` escapes it again. Decode entities once after `stripTags`,
            as state-chart.transform.js `decodeEntities` does
done when — `R&D` reads `R&D` on the chip, in `.journey-desc` and in the --read article
evidence  — a per-feature demo deck (HARD RULE #9) with a before/after render
verify    — tier 0 gates plus the visual review path
