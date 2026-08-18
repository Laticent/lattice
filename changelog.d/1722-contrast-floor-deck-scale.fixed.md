- **Fixed: the contrast gate graded ordinary body text as "large text" on 4K decks, and
  asked only 3:1 of it.** WCAG's 18pt large-text line was applied to raw canvas pixels,
  but every `--fs-*` token is authored in `cqi`, so one design resolves to a different
  pixel count per deck size — `--fs-body` is 21.4px on an `hd` deck and 64.1px on a `4k`
  one. Rendering the same gallery at both sizes flipped 1024 of 1534 runs between
  thresholds and 317 pass/fail verdicts, on the deck's `size:` line alone. The gate now
  scores every run against 4.5:1 and grants no large-text allowance: normalizing the
  canvas away needs a single reference width, and the type scale is curated against two,
  so any normalizer inflates the orientations it was not curated for. Stricter than WCAG,
  never more lenient, and it costs nothing measured.
- **Fixed: de-emphasized rows and cards were dimmed with `opacity`, which made the
  largest text on a slide the least legible.** A CSS `opacity` composites ink *and*
  backdrop, so it weakens each ink in proportion to the headroom it had: on an `agenda`
  progress slide it took the row title from 18.13:1 to 2.97:1 and the bigger, bolder
  accent counter beside it from 5.47:1 to 2.00:1. `agenda`, `kanban` and `compare-prose`
  now step down with a de-emphasis ink instead — plus weight and elevation on `kanban` —
  and the current row, the winning card and the "done" status chip keep full strength.
