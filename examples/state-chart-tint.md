---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · State chart tints"
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Feature deck`

# Tint a state machine without leaving the palette.

`:::token` names a theme token, never a color — so a tinted deck still re-themes.

---

<!-- _class: divider light -->

## The channel

`:::token` after a state's pills, or after a transition's inline code.

---

<!-- _class: state-chart lr -->

`Untinted`

## The default reads as one system.

Every edge takes the engine's connector color.

1. Draft `start`
   - `submit => 2`
2. Review `on-track`
   - `approve => 3`
   - `reject => 1`
3. Published `end`

*The baseline the next slide tints — same machine, no `:::`.*

---

<!-- _class: state-chart lr -->

`Tinted transitions`

## Color carries the outcome.

The happy path reads green, the rejection red.

1. Draft `start`
   - `submit => 2`:::state-pass-hue
2. Review `on-track`
   - `approve => 3`:::state-pass-hue
   - `reject => 1`:::state-fail-hue
3. Published `end`

*Same machine — one token each on the edges that carry meaning.*

---

<!-- _class: state-chart lr -->

`Tinted states`

## A node takes a tint too.

Terminal states carry their outcome in the tile.

1. Intake `start`
   - `triage => 2`
2. Triage
   - `accept => 3`:::state-pass-hue
   - `refuse => 4`:::state-fail-hue
3. Accepted `done`:::state-pass-hue
4. Refused `end`:::state-fail-hue

*A tint paints the tile; the badge still carries the status.*

---

<!-- _class: state-chart lr -->

`Label backgrounds`

## The second slot sets the label ground.

`:::edge-token/label-bg-token` — the edge, then the ground its label sits on.

1. Queued `start`
   - `run => 2`:::state-pass-hue/surface-raised
2. Running
   - `fail => 3`:::state-fail-hue/surface-raised
3. Done `end`

*For when an edge crosses a busy area and its label must knock out more of it.*

---

<!-- _class: state-chart lr -->

`Degrading`

## An unresolvable name changes nothing.

Existence is not checked at build time.

1. Draft `start`
   - `submit => 2`:::state-pass-hue
   - `typo => 3`:::stat-pas-hue
2. Live `live`
3. Void `end`

*`typo` names no real token, so that edge keeps its inherited paint.*
