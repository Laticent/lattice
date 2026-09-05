---
status: shipped
summary: >
  114 of 286 committed goldens were stale — 110 of 211 deck goldens and 4 of 75 gallery
  pairs — because eight render-input PRs merged after the last sweep (#1983, 2026-09-01)
  and each blessed only what it touched. That is the seam `2026-08-24-golden-corpus-re-bless.md`
  named: `--bless` with no `--scope` means galleries, `--check` means everything. The
  refresh is routine; what it FOUND is the point. While `regress` is red across a deck it
  cannot report a NEW regression in that deck, and one was hiding: `examples/gallery-jargon`
  slide 15 shipped a `Content clipped` stamp with row 06 sliced through the middle, from
  #2059's `--lt-meta: fit-content(26cqi)` cap squeezing the meta column until all six rows
  wrapped to two lines where three did before. A 289-deck overflow sweep says it is the
  ONLY casualty in the corpus, so the fix is the modifier #2059 shipped for exactly this
  shape (`flex-meta`) rather than a change to the default — and the fixed render is
  word-identical to the pre-regression golden. Two things are recorded and not fixed:
  #2059's changelog claim that "the default already fits" is false for one deck in 289,
  and `themes/palette-audit` page 2 now has its intro paragraph occluded by the note panel
  (that deck was already clipping on both sides of the refresh).
---

# A stale gate reports nothing, and it was hiding a clipped slide

**2026-09-05 · branch `claude/stale-goldens-regressions-ikwu5c`**

**Area:** the committed golden corpus, `examples/gallery-jargon.md`,
`lib/components/inventory/list-tabular`

## 1. What was stale, and why

`npm run regress` on a clean `main` (`e562d2f`):

| Scope | Checked | Drifted |
| --- | ---: | ---: |
| gallery pairs | 75 | 4 |
| deck goldens | 211 | 110 |

The last sweep was #1983 on 2026-09-01. Eight render-input PRs merged after it — the
`cards:` register (#2011), auto-split (#2016, #2042), the universal coda (#2018), the
table family's outer edge (#2055), `list-tabular`'s responsive columns (#2059),
`list-steps` (#2046), `stage-clip` (#2049) — and each blessed the artifacts it touched
directly. None swept the deck scope, because reaching it takes a flag:
`regression-gate.mjs --bless` with no `--scope` means galleries while `--check` means
everything. `2026-08-24-golden-corpus-re-bless.md` §4 measured that seam and made the
command say out loud what it did not touch. The note is right and the print-out fires;
neither makes anyone run the multi-hour deck sweep.

## 2. The finding: a red gate reports nothing

**While `regress` is red across a deck it cannot surface a NEW regression in that deck.**
The staleness is not the defect — it is the blindfold.

`examples/gallery-jargon` slide 15 renders a `Content clipped` stamp and cuts row 06
through the middle. The words `A`, `ASK` and `CUSTOMER` are absent from the whole
document. It is a `list-tabular` ledger, and the cause is #2059's responsive columns:

- **Before.** Tracks were `3.4375cqi 15.625cqi 1fr minmax(0, 0.9fr)`, so the meta column
  took roughly 36cqi of a shared split. Three of six metas wrapped to two lines. The
  slide fit.
- **After.** `--lt-meta: fit-content(var(--lt-meta-max))` caps the meta at **26cqi**
  while `--lt-body: minmax(0, 1fr)` takes every remaining pixel. `fit-content()` is a
  hard cap, not a preference — so the meta wraps even though the row has free space the
  body does not need. All six metas went to two lines, the ledger outgrew the stage, and
  `align-content: safe center` did what it promises: lost the tail rather than the head.

Two gates could have said so and neither did. `regress` was red across the deck scope
already. `overflow:check` is a ratchet with a committed baseline, and `gallery-jargon`
is not in it — but it is on-demand by design (a 289-deck sweep of real Chromium), so
nobody ran it.

## 3. The fix, and why it is not the default

A full 289-deck overflow sweep says `gallery-jargon` slide 15 is the **only** slide in
the corpus that newly clips. One casualty in 289 does not make a default wrong, and this
slide is precisely the shape the component's own modifiers document:

> **`flex-meta`.** The trailing column carries a phrase rather than a stamp, and it
> should absorb the leftover width.

The metas here are phrases (`-5 to +5 · Auto · Did anyone ask a customer`), not stamps.
`flex-meta` hands the leftover to the meta and lets the body hug, and the result is
**better than the render this regressed from**: every meta on one line, where the
pre-#2059 golden wrapped three of six. Checked rather than asserted — a `pdftotext` word
multiset of the fixed render against the `origin/main` golden is empty in both
directions.

`fit-meta` renders identically on this slide. `flex-meta` is chosen on intent, and it is
the more robust of the two: it caps nothing but hands the slack to the column that needs
it, where `fit-meta` leaves the body holding slack it does not use.

**Changing `--lt-meta-max` was rejected for this branch.** It re-decides a number in a
component that merged the day before, moves goldens across the corpus, and buys nothing
measurable: 288 of 289 decks are fine with 26cqi.

## 4. What is recorded and NOT fixed

**#2059's changelog claim is overstated.** It says of the column modifiers: *"Most
ledgers need none of them — the default already fits."* It fits 288 of 289 decks. The
one it does not fit is a hand-curated long-runner whose content did not change. Whether
the 26cqi cap should widen — the name cap beside it is 34cqi — belongs to that
component's owner, not to a golden refresh (HARD RULE #18, off-path).

**`themes/palette-audit` page 2 occludes its intro paragraph.** The KEY INSIGHT panel
now sits high enough to cover the paragraph above it; the paragraph's text is still in
the PDF, under the panel. That deck carries a `Content clipped` stamp on pages 2 and 84
in the OLD golden as well, so this is a pre-existing overflow in a hand-rolled audit
artifact with its own `style:` block, not something the refresh introduced. It is also
not in the overflow baseline, because it is not in that tool's corpus.

## 5. What was checked before blessing

Both arms `2026-08-24-golden-corpus-re-bless.md` §5 established, because a mechanical
sweep is exactly what that note caught promoting an artifact it should not have:

- **Page counts.** No golden changed page count, so §5b — *pixel-only drift is blessed; a
  page-count flip is restored and reported* — had nothing to restore.
  `examples/portrait-roadmap`, the one artifact that note exempts for rendering 5 pages
  against an 8-page golden, matched its golden here and did not drift at all. The flip
  does not reproduce on this host, which is consistent with
  `2026-08-17-portrait-roadmap-pagination-drift.md` calling it host-dependent.
- **Content.** A word multiset across all 118 refreshed files left 113 word-identical.
  Three of the five deltas are `pdftotext` artifacts where a wrap position moved
  (`derisk` to `de risk`, `moderaterisk` to `moderate risk`, `reinspections` to
  `inspections re`) — the same class §5 recorded, and the reason a LINE multiset is the
  wrong instrument. The other two are the two findings above.

## 6. The durable lesson

A freshness gate that is allowed to sit red stops being a gate and becomes a list. The
corpus went 110 deck goldens stale in four days, and the cost was not the stale bytes —
it was that a clipped slide shipped inside the noise, on a tree where `build:check`, the
unit suite and `lint` were all green.
