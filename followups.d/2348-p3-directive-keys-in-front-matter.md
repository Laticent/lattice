---
origin: 2348
priority: P3
recorded: 2026-09-24
---

# Per-slide directive keys behave oddly in front matter

why now   — The #2348 inventory rendered them: `build:`, `focus:`, `focusStyle:` and `track:` in front matter silently apply to EVERY slide, and `focusSteps:`, `lens:` and `marp:` are parsed and then do nothing. None is documented or linted, so a deck author who writes `focus: row 1` at the top gets a spotlight on every slide.
where     — lib/engine/directives.js:39-90 (KNOWN_DIRECTIVES / GLOBAL_ONLY) → lib/engine/slides.js:223-240.
done when — A decision on each: either lint warns that the key belongs on one slide (`_focus:`), or the engine ignores it in front matter; the chosen behavior is in lib/base/base.docs.md and the front-matter reference.
evidence  — In-memory engine renders during the #2348 inventory: data-focus/data-build on every section; focusSteps expanded nothing (1 slide in, 1 out).
verify    — A deck with `focus: row 1` in front matter either lints with a warning or renders without data-focus.
