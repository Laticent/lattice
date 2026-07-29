---
marp: true
theme: indaco
size: portrait
paginate: true
footer: "Fit Ladder · reflow, then split"
---

<!-- _class: title -->

# A split that reads the other axis

`Fit Ladder · Split · #1234`

Auto-split used to look only for vertical spill. A row of members that ran off the
right edge was never handed to the splitter, so it shipped clipped — and the members
past the edge were simply gone from the export.

---

<!-- _class: premise -->
<!-- _footer: "The lede belongs on the cover, once" -->

## Eight is where one palette cycle ends.

Past eight rows the categorical hues repeat, so eight is this layout's practical ceiling — which makes it the right stress case for a split that has to carry its framing forward.

1. Remember
   - Recall facts, syntax, rules.
   - How is this done?
2. Understand
   - Explain behavior and dependencies.
   - Why does it work?
3. Apply
   - Use patterns in new contexts.
   - How do I make it work here?
4. Analyze
   - Decompose across boundaries.
   - Where does it break?
5. Evaluate
   - Judge options against strategy.
   - Which option should win?
6. Create
   - Synthesize what isn't there.
   - What should exist?
7. Transfer
   - Carry the judgment to new ground.
   - Where else does this hold?
8. Teach
   - Make the reasoning reproducible.
   - Can someone else do this?

---

<!-- _class: cards-stack horizontal -->
<!-- _footer: "Three cards that used to be one" -->

## A sideways stack overflows sideways.

- Rows become columns.
  - The ranking now reads left to right.
- Same card anatomy.
  - Title, body, optional status pill.
- Use for timelines.
  - Sequence feels natural sideways.

---

<!-- _class: list-steps -->
<!-- _footer: "One step per page, with the relationship carried" -->

## How the migration runs.

1. Freeze the schema — no new columns until the cutover window closes.
2. Backfill the shadow table — replay six months of history and reconcile.
3. Dual-write both paths — every write lands in old and new, verified nightly.
4. Flip the readers — move traffic a service at a time, watching error rates.
5. Retire the old path — drop the writes once a full week reads clean.
6. Archive the runbook — file the sign-off records with the control owners.
7. Close the gate — confirm the controls transferred to their named owners.

---

<!-- _class: closing -->

## What changed

The veto now asks whether splitting *narrows* the collection, not which direction it
overflowed. A flex row or a multi-column grid qualifies; a table does not, because its
width comes from its columns.
