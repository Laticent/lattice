---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · Branching state charts"
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Feature deck`

# A state machine that branches.

The numbered column is kept for chains. A fan-out gets a real graph layout.

---

<!-- _class: divider light -->

## The rule

A chain keeps `state i at row i`. A machine that branches is re-ranked.

---

<!-- _class: state-chart lr -->

`Chain`

## A chain is unchanged.

One outgoing edge per state — the column already is the right answer.

1. Source `start`
   - `compile => 2`
2. Compiled
   - `test => 3`
3. Tested
   - `deploy => 4`
   - `fail => 1`
4. Deployed `end`

*Every machine in the six shipped galleries lays out exactly as it did before.*

---

<!-- _class: state-chart lr -->

`Fan-out`

## Three ways out of one state.

No single column can show this; the states would read as a sequence.

1. Intake `start`
   - `triage => 2`
2. Triage
   - `fast => 3`
   - `deep => 4`
   - `hold => 5`
3. Fast path
   - `ship => 6`
4. Deep review
   - `ship => 6`:::state-pass-hue
   - `refuse => 7`:::state-fail-hue
5. Legal hold
   - `refuse => 7`:::state-fail-hue
6. Approved `done`
7. Refused `end`

*The numbering still names each state; it just no longer dictates the row.*

---

<!-- _class: state-chart -->

`Top to bottom`

## The same machine, stacked.

Direction is still the author's call — `lr` or the default.

1. Intake `start`
   - `triage => 2`
2. Triage
   - `accept => 3`:::state-pass-hue
   - `refuse => 4`:::state-fail-hue
3. Accepted `done`:::state-pass-hue
4. Refused `end`:::state-fail-hue

*Terminal states converge on one exit marker, ranked with everything else.*

---

<!-- _class: state-chart lr -->

`Self-loops`

## A self-transition still routes the old way.

dagre does not route a self-edge, so the hand-written router keeps drawing them.

1. Connecting `start`
   - `retry => self`
   - `ok => 2`:::state-pass-hue
   - `fail => 3`:::state-fail-hue
2. Connected `live`
   - `drop => 1`
3. Failed `end`

*One machine, two routers — whichever is right for each edge.*

---

<!-- _class: state-chart lr -->

`Long labels`

## A label can break, or wrap itself.

`\n` and `<br/>` break where you say; anything still too long wraps on its own.

1. Submitted `start`
   - `needs<br/>second review => 2`
   - `auto approve => 3`:::state-pass-hue
2. Second review
   - `escalate to legal counsel => 4`
3. Approved `done`:::state-pass-hue
4. Escalated `end`

*Labels sit below the line on `lr` and to the right on the default, so a two-line
label never punches a hole through the edge it belongs to.*
