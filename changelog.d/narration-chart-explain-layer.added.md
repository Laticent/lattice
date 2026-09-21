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
  counting the remainder on the rest so nothing is silently dropped.
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
