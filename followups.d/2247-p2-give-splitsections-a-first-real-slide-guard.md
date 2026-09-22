---
origin: 2247
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2247#issuecomment-5761690751
backfill: true
---

# Give `splitSections` a first-real-slide guard

Backfilled verbatim from the continuation brief on #2247 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Give `splitSections` a first-real-slide guard
       why now   — a deck body that merely MENTIONS a `<section>` tag derails the whole
                   HTML-stage pass: no data-form, no data-frame, no `form` class, so the
                   deck renders Form-blind. It is the live exception to "every slide
                   carries data-form". Pre-existing on main, logged under #18, not caused
                   by #2247.
       where     — lib/integrations/markdown-it/plugins.js `splitSections`;
                   lib/core/auto-split.js already has the guard to copy.
       done when — a deck containing `<!-- <section class="title"> -->` in its body still
                   stamps every real slide; the DOM twin and the HTML twin agree on it.
       evidence  — the rendered .html of such a deck, with a per-section dump of
                   data-frame / data-form / class.
       verify    — tier 1 checker, because it is a shared-kernel parser change on the path
                   every render takes.
```
