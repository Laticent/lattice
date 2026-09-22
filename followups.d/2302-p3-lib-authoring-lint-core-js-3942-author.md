---
origin: 2302
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2302#issuecomment-5775735942
backfill: true
---

# lib/authoring/lint-core.js:3942 — AUTHOR_SCRIPT_RE is a full tag-span regex of the shape CodeQL's bad-tag-filter query flags

Backfilled verbatim from the continuation brief on #2302 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] lib/authoring/lint-core.js:3942 — AUTHOR_SCRIPT_RE is a
       full tag-span regex of the shape CodeQL's bad-tag-filter query flags
       why now   — lowest impact of the three, but it is the last known instance
                   of the pattern #2302 removed everywhere else; leaving it means
                   the next lint-core change may surface the alert.
       where     — const AUTHOR_SCRIPT_RE = /<script\b(?[^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
       done when — the author-script lint rule still flags a deferring inline
                   script (rule author-script-defers) and the pattern no longer
                   spans an end tag, or the alert is dismissed with a written
                   reason if the span is genuinely required here.
       evidence  — test/unit/components/lint-core.test.js green, plus the CodeQL
                   check run on the PR.
       verify    — tier 1 checker, because lint-core.js is shared by CLI,
                   validate() and the browser (HARD RULE #7) and a regex change
                   there can silently stop flagging a real footgun.
```
