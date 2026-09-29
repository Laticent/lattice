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
against the screen's rgb(181,95,116). JPEG gave rgb(110,79,84), so it is better than before.
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
