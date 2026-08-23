- **A hand-written card can now reach `status:ready`.** The Definition of Ready gate reads
  two fields out of the issue body, and it recognized only the exact headings the work-item
  *form* renders. Most cards are not filed through the form — they are typed into the web
  UI or opened by an agent — so a card carrying a repro and a `## Definition of done`
  checklist met the bar in substance and failed it on form. Measured 2026-08-23: **6 of 167
  open cards were `status:ready`**, and the whole Ready column was months-old leftovers, so
  no session could pull work from the board without a human dispatching it. The parser now
  accepts the headings people actually write (`Definition of done`, `Acceptance criteria`,
  `Acceptance`, `Done when`; `Swimlane`, `Governing doc`, `Design doc`) in a **second pass
  that runs only for a field whose form heading is ABSENT** — so a form-filed card parses
  byte-identically in every case, including one that left a required field at
  `_No response_`, which the gate goes on rejecting. An alias heading can neither truncate a
  canonical value nor hijack a field the form supplied. Headings inside **fenced code blocks**
  are also no longer treated as fields at all: a `# Done when` in a pasted shell snippet used
  to invent an acceptance check whose value ran past the closing fence into unrelated prose.
  Fence matching follows CommonMark — same character, at least as long — so a card that pastes
  a markdown *example* containing a fence cannot invert the masking and expose a heading again.
  (`.github/scripts/issue-form.js`)
