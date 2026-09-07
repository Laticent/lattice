---
status: proposed
summary: Can a `guards: strict` register prevent overflow by ellipsizing the text that does not fit? Measured on the real engine in Chromium 131 — yes for prose in an HTML text block, no for anything else. CSS alone cannot do it (no adaptive clamp exists); a measured pass fixed 4 of the 6 clipping slides in the shipped corpus at 6ms per deck; and the existing `probeContentClipped` still reports every trimmed slide, so the honest alarm survives the guard rather than being silenced by it. The blockers are not implementation: 14 chart components carry their labels in SVG where CSS ellipsis is a no-op, a box that does not fit cannot be fixed by trimming text, and a naive cut hid two paragraphs with no mark at all. Proposes TRIM as a fifth Fit-Ladder move, gated by a per-slot trim class whose default is never-trim, and puts three forks to the owner.
---

# Guards — can an ellipsis prevent overflow?

**The proposal.** A deck-level `guards:` register. At `strict`, text that
overflows renders with an ellipsis instead of spilling or being cut mid-line, so
the component keeps its shape and an export carries a clean "…" rather than a
sheared paragraph. At `loose`, nothing changes. The overflow ring, the "Content
clipped" tag and the type-floor warning all stay on either way — the guard
protects the look, it does not hide the problem.

**The answer, in one line:** it works, it is not universal, and the boundary is
sharp enough to write down. Trimming can only recover height that TEXT is
occupying, in an HTML box, where losing the tail does not change what the slide
asserts. That is most prose and almost nothing else.

Everything below was measured on this tree at `9522374`, with the real emulator
and Chromium 131.0.6778.204, not reasoned from the spec.

---

## 1. CSS alone cannot do it

The first hope is that this is a stylesheet change: give every text box
`overflow: hidden` and a clamp, ship it in `lattice.css`, and be done — no
measurement, no JS, and it works on every render path including export-to-Marp.

It does not exist. `-webkit-line-clamp` needs an integer line COUNT, and there is
no way in CSS to derive that count from the height the box actually has. Seven
forms were tried:

| What was tried | Result in Chromium 131 |
|---|---|
| `-webkit-line-clamp: 3` (a literal count) | works — clamps and draws the ellipsis |
| `-webkit-line-clamp: calc(120px / var(--lh))` | **computes to `none`** — a length ratio is not accepted as an integer |
| `-webkit-line-clamp: calc(100cqh / 24px)` (container-relative) | **`none`** — same reason |
| `-webkit-line-clamp: round(down, 120 / 1)` (a pure number) | `120` — arithmetic is fine, so the barrier is specifically lengths |
| `line-clamp: 3` (the CSS Overflow 4 standalone property) | **unsupported** |
| `block-ellipsis: auto` (clamp to available height — exactly what we want) | **unsupported**, and unimplemented anywhere |
| `-webkit-box` + `max-height` with no count | no clamp, no ellipsis — a hard clip |

`block-ellipsis: auto` is the feature this proposal wants and no engine ships it.
So the count has to come from somewhere else: either a **measured** pass that
computes it per box, or a **declared** budget per component slot. Section 8
puts that fork to the owner.

*(The probe was a throwaway in `.scratch/` and is not committed. The table IS
the reproduction: seven declarations on a fixed-height box and one
`getComputedStyle` read per row.)*

---

## 2. The measured guard, and what it did to the shipped corpus

The experiment is about 100 lines that run after fonts settle: find the boxes
that overflow, walk their text blocks, find the block that crosses the frame
edge, and set `-webkit-line-clamp` to the number of lines that fit above it.

Run over every deck in the corpus that clips today:

| Deck | Slides | Clipping before | Clipping after | Blocks trimmed | Alarm still firing | Pass cost |
|---|---|---|---|---|---|---|
| `examples/overflow-fix-me.md` | 7 | 2, 3, 5 | **2** | 4 | 2, 3, 5 | 6ms |
| `examples/marker-corner.md` | 7 | 3, 4 | none | 2 | 3, 4 | 6ms |
| `examples/README.md` | 1 | 1 | 1 | 2 | 1 | 4ms |
| `premise.gallery.md` | 8 | none (it trims already) | none | 0 | 3 | 2ms |

**Four of the six geometrically clipping slides fit afterward.** The cost is
single-digit milliseconds for a whole deck, so this is not a performance
question. And the look is the point: the over-stuffed comparison panel ends
"…folds the migration tooling into the base license rather than billin…" inside
an intact card, and the four-up card grid keeps its 2×2 shape with the oversized
card ending "…A reviewer looking at four cards should…".

The two that did not fit are the interesting half, and they are section 4.

---

## 3. The property that makes this viable: the alarm survives

The obvious objection is that a guard which makes overflow invisible also makes
it undetectable — the ring stops firing, the export goes quiet, and an author
ships a truncated deck believing it fit. That objection is answered by machinery
this repo already built.

