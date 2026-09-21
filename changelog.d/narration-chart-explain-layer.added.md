- **Added: charts are now explained, not just read.** A chart whose substance lives
  in an `<svg>` used to reach the caption voice as a list of labelled numbers with
  nothing saying what they measured. Every picture-bound chart now opens with what
  its encoding means — *"each bar's length is its value, measured from zero"* —
  declared in the component's own manifest (`projection.frame`), so a chart added
  later is covered the day its manifest lands.
- **Added: `bullet` narration names the measure, the target and the attainment
  between them.** It read *"New ARR, four point two million, five million"* — two
  numbers in authored order, with nothing saying which was the plan. It now reads
  *"New ARR, four point two million against a five million target — eighty-four
  percent of plan, closing on plan"*, counts how many rows cleared the line, and
  measures attainment **from the row's floor**, so a 99.4% uptime against a 99.9%
  target on a 99.0% floor is spoken as 44% of the way to plan rather than 99%.
- **Added: `word-cloud` narration reads rank instead of reciting counts.** The
  component's docs say the rank matters more than the count and that it is not a
  precise data viz; narration recited every weight anyway, twenty numbers deep on a
  large cloud. It now names the encoding, the biggest term and its margin, the tiers
  under it and the quiet tail — enumerating only clouds small enough to hold, and
  naming the remainder on the rest so nothing is silently dropped. It states no TERM
  COUNT, deliberately: the packer drops a word it cannot seat, so a source list and
  the drawn canvas can disagree (2 of the 34 word-cloud slides in this repo), and
  narration runs on markdown before any render.
- **Added: `state-chart` narration opens with the machine's shape.** Every edge was
  read in authored order and the topology was not, so a listener rebuilt the graph
  from a serial list. Slides now open with the size, the endpoints, where the machine
  decides, what steps back and what loops — plus three hazards no surface named
  before: a state whose only exit is a self-loop, a state nothing leads to, and a
  state that stops without being marked an ending.
- **Fixed: a `bullet` row's `Band` and `Floor` bullets are no longer read aloud as
  prose.** They are structural inputs to the chart's zones; the caption track spoke
  them as content at the end of the slide.
- **Fixed: the same number now narrates the same way however it was typed.** `900k`
  and `0.9M` both read as *"nine hundred thousand"*; `1.2M` and `1200k` both as *"one
  point two million"* — narration was reading the author's spelling rather than the
  value, so two decks carrying identical data narrated differently and `1200k` came
  out as *"one thousand two hundred thousand"*.
- **Fixed: a European-spreadsheet paste no longer narrates a hundred times too big.**
  `1,25M` read as *"one hundred twenty-five million"* over a chart correctly drawing
  1.25M — the voice took the decimal comma for a thousands separator where the chart's
  parser did not. A bare number is deliberately left alone, so `Closed \`2024\`` still
  reads as a year.
- **Fixed: a state chart's shape no longer arrives as one thirteen-second breath.** The
  machine-shape sentence joined every clause with a semicolon, and since one sentence
  becomes one caption cue — and one TTS clip — the hazards slide produced a 39-word
  utterance a listener cannot scrub back into. It is two sentences now: longest cue
  13.2s → 10.1s, p90 7.6s → 6.9s.
- **Fixed: a `bullet` chart's spoken tally no longer contradicts the chart.** A row
  whose key is written as a code span (`- \`Target\` \`80%\``) was invisible to
  narration and fully scored by the chart, and one with a note nested under it was
  the reverse — so the caption said "none cleared its target" over a chart drawing a
  cleared bar. Measured over 400 generated decks: 91 of 356 that spoke a tally spoke
  one the render contradicts, now 0 of 351.
- **Fixed: a `bullet` row that CLEARED its target no longer swallows its `Band`
  lines.** Narration absorbs them so they are not read back as prose, and the clause
  that voices them sat below the cleared branch — so on a cleared row they reached no
  surface at all.
- **Fixed: a rounded attainment no longer argues with its verdict.** 99.1 against a
  99.5 target is 99.6%, which rounds to "one hundred percent of plan" on a row that
  MISSED. It reads "just short of plan" now, and "just above plan" on the mirror case.
- **Fixed: a heading carrying any two numbers no longer deletes the tally.** "Three
  pilots, five weeks in." reports nothing and suppressed the one summary fact a
  five-row chart has. The tally SHAPE (*"two of five…"*) is what states it; anything
  else needs a verb, and `over target` and `against plan` join that list. A trailing
  prose bullet did the same and no longer does.
- **Fixed: a `state-chart` no longer claims a route to a state it cannot reach.** "A
  three-state machine from Draft to Draft and Filed. … Nothing leads to Filed" asserted
  a route and denied it two sentences later. Endpoints are now the terminals the start
  can actually get to.
- **Added: a `state-chart` names an ISLAND — states that point at each other and that
  the machine can never get to.** Nothing found those before; an in-degree test cannot,
  because each of them has an edge pointing at it. It is a separate sentence from
  *"nothing leads to X"* on purpose: on an island the picture draws the arrow that
  would refute that one.
- **Fixed: `$-0.8M` and `0.5k` are spoken.** The first rebuilt as the literal
  `-$-800k` and reached the voice as glyphs; the second read as *"zero point five
  thousand"* rather than *"five hundred"*. **One spelling changes in a way worth
  knowing:** `$−0.8M`, with a Unicode minus *behind* the currency symbol, used to
  reach the voice as unreadable glyphs and now reads *"eight hundred thousand
  dollars"* — positive. That is what the chart plots for that pill (`parseValue`
  reads a U+2212 in front of the symbol and not behind it), so the voice and the bar
  agree; the parser asymmetry itself is tracked as #2287.
- **Fixed: a `bullet` row whose nested structure cannot be read from the Markdown no
  longer claims a relationship.** A tab, a marker gap wider than one space, or a
  one-space indent each make markdown-it nest differently from anything a line
  scanner can compute — and narration runs on Markdown, before any render. Such a row
  refuses what its children could have changed and no more — where a nested line
  carries a VALUE the whole relationship goes, where the children are prose the row's
  own numbers stand, and the slide speaks no tally either way. The lines are still
  read aloud. The refusal is keyed on what markdown-it can fold into the row's own
  paragraph, not on whether the children look like prose. The cost is real and
  measured, and it moves with how malformed the corpus is: on the decks in this
  repo it is exactly zero — all 16 bullet slides narrate identically.
- **Fixed: a `state-chart` no longer says a state "stops without being marked an
  ending" over a slide that draws it into the finish marker.** It reads *"nothing
  leads out of X"* — true of both rules the chart uses to decide that. A state
  stranded on both sides gets one clause rather than two, and a state whose only
  inbound arrow is its own self-loop is no longer told that nothing leads to it.
