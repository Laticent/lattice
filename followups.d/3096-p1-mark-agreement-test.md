---
origin: 3096
priority: P1
recorded: 2026-11-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-08-dynamic-components.md §The measurement
deferred: large — a new integration test over every committed deck plus thirteen fixtures; #3096 is the design note that decided it
source: https://github.com/Laticent/lattice/pull/3096#issuecomment-6730760918
---

# A committed test that every page and section mark agrees

why now   — six separate counts answer "where is this slide?" and "where does each section start?", five of them written
            twice. A scratch measurement on 2026-11-09 found them agreeing on all 561 committed decks, and found one
            fixture (a divider with focus steps) where four disagree. Nothing keeps that checked.
where     — test/integration/ (a new test), plus the thirteen fixtures the note lists.
done when — the test renders the committed decks and fixtures on BOTH render paths, takes the section count from the
            source, and checks the page stamp, divider k/N, the divider-numbered numeral, the rail's lit dot, the topic
            eyebrow, the agenda's list and page references, the proof color, the split k-of-N rail and the
            data-lattice-slide stamps. It knows when each mark must be present, so a deleted mark fails it. The proof
            color's hidden-slide rule is its one sanctioned exception, named with its reason.
evidence  — the v2 script and fixtures, posted on PR #3096 (https://github.com/Laticent/lattice/pull/3096#issuecomment-6730760918); its mutation table is in the note.
verify    — the test passes on main, and fails when one count is broken by hand (the arm that proves it can fail).