`probeContentClipped` (`lib/core/overflow-probe.js:876`) exists specifically to
catch text lost with **no geometric spill to see** — its own header names an
ellipsis and a line-clamp as the cases it is for. Running both probes before and
after the guard, on the same DOM:

| Slide | `over` before | `over` after | `cut` after |
|---|---|---|---|
| fix-me p3 | true | **false** | **true** |
| fix-me p5 | true | **false** | **true** |
| marker-corner p3, p4 | true | **false** | **true** |

The geometry channel goes quiet — that is the guard working — and the
content-cut channel keeps reporting on every trimmed slide. The emulator's
existing stderr line already says the right thing without a word changed:

> An ellipsis, a line-clamp or a sheared panel head loses text with no box
> overflow to see, so the frame check above cannot report it. Shorten the copy
> or give that box more room.

So the guard does not need a new alarm, and it cannot accidentally disarm the
old one. This is the single strongest argument that the idea is buildable here
and not somewhere else.

**One consequence, and it is not small.** Every strict slide would light the
content-cut channel, `overflow:check`'s corpus ratchet would move, and
`lint:deck:all --strict` gates CI on warnings. Turning `guards: strict` on for
our own decks is therefore a corpus-wide event, not a per-deck one.

---

## 4. Four failure modes, each measured, each producing a rule

Every one of these was a real render, not a hypothesis. They are the invariants
any implementation has to obey.

### 4a. Trimming a layout container destroys the layout

The first version clamped the `<ul>` that IS the card grid. `-webkit-box`
replaced `display: grid`, and a four-up grid collapsed into one column with the
right half of the slide empty.

> **Rule.** Only ever trim a TEXT BLOCK — an element laid out as a block whose
> child boxes are all inline. Never a grid or flex container.

### 4b. Trimming a container of block children clips with no ellipsis at all

Clamping a box whose children are blocks (a heading plus two paragraphs, or a
`<ul>` wrapping one long `<li>`) cuts geometrically and draws nothing. Measured:
the box ended mid-line, no "…" anywhere. The ellipsis is placed on the clamped
box's own last line box, and a box whose children are blocks has none.

> **Rule.** Trim the innermost element that directly contains the text.

### 4c. Trimming an `<li>` kills its bullet

`display: -webkit-box` replaces `display: list-item`, so the marker disappears.
Visible in the comparison panel: the trimmed second bullet lost its dot while
its sibling kept one.

> **Rule.** The trim goes on a wrapper inside the item, not on the item.

### 4d. The worst one — a trim can hide content and mark nothing

On `examples/README.md` the guard clamped two paragraphs that were already
entirely below the frame edge. Both vanished from the render with no ellipsis
anywhere on the slide, because the "…" was drawn on a line that is itself
outside the visible box. The slide now looks perfect and is missing two
paragraphs. **That is strictly worse than the clip it replaced** — a sheared
paragraph at least looks wrong.

> **Rule, and it is the load-bearing one.** The cut must land INSIDE the last
> visible text block. Find the block that straddles the frame edge, trim THAT
> one so its ellipsis is visible, and hide what follows. When the edge falls in
> a gap between blocks, pull the last fully visible block back by one line to
> force a visible mark. **A guard that cannot place a visible ellipsis must
> decline and leave the honest clip.**

### 4e. And the one that is not fixable

`examples/overflow-fix-me.md` p2 stayed over by 25px after trimming, because
what does not fit is a callout BOX — its padding, its label chip, its border.
Trimming its text to a single line still leaves the box too tall.

> **Rule.** Trimming recovers only the height that text occupies. Box-driven
> overflow is out of scope and keeps the ring.

---

## 5. Coverage — what a text guard can never reach

From a full census of all 69 components (`lib/components/*/*/*.styles.css`):

- **14 chart components carry their labels in SVG `<text>`** — bar, bullet,
  funnel, gantt, line, map, piechart, quadrant, radar, scatter, slope,
  stacked-bar, waterfall, word-cloud. CSS `text-overflow` and `line-clamp` do
  not apply to SVG text. A guard is a **no-op on a fifth of the catalog**.
  Those components fit by their own scaling and their type floor, which is the
  right answer for a chart.
- **51 of 69 carry at least one multi-line prose slot** — so the single-line
  `text-overflow: ellipsis` idiom would be the wrong tool for nearly all of them.
- **4 components are single-line labels only** (contact, logo-wall,
  obligation-matrix, progress) where plain ellipsis would just work.
- **30 components already give their children determinate heights** (a flex
  child with `flex: 1` and `min-height: 0` in the bounded stage, or a chart
  figure pinned to 100%), 11 do so only in named variants, and 28 size to
  content. A declared per-slot clamp (section 8, option B) only engages where
  the box height does not grow with its content — so it would reach the 30
  cleanly, the 11 partly, and the 28 not at all.

So the honest coverage claim is: **a trim guard reaches HTML prose in about 55
components and nothing else.** It is not universal and should not be described
as universal.

