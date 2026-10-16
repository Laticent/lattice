# exemplars/ — the worked-deck library

Full, realistic decks ("what good looks like"), organized by sector
(`corporate/`, `academic/`, `government-public/`, `general-team/`, ...),
each committed with its rendered PDF. The Studio's Drafting picker serves
these live, filtered to short/standard/full lengths by
`lib/exemplars/tier-filter.js`.

Conventions: the integration tier asserts the exact deck count and that
every committed PDF's page count matches its source. Commit the markdown only:
the nightly bless bot renders and commits the PDFs (pull requests do not commit
PDFs), and the integration tier excuses a PDF still waiting on that bless.

Note for tooling: this file is prose, not a deck — the repo deck linter
walks every markdown file in this folder, so keep slide markup out of it.
