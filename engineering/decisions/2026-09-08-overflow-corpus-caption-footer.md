---
status: in-progress
summary: >-
  The overflow-corpus ratchet's 8 stale decks have ONE cause and it is not the decks. 19 of the 20
  clipped slides are the SPECIMEN-VOICE CAPTION FOOTER — the `— <summary>` suffix
  `galleryPlan()` appends for a `specimenVoice` manifest — ellipsised by the standard frame's
  single-line footer band, `chromeOnly: true`, no author body content lost. Measured: the band is
  1187px at hd and a `bar row` footer lays out at 1344px; 29 generated footers across 8 components
  exceed it. The 20th slide, `examples/q-and-a.md` p7, was a real 59px vertical overflow and is
  fixed here, and `examples/overflow-guards.md` — which clips on `main` too, on purpose, and had
  never been recorded — is added to the baseline the way `overflow-fix-me.md` already is. The
  caption-footer baseline is deliberately NOT re-blessed and the footer format is deliberately NOT
  changed — both are the owner's call, with the options and a recommendation recorded below.
builds-on: 2026-07-27-footer-band-allocation.md, 2026-07-30-slide-geometry-emitted-not-measured.md
---

# The overflow corpus's stale decks are one generated footer, not eight decks

**Date** 2026-09-08 · **Issue** #2133 · **Status** In progress — diagnosed, one real overflow
fixed, one intentional-demo deck recorded, the caption-footer class recorded and open

## What was measured

`node tools/check-overflow-corpus.js` over the full 314-deck corpus, this branch, real Chromium.
The DIAGNOSIS sweep read **26 clipped slides across 11 decks against a baseline of 7 across 4**;
the 19 new slides sat in 7 decks and every one of them is the same thing.

| deck | pages | cause |
|---|---|---|
| `chart/bar`, `chart/bullet`, `chart/slope`, `chart/stacked-bar` | p3–p5 each | caption footer |
| `chart/line` | p3–p6 | caption footer |
| `chart/waterfall` | p3–p4 | caption footer |
| `inventory/team-profile` | p7 | caption footer |
| `examples/q-and-a` | p7 | **a real 59px vertical overflow — fixed** |

The issue's own table said 23 slides; the count is 20 (hand-added, and now re-derived from a
fresh sweep).

## The cause

