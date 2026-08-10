---
status: shipped
summary: WebKit painted the first h3 of a `math compare` slide twice — a ghost column label colliding with the h2, reported from a real iPad (#1554). The box that fragments is the EYEBROW paragraph, not the h3: `break-inside: avoid` on the h3 alone changes nothing, and an eyebrow-less compare slide never had the bug. Fixed by making the masthead band and the column labels atoms while leaving caption prose breakable — `> *` also clears the ghost but regresses an overflowing slide, relocating the caption whole and pushing the next h3 group off the page. Chosen over the structural alternative (retire the spanner, wrap each h3 group in a transformer-built column div, grid the body), which also cleared the defect in a prototype but costs a new cross-renderer transformer and re-renders every committed compare PDF. Four earlier oracles each cleared a visibly ghosted slide; the reasons are recorded here because the obvious ones do not work.
---

# `math compare` column children are atoms — and how not to test for it

**Symptom:** on a `math compare` slide, real WebKit painted the first `<h3>`
twice — once in its correct column, once as a ghost above the `column-span: all`
headline where it collided with the `h2`. Chromium rendered the identical DOM
correctly. Reported from an iPad (#1554).

## The fix

```css
section.math.compare > :is(h2, h3, p:has(> code:only-child):has(+ h2)) {
  break-inside: avoid;
}
```

The masthead band and the column labels are atoms. Caption prose deliberately is
not — see "what `> *` costs" below.

### Which box actually fragments

The issue title, and the first version of this note, both said WebKit fragments
the **`h3`**. That is the visible symptom, not the mechanism, and getting it
wrong matters because it points at the wrong fix. Measured over 8 compare shapes
× light/dark × 1180×820 and 1180×703, counting slides that paint every `h3`
exactly once:

| rule | clean |
|---|---|
| none (the shipped state before this change) | 12/32 |
| `> h3 { break-inside: avoid }` | **12/32** — the obvious fix does nothing |
| the eyebrow paragraph alone | **32/32** |
| the rule above | **32/32** |
| `> *` | 32/32 |

And a compare slide with **no eyebrow never had the bug at all**. What WebKit
fragments is the in-flow content that *precedes* the spanner; the duplicated
heading is a paint copy. So the eyebrow arm is load-bearing and must not be
dropped — `h2` and `h3` are belt-and-braces on boxes that never wanted to split.
Anyone "simplifying" this to `> h3` reopens #1554.

### What `> *` costs

`> *` is the tidier statement and it does clear the ghost, which is why it was
the first thing shipped here. It also makes **caption prose** an atom, and that
is a real regression on a slide whose caption is taller than its column: instead
of flowing across the boundary, the caption relocates whole, leaving a gap under
the equation and pushing the *next* `h3` group off the slide entirely. Rendered
through the export path on an overflowing fixture, the arms above are
**byte-identical to the unfixed engine** while `> *` is not. Found by the
maker-checker pass, not by a gate: the emulator flags the slide as clipped in
both states, so the overflow corpus check sees no new page.

### Chromium drift

Zero, **on slides that fit** — which is every committed one. `examples/adaptive-sweep.md`
is the only corpus deck using `math compare`; rendered with and without the fix,
31/31 rasterized pages are hash-identical, so no committed PDF churns. The
qualifier is the honest form of the claim: on an *overflowing* compare slide the
`> *` variant does move pixels, which is exactly why it is not what shipped.

## Why not drop the spanner (the structural option)

#1554 suggested costing a layout that has no spanner at all — a flex/grid two-up,
or one column `div` per `h3` group — since that removes the whole fragmentation
class rather than one instance of it. It was prototyped, not guessed at: injecting
a wrapper pass (`h3` + following siblings → `.compare-col`) and a
`grid-template-columns: repeat(N, 1fr)` body cleared the defect **32/32 in both
engines**.

It still loses on cost:

- The compare markdown is a flat sibling sequence with no wrapper divs, so grouping
  requires a **new transformer** carried on both render paths (`applyToHtml` +
  `applyToDom`) with the usual idempotence and parity obligations — real blast
  radius against HARD RULE #1.
- Replacing multicol with grid **changes Chromium's output**, so every committed
  `compare` PDF re-renders. The chosen fix changes nothing there.
- `column-fill: balance` and `column-rule` would need hand-rebuilding as grid gaps
  and borders, and the 3-column arm (`:has(h3:nth-of-type(3))`) re-derived.
- The `.katex-mathml { position: fixed }` workaround (math.styles.css) exists
  *because* of multicol. Dropping multicol would make it dead code to retire in
  the same breath, widening the change again.

One declaration that states an intent the layout already had beats a transformer
that restates the layout. Should `.compare` ever need a genuinely different
composition, the prototype above is the shape to start from.

## The part worth reading: four oracles that were WRONG

#1554's own summary is that the boxes are correct and only a rasterized view can
see the defect. That is true, and it is a sharper constraint than it sounds —
four successive oracles each certified a slide that is *visibly* ghosted.

1. **Count the h3's accent underline.** Each `> h3` carries a 2px accent
   border-bottom, so "one underline per column, all on one baseline" looks like a
   clean pixel invariant. It caught the baseline defect, and then cleared a
   candidate fix that stopped the *border* duplicating while the heading text still
   ghosted. An oracle keyed to one feature of an element only ever tests that
   feature.
2. **Ink outside the union of all element boxes.** Appealing — "every painted
   pixel is accounted for by some box" — and useless: a section's block children
   tile its entire content area, so a stray fragment always lands inside *some*
   box. It reported the known-broken slide perfectly clean.
3. **Hide every element, reveal one at a time, attribute ink per box.** This fixes
   (2)'s flaw by making the question per-element, and introduces a worse one: it
   perturbs the incremental layout under test. It also cleared a visibly broken
   slide.
4. **`elementsFromPoint` stray hits.** Deterministic, no pixels, zero false
   positives on Chromium — and it under-reports, because WebKit does not hit-test
   every painted fragment. It caught the ghost on one slide and missed a visually
   identical ghost on the next. `getClientRects()` is no better: it returns a
   SINGLE rect on the failing slide, so even the plural box API cannot see the
   second fragment.

**What works** is to treat the ghost as what it is — a pixel copy of the h3's own
glyph run. Binarize the slide against each row's modal colour, take each h3's
**tight glyph box** (a `Range` over its text) as a template, and search for a
second occurrence at the column origins ±16px. The tight box matters: the element
box spans the full column and carries the underline the ghost does not reproduce,
which drags the score under any usable threshold. Positions occupied by another
h3 are skipped — two short mono-caps labels ("Mean"/"Mode") share most of their
ink, and that resemblance is not the defect. Chromium's worst coincidental match
across the fixture set is 0.585 and a real ghost scores 0.72–1.00, so the
threshold sits at 0.65.

## Where the guard runs, and one honest limitation

`docs/e2e/math-compare-webkit.spec.ts`, tagged `@webkit-tablet` so the nightly
runs it. It drives the real Studio to Present — the reported surface, with the
real engine, the real bundled CSS and the real webfonts — and then **re-hosts the
presented document at top level** to read it.

What the `webkit-tablet` project contributes is the **engine**, not the box: its
1180×703 viewport is the Studio page's, while the document under test is rastered
on a probe page at 1280×900, large enough to hold the 1280×720 slide without the
page itself scrolling. The ghost reproduces at 1180×703, 1180×820 and 1400×900
alike, so the box is not the variable here — unlike #1227, where it was.

One trap worth naming, because the first cut of the spec fell into it: with
Present open there are **two** frames holding a `section.math.compare`, and the
composer's live preview comes first in `page.frames()`. A scan therefore reads
the wrong document, both arms can raster the same slide, and the failure message
names the wrong shape. The frame is reached through its owning element
(`[aria-label="Presented slide"] iframe.live`) and each arm pins its exact column
count, so neither can drift.

That last step is not tidiness. In headless WebKit the duplicate does not paint
while the document sits inside the Studio's `srcdoc` iframe; on real iOS Safari it
does, which is how #1554 was reported in the first place. The document is
byte-identical either way — verified by dumping both — so the fragment is a
property of the engine's markup and CSS, not of the host. Asserting inside the
iframe produces a spec that passes against the *unfixed* engine, measured rather
than assumed. The spec was checked in both directions: it fails on the unfixed
build with `"Method of moments" at 64,358 also at 656,220 (iou 1)` and passes on
the fixed one.

### Verifying a CSS fix against the docs site: two traps

Both of these produced confident, wrong measurements here before being caught.

**The docs site does not read `dist/lattice.css`.** It serves a content-hashed
copy under `docs/public/playground/v/<hash>/`, staged by
`docs/scripts/sync-playground-assets.mjs`. A root `npm run build` updates `dist/`
and leaves that copy alone, so a docs-site run can keep serving the *previous*
CSS indefinitely — and `astro preview` plus Playwright's `reuseExistingServer`
will happily hold that stale build across runs. The hash in the served
`@font-face` URLs is the tell: if it did not change, neither did the CSS. Check
the served bundle, not the source, before believing any result.

**`git stash push <file>` reverts to HEAD, not to `origin/main`.** On a branch
that already committed a first attempt, stashing the follow-up edit restores the
first attempt — so a "negative control" run that way tests the old fix and passes,
which reads as "the spec cannot fail". Use `git checkout origin/main -- <file>`
for a real before-state.

**UNVERIFIED:** real iOS Safari. It cannot be reached from this sandbox, so the
claim that the fix holds on the reporter's iPad rests on the defect and the fix
both being reproduced in the same WebKit engine build (Playwright's WebKit 26.0,
build 2215) on the same document.

## Related

- The sandbox **can** run WebKit — `npx playwright install-deps webkit && npx
  playwright install webkit`, about two minutes. `docs/playwright.config.ts` said
  the sandbox was Chromium-only, which is what stopped an earlier investigation of
  this exact report; that note is corrected in this change.
- #1554 notes the `webkit-tablet` tier only runs what is tagged, and no `@webkit-*`
  spec covered this component — which is why a shipping layout could be broken on
  an iPad with every gate green. This adds the first one for `math`; which other
  components warrant a standing WebKit raster pass is left open.
- `engineering/decisions/2026-06-28-experience-gating-playwright.md` § the
  `webkit-tablet` project — the tier that exists because WebKit diverges from
  Chromium in layout (#1227). This is a second instance of that class.
