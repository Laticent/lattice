---
marp: true
theme: indaco
paginate: true
color-mode: dark
footer: "Laticent · charts explained, not just read"
acronyms:
  EMEA: Europe, the Middle East and Africa
  APAC: Asia Pacific
  LATAM: Latin America
---

<!-- _class: title silent -->

# A chart read aloud is not a chart explained.

`Feature · the narration explain layer`

Every picture-bound chart now opens with what its encoding means, and three of them say what their numbers are *for*. Listen with the captions on.

<!-- This deck is the listening fixture for the narration explain layer. Play it with captions on, or open the .vtt beside it. Each slide's caption is the whole point — the picture is only there to check the words against. -->

---

<!-- _class: bullet -->

`Q3 2026 · commercial plan`

## Are we on plan.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`
- Services revenue `1.1M` `1.8M`
- Partner-sourced ARR `0.9M` `1.4M`

<!-- Before: "New ARR, four point two million, five million." Two numbers in authored order, with nothing saying which one was the plan. -->

---

<!-- _class: bullet -->

`Service levels · the floor case`

## A high baseline hides a real miss.

- Uptime `99.4%` `99.9%`
  - Floor `99.0%`
- Gross margin `71%` `68%`
- Deflection `94%` `62%`

<!-- The row that matters is uptime. A raw ratio reads it as ninety-nine percent of target — a rounding error away. The bar is drawn from the floor, so the honest reading is forty-four percent of the way to plan, and that is what the caption says. -->

---

<!-- _class: word-cloud -->

## What the team called out this quarter.

- time-to-value `5`
- security `4`
- onboarding `4`
- pricing `3`
- integrations `3`
- support `2`
- roadmap `2`
- contracts `1`
- residency `1`

<!-- Nine terms is past the enumeration cap, so the caption names the encoding, then the leader and its margin, then the tail it is standing in for. Before, it read nine counts in a row. It states no TERM COUNT: the packer drops a word it cannot seat, so the source list and the canvas can disagree, and narration runs on markdown. -->

---

<!-- _class: word-cloud dense -->

## Twenty terms is where reciting counts stops working.

- component `512`
- variant `327`
- manifest `261`
- gallery `204`
- function `168`
- form `139`
- substance `116`
- transform `94`
- selector `77`
- palette `63`
- cascade `51`
- bundle `42`
- scaffolder `34`
- token `28`
- normalize `22`
- packer `17`
- spiral `13`
- footer `9`
- eyebrow `7`
- watermark `5`

<!-- This slide used to read twenty numbers aloud, in order, with no shape. It is now three: what size encodes, the biggest term and how far clear it is, and where the tail bottoms out. The heading still names twenty because the AUTHOR counted them; the caption does not, for the reason the previous slide's note gives. -->

---

<!-- _class: word-cloud -->

## A tie at the top is not a leader.

- retention `5`
- activation `5`
- expansion `3`
- referral `3`
- winback `2`
- reactivation `2`
- dormancy `1`

<!-- Two terms tie at five, so the caption says they tie rather than naming one of them arbitrarily. This slide started out as `focal`, which widens the size ceiling so one term dwarfs the rest — and the renderer then could not seat the second leader anywhere on the spiral and dropped it. A tie is the signal that `focal` is the wrong variant for the data, and the chart says so twice. -->

---

<!-- _class: state-chart lr -->

`Submission lifecycle`

## The shape comes before the edges.

1. Draft `start`
   - `submit => 2`
2. In Review `at-risk`
   - `approve => 3`
   - `reject => 1`
   - `revise => self`
3. Published `end`

<!-- Before, this read as four "From X" sentences and a listener rebuilt the graph from them. The caption now opens with the size, the endpoints, where the machine decides, what steps back and what loops — then reads the edges. -->

---

<!-- _class: state-chart -->

## Three hazards nothing else names.

1. Running `start`
   - `fail => 2`
   - `finish => 4`
2. Stuck
   - `retry => self`
3. Parked
4. Done `end`

<!-- Stuck has a self-loop and no other exit, so the machine can enter it and never leave — and it is never inferred terminal, because the loop counts as an outgoing transition. Nothing leads to Parked at all. Both are said aloud. -->

---

<!-- _class: bar -->

`Revenue · FY26`

## The frame says what the bars measure.

- North America `4.2`
- EMEA `3.1`
- APAC `1.8`
- LATAM `0.6`

<!-- Every picture-bound chart now opens with its encoding, declared in its own manifest: each bar's length is its value, measured from zero. A listener who cannot see the chart had no way to know that. -->

---

<!-- _class: closing -->

## The heading is still yours.

Narration owes the frame, the shape and the relation. The verdict on the slide is the author's, and it is not said twice.

<!-- Interpretation stays off the ladder on purpose. The bullet slide's own docs tell an author to name the verdict in the heading, so a narrator that adds one is talking over them — and when the heading already carries the tally, the computed one is suppressed. -->
