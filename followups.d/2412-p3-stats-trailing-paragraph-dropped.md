---
origin: 2412
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2412
---

# A stats slide's paragraph after the stat list is missing from the article and narration

why now   — found driving #2412's Read · Article check. A `stats` slide's source line after the
            list (`*Source: CRM export, 30 September.*` followed by a `> …` insight) stays in
            `.cell-stage`, because a below-note must be the slide's LAST block. `projectStats`
            and `speakStats` in lib/transformers/prose-projection.mjs collect only the blocks
            that PRECEDE the stat list (`compareDocumentPosition & 0x02`), so the article and
            the voice both drop it while the slide shows it.
where     — `projectStats` and `speakStats`: also take the stage's blocks that FOLLOW the list,
            in order, skipping the same chrome.
done when — the source line reaches both the article and narration once, after the stats; a
            census over the committed decks shows no stats-slide paragraph missing.
evidence  — an engine-rendered arm failing on the old code; the census.
verify    — tier 0; narration timing moves only for the slides that gain words.
