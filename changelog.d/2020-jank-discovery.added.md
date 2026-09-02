- **Added: `check:jank --anchors`, and an honest account of what a green run means.** An
  inversion pass pointed out that the tool contradicted its own premise: it argues nobody
  forms the suspicion by looking, then told operators to run it *when they suspect*. Worse,
  the natural first invocation could not fail — without `--anchor`, drift and collision are
  undefined and every other line is advisory, so `check:jank <component>` exited 0 on
  everything, and exactly one anchor selector was written down anywhere in the repo.
  `--anchors` now lists the generated boxes the walk can place, with each one's travel across
  the sweep and how many match per slide; on components nobody had named an anchor for it
  surfaces candidates immediately. The run also prints a `SWEEP moved` line naming which
  dimension changed — four byte-identical-looking rows under a clean verdict are normal when
  only ink *width* moved, which the table has no column for — and warns on non-wide families
  that `--no-split` suppresses a pass the real render would run. `engineering/jank.md` gains a
  "what a green run does NOT mean" section.
