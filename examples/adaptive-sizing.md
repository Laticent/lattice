---
marp: true
theme: indaco
size: story
paginate: true
---

<!-- _class: title silent -->

# Adaptive by box, not by size.

`Lattice · component adaptive sizing`

The same five components, rendered on a 9:16 frame. Each reflows to the box it occupies — no size-specific variant was authored into the deck.

---

<!-- _class: list takeaway -->

## What "box-local" changes.

- A component reads the box it sits in, not the size you selected.
- Type stays anchored to the slide; only the structure reflows.
- The trigger is the container's aspect, so a portrait deck and a narrow nested cell are handled by one rule.
- Four families carry the structure: wide, square, tall, strip.
- The author declares priority and what may drop; the layout honors it.

---

<!-- _class: kpi -->

`Atlas · Q4 2026`

## The quarter held on every metric that mattered.

1. $48.2M
   - Annual recurring revenue
   - target $46M · +12% `On plan` `Board`
2. 71%
   - Gross margin
   - +3pp QoQ `On plan` `Finance`
3. 119%
   - Net revenue retention
   - +4pp YoY `Ahead` `Investor`
4. $0.9M
   - Cash burn
   - target $1.4M `On plan` `Board`

---

<!-- _class: matrix-2x2 -->

## Where the next two quarters get spent.

`Effort · Impact`

- Migrate the data layer
  - High impact, low effort — start now.
- Rebuild the editor
  - High impact, high effort — staff in Q1.
- Rename the workspace
  - Low impact, low effort — defer.
- Re-platform billing
  - Low impact, high effort — do not start.

---

<!-- _class: cards-grid -->

## Four pilots, four lessons.

- Onboarding.
  - Teams that finished setup in one sitting retained at twice the rate.
- Scoring.
  - The default weights were re-tuned by almost every team within a month.
- Logging.
  - Predicted-outcome fields stayed blank until we made them one tap.
- Review.
  - Weekly log review was the single strongest signal of a healthy pilot.

---

<!-- _class: split-compare -->

`Decision required`

## Build the data layer, or buy it?

Both paths are viable. The difference is where we spend the next eighteen months.

- Build in-house
  - Full control over schema and roadmap
  - 2–3 engineer-quarters to feature parity
- Buy + configure
  - Ship in six weeks, not nine months
  - Exit risk manageable — data export contractually guaranteed

> Buy the infrastructure. Build the differentiation. Revisit in twenty-four months.

---

<!-- _class: list principles -->

## How the reflow decides.

1. Measure the box the component occupies, not the deck.
2. Pick the family from the box's aspect ratio.
3. Keep type anchored to the slide; reflow only the structure.
4. Shed the lowest-priority parts last, only when the box is tightest.

---

<!-- _class: title silent -->

## One contract, every frame.

`engineering/decisions/2026-06-18-component-adaptive-sizing.md`

Nothing on these slides selected a size. The components did.
