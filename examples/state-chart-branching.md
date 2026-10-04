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

A chain keeps its reading order. A fan-out gets a real graph layout.

---

<!-- _class: divider light -->

## The rule

A chain reads `1, 2, 3` in order. A machine that branches is re-ranked.

---

<!-- _class: state-chart lr -->

`Chain`

## A chain keeps its order.

One outgoing edge per state — reading order already is the right answer.

- Source `start`
  - -compile-> Compiled
- Compiled
  - -test-> Tested
- Tested
  - -deploy-> Deployed
  - -fail-> Source
- Deployed `end`

*A long chain wraps onto a second row rather than shrinking — the order still reads left to right.*

---

<!-- _class: state-chart lr -->

`Fan-out`

## Three ways out of one state.

No single column can show this; the states would read as a sequence.

- Intake `start`
  - -triage-> Triage
- Triage
  - -fast-> Fast path
  - -deep-> Deep review
  - -hold-> Legal hold
- Fast path
  - -ship-> Approved
- Deep review
  - -ship-> Approved
  - -refuse-> Refused `:dashed`
- Legal hold
  - -refuse-> Refused `:dashed`
- Approved `done`
- Refused `end`

*The badges still show the list order; they no longer dictate the row.*

---

<!-- _class: state-chart tb -->

`Top to bottom`

## The same machine, stacked.

Direction is the author's call — `lr`, `tb`, or leave it to fit the stage.

- Intake `start`
  - -triage-> Triage
- Triage
  - =accept=> Accepted
  - -refuse-> Refused `:dashed`
- Accepted `done`
- Refused `end` `fail`

*End states converge on one end marker, laid out with everything else.*

---

<!-- _class: state-chart lr -->

`Self-loops`

## A self-transition loops at a corner.

The router nests each loop outside its state's corner and keeps every other line clear of it.

- Connecting `start`
  - -retry-> Connecting
  - =ok=> Connected
  - -fail-> Failed `:dashed`
- Connected `live`
  - -drop-> Connecting
- Failed `end`

*One router for every line, loops included.*

---

<!-- _class: state-chart lr -->

`Long labels`

## A long label sits on its line.

The router seats every label on its own line and cuts the line under it, so the label never crosses a state.

- Submitted `start`
  - -needs second review-> Second review
  - =auto approve=> Approved
- Second review
  - -escalate to legal counsel-> Escalated
- Approved `done`
- Escalated `end`

*Keep an event to a few words: the gap it needs is the gap the machine gets.*
