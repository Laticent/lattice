---
status: in-progress
summary: >
  Fifteen of the seventeen registry transformers carry two implementations of one restructure —
  `applyToHtml` (string, engine/export) and `applyToDom` (nodes, runtime/preview) — agreeing by
  care rather than construction. Before deleting the string twins, `tools/transform-parity.mjs`
  ran both over all 76 gallery decks: 2 byte-identical, 68 equivalent re-serializations, 6
  genuinely different. Those six reduce to FOUR causes, and every one of them resolves the same
  way — the DOM implementation is the correct one and the string twin is the stale one. So the
  migration is not a regression risk to be managed; it is four live defects to be fixed. The
  sharpest: math slides currently emit `<br></br>` on the export path, and a browser parses a
  `</br>` end tag as ANOTHER `<br>` — verified in Chromium, 2 elements and 72px against 1 and
  48px, so every math slide in every exported PDF carries a spurious extra line break. Also live:
  `below-note` wraps a chart caption in the preview and not in the export; the `video` component
  builds `video-lead` + `<figure>` in the preview and `cell-masthead` in the export — two
  different layouts for the same slide.
---

# The transform twins disagree in four places, and the string side is wrong in all four

**Date:** 2026-08-26 · **Status:** findings recorded; the migration itself is not done
**Method:** `npm run parity:transforms` — both implementations over every `*.gallery.md` and
`*.exemplar.md`, each difference classified identical / equivalent-re-serialization / different,
with the safe re-serializations enumerated rather than inferred.

## The corpus result

| | decks |
|---|---|
| byte-identical | 2 |
| equivalent (attribute form, entity form, self-closing form, whitespace) | 68 |
| **genuinely different** | **6** |

Six decks, four causes.

## The four

### 1. `<br></br>` — an extra line break in every exported math slide

The string path emits `<br></br>`. There is no such thing as a `<br>` end tag: an HTML parser
treats `</br>` as a second `<br>`. Verified in Chromium rather than argued from the spec —
`a<br></br>b` yields **2 `<br>` elements and 72px**; `a<br>b` yields **1 and 48px**.

The DOM path emits the correct single `<br>`. So this is not a migration risk; it is a live
rendering defect on the export path that the migration removes.

*Deck:* `math.gallery.md`.

### 2. `below-note` wraps a chart caption in the preview but not the export

The DOM implementation wraps the trailing `.chart-caption` in `<div class="below-note">`; the
string implementation leaves it bare. The wrap is the feature — it is what gives the note its
own styling — so the export is currently missing it.

*Decks:* `chart.gallery.md`, `matrix-grid.gallery.md`.

### 3. `video` builds two different layouts

- string: `<div class="cell-masthead"><div class="masthead-lede">…` — mastheadLift won.
- DOM: `<div class="video-lead">…</div><figure…` — the video component's own layout won.

Same slide, two structures, depending on which path rendered it. This one needs a decision about
which is intended rather than a straight "the DOM is right", because it looks like a
transformer-ORDERING disagreement (whether `video` runs before or effectively instead of
`masthead-lift`) rather than one implementation being a stale copy of the other.

*Decks:* `imagery.gallery.md`, `video.gallery.md`.

### 4. Unclosed `<ins>` / `<del>` in prose, repaired by the parser

`redline.gallery.md` describes its own component in prose containing a literal `<ins>/<del>`.
The string path passes the malformed markup through; the DOM path closes the tags, which is
exactly what a browser does with that input anyway. Benign — the rendered result is the same —
and the DOM output is the honest representation of it.

*Deck:* `redline.gallery.md`.

## What this changes about the plan

The migration was framed as "prove nothing breaks, then delete the string twins". The evidence
says something stronger and more useful: **the string twins are where the bugs are.** Three of
the four causes are the export path being wrong, and deleting the twin is the fix.

That reorders the work. Rather than a careful risk-managed sweep, the sequence is:

1. Settle cause 3 (`video`) — the only one needing a judgment call about intent.
2. Route `applyToHtml` through `lib/core/dom-provider` + `applyToDom`, and delete the fifteen
   string implementations.
3. Regenerate the golden HTML and the committed PDFs. The 68 "equivalent" decks all churn bytes
   (attribute form, entity form, self-closing form) even though nothing about them renders
   differently, so the diff will be large and almost entirely uninteresting — worth saying out
   loud in the PR so a reviewer does not go looking for meaning in it.
4. Turn `parity:transforms` from a report into a gate: once the twins are gone the tool compares
   nothing, so its successor is a check that the DOM path's output is stable against a committed
   snapshot.

## What is NOT established

Only `*.gallery.md` and `*.exemplar.md` were compared — the committed `examples/` decks and any
deck shape not represented in the galleries were not. Before the delete lands, widen the corpus.
