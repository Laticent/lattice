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

1. Submitted `start`
   - `needs<br/>second review => 2`
   - `auto approve => 3`
2. Second review
   - `escalate to legal => 4`
3. Approved `done`
4. Escalated `end`

*Labels sit below the line on `lr` and beside it on `tb`, never through their edge.*

---

<!-- _class: state-chart tb -->

`Paired edges`

## Two edges between the same states keep two labels apart.

1. Draft `start`
   - `submit => 2`
2. Review `live`
   - `reject => 1`
   - `approve => 4`
   - `block => 3`
3. Blocked `blocked`
   - `unblock => 2`
4. Approved `done`

*Each pair gets room for both labels, and no label sits on another edge's line.*

---

<!-- _class: state-chart tb -->

`Self-loops`

## A loop's label sits clear of its own arc.

1. Queued `start`
   - `claim => 2`
2. Running `live`
   - `retry => self`
   - `finish => 3`
3. In Review
   - `revise => self`
   - `approve => 4`
4. Complete `end`

*The label moves just past the arc, so the loop and its name never overlap.*

---

<!-- _class: state-chart lr -->

`Status key`

## Running work and finished work look different.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `approve => 3`
3. Approved `done`
   - `publish => 4`
4. Published `live`
   - `archive => 5`
5. Archived `end`

*`live` paints blue, as on a gantt bar; `on-track` and `done` share one green chip.*

---

<!-- _class: content -->

`Portrait`

## Portrait decks keep their labels in scale.

The chart's text floor now grows with the deck's type. On a story-sized deck, a state chart sets its edge labels and ordinals at the same scale as its state names, so the export no longer warns TYPE FLOOR. The portrait gantt and state-chart deck shows it.
