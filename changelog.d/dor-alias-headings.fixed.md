- **A hand-written card can now reach `status:ready`.** The Definition of Ready gate reads
  two fields out of the issue body, and it recognized only the exact headings the work-item
  *form* renders. Most cards are not filed through the form — they are typed into the web
  UI or opened by an agent — so a card carrying a repro and a `## Definition of done`
  checklist met the bar in substance and failed it on form. Measured 2026-08-23: **6 of 167
  open cards were `status:ready`**, and the whole Ready column was months-old leftovers, so
  no session could pull work from the board without a human dispatching it. The parser now
  accepts the headings people actually write (`Definition of done`, `Acceptance criteria`,
  `Acceptance`, `Done when`; `Swimlane`, `Governing doc`, `Design doc`) in a **second pass
  that runs only for a field whose form heading is ABSENT** — so the alias pass never
  touches a form-filed card, including one that left a required field at `_No response_`,
  which the gate goes on rejecting. (Parsing is *not* byte-identical in every case: a body
  containing an unclosed fence or an HTML comment now parses the way GitHub renders it,
  which is the point of the masking below and can change what a malformed card yields.) An alias heading can neither truncate a
  canonical value nor hijack a field the form supplied. Headings inside **fenced code blocks**
  are also no longer treated as fields at all: a `# Done when` in a pasted shell snippet used
  to invent an acceptance check whose value ran past the closing fence into unrelated prose.
  Fence matching follows CommonMark in full — same character, at least as long, **and no info
  string on the closer** — so a card pasting a nested markdown example (outer ```, inner
  ```markdown) cannot leak the headings inside it as real fields. HTML comments are masked too,
  and because a comment renders as nothing while a fenced block is visible content, field values
  are sliced from a comment-only mask: an acceptance check written as a code block still counts,
  while one that is entirely commented out does not.
  (`.github/scripts/issue-form.js`)
