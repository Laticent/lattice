- **A hand-written card can now reach `status:ready`.** The Definition of Ready gate reads
  two fields out of the issue body, and it recognized only the exact headings the work-item
  *form* renders. Most cards are not filed through the form — they are typed into the web
  UI or opened by an agent — so a card carrying a repro and a `## Definition of done`
  checklist met the bar in substance and failed it on form. Measured 2026-08-23: **6 of 167
  open cards were `status:ready`**, and the whole Ready column was months-old leftovers, so
  no session could pull work from the board without a human dispatching it. The parser now
  accepts the headings people actually write (`Definition of done`, `Acceptance criteria`,
  `Acceptance`, `Done when`; `Swimlane`, `Governing doc`, `Design doc`) in a **second pass
  that runs only for a field the form headings left empty** — so a form-filed card parses
  byte-identically, and an alias heading can neither truncate a canonical value nor hijack a
  field the form supplied. (`.github/scripts/issue-form.js`)
