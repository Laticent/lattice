---
origin: 2350
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2350
---

# A slide's subtitle is projected as its kicker, before the heading

why now   — found while fixing the video lead sentence (#2350). `eyebrowOf` in
            lib/transformers/prose-projection.mjs takes the FIRST `.masthead-lede > p`,
            and a subtitle sits after the `h2` there. A slide with only a subtitle shows
            it as the kicker ABOVE the heading in Read · Article, and narration reads
            "a subtitle. Heading here." Pre-existing; off #2350's path. Wide reach: every
            masthead slide with a subtitle and no eyebrow.
where     — `eyebrowOf` (masthead branch) and the speech path that shares it
            (`projectDeckToScript`); decide where a subtitle belongs in the article.
done when — the kicker is only a paragraph BEFORE the heading, and a subtitle projects
            after the heading (or is dropped on purpose, with the reason written down)
            in both the article and narration.
evidence  — an engine-rendered arm that fails on the old code, and a Studio
            Read · Article drive at 1440/820/390.
verify    — tier 0.
