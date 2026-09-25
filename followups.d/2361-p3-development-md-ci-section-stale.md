---
origin: 2361
priority: P3
recorded: 2026-09-25
---

# development.md §CI no longer matches ci.yml

why now   — §CI says `build:check` runs in the `unit` job and integration takes about 2–3 minutes
            cold. `ci.yml` runs it in `lint`, and the oracle catalog measured integration at 8m26
            (chapter 6 §3).
where     — `engineering/development.md` §CI, `.github/workflows/ci.yml`.
done when — §CI describes the jobs as `ci.yml` runs them, with timings from a quoted run.
evidence  — a link to the CI run the timings came from.
verify    — tier 0 self-review.
