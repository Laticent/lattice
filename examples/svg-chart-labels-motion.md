---
marp: true
theme: indaco
paginate: true
---

<!-- _class: title silent -->

# Labels that wrap. Charts that build.

`funnel · radar · quadrant · gantt`

Every chart the family treats as a diagram is now fully SVG — geometry **and** labels — with every visible element addressable by chart motion. Labels break to `<tspan>` lines in viewBox units, so they wrap instead of running off the frame and stay crisp from a laptop screen to an 8K wall.

---

<!-- _class: statement silent -->

## Native SVG text does not wrap.

That one fact caused two different failures. A long label ran straight off its viewBox — the funnel clipped a stage name at the frame edge, and the radar's left rim label painted to **x = −96** in a 0…595 box. And two labels on nearby marks printed straight through each other, because *width* was never the problem there — *placement* was.

---

<!-- _class: funnel -->

## Long stage names wrap instead of clipping.

- Enterprise Procurement Qualification Review `12,400`
- Security And Compliance Assessment `8,100`
- Commercial Negotiation `3,050`
- Signed `900`

---

<!-- _class: radar -->

`Scale · 0–10`

## Rim labels wrap, and the shape finally animates.

- Build in-house
  - Operational resilience and continuity `6`
  - Regulatory compliance posture `7`
  - Calibration transparency `9`
  - Support `5`
  - Cost predictability `8`
- Vendor North
  - Operational resilience and continuity `8`
  - Regulatory compliance posture `7`
  - Calibration transparency `2`
  - Support `8`
  - Cost predictability `4`

---

<!-- _class: quadrant -->

`Effort 0–10 → Reach 0–100`

## Crowded item names are placed apart, not printed on top of each other.

Corner names are fixed obstacles — a corner labels the quadrant, not a data point — so the item labels move around them.

- Quick Wins
  - Enterprise data platform modernization `2, 82`
  - Customer self-service portal rebuild `3, 72`
- Strategic Bets
  - Legacy mainframe decommissioning program `8, 88`
  - Decision-log API `7, 74`

---

<!-- _class: gantt -->

`Jan..Dec` `today Jun`

## The gantt is one SVG, so motion can build it.

- Platform
  - Data migration `Jan..Apr` `on-track`
  - Cutover rehearsal `Jun..Sep` `at-risk`
- Security
  - Threat model refresh `Feb..Mar` `done`
  - Pen test window `Oct..Dec` `blocked`
- Enablement
  - Partner onboarding rollout `Apr..Sep` `pilot`
- Gates
  - Schema freeze `Jun` `milestone` `decision`

---

<!-- _class: state-chart -->

`Submission lifecycle`

## States are painted from measured boxes, never guessed widths.

1. Draft `start`
   - `submit => 2`
2. Awaiting compliance review `on-track`
   - `approve => 3`
   - `reject => 1`
3. Counter-signature pending `at-risk`
   - `sign => 4`
4. Executed `end`

---

<!-- _class: statement silent -->

## Why not `foreignObject`.

It wraps natively, so it looks like the obvious answer. It is not "fully SVG", it is unreliable in the Chromium→PDF export path — and, decisively, a `foreignObject` label is an HTML `<div>`. Chart motion grants the label role to `<text>` nodes, so such a label would be invisible to the very system this work exists to serve.

---

<!-- _class: statement silent -->

## Measured in viewBox units, baked at build time.

Widths, font sizes and line heights are all expressed in the chart's own coordinate space, never device pixels — so the same vector at 1280×720 and at 8K is one shape scaled, and text keeps its proportion and stays sharp. The breaks are computed once, when the chart transform runs, so the exported bytes are deterministic and the preview cannot drift from the PDF.
