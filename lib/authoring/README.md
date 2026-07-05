# lib/authoring — deck lint / review / scorecard cores

The pure "authoring intelligence" shared by the CLI and the in-browser
panels: what renders wrong (lint), what communicates poorly (review), how
board-ready the deck is (scorecard), and the note/non-note boundary.

- `lint-core.js` — pure footgun checks; the single source (HARD RULE #7:
  edit lint rules HERE, never duplicate them).
- `lint.js` — Node binding; builds the name/modifier vocabulary from live
  manifests, then delegates to `lint-core`.
- `review-core.js` — advisory presentation-trap suggestions.
- `prose-budgets.js` — word budgets per element (feeds `review-core`).
- `scorecard.js` — aggregates lint + review + structure into a grade.
- `fact-check-core.js` — claim inventory + verifiability triage.
- `notes-core.js` — the single speaker-note boundary.

**Gotcha:** these are bundled to the browser by
`tools/build-authoring-core.js` — keep them free of `fs` and Node-only
dependencies. The vocabulary is *injected* (Node builds it from manifests;
the browser passes a precomputed one) — never `require` the component
catalog from `lint-core`.
