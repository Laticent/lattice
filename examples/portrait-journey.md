---
marp: true
size: story
theme: indaco
paginate: true
header: "Lattice · journey portrait"
---

<!-- _class: title silent -->

# The journey, read top to bottom.

`journey · vertical board · portrait · 2026-06-19`

A journey is horizontal by nature — stages left to right, mood dipping below a timeline. On a tall deck that strands it in a band. Portrait gets a board of its own: stages stack, each task is a row, and mood reads twice — the row's color and the face's position.

---

<!-- _class: content -->

## Mood, twice over.

The landscape board is three parallel column-grids; you can't make a stage label group its task *rows* in CSS. So portrait emits a different shape — and encodes mood redundantly so it survives a glance.

- **Row wash** — pain warm, delight cool. The emotional arc is the first thing you see.
- **Plotted face** — seated on a pain-to-delight track with a dashed reach to the spine. The exact value, when you look closer.
- A `mood=1` task is then unmistakable: a pink row with the face pulled to the edge.

---

<!-- _class: journey -->
<!-- _footer: "Vertical board · the dip reads twice" -->

## Customer onboarding · trial to activation.

- Evaluate
  - Read case study `{who=prospect, mood=5}`
  - Book demo `{who=prospect, mood=4}`
  - Live demo `{who=prospect, mood=4}` `@sales`
- Trial
  - Trial signup `{who=prospect, mood=3}`
  - Workspace setup `{who=user, mood=1}` `@onboarding`
- Activate
  - First report `{who=user, mood=3}`
  - Daily use `{who=user, mood=5}`

---

<!-- _class: journey -->
<!-- _footer: "A steadier arc — support resolution" -->

## Support ticket · first touch to resolved.

- Intake
  - Ticket filed `{who=customer, mood=2}`
  - Auto-triage `{who=system, mood=3}`
- Work
  - First reply `{who=agent, mood=4}`
  - Investigation `{who=agent, mood=3}`
  - Fix shipped `{who=agent, mood=4}` `@eng`
- Close
  - Confirmation `{who=customer, mood=5}`

---

<!-- _class: journey heatmap -->
<!-- _footer: "Variants unify to the vertical board" -->

## Heatmap · where the trial drops off.

- Evaluate
  - Read case study `{who=prospect, mood=5}`
  - Book demo `{who=prospect, mood=2}`
- Trial
  - Trial signup `{who=prospect, mood=3}`
  - Workspace setup `{who=user, mood=1}`
- Activate
  - Daily use `{who=user, mood=5}`

---

<!-- _class: quote -->

## A portrait deck is a different box, not a smaller slide.

The win isn't shrinking the journey to fit — it's giving the vertical canvas its own composition, where the emotional arc runs down the page and the worst moment is the one your eye lands on first.
