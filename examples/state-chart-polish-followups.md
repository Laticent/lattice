---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · State chart follow-ups"
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Feature deck`

# Four fixes to the state chart.

A caption stays one line, labels keep their room, and the key tells running work from finished work.

---

<!-- _class: state-chart lr -->

`Caption`

## A caption with code reads as one sentence.

- Submitted `start`
  - -needs second review-> Second review
  - -auto approve-> Approved
- Second review
  - -escalate to legal-> Escalated
- Approved `done`
- Escalated `end`

*Labels sit on their line, which is cut under them, never across a state.*

---

<!-- _class: state-chart tb -->

`Paired edges`

## Two edges between the same states keep two labels apart.

- Draft `start`
  - -submit-> Review
- Review `live`
  - -reject-> Draft
  - -approve-> Approved
  - -block-> Blocked
- Blocked `blocked`
  - -unblock-> Review
- Approved `done`

*Each pair gets room for both labels, and no label sits on another edge's line.*

---

<!-- _class: state-chart tb -->

`Self-loops`

## A loop's label sits clear of its own arc.

- Queued `start`
  - -claim-> Running
- Running `live`
  - -retry-> Running
  - -finish-> In Review
- In Review
  - -revise-> In Review
  - -approve-> Complete
- Complete `end`

*The label moves just past the arc, so the loop and its name never overlap.*

---

<!-- _class: state-chart lr -->

`Status key`

## Running work and finished work look different.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -approve-> Approved
- Approved `done`
  - -publish-> Published
- Published `live`
  - -archive-> Archived
- Archived `end`

*`live` paints blue, as on a gantt bar; `on-track` and `done` share one green chip.*

---

<!-- _class: content -->

`Portrait`

## Portrait decks keep their labels in scale.

The chart's text floor now grows with the deck's type. On a story-sized deck, a state chart sets its edge labels and ordinals at the same scale as its state names, so the export no longer warns TYPE FLOOR. The portrait gantt and state-chart deck shows it.
