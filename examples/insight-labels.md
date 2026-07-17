---
marp: true
theme: indaco
paginate: true
header: "Lattice · insight-labels"
---

<!-- _class: title silent -->

# Rename the callout

`Base · Insight label`

The Key Insight panel and the split-compare verdict share one label seam.
Default wording stays; an `insight-*` modifier on the slide `_class` swaps
the word to a curated boardroom heading.

---

<!-- _footer: "default · no modifier" -->

## The default stays KEY INSIGHT.

Any trailing blockquote on a content slide renders as the accent panel with
its familiar eyebrow. Nothing changes unless you ask for it.

- Migration is opt-in — every existing deck renders identically.
- The label word is the only thing a modifier touches.

> The seam is invisible until you reach for it.

---

<!-- _class: insight-takeaway -->
<!-- _footer: "insight-takeaway" -->

## Same panel, read as a TAKEAWAY.

When the callout is what the audience should walk away with, name it so.

- The panel chrome, color, and sizing are untouched.
- Only the eyebrow word changes.

> Lead with the takeaway; let the body earn it.

---

<!-- _class: insight-the-ask -->
<!-- _footer: "insight-the-ask" -->

## A board slide closes with THE ASK.

The curated set covers the words a decision slide actually needs.

- `insight-so-what` — SO WHAT
- `insight-bottom-line` — BOTTOM LINE
- `insight-verdict` — VERDICT

> Approve the Series B bridge at the March board meeting.

---

<!-- _class: split-compare -->
<!-- _footer: "split-compare · default RECOMMENDATION" -->

`Decision Required`

## Build the pipeline, or buy it?

The verdict card defaults to RECOMMENDATION — no modifier needed.

- Build in-house
  - Full control of the roadmap
  - Two engineer-quarters before first value
- Buy the managed platform
  - Live in three weeks
  - Roadmap set by the vendor

> Buy now to unblock Q3; revisit build at renewal.

---

<!-- _class: split-compare insight-verdict -->
<!-- _footer: "split-compare insight-verdict · one vocabulary, both surfaces" -->

`Decision Required`

## The same modifier renames the verdict card.

`insight-verdict` sets `--insight-label` for both surfaces — the
recommendation is a Key Insight variant, not a split-compare special.

- Ship the redesign now
  - Beats the competitor announcement
  - Two known regressions still open
- Hold one sprint
  - Regressions closed first
  - Cedes the first-mover window

> Ship now; patch the regressions in the first point release.

---

<!-- _class: insight-our-view -->
<!-- _footer: "insight-our-view · the board-slide follow-ons" -->

## An analyst deck signs with OUR VIEW.

The vocabulary grew with the words a board or analyst slide reaches for.

- `insight-implication` — IMPLICATION
- `insight-next-step` — NEXT STEP
- `insight-why` — WHY IT MATTERS

> The re-rate is priced in; the surprise is the margin path, not the top line.

---

<!-- _class: title silent -->

# One seam, one vocabulary

`insight-key · insight-recommendation · insight-takeaway · insight-verdict · insight-so-what · insight-bottom-line · insight-the-ask · insight-our-view · insight-implication · insight-next-step · insight-why`

Set `--insight-label` per slide via a modifier, or deck-wide via a
frontmatter `class:`. Defaults never move; the word is a curated choice.
