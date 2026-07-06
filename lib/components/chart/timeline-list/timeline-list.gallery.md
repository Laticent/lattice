---
marp: true
theme: indaco
paginate: true
header: "Lattice · timeline-list"
---

<!-- _class: title silent -->

# timeline-list

`Evidence · Timeline · Series`

Date-stamped event list rendered as a horizontal spine — a dot per event with its date pill above and title, status pill, and body stacked below.

---

<!-- _class: timeline-list -->
<!-- _footer: "Default · timeline-list" -->

`chart · timeline-list`

## The timeline pins events to their dates.

Four milestones show the shape; the date chips carry the when.

1. `Q1` The first milestone
   - One clause says what changed here.
2. `Q2` The second, marked `decision`
   - A tag names the milestone's kind.
3. `Q3` The third milestone
   - Sixteen words is each entry's budget.
4. `Q4` The fourth milestone
   - Four to six entries reads best.


---

<!-- _class: timeline-list -->
<!-- stress-slide -->
<!-- _footer: "Stress test · timeline-list — Six milestones at the word ceiling." -->

`timeline-list · stress`

## Six milestones is the line's honest length.

1. `Y1 Q1` The opening milestone
   - An entry at the hard budget carries one full clause and its consequence.
2. `Y1 Q3` The second marker
   - Twenty-four words is the ceiling; spend them on what changed, not context.
3. `Y2 Q1` The midpoint
   - The middle of a timeline is where attention sags — anchor it.
4. `Y2 Q3` The fourth marker
   - Entries shorten as the line descends.
5. `Y3 Q1` The fifth marker
   - The soft ceiling passed one entry ago.
6. `Y3 Q3` The last marker
   - Six is the stop; a seventh becomes a gantt.


---

<!-- _class: timeline-list dark -->
<!-- _footer: "Composition: dark · timeline-list dark" -->

`chart · timeline-list`

## The timeline pins events to their dates.

Four milestones show the shape; the date chips carry the when.

1. `Q1` The first milestone
   - One clause says what changed here.
2. `Q2` The second, marked `decision`
   - A tag names the milestone's kind.
3. `Q3` The third milestone
   - Sixteen words is each entry's budget.
4. `Q4` The fourth milestone
   - Four to six entries reads best.


---

<!-- _class: timeline-list compact -->
<!-- _footer: "Composition: compact · timeline-list compact" -->

`chart · timeline-list`

## The timeline pins events to their dates.

Four milestones show the shape; the date chips carry the when.

1. `Q1` The first milestone
   - One clause says what changed here.
2. `Q2` The second, marked `decision`
   - A tag names the milestone's kind.
3. `Q3` The third milestone
   - Sixteen words is each entry's budget.
4. `Q4` The fourth milestone
   - Four to six entries reads best.


---

<!-- _class: timeline-list accent -->
<!-- _footer: "Composition: accent · timeline-list accent" -->

`chart · timeline-list`

## The timeline pins events to their dates.

Four milestones show the shape; the date chips carry the when.

1. `Q1` The first milestone
   - One clause says what changed here.
2. `Q2` The second, marked `decision`
   - A tag names the milestone's kind.
3. `Q3` The third milestone
   - Sixteen words is each entry's budget.
4. `Q4` The fourth milestone
   - Four to six entries reads best.


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · timeline-list" -->

## When NOT to reach for timeline-list.

- **Date-less steps.** No calendar dates? You have a sequence, not a timeline. Use `list-steps` for an ordered list or `journey` for stage-by-stage progress.
- **Date-range bars.** If each milestone needs a start and end on a shared axis, it's a Gantt chart. Use `gantt` — bar geometry conveys the durations a pill cannot.
- **Status pills as decoration.** The status pill is a verdict — `decision`, `live`, `at-risk`, `blocked`, `done`. Don't invent freeform tags; the engine tints only the known vocabulary.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `gantt` — milestones occupy date ranges, not single moments
- `list-steps` — the sequence has no dates, just an order
- `journey` — stage-by-stage progress without calendar dates
- `roadmap` — the timeline is forward-looking and bucketed by horizon
- `progress` — the events are parallel workstreams with completion percentages
