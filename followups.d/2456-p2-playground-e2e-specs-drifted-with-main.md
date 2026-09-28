---
origin: 2456
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2456
priority: P2
---

# Five Playground e2e specs drifted with main's content

why now   — They fail identically on a build of main 9237268, so every Playground change
            reads as red in them. Found running them for #2456.
where     — `docs/e2e/playground-stress.spec.ts:223`, `:324`, `:369` expect a 13-slide KPI
            gallery (it now renders 15); `:575` expects `piechart` as the top search hit
            (`flowchart` now wins); `docs/e2e/split.spec.ts:206` clicks the picker's first
            option, which no longer swaps the deck, so the collapsed preview never expands.
done when — each spec derives its expectation from the catalog or gallery rather than a
            literal, and all five pass on desktop.
evidence  — `npx playwright test <those five> --project=desktop` green on main.
verify    — tier 2: the five specs against a production docs build.
