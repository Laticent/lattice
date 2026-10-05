---
origin: 2529
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2529
---

# Lessons reach — site search deep-links, progress, first-open offers

why now   — owner ruling 2026-10-05: the Studio palette first, the site-wide search later.
where     — `docs/src/components/site/CommandMenu.tsx` (link `/studio?lesson=<id>`); a
            `?lesson=` handler in `StudioShell.tsx`; lesson progress per viewer; the Learn group
            showing only on a query once the catalog passes ~10 lessons.
done when — a site search for "pdf" opens the Studio and starts the lesson; finished lessons
            are remembered and the next one suggested; a panel offers its lesson the first time
            it opens, once, and never again after dismissal.
evidence  — e2e from the site search to a running lesson; screenshots at 1440, 820, 390.
verify    — e2e + screenshots.
