---
marp: true
theme: indaco
paginate: true
header: "Lattice · journey"
---

<!-- _class: title silent -->

# journey

`Progression · Timeline · Structure`

Native user-journey chart — sections of tasks, each tagged with actor(s) and a 1-5 mood. Renders as section bars, task chips, plumb lines, and mood faces.

---

<!-- _class: journey -->
<!-- _footer: "Default · journey" -->

## The journey scores each stage of the path.

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

<!-- _class: journey heatmap -->
<!-- _footer: "heatmap · journey heatmap — Stages shade by score." -->

## heatmap shades the stages by score.

- Evaluate
  - Read case study `{who=prospect, mood=5}`
  - Book demo `{who=prospect, mood=4}`
- Trial
  - Trial signup `{who=prospect, mood=3}`
  - Workspace setup `{who=user, mood=1}`
- Activate
  - First report `{who=user, mood=3}`
  - Daily use `{who=user, mood=5}`


---

<!-- _class: journey curve -->
<!-- _footer: "curve · journey curve — A sentiment line rides the stages." -->

## curve draws the sentiment line.

- Evaluate
  - Read case study `{who=prospect, mood=5}`
  - Book demo `{who=prospect, mood=4}`
- Trial
  - Trial signup `{who=prospect, mood=3}`
  - Workspace setup `{who=user, mood=1}`
- Activate
  - First report `{who=user, mood=3}`
  - Daily use `{who=user, mood=5}`


---

<!-- _class: journey swimlane -->
<!-- _footer: "swimlane · journey swimlane — One lane per actor." -->

## swimlane splits the journey by actor.

- Evaluate
  - Read case study `{who=prospect, mood=5}`
  - Live demo `{who=prospect, mood=4}` `@sales`
- Trial
  - Trial signup `{who=prospect, mood=3}`
  - Workspace setup `{who=user, mood=1}` `@onboarding`
- Activate
  - First report `{who=user, mood=3}`
  - Daily use `{who=user, mood=5}`


---

<!-- _class: journey weighted -->
<!-- _footer: "weighted · journey weighted — Stage size carries weight." -->

## weighted sizes the stages by importance.

- Discover
  - Search `{who=prospect, mood=4, volume=45}`
  - Referral `{who=prospect, mood=5, volume=18}`
- Convert
  - Pricing page `{who=prospect, mood=3, volume=12}`
  - Checkout `{who=prospect, mood=2, volume=10}`
- Support
  - Settings `{who=user, mood=3, volume=8}`
  - Help docs `{who=user, mood=4, volume=7}`


---

<!-- _class: journey -->
<!-- stress-slide -->
<!-- _footer: "Stress test · journey — Five stages, twelve tasks — the ceiling." -->

## Five stages of twelve tasks is the ceiling.

- Discover
  - Hear of it `{who=prospect, mood=3}`
  - First visit `{who=prospect, mood=4}`
- Evaluate
  - Read the case `{who=prospect, mood=4}`
  - Book a demo `{who=prospect, mood=3}`
  - Sit the demo `{who=prospect, mood=4}` `@sales`
- Trial
  - Sign up `{who=prospect, mood=3}`
  - First setup `{who=user, mood=1}`
  - Invite the team `{who=user, mood=2}`
- Adopt
  - First report `{who=user, mood=4}`
  - Weekly habit `{who=user, mood=5}`
- Expand
  - Add seats `{who=buyer, mood=4}`
  - Renew early `{who=buyer, mood=5}`


---

<!-- _class: journey dark -->
<!-- _footer: "Composition: dark · journey dark" -->

## The journey scores each stage of the path.

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

<!-- _class: journey compact -->
<!-- _footer: "Composition: compact · journey compact" -->

## The journey scores each stage of the path.

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

<!-- _class: journey accent -->
<!-- _footer: "Composition: accent · journey accent" -->

## The journey scores each stage of the path.

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

<!-- _class: cards-stack -->
<!-- _footer: "Anti-patterns · journey" -->

## When NOT to reach for journey.

- Process without affect
  - If the mood scores are all the same or arbitrary, the chart is doing less work than `timeline` or `list-steps`. Reserve journey for sequences where the affect changes meaningfully.
- More than ten tasks
  - Past ten tasks the chips compress and the labels become unreadable. Group into fewer sections, or split the journey at a natural break.
- Volume tokens without weighted
  - The `volume=` value is meaningful only under the `weighted` variant. On the other four it is parsed but invisible — strip it from the markdown or commit to weighted.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `list-steps` — process needs descriptive body per step, no chart
- `gantt` — schedule of overlapping tasks across lanes
- `kanban` — current status by stage rather than sequence over time
