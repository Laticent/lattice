---
origin: 3096
priority: P1
recorded: 2026-11-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-08-dynamic-components.md §The measurement
deferred: large — a new integration test over every committed deck plus seven fixtures; #3096 is the design note that decided it
source: https://github.com/Laticent/lattice/pull/3096
---

# A committed test that every page and section mark agrees

why now   — six separate counts answer "where is this slide?" and "where does each section start?", five of them written
            twice. A scratch measurement on 2026-11-09 found them all agreeing on 539 decks; nothing keeps it that way.
where     — test/integration/ (a new test), plus seven fixtures: focus-step divider, hidden divider, hidden proof slide,
            split: headings, reordered agenda list, paginate: false, twelve sections.
done when — the test renders the committed decks and fixtures, builds ground truth from the source, and checks the page
            stamp, divider k/N, the divider-numbered numeral, the rail's lit dot, the topic eyebrow number, the agenda's
            list and page references, the proof color, the split k-of-N rail and the data-lattice-slide stamps. The proof
            color's hidden-slide rule is its one sanctioned exception, named with its reason.
evidence  — the scratch script and findings from the #3096 session (0 disagreements on page/section marks).
verify    — the test passes on main, and fails when one count is broken by hand (the arm that proves it can fail).
