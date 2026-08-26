---
status: in-progress
summary: >
  RETRACTION AND CORRECTION. The first version of this note claimed the parity harness had found
  six live defects — an extra line break in every exported math slide, a missing below-note wrap,
  and the `video` component rendering two different layouts — and concluded that "the string twin
  is stale and the DOM implementation is correct." That conclusion was wrong, and it was wrong
  because the harness was measuring the wrong thing, twice over. FIRST, `lib/engine`'s `render()`
  already runs `applyAllToHtml` itself (index.js:381), so feeding `render().html` to both paths
  handed them ALREADY-TRANSFORMED input: the string path's idempotence guards fired and it
  no-opped, so the comparison was an idempotence test wearing a parity test's clothes. SECOND,
  and still true after that was fixed, the runtime does prerequisite work BEFORE it calls
  `applyAllToDom` — `deckFrontMatterSource()`, `applyFormDefaultToDom` (which stamps the `form`
  class that masthead-lift keys on), `transformSlotLabels()` — and the harness calls
  `applyAllToDom` bare, so transforms run against sections that were never prepared. The
  divergences it reports are largely artifacts of that missing setup. What survives: the
  dom-provider itself, and the SVG finding that killed linkedom, both independent of the harness.
  The parity question is OPEN.
---

# Retracted: the transform-twin divergence findings were a harness artifact

**Date:** 2026-08-26 · **Status:** the findings are withdrawn; the tool needs work before its
numbers mean anything

The first version of this note is preserved only as the thing being corrected. It asserted, with
apparent evidence, that the two implementations of each registry transformer disagree in four
live ways and that the string side was wrong in all four. Neither the count nor the conclusion
holds.

## Two mistakes, in order

### 1. The harness fed both paths already-transformed HTML

`lib/engine/index.js:381` calls `applyAllToHtml` inside `render()`. The harness took
`engine.render(deck).html` as its input and ran both implementations on it — so both were handed
a document the transformers had already processed. The string path's idempotence guards did their
job and it no-opped; the DOM path did something slightly different to the same input. Every
"divergence" was a statement about idempotence, not about parity.

The tell was there and got walked past: the committed `video.gallery.light.pdf` — rendered by the
string path — shows the CORRECT video layout, which directly contradicted the claim that the
string path builds a masthead there. Checking the artifact against the claim is what caught this,
and it should have come first rather than last.

Fixed by stubbing `registry.applyAllToHtml` to identity BEFORE requiring `lib/engine`, so the
engine emits pre-transform HTML. The tool now also aborts if the engine's output still carries a
transformer's marker class, so this specific mistake cannot recur silently.

With that fixed, `video` compares **equivalent**. There was never a defect there.

### 2. The harness runs `applyAllToDom` out of context

This one survives the first fix and invalidates the numbers again. `lib/runtime/index.js` does
real work before it reaches the registry:

```
deckFrontMatterSource();        // deck-wide front matter, memoized
applyFormDefaultToDom(...)      // stamps `data-lattice-slide` + the `form` class
transformSlotLabels();
sharedTransformerRegistry.applyAllToDom(document);   // ← only now
```

The runtime's own comment is explicit: *"Must precede applyAllToDom (masthead-lift keys on
`section.form`)."* The harness calls `applyAllToDom` bare, so masthead-lift sees sections with no
`form` class and takes a different branch. That is exactly the shape of the largest remaining
divergence — the eyebrow `<p><code>` landing inside `masthead-lede` on one path and outside
`cell-masthead` on the other — and it is the harness's fault, not the code's.

So the current reading of 60 differing decks is not a finding. It is an unprepared DOM.

## What actually stands

- **`lib/core/dom-provider`** — parse and serialize with the environment's own parser. Independent
  of all of the above, and tested.
- **linkedom is disqualified.** It lowercases SVG element names (`<radialGradient>` →
  `<radialgradient>`, `<foreignObject>` → `<foreignobject>`); 0 of 5 preserved against jsdom's 5/5
  and Chromium's 5/5. That measurement never touched the harness and stands on its own. It remains
  the most valuable thing this work produced, because it was a silent-corruption trap hiding
  behind a real 17× speed win.
- **The Studio budget** (`docs/scripts/frame-baseline.json`) — also independent, also stands.

## What the harness needs before it is trusted again

Replicate the runtime's pre-steps — front matter, `applyFormDefaultToDom`, `transformSlotLabels`
— so `applyAllToDom` runs against the DOM the runtime actually hands it. Until then
`parity:transforms` should be read as "these two code paths were run in different conditions",
which is not a parity test.

The general lesson, worth more than the specific bug: **a comparison harness is a measuring
instrument, and an instrument that has not been calibrated against a known-good artifact reports
confident nonsense.** Both mistakes here would have been caught in minutes by checking the first
reported divergence against a committed PDF before writing any of it up.
