---
status: proposed
summary: "DECIDED, NOT YET BUILT (status `proposed` = the code is not written; the decision is). #1385 asked whether the export MUST bake Mermaid before `engine.render`, because the source-side slide reconstruction (`lib/core/slide-class-spans.js`) exists only because it does. Measured rather than argued: of the 9 real `rawMd` reads in lattice-emulator.js, ONE wants the baked form (the render itself), one is actively HARMED by it (the player envelope ships baked SVG as the deck's 'verbatim source', so a recipient re-importing gets frozen diagrams), and seven are indifferent — plus a tenth site that is not a `rawMd` read at all because the chart narrator already pays to route AROUND the ordering. `engine.render` is called EXACTLY ONCE on this path, so the ordering buys no re-render amortization either. Nothing requires it: the ordering is an accident of module-evaluation position, not a constraint. Verdict — SCHEDULE THE INVERSION (render first, bake per `<section>`), which deletes the reconstruction, its 651-deck corpus gate, and the SVG-back-through-markdown-it hazard that already shipped one bug. It is NOT done here: it is a rewrite of the emulator's diagram stage that would swamp a four-fix branch, and it needs the image-set cross-scheme re-bake's index alignment carried deliberately. What lands here is the decision, the evidence, and the plan — so the next person maintaining the reconstruction knows it is on a retirement path rather than a growth one."
builds-on: 2026-06-06-mermaid-dual-render-prune.md
---

# Bake-before-render is an accident, and the reconstruction it forces should be retired

## The question

`lib/core/render-diagrams.js` opens with a design premise:

> "THE WHOLE DIFFERENCE IS ONE PORT. … the two renderers differ in exactly one
> respect: HOW YOU READ A TOKEN FOR A SLIDE. … Everything else — **which slides
> exist**, which palette each one resolves … is identical logic."

`lib/core/slide-class-spans.js` is the proof that it is not. The preview learns
which slides exist by asking the DOM. The export learns it by **reconstructing the
source** — re-parsing the markdown with a second markdown-it, re-deriving slide
boundaries, and re-resolving the directive grammar. #1332 unified the *walk* and
left the divergent *input* to the walk in place.

That second answer has produced eight defects: #1326 (×4), #1329, #1340, and the
three closed by #1384. Every fix has been another layer on the reconstruction.
#1385 asked whether the reconstruction should exist at all.

It exists because of an ORDER. `preprocessMermaid(md)` runs at module-evaluation
time in `lattice-emulator.js`; `engine.render(...)` does not happen until
`engineSlides()` is called, well below it. Because the bake runs first, it has no
`<section>` to read — so it reconstructs one.

(Sites are named, not line-numbered, throughout this record. An earlier draft
cited lines; they were captured mid-branch and were already 6–17 off in both
directions by the time it was read, which for a record whose whole argument is
"go read these nine sites" is load-bearing.)

## What the evidence says

**The ordering is required by nothing.** `rawMd` appears 14 times in
`lattice-emulator.js`; **nine are real reads** (the rest are comments). Named by
their call site rather than by line, because these move:

| Read | Wants the baked form? |
|---|---|
| `engine.render(…)` | **yes** — this is the consumer, and the only one |
| `stripSharedSource(rawMd, …)` → the player envelope's `source`, documented in `lib/export/player-core.mjs` as *"verbatim LFM source"* | **actively harmed** — it ships baked SVG where a re-importer expects fences |
| `applyDeckLogoToHtml`, `parseFm`, `acronymSpokenMap`, `lexiconMap`, `frontMatterCaptions`, `frontMatterLang`, the `fmMatch` front-matter slice | **no** — front matter (one of them, `parseFm`, also reads the BODY, for the document title off the first `#` heading; a baked `<svg>` yields no heading, so it does not care either) |

So: **1 for, 1 actively against, 7 indifferent.**

And a tenth site that is not a `rawMd` read at all but belongs in the tally
anyway — the chart narrator **routes around** the bake, re-deriving
`appendAutoGlossary(md)` from the fence-intact source precisely because `rawMd`'s
fences are gone. A consumer paying to undo the ordering is evidence about the
ordering.

**`engine.render` is called exactly once** on this path (grep: one call site, one
invocation). There is no re-render the early bake amortizes — the measured split
loop re-cuts the DOM in the browser, it does not re-parse markdown. The obvious
defence of the current order ("bake once, survive N renders") does not apply.

**The target DOM shape is already known-good.** The RUNTIME path bakes per
`<section>` today — that is what the preview does. Inverting the export makes it
do what the other render path already does, which is the direction HARD RULE #1
points.