`galleryPlan()` in `tools/build-component-docs.js` appends `— <summary>` to a variant's footer
when the manifest sets `specimenVoice: true` — the 2026-07-05 Specimen Book decision, so the
footer band narrates the specimen. The summary is documentation prose, and the band is single-line
chrome (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`).

Measured on `bar.gallery.md` at hd: the band is **1187px** and the text runs **~9.88px per
character**, so it holds about 120 characters. The three cut footers lay out at 1344px, 1294px and
1225px; the two that fit are 13 and 100 characters. Across the tree, **29 generated footers on 8
components** are past that budget, the longest 396 characters (`zoom · waterfall zoom`).

*(Re-derived 2026-09-08 after an independent checker reported 23 across 7. The count holds: walk
every `*.manifest.json` with `specimenVoice === true`, build each footer the way `galleryPlan` does
— `` `${label} · ${name} ${key}` `` for a `variantDocs` entry and `` `Stress test · ${name}` `` for
the stress slide, then `— ${summary}` — and count the ones past 120 characters. 262 specimen
footers, 29 over, on 8 components; the number is stable from a 110- to a 120-character budget. A
count off `m.variants` rather than `m.variantDocs`, or one that skips the stress slide, comes in
low. Recorded because the disagreement will otherwise be re-litigated, and because a checker being
wrong is not the same as a claim being right — this one was re-run, not defended.)*

`probeContentClipped` classifies every one of them `chromeOnly: true` — the ellipsis is the
DESIGNED answer and no author body content is lost. `check-overflow-corpus.js` counts them anyway,
deliberately: its own comment cites #1300, "an ellipsed footer … both answers are yes".

## Why nothing was re-blessed, and why the footer was not changed

**Re-blessing** would restore the ratchet today — it is broken for every branch that runs the
sweep, which is the complaint #2133 opens with — but it banks 19 known-bad slides as the floor,
which #2133 explicitly rejects: "blessing 23 clipped slides would bank the drift as the new floor
and lose the information that these decks were once clean."

**Changing the footer** is the root fix and it is not this PR's to make. Every candidate is a
change to a design decision taken in another PR, with 66 specimen galleries and their committed
PDFs downstream:

1. **Drop the `— <summary>` suffix when it would not fit.** Loses nothing legible — the reader
   sees a clean label instead of a sentence cut mid-word — and the summary still ships in
   `<name>.docs.md`, `components.json` and the docs site. **Recommended.** The budget has to be a
   character count (the generator has no box), so it will also drop the suffix on a handful of
   footers that fit today.
2. **Shorten the 29 summaries.** Rejected: they are load-bearing documentation, and amputating a
   real explanation to fit a chrome line is what HARD RULE #30 exists to stop. `waterfall zoom`'s
   396 characters are 396 characters of why.
3. **Exempt a chrome-only cut from the corpus count.** Rejected: #1300 settled that the footer
   band is not exempt from the author channel, and the corpus tool unions both registers on
   purpose.

## A NINTH deck, and it is not drift

The sweep also reports `examples/overflow-guards.md` pages 2 and 4. That deck is not in the
baseline and it clips on `origin/main` too — rendered in a clean `main` worktree at `145c442`, the
same two pages. It arrived with `30ffa6e` (`guards: strict`, #2131) after this branch opened and
was never recorded.

It is also **clipping on purpose**, which the slides say themselves: p2 is the card the guard trims
(`✂ TRIMMED … pages 2` on the terminal, `CONTENT CLIPPED — page 2` in the report) and p4 is the
case where the guard DECLINES because the mark would land off-screen — its body text reads "that is
why you are reading a slide that clips rather than one quietly missing its tail."

So it is recorded, pages listed, exactly as `examples/overflow-fix-me.md` already is — the
treatment `check-overflow-corpus.js`'s own docblock prescribes for intentional clipping ("Those
decks stay in the baseline with their pages listed rather than being special-cased, so
'intentional' is visible, not hidden"). **That is not the re-blessing refused above.** The 19
caption-footer slides are decks that WERE clean and drifted; recording them banks real drift.
`overflow-guards.md` was never clean, and leaving it out fails the ratchet on `main` for every
branch that runs a sweep — the complaint #2133 opens with.

## What the sweep reads now

Re-run on the branch's final tree, same tool, same corpus:

```
total: 28 · baseline: 9 · regressions: 7 decks / 19 slides · improvements: 0 · errors: 0
```

**All 19 are the caption footer.** `examples/q-and-a.md` is gone from the list (fixed below) and
`examples/overflow-guards.md` is gone from it (recorded above). **No deck this branch touches
clips** — not the math demo, not `adaptive-sweep`, not the three components whose stylesheets were
guarded. 28 = the 19 caption-footer slides + the 9 now in the baseline.

**The diagnosis sweep's 26/11 does not reconcile arithmetically with this one, and it is not worth
forcing.** 26 + 2 − 1 is 27, not 28, and the table above sums to 20 above-baseline slides rather
than 19 — that sweep was taken on an intermediate tree that no longer exists as a commit, and its
totals were read off a terminal rather than a JSON record. The numbers to trust are the ones in the
block above, which are a saved `--json` run on the branch tip and were independently re-derived by
a second full sweep. The diagnosis figures are kept because the CAUSE analysis rests on them, not
the count. (The off-by-one was found by the HARD RULE #25 checker.)

## What IS fixed here

`examples/q-and-a.md` p7 (`q-and-a grid`), the one real overflow. Two of its four questions wrapped
to a second line and the grid's equal-height rows charged that twice — 1262px of content in a
1203px stage, 59px over, at every size. Shortening those two questions to one line each takes it to
zero; the answers are untouched. Re-measured through the full corpus sweep, not just the deck.

## What is still open

- The 19 caption-footer slides, and the baseline that still records them as regressions.
- #2133 step 4 — "consider whether a cheap subset could run per-PR, so drift is caught in days".
  That adds a CI step, which is the owner's call by CLAUDE.md's own reach test. Worth putting: the
  cost of the on-demand choice is exactly this note, a floor nobody re-ran for two months.
