---
origin: 2358
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2358
---

# Read · Article never projects a slide's coda (key-insight panel, below-note)

why now   — found measuring #2358: `projectDeckToProse` walks `.cell-stage`, and the
            coda cell (`lib/core/coda.js`) sits outside it. Over the 207 example and
            baseline decks, 227 of 230 coda-bearing slides lose the coda in the
            article while narration reads it (`speakCoda`). Widest content loss left
            in the reader view; every component is affected.
where     — `projectDeckToProse` in lib/transformers/prose-projection.mjs; mirror
            `speakCoda`'s rules (a layout that claims its coda keeps it in the body,
            and nothing is projected twice).
done when — the coda projects once, after the body, as its own block (a key-insight
            panel as a callout, a below-note as a closing note), and the census shows
            no coda missing from the article.
evidence  — an engine-rendered arm failing on the old code; the corpus census; a
            Studio Read · Article drive at 1440/820/390.
verify    — tier 1 checker: it changes every coda-bearing slide's article.