## What the inversion deletes

- `lib/core/slide-class-spans.js` and its whole defect history.
- `test/unit/core/slide-class-span-parity.test.js` — a 651-deck corpus gate that
  exists only to police the reconstruction.
- The hazard of **SVG passing back through markdown-it**. Not theoretical, and
  not merely reproducible — it already shipped. `lattice-emulator.js` carries a
  live `<text>`-collapsing workaround for Mermaid sankey (gated on the
  `<g class="links"` marker), which emits `<text>Wages\n750</text>`;
  markdown-it reads the blank line inside the inlined SVG as a paragraph break and
  produces invalid `<text>Wages<p>750</text>`, visible as run-together labels. The
  worse sibling reproduces on the current engine — content carrying `\n\n---\n\n`
  spliced into the source yields **3 sections where the source declares 2**:

  ```js
  const spliced = 'a\n\n---\n\nb';   // as a diagram label would arrive
  // a 2-slide deck with that spliced in → sections: 3
  ```

  Under render-then-bake, SVG never reaches a Markdown parser and the sankey
  workaround can go with it.
- The lossy "lossless" bundle. The emulator ships `stripSharedSource(rawMd, …)`
  as the player envelope's `source` — documented in `lib/export/player-core.mjs`
  as **"verbatim LFM source"** — and `rawMd` has
  every ` ```mermaid ` fence already replaced by baked SVG. A recipient
  re-importing a shared deck gets frozen diagrams, not diagram source.
- The chart-narration workaround, which re-derives a fence-intact source
  *because* the bake ran too early.

## The honest cost

**Reorientation.** `reorientMermaidForPortrait` rewrites a diagram's DEFINITION
(LR/RL → TB/BT on a portrait deck) and must run before mmdc. Rendered HTML carries
the definition only as hljs-tokenized, entity-escaped `<code>`. But this is the
easy half: fence order is stable between source and render, so an order-indexed
list of raw definitions captured before the render suffices. The hard half —
*which slide* — comes free from the `<section>`.

**The image-set cross-scheme re-bake.** `MERMAID_REBAKE_DEFS` and
`MERMAID_REBAKE_MODES` are index-aligned with the `data-mmd-idx` stamp on each
rendered `.mermaid-svg`, and a cross-scheme `--image-mode` export re-renders a
diagram only when its own bake mode differs from the look. That alignment is
built during `preprocessMermaid` today and has to be carried deliberately, not
inherited. It is the one piece of the inversion that can go silently wrong.

**Blast radius.** This is a rewrite of the emulator's whole diagram stage, not a
refactor of one function — which is why it is scheduled here rather than done
here. Folding it into a branch that already carries four other fixes would make
every one of them harder to review, and it is precisely the kind of change
HARD RULE #25 says gets the adversarial trio on its own.

## The decision

**Schedule the inversion.** Bake-before-render is not justified: nothing between
the two points needs the baked SVG, the one read that wants it is the render
itself, and two other reads are already paying for the ordering.

Until it lands, `lib/core/slide-class-spans.js` is on a **retirement path, not a
growth path**. A new defect in it is a reason to weigh bringing the inversion
forward, not a reason to add a fourth layer. `engineering/mermaid.md` §5.3.1
records, as a lesson, that "a second answer to a question the renderer already
answers will drift"; this is that lesson applied to the module the lesson was
written about.

### The plan, in the order it should land

1. **Capture raw definitions before the render**, order-indexed, and stop
   rewriting the source. `preprocessMermaid` becomes `collectMermaidFences` —
   same reorientation, same `MERMAID_REBAKE_*` alignment, no substitution.
2. **Render.** `engine.render` receives the deck with its fences intact, so
   ` ```mermaid ` arrives as a `fence` token — exactly what the runtime path sees.
3. **Bake per `<section>`**, walking the rendered document. The slide's class is
   read off the section (`readClassAttr`), which is what the preview already does,
   so `resolveDiagramBand`'s two callers converge on one input shape.
4. **Delete** `slide-class-spans.js`, its parity gate, and the sankey `<text>`
   workaround; point `stripSharedSource` and the chart narrator at the now-intact
   source and drop the `appendAutoGlossary(md)` re-derivation.
5. **Verify** on the real surfaces: the 74-gallery regression gate at both moods,
   a cross-scheme image-set export (the index alignment), and a shared `.html`
   re-imported into the Studio with its diagrams still editable — the last being
   the user-visible win, and the one no unit test reaches.

Steps 1–3 are one change; 4–5 cannot be split from it.
