- **Breaking:** the state markers now have six answers with one meaning each, in every layout: `[x]` yes, `[-]` partly, `[!]` no, `[?]` unknown, `[ ]` open, `[/]` does not apply. Two layouts read `[ ]` their own way before, and a deck written against the old reading changes on render:
  - **verdict-grid:** `[ ]` was the red cross for "not met". It is now the open ring, "not assessed". Write `[!]` for a criterion that was not met.
  - **obligation-matrix:** `[ ]` was "exempt". It is now "undetermined". Write `[/]` for an exempt regime; the key names it "Exempt".

  `lint:deck` flags both with a suggestion naming the marker to use. Every shipped deck and gallery is migrated.
- Added `[!]` (no), which draws the red cross in every layout that draws marks: checklist, pricing, obligation-matrix, `state-cells` tables, inline marks, verdict-grid and roadmap (as "missed").
- Added `[?]` (unknown): a hollow ring with a drawn question mark, for an answer somebody looked for and could not settle. It sits beside `[ ]` (open, nothing inside the ring). In roadmap it reads "uncertain".
- `pricing` draws `[ ]` as the open ring instead of a red cross. It used to borrow verdict-grid's reading, so a legend written in inline marks under a pricing slide disagreed with the cards above it.
- `state-cells` tables draw the `[ ]` ring in the neutral `--muted-mark` gray, matching every other open ring. It had kept `--text-label`, which is accent-colored.
- `roadmap status` cells no longer show a faint copy of the state mark beside the text. The corner token was the only mark meant to show.
- Speech, read-along and prose projection name each answer in the layout's own words (pricing says "coming" for `[ ]`, "missing" for `[!]`).
- The docs-site Compose table picker offers all six markers, and the table menu holds all six too. On a narrow editor pane the inline buttons move into that menu, so the picker no longer covers the slide's Collapse and Delete buttons.
- The linter's advice for a typed ✗, ✕ or ❌ now says `[!]` instead of `[ ]`, and it coaches a typed ❓ toward `[?]`.
