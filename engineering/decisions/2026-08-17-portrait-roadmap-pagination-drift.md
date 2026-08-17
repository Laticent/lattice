---
status: shipped
summary: >
  examples/portrait-roadmap renders 5 pages against its committed 8-page golden, at
  origin/main and at 602858c (2026-08-13), which predates every 2026-08-16 merge —
  re-rendered here after a reviewer showed the handoff's 94d043d does not. The question was
  whether that is harmless cross-machine pagination or a latent auto-split bug dropping
  content. It is pagination, and the finding INVERTS the worry: a multiset diff of the
  extracted text shows ZERO body content unique to either side — the entire 18-line delta
  is 3 x 6 lines of repeated per-slide chrome (running header, footer band, legend,
  subtitle fragment, and auto-split's own "(cont.)" marker) — and looking at the pages
  shows the GOLDEN is the worse render: it puts one phase card on each of four pages, each
  roughly 85% empty, where the fresh render composes all four onto one page and clips
  nothing. Nothing is re-blessed: the golden is not wrong about content, only about a
  machine, and re-blessing bakes this host's metrics into a file the whole team renders
  against. Fixed on-path: the page-count label was inverted in both of its copies, so the
  three DROPPED pages were reported as "new page added" — the exact wrong steer for the
  question the gate exists to answer.
---

# `portrait-roadmap`: 5 pages against an 8-page golden

**Follow-on from #1686.** Handed over as one of three threads off the render-cost
thread, framed as: *I confirmed it is not ours. I did NOT confirm it is harmless.*

This note confirms it is harmless, and corrects the direction of the concern.

## 1. What was already established

Carried in from the handoff, not re-derived here:

- Fresh render = 5 pages, committed golden = 8.
- It reproduces identically at `origin/main` **and** at `94d043d` — so it is not
  caused by #1677 / #1661 / #1679 / #1686, all of which land after that commit.
  > **Corrected.** The handoff described `94d043d` as "predating all of
  > 2026-08-16's merges", and this note repeated it. It does not: `94d043d` is
  > *itself* dated 2026-08-16, with five squash merges after it (#1648, #1679,
  > #1661, #1668, #1677). An independent reviewer caught it and then made the
  > point moot by rendering at **`602858c` (2026-08-13)**, which genuinely
  > predates every 2026-08-16 merge. **Re-rendered here rather than taken on
  > trust: `602858c` gives 5 pages too** (`pdfinfo`, a clean worktree at that
  > commit). The conclusion is stronger than the sentence that overstated it.
- Auto-split is height-driven, so a small font-metric difference flips split
  decisions and re-paginates. That was the leading hypothesis, and it was
  **unverified**.

The drift table and the wider cross-machine band live in
`2026-06-12-p4-regression-gate-retire-marp.md` §0a.

## 2. The question, and the test that answers it

Page counts cannot answer "did the render lose content" — that is what made the
thread ambiguous. Two tests can, and they disagree with each other about nothing:

**Test 1 — a multiset diff of the extracted text.** `pdftotext -layout` on both
PDFs, whitespace normalized, footer page numbers stripped, duplicates *kept*
(a set diff would hide a card that appears twice in one and once in the other):

| | |
|---|---:|
| Body lines in the golden | 96 |
| Body lines in the fresh render | 78 |
| **Unique to the fresh render** | **0** |
| Unique to the golden | 18 |

Those 18 are exactly **3 × 6 lines of per-slide chrome**, one set per dropped page:

```
LATTICE · ROADMAP PORTRAIT              (running header)
H1 2026 → H2 2026                       (eyebrow, top of the slide)
Auto-horizons · four quarters stacked   (the deck's _footer:)
Platform roadmap by                     (h2 fragment — the heading wraps)
Shipped  Planned  Out of scope          (legend)
workstream. (cont.)                     (auto-split's own continuation marker)
```

(The first draft of this block called `H1 2026 → H2 2026` a footer and truncated
it, and called `Auto-horizons · …` a "footer band" — the reviewer measured the
eyebrow at y≈66, i.e. the top of the slide. Corrected, because this block is the
note's central evidence exhibit and a mislabeled exhibit is worth less than none.)

Every one is chrome the engine stamps *per slide*, and `(cont.)` is auto-split's
own artifact. **Not one phase card, workstream, or status item is missing.** The
"unique to fresh" column being empty is the load-bearing half: the fresh render
invents nothing either.

**Test 2 — look at the pages** (HARD RULE #23; text extraction cannot see
clipping, and clipping is the failure mode that would matter). Rasterized both at
72 dpi and compared them whole.

The fresh render's page 3 carries all four phase cards — `PHASE 01 Q1` through
`PHASE 04 Q4`, each with its Signal intake / Adoption / Governance rows — inside
the frame, nothing clipped, with vertical room to spare. Page 4 does the same for
all three horizons. The render also emits **no overflow, clipping or legibility
warning**.

The golden's pages 3–6 each carry **one** phase card, stretched to fill the page,
with two content rows floating in roughly 85% empty space.

## 3. What that means, and it is not what the thread expected

**The fresh 5-page render is the better artifact.** The golden is not a record of
content the engine has since lost; it is a record of auto-split, on some other
machine, deciding that four cards could not share a page and emitting four
near-empty slides instead. The last page of each file is identical apart from its
page number (`5` vs `8`), so the tail is intact and only the middle re-paginated.

So the answer to *is there a latent auto-split bug a metric nudge tips into
dropping content?* is **no — nothing is dropped**. There is a separate,
pre-existing observation worth recording, which is that auto-split *can* land in
a state that produces mostly-empty slides on this deck. That is **off the path**
of this investigation (nothing here caused it, nothing here worsens it), so per
HARD RULE #18 it is logged rather than pulled into the diff.

## 4. What is NOT done, deliberately

**Nothing is re-blessed** — not this deck, not the 29 decks over 5% in §0a's
table. The golden is not wrong about *content*; it is right about a different
machine. Re-blessing here would bake this host's rasterization and pagination
into a file every other machine renders against, trading a visible, understood
drift for a silent, wrong baseline. §0a argues this at length.

The consequence is that `examples/portrait-roadmap` stays red in
`tools/regression-gate.mjs --scope decks` on this host. That is the correct state
for a gate whose baseline was captured elsewhere, and it is preferable to a green
gate that means nothing.

**The mechanism is still unproven.** "A font-metric difference flips a
height-driven split decision" remains the leading hypothesis and this note does
not promote it to a finding — it explains the observation and nothing here tested
it. The render-cost thread has produced five confidently-wrong mechanisms inferred
from a signature (`2026-08-16-render-format-cost-assessment.md` §9); this one is
not going to be the sixth. What *is* established is the part that decides the
question: no content is lost either way.

## 5. Fixed on-path: the page-count label read backwards

The regression gate's own report labeled the three **dropped** pages
`"new page added"`:

```json
{ "page": 6, "pixels": -1, "note": "new page added", "newPng": null }
```

`newPng: null` on the same row says the fresh render has no such page. The
ternary was inverted:

```js
note: oldP ? 'new page added' : 'page removed'   // wrong
```

`oldP` is the **baseline** page, `newP` the fresh one, so a page only the baseline
has was *removed*. It was wrong in both of its copies — `tools/pixel-check.js:160`
and `tools/preview.js:287` — which is why it survived: two independent
transcriptions of the same mistake look like corroboration.

This is on the path of this investigation in the strict sense: the thread's whole
job was to read this gate's output and decide whether content was lost, and the
gate reported the opposite of what happened. Both call sites now import one
`pageDeltaNote` from `tools/preview.js` (HARD RULE #1).

`test/unit/tools/page-delta-note.test.js` pins it in both places it can break,
with the mutation results measured rather than asserted:

| Mutation | Assertions failing (of 6) |
|---|---:|
| restore the literal old ternary | **5** |
| swap only the two arms, keep the `null` return | 3 |
| swap a **call site's** argument order (`pixelDiff(outPdf, golden)`) | **2** |

> **Corrected.** This note and the PR first claimed "restoring the old ternary
> fails 3 of its 6 assertions". That artifact belongs to the *arm-swap* mutation,
> not the one the sentence named — the old ternary fails **5**. The claim was
> conservative (the test is stronger than advertised) and it was still a
> verification claim whose named surface did not match its evidence, which is the
> thing HARD RULE #23 exists to stop. Found by an independent reviewer re-running
> the mutation instead of believing the report of it.
>
> The **call-site** row is new. The reviewer's sharpest finding was that the fix
> pinned the pure helper while leaving the *other half of the same bug class*
> uncovered: `pixelDiff(golden, outPdf)` swapped at any of four call sites makes
> the label lie again with every original assertion green. There is now a
> source-level assertion that the baseline argument comes first at all four.

## 6. Verification

| Claim | Surface | Artifact |
|---|---|---|
| Golden 8 pages, fresh 5 | real `pdfinfo` on both PDFs | counts above |
| No body content lost or invented | real `pdftotext` multiset diff | the 96/78/0/18 table |
| Nothing clipped in the packed render | rasterized pages, viewed whole | fresh pp. 3–5 |
| The golden's pages are mostly empty | same | golden pp. 3–6 |
| The label fix catches its own regression | `node --test`, mutation run | 5 of 6 fail on the old ternary; 2 of 6 on a swapped call site |
| None of the above is machine-independent | — | **UNVERIFIED, and unverifiable here** |

Rendered with the real CLI — the command, in the form that actually runs (it
requires an output path; `lattice-emulator.js:508` rejects it without one):

```sh
node lattice-emulator.js examples/portrait-roadmap.md .scratch/pr-fresh.pdf -q
```

On the cloud sandbox — **one machine**, which is the whole subject of this note and
the reason none of it is a cross-machine claim.

**Independently re-derived.** A reviewer with no stake in the conclusion rebuilt
the multiset diff from scratch and got the same 96 / 78 / 0 / 18; confirmed all
**24** status cells in the source are present in *both* renders (so the claim holds
against the deck source, not merely against the golden); measured the golden's
phase cards at **1.2–1.4% ink**; and pinned the last-page claim precisely — the two
files differ by 112 pixels inside an 11×18 box at the page-number glyph. It also
traced `pdftoppm`'s argument order and all four call sites to confirm the label fix
points the right way, then ran the real `pixelDiff` on the two real PDFs and got
`page removed` with the golden present. The old label was false; the new one is
true.
