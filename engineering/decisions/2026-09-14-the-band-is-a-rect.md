---
status: shipped
summary: >
  A tour's caption declared a rect and the engine read two of its four fields, so a centered
  380px `progress` pill reported a full-width band and every reveal whose target sat in the
  1060px beside it scrolled the page for nothing. `chromeInset` now carries the horizontal
  extent, published as `--vt-chrome-left` / `--vt-chrome-right` in CLEAR-space sense so that a
  full-width caption reports 0 and 0 and every consumer written before the pair existed is
  byte-identical.
---

# The band is a rect, not a full-width stripe

`engineering/decisions/2026-09-14-tour-caption-is-an-occluder.md` §3.1 closes with "It is also
purely vertical — a centered `progress` pill 380px wide is reported as a full-width band." That
sentence is now historical; this note is what replaced it.

## 1. The information was already there

`BuiltDock.occludes()` returns a `RectLike` — `left`, `top`, `width`, `height` — measured from the
painted box. Every caption style already produced a correct one; `progress` and `bar` return the
dock, `split` its caption box, `scrim` the union of its gradient and its subtitle. `chromeInset`
then read `box.top` (or `box.top + box.height`) and discarded `left` and `width`.

So the fix is not new measurement. It is reading two fields that were already being handed over.

## 2. The sense is inverted on purpose, and that is what makes it additive

The vertical pair says how much is COVERED, from each window edge inward. The horizontal pair says
how much is CLEAR, from each window edge inward to the band:

```
--vt-chrome-left    px between the window's LEFT edge and the band
--vt-chrome-right   px between the window's RIGHT edge and the band
```

covered x-range = `[left, innerWidth - right]`.

A uniform "covered" sense would have made a full-width caption publish `innerWidth` on one side or
forced a third number for the width. The clear-space sense makes **full width publish `0px` and
`0px`**, which is the value any consumer gets from a property that is not set. So:

- the Studio's `tourChromeOverlap` reading an OLDER Vetrina build sees `0`/`0`, reconstructs the
  full-width band, and behaves exactly as it did before this existed;
- `scrim` — the phone caption style, and the one the whole occluder mechanism exists for — is
  genuinely full width and keeps reporting exactly what it reported.

Nothing about `--vt-chrome-top` / `--vt-chrome-bottom` moved. This is a widening, not a change.

## 3. Two consumers got the x-test, and neither is the margin

CSS `scroll-margin` has no horizontal analog for a vertical scroll, so the x-awareness belongs in
the question "is this target even behind the caption?", not in the number written afterwards:

- `stage.ts`'s `intrudes`, inside `reveal` — a target whose x-range does not meet the band is left
  alone, and the second scroll pass never runs.
- `tour-chrome.ts`'s `tourChromeOverlap` — a host pane entirely beside the caption gets `0`, so the
  Studio's editor does not reserve room for a caption that is nowhere near it.

Both use a STRICT overlap test. A target whose right edge is exactly the band's left edge shares a
zero-width intersection with it, which is not something a caption paints over, and a `>=` test
would lift for it. There is an arm for that on both sides.

The `fits` half of `reveal` was deliberately left vertical: it asks whether a lifted target still
fits in the window's height, which the band's width has no bearing on.

## 4. The dedupe had to widen with it

`publishChromeInset` skips its write when the properties already hold the value, comparing the LIVE
value rather than a cache (#2209 §3.3 — two stages can share a document). All four now join that
comparison. Comparing the vertical pair alone would certify a stale extent for free: a `bar`
re-seated by a window resize keeps its height, so `top`/`bottom` are unchanged, while its `left` and
`right` move by hundreds of pixels. `publishedBottom` stays the single ownership token for teardown,
because all four are written together in one place.

## 5. What is verified

- **Real surface (HARD RULE #23)**: two arms in `docs/e2e/vetrina-cursor-caption.spec.ts` on a real
  Chromium, asserting that the published strips equal the gutters beside the dock Playwright
  measured — for `progress` and for `bar`. The prototype at `/proto/vetrina-caption/` gained
  `progress` and `split` radios so the narrow styles have a surface at all; it had only `bar` and
  `cursor`. Both arms were driven against a mutant that publishes `0`/`0`, and both fail on it.
- **Arithmetic**: five arms in `docs/src/lib/vetrina/reveal.test.ts` (the caption fixture gained an
  optional x-span) and five in `docs/src/components/studio/tour-chrome.test.ts`. Two mutants were
  driven — forcing `overlapsX` true kills the two "beside" arms; zeroing the extent kills three —
  and each leaves the rest of the suite green.
## 6. This DOES change a shipped tour, and an earlier draft of this note said it did not

The first draft closed with "no shipped tour uses `progress` or `split` today, so this changes the
behavior of no tour currently in the product." That is false, and it contradicts §4 of this same
note, which argues that a `bar`'s gutters move by hundreds of pixels.

`docs/src/components/studio/use-studio-demo.ts:186` ships `caption: b.mobile ? 'scrim' : 'bar'`.
So every desktop and tablet Studio tour uses `bar` — and `bar` is
`width: calc(100% - 24px); max-width: 680px`, centered (`stage.ts:935`). On a 1440px window it
paints x 380..1060, so the published band goes from **1440px wide to 680px**, and `intrudes` now
returns `false` for any cue target lying entirely in `[0, 380]` or `[1060, 1440]`. Those targets
used to be scrolled for and no longer are.

That is the correct direction — nothing is painted over them — but it is a behavior change in a
tour currently in the product, and it should be reviewed as one. What remains genuinely unclaimed
is the `progress`/`split` half: those two styles are the worst case and no shipped tour selects
them. `scrim`, the phone style, is full width and is unaffected either way.

The measurement that would close the remaining question is a target inventory of the shipped
Studio tour at 1440x900 and 820x1180, asking whether any cue target actually lands entirely in a
`bar` gutter. That was not done.
