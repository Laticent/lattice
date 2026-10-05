---
origin: 2503
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2503
---

# A 1 px rule on a 4K slide stays slightly soft in the PDF writer's photo

#2503 made the writer's background photo PNG-first, which keeps a 1 px colored rule exact on
16:9 and HD slides. A 4K slide's photo is still capped at 2560 px on its long edge, and that
downsample keeps the rule soft even as PNG: a dark slide's top keyline reads rgb(128,69,82)
against the screen's rgb(181,95,116), and JPEG rgb(110,79,84). PNG there bought that little and
cost ~13 s a 4K gallery render, so a downsampled photo stays JPEG (the 4K gallery composes in
the same 31 s as before #2503).
Photographing 4K at its own 3840 px makes the rule exact, but cost ~21 s on the 116-slide 4K
gallery (44 s to 65 s) and pushed CI's integration job past its 25-minute timeout, because the
invariant suites render that gallery many times. The owner kept the cap (2026-09-29).

A fix that pays for itself: photograph only a thin band along each edge at 1x (where the
keylines are) and composite it over the capped photo, or draw the deck's keyline rule as a
vector like the borders, so nothing at 4K needs the full-size photo.

```text
  P3 · a 1 px rule on a 4K slide stays soft in the writer's photo
       why now   — 3 of the 59 decks the golden sweep flagged are 4K; the other 56 are exact.
       where     — lib/core/pdf-compose/compose.mjs (the photo scale cap), read-slide.mjs (vectors).
       done when — the 4K fixture's top rule matches Chrome's print within 6 levels, and the
                   116-slide 4K gallery composes within ~10% of its time on main.
       evidence  — the hairline integration test with a 4K arm; the gallery timing, main vs branch.
       verify    — tier 1, because it changes exported bytes (owner sign-off, dark + light).
```

## Measured 2026-10-05 (claude/pdf-writer-tnum-and-followups): both cheap routes fail the budget

The 116-slide 4K baseline gallery (`test/integration/baseline-decks/gallery.md`), CLI render end
to end, one run each on the same sandbox:

| photo                              | PNG encoder           | time    | file      |
|------------------------------------|-----------------------|---------|-----------|
| capped at 2560 px (today, JPEG)    | fast (CI)             | 36.9 s  | 5.9 MB    |
| capped at 2560 px (today, JPEG)    | default (real export) | 36.9 s  | 5.9 MB    |
| its own 3840 px (PNG-first)        | fast (CI)             | 54.1 s  | 19.2 MB   |
| its own 3840 px (PNG-first)        | default (real export) | 72.7 s  | 8.1 MB    |

So the exact photo is +47% under CI's encoder and +97% for a real export, against the ~10% the
done-when allows. #2515's fast encoder does not rescue it.

A 1x band along the top edge, composited over the capped photo, is not cheaper: a Puppeteer
screenshot is dominated by its per-call cost, and 116 clipped 24 px bands took 91 s against
119 s for 116 full 1x slides on the same page (`.scratch/band-cost.mjs` in that session). One
extra capture per 4K slide costs about what the full photo does.

What is left is the vector route: draw the keyline rule (and every other 1 px edge rule a
finish paints) as a PDF shape, the way #2404 drew solid borders. That is a reader change per
paint source (a pseudo-element gradient bar, an inset box-shadow ring, the frame keyline in
`lib/base/base.finish.css`), each owed a hairline arm and export sign-off. Not attempted here.
