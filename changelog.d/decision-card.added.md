- **A ❓ decision card now carries every open item, question and decision.**
  Sessions used to bury a decision inside a status list, so the owner had to ask
  "what are the remaining open items?" to find it. The card lists only the
  choices that are the owner's, in plain words: each has options with what they
  buy, cost and trigger, a recommendation, and what happens if nobody answers.
  It is posted automatically when a session stops with anything open, or on
  request, on the PR and in chat with the same wording. Unanswered items are
  carried into the continuation brief and `followups.d/`.
  (`engineering/workflow.md` §❓ Decision card)
- **The four agent cards (🚦 pre-merge, 📋 standup, 🎯 continuation, ❓ decision)
  now share one phone-width layout, and `npm run card` builds them.** Each opens
  with a BOTTOM LINE (the ask, the pick, the state), then CAPS sections where each
  field is a label line with its value below it, at most 38 columns because the
  chat app shows about 38 characters of a code block. An agent writes the facts as
  a small YAML file, and `npm run card -- card.yml` validates it against a schema,
  wraps it, puts the CAPS on the critical values and prints the fenced card, so the
  layout is correct by construction. It refuses a card with a value that runs past
  two lines, template text left in, a `raise it` of "nothing outstanding" beside an
  unrun check, or a `#N` that YAML would read as a comment. The 🚦 card gains a
  `pick` line (merge or hold, with the one reason) and a `read by` line. The 🎯
  brief keeps its STANDING ORDERS block inline so a cold session needs no lookup.
  (`engineering/workflow.md` §One layout for all four cards, `tools/card.js`,
  `engineering/card-examples/`)
