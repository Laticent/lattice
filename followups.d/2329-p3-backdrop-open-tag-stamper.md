---
origin: 2329
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2329
---

# The backdrop injector stamps section open tags with a global regex

why now   — found by the independent checker on the P1 section-walker migration.
            `OPEN_RE` in lib/core/backdrop.js matches every `<section …>` in the
            document, so a `<section class="finish">` quoted in an HTML comment gets a
            `.backdrop` div written inside the comment, and a hand-authored nested
            finish section gets one too. It stamps open tags rather than finding where
            a slide ends, so no slide is lost; not reproduced, reasoned from the code.
where     — `applyBackdropToHtml` in lib/core/backdrop.js; the DOM twin in the runtime.
done when — the injector visits top-level sections through `mapSections` (or states
            why nested sections are meant to get a backdrop, matching the DOM twin),
            and a quoted-comment arm pins that the comment's bytes are untouched.
evidence  — the arm failing on the old code; an examples/*.md HTML-export A/B.
verify    — tier 1 if the walk changes: it runs on every finish render.
