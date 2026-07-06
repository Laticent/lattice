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
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
  - Live demo `@prospect` `@sales` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `@onboarding` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`


---

<!-- _class: journey heatmap -->
<!-- _footer: "heatmap · journey heatmap — Stages shade by score." -->

## heatmap shades the stages by score.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`


---

<!-- _class: journey curve -->
<!-- _footer: "curve · journey curve — A sentiment line rides the stages." -->

## curve draws the sentiment line.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`


---

<!-- _class: journey swimlane -->
<!-- _footer: "swimlane · journey swimlane — One lane per actor." -->

## swimlane splits the journey by actor.

- Evaluate
  - Read case study `@prospect` `:5`
  - Live demo `@prospect` `@sales` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `@onboarding` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`


---

<!-- _class: journey weighted -->
<!-- _footer: "weighted · journey weighted — Stage size carries weight." -->

## weighted sizes the stages by importance.

- Discover
  - Search `@prospect` `:4` `+45`
  - Referral `@prospect` `:5` `+18`
- Convert
  - Pricing page `@prospect` `:3` `+12`
  - Checkout `@prospect` `:2` `+10`
- Support
  - Settings `@user` `:3` `+8`
  - Help docs `@user` `:4` `+7`


---

<!-- _class: journey -->
<!-- stress-slide -->
<!-- _footer: "Stress test · journey — Five stages, twelve tasks — the ceiling." -->

## Five stages of twelve tasks is the ceiling.

- Discover
  - Hear of it `@prospect` `:3`
  - First visit `@prospect` `:4`
- Evaluate
  - Read the case `@prospect` `:4`
  - Book a demo `@prospect` `:3`
  - Sit the demo `@prospect` `@sales` `:4`
- Trial
  - Sign up `@prospect` `:3`
  - First setup `@user` `:1`
  - Invite the team `@user` `:2`
- Adopt
  - First report `@user` `:4`
  - Weekly habit `@user` `:5`
- Expand
  - Add seats `@buyer` `:4`
  - Renew early `@buyer` `:5`


---

<!-- _class: journey dark -->
<!-- _footer: "Composition: dark · journey dark" -->

## The journey scores each stage of the path.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
  - Live demo `@prospect` `@sales` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `@onboarding` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`


---

<!-- _class: journey compact -->
<!-- _footer: "Composition: compact · journey compact" -->

## The journey scores each stage of the path.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
  - Live demo `@prospect` `@sales` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `@onboarding` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`


---

<!-- _class: journey accent -->
<!-- _footer: "Composition: accent · journey accent" -->

## The journey scores each stage of the path.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
  - Live demo `@prospect` `@sales` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `@onboarding` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · journey" -->

## When NOT to reach for journey.

- **Process without affect.** If the mood scores are all the same or arbitrary, the chart is doing less work than `timeline` or `list-steps`. Reserve journey for sequences where the affect changes meaningfully.
- **More than ten tasks.** Past ten tasks the chips compress and the labels become unreadable. Group into fewer sections, or split the journey at a natural break.
- **Volume tokens without weighted.** The `+N` volume token is meaningful only under the `weighted` variant. On the other four it is parsed but invisible — strip it from the markdown or commit to weighted.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `list-steps` — process needs descriptive body per step, no chart
- `gantt` — schedule of overlapping tasks across lanes
- `kanban` — current status by stage rather than sequence over time