---

## 6. Selective by role, not by component — and the default is never-trim

This is the half of the design that matters more than the mechanism.

An ellipsis on a sentence says "there is more of this". An ellipsis on a NUMBER
says something false. `$1,234,567` trimmed to `$1,23…` is not an abbreviated
fact, it is a wrong one, and it is wrong on a boardroom slide where somebody
reads it aloud. The same holds for a citation, a statutory reference, a formula,
and a line of code — where `...` is itself valid syntax in several languages.

So a slot's trim behavior is a property of what the text MEANS, and it has to be
declared:

| Trim class | Slots | Why |
|---|---|---|
| **trim** | body prose, card bodies, bullet text, notes, captions | The tail is elaboration. "…" reads correctly as "more of the same". |
| **drop** | repeated collection items (bullets, cards, timeline entries) | Dropping whole items reads better than shearing one, and the ellipsis on the last kept item stands for the rest. |
| **never** | numbers and KPI values, legal and citation text, code, math, headings, attribution | A trimmed one is a false statement, not a shortened one. These keep the clip and the ring. |

**An unclassified slot defaults to `never`.** A guard that trims a slot nobody
classified is one bad default away from putting a wrong number on a slide, and
the failure is silent by construction — the deck looks better than the truth.
The cost of that default is that `guards: strict` does less on day one and
earns coverage component by component, which is the correct direction of travel.

The three headline questions, answered directly:

- **Can it be universal?** No. Universal over prose; a no-op over SVG charts;
  refused over numbers, law, code and math; powerless against box overflow.
- **Does it survive on all components?** Only under the four rules in section 4.
  The naive version broke a card grid, dropped a bullet marker, and hid two
  paragraphs with no mark.
- **Everything or selectively?** Selectively, by declared slot role, defaulting
  to no.

---

## 7. What this contradicts, stated plainly

Three written rulings point the other way, and a fourth precedent points here.

- `design/forms.md:477` rejects a fade at the cut on three grounds and concludes
  "the honest pair for a fixed page is **clip** + **ring**". An ellipsis shares
  the second ground (it hides authored content) and escapes the third (no alpha
  gradient in the PDF).
- `2026-06-22-the-fit-spine.md:61` axiom 4: "Delivered content is never silently
  lost." A trim is not silent — the mark is on the slide and both probes still
  report — but it is lost.
- `2026-07-22-structure-derived-split-patterns.md:315`: overflow is "always more
  slides, or the honest ring … never '…'".
- Against those: `2026-07-27-footer-band-allocation.md:193` records the owner
  signing off on exactly this trade for the footer, with the survival numbers
  measured, and the note says explicitly that a future reader will assume it was
  an oversight and that it was not. The engine ships an ellipsis in five places
  today, each decided case by case.

So the proposal is not novel in kind. What is new is making it a **deck-wide
author-selectable policy** rather than five local judgments — which is precisely
why it is the owner's call and not a routine change. Adopting it means adding a
fifth move to the Fit Ladder, TRIM, sitting between SPLIT and FLOOR, and editing
axiom 4 to say what it now means.

One more altitude question comes with it. `overflow-marker:` shipped as front
matter for exactly one commit and was moved out
(`2026-07-30-overflow-marker-register.md:85`) on the argument that overflow
presentation is a property of the RENDER TARGET, not of the deck — same as
`autosplit:`. `guards:` asserts the opposite for a neighboring question. Both
answers are defensible; they cannot both be the house rule.

---

## 8. The forks

1. **Is TRIM admitted to the Fit Ladder at all?** If yes, `forms.md` §6 and the
   spine's axiom 4 get edited in the same change, not contradicted quietly.
2. **Measured or declared?**
   - *Measured* (what was tested): one pass after fonts settle, adaptive, cuts
     exactly at the frame, ~6ms per deck. Costs a measure pass on every render
     path, and it is invisible to export-to-Marp, which has no such pass.
   - *Declared*: `line-clamp: N` per component slot in the component's own CSS,
     N chosen for the box at design time. Pure CSS, deterministic, works on every
     path with no measurement — but only engages where the box height does not
     grow with its content, which the census puts at 30 components cleanly and 11
     partly.
   - *Both*: declared budgets carry the fixed-geometry cases; the measured pass
     covers the rest. Two mechanisms for one concern is a HARD RULE #1 smell and
     needs an answer before, not after.
3. **Deck register or export setting?** Section 7's altitude question.

## 9. Recommendation

Admit TRIM, measured, selective, default-off, with `never` as the default trim
class — and treat section 4d as the acceptance test rather than a detail. The
argument is that the alarm already survives the guard for free, which is the
property that usually has to be invented and here does not.

The thing worth NOT doing is shipping a universal `strict` that trims whatever it
finds. The measured runs show what that produces: a slide that looks correct and
has lost two paragraphs with nothing on it to say so.
