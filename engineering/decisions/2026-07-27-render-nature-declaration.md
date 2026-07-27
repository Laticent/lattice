---
status: shipped
summary: Every visualization declares `render` (svg | hybrid | html) plus a `renderNote` justifying it, and the declaration is derived from the real rendered export in a browser and gated — because the branch before this one found four hand-maintained claims that had gone false. The taxonomy half is documentation only: `substance` is what separates a chart from a diagram, `bucket` is a folder, chart-family membership is a shared skeleton, and `render` is construction material.
---

# Declaring what a visualization is drawn with — `render` + `renderNote`

**Date:** 2026-07-27
**Status:** Adopted
**Touches:** `lib/components/manifest.schema.json`, the 14 visualization manifests,
`tools/check-render-nature.js` (new), `checkRenderNature` in `tools/check-ownership.js`,
`tools/build-component-docs.js`, `tools/build-docs-portal.js`, `design/design-system.md`,
`design/concepts.md`, `lib/components/chart/_chart-family/chart-family.docs.md`

---

## 1. The complaint

> "one thing that bothers me is we have no way to distinguish which are pure svg,
> which are hybrid and which are html. the definition of chart vs diagram vs
> something else is also not easy to understand. they are all related [as]
> visualizations right? i wonder if the manifest should have fields to tell us of
> their nature. and justification tailored to them"

Two problems, stacked. The catalog could not say what a component was **made of**,
and the words it used for **what a component is** were overloaded to the point of
being misleading.

## 2. Why "made of" is a real question, not trivia

Three shipped behaviors depend on it and on nothing else in the manifest:

- **Motion.** `chartToScene` (`docs/src/lib/chart-anima.ts`) reads the FIRST `<svg>`
  in a section and animates what it finds. A component with no `<svg>` gets no
  scene and the poster silently stays up — the chart looks right and never moves.
  In a hybrid, the HTML half sits still while the SVG half animates.
- **Mark detail.** The popover addresses `[data-mark]`; which parts can carry one
  follows from what they are.
- **Export.** An SVG export of a figure captures the SVG side, and nothing else.

Before this change the only place any of that was written down was a hand-typed
prose table in `chart-family.docs.md`.

## 3. Why declaring it is not enough

The branch immediately before this one (#1189, SVG-ifying the diagram charts)
spent most of its effort on hand-maintained claims that had quietly gone false:

- a motion role map keyed on a CSS class no kernel has ever emitted — the entry
  read as "radar shapes animate" while the shape silently never built;
- a role gate that scanned kernel SOURCE for `data-mark`, and so was blind to
  every mark emitted through a helper — it reported zero offenders with the roles
  deleted;
- three committed artifacts that no longer reproduced from their source;
- four documented support claims that were wrong.

A new manifest field is another hand-maintained claim. On this evidence, adding
one without a derivation would be repeating the mistake in a new place.

But the fact IS derivable — the whole classification table below was produced by a
throwaway script in an afternoon. So the shape of the answer was already implied:
**declare for intent, derive for truth, gate the agreement.** That is the repo's
existing idiom (`checkAdaptDeclarations` cross-checks `adapt.mode` against the CSS;
the CSS-mirror test; the emitter role gate), applied to a new fact.

## 4. The fields

```jsonc
"render": "svg" | "hybrid" | "html",   // what the picture is DRAWN with
"renderNote": "…"                       // why THIS component is built that way
```

Required for the visualization family — bucket `chart` or `diagram` — and
**rejected everywhere else**. That second direction matters: the derivation only
covers the visualization family, so a `render` on a prose component would be
exactly the ungated assertion this mechanism exists to prevent. Silence outside
the family is the correct state, not an omission.

`renderNote` is the "justification tailored to them" the ask named. It says what
each side is made of and what forced the choice — a shared coordinate system, a
measured box, arbitrary rotation, text that must stay selectable. Two shapes are
rejected by the gate: a note that only restates the enum ("renders as SVG"), and a
`hybrid` note that never says which part is which, since that seam is the entire
value of the hybrid verdict.

## 5. The derivation, and the surface it runs on

`tools/check-render-nature.js`.

**The surface is the export, not the engine's HTML** (HARD RULE #23). Deriving
from `engine.render()` alone gets two components wrong on principle: `diagram`
emits a ```mermaid fence that mmdc turns into SVG at build time (it would derive as
`html`), and `state-chart` emits an `<ol>` that the browser pass measures and
repaints into an SVG overlay (the repaint would be invisible). So the gate renders
each component's gallery through `lattice-emulator.js`, takes the HTML sidecar it
drops — mermaid already baked — loads it in headless Chromium so the runtime pass
runs, and measures the live DOM. Same idiom as `tools/check-svg-scaling.js`, which
measures the same sidecar.

**The measurement is deliberately dumb**, so there is nothing to argue with. Inside
each slide's picture (`.chart-body` for chart-frame members, `.mermaid-svg` /
`.mermaid-fallback` for diagrams), every VISIBLE text node and every visible shape
is attributed by one question: is it inside an `<svg>`? An HTML element carrying
`[data-mark]` counts as HTML content even with no text. Both sides present →
`hybrid`; one side → that side; neither → `empty`, which is always an error.

Three things are deliberately subtracted, and only three: the masthead / header /
footer (outside the stage cell), the read-as caption `.chart-caption` (a sentence
ABOUT the picture — counting its prose would make every captioned SVG chart read
as hybrid), and anything not visible (`getClientRects().length === 0`, which is how
state-chart's hidden `<ol>` correctly stops counting after the paint).

**No threshold.** Radar is `hybrid` on the strength of one 22-character HTML
`<figcaption>` under each small-multiple. A threshold would have rounded that to
`svg` and hidden precisely the seam an author needs to know about. The same rule
makes word-cloud hybrid for its HTML accessibility key.

**Coverage is per-component, not per-bucket.** It renders each component's OWN
gallery, so every shipped variant is in scope — radar's `mini` variant is exactly
the case a single bucket-gallery slide would have missed. A component's verdict is
the OR across its slides: if any shipped variant mixes the two, the component
mixes the two.

Cost: ~2 minutes, one emulator build per component. It skips loudly (exit 0, a
notice, nothing claimed) when no Chromium is resolvable.

## 6. Two gates, split by what needs a browser

| | Where | Runs in | Catches |
|---|---|---|---|
| **Coverage** | `checkRenderNature`, `tools/check-ownership.js` | `build:check` (browser-free, every PR) | a visualization that declares nothing; a non-visualization that declares anything; an empty or one-sided note |
| **Truth** | `tools/check-render-nature.js` | `npm run check:render-nature`, on demand | a declaration that disagrees with the rendered export |

The split is forced: `build:check` must stay browser-free, and truth cannot be
established without a browser. Saying so plainly is better than putting a
jsdom stand-in in `build:check` and calling the field verified.

## 7. What it derived

Ground truth at the time of writing, from the real export:

| Component | `render` | Why (short) |
|---|---|---|
| `diagram` | svg | mmdc bakes the fence to SVG; node labels ride in `<foreignObject>` |
| `funnel` | svg | the taper is geometry — a band's width IS the conversion |
| `gantt` | svg | bars and the date axis share one coordinate system |
| `map` | svg | the geography is literally path data |
| `piechart` | svg | wedges are arc paths; the legend shares their space |
| `quadrant` | svg | points placed by value on two axes; label placement needs them together |
| `journey` | hybrid | HTML board (a table of text) with an SVG mood curve drawn across it |
| `radar` | hybrid | SVG polygons; the small-multiples variant captions each mini in HTML |
| `state-chart` | hybrid | authored `<ol>` measured, then painted into the SVG overlay |
| `word-cloud` | hybrid | SVG words (arbitrary size and angle); HTML key for reading order |
| `kanban` | html | text cards in named columns — no geometry to draw |
| `progress` | html | one number per row; a `<div>` width needs no coordinate system |
| `roadmap` | html | a real `<table>`; nothing is positioned by value |
| `timeline-list` | html | the only geometry is the ordering, and document order carries it |

Six SVG, four hybrid, four HTML. The four HTML members are not a backlog — each
`renderNote` argues that HTML is the right answer for that layout, and rewriting
them in SVG would trade real text selection, wrapping and reflow for nothing.

## 8. The taxonomy half — documentation only

The second complaint ("chart vs diagram vs something else is not easy to
understand") is a naming collision, not a modeling error, so it is fixed in prose:
no renames, no manifest churn.

The word *chart* does four independent jobs:

| The thing | Where | What it answers |
|---|---|---|
| `substance` | manifest | what the AUTHOR writes — `series` (table), `graph` (network), `structure` (hierarchy), `prose` |
| `bucket` | manifest + folder path | which directory the files sit in. Nothing else. |
| chart-family membership | `CHART_LAYOUTS` in `chart-family.js` | whether the dispatcher wraps it in `.chart-frame` |
| `render` | manifest, gated | what the picture is drawn with |

**Substance is what separates a chart from a diagram** — series versus graph. That
is the real distinction and the one authors should learn. The bucket is a folder;
membership is a shared skeleton; `render` is construction material. The components
where they disagree make the point: `state-chart` is a graph, in the chart folder,
wearing the chart frame, drawn hybrid.

One false claim was removed on the way: `design/design-system.md` §5's substance
table carried an "Output" column reading DOM · DOM · SVG · SVG. Four of the
thirteen chart components draw no SVG at all, so the column was wrong — and it was
plausibly the seed of the confusion, since it taught that `series` means SVG.

`render` is deliberately **not** added to the concept ontology
(`lib/concepts/concepts.json`) and is not a fifth design axis. The four axes decide
what a slide is and how it is composed; `render` records how one family of them is
built. It changes nothing about how an author picks a component — only what they
can expect it to do once picked.

## 9. Alternatives rejected

**A hand-maintained field with no derivation.** Cheapest, and the exact failure
mode §3 documents. Rejected on this branch's own evidence.

**Derive only, no declaration.** A generated catalog with no declared intent
cannot fail: whatever the component renders becomes the truth, including a
regression. Declaring intent is what makes disagreement meaningful — the same
reason `adapt.mode` is declared rather than inferred from the CSS.

**Require `render` on all 59 components.** 45 more declarations, all trivially
`html`, none of them derived (the derivation covers the visualization family), and
the discriminating power of the field diluted to nothing.

**Threshold or allowlist so "mostly SVG" reads as `svg`.** Every threshold is an
argument waiting to happen, and the parts it would round away — radar's captions,
word-cloud's key — are exactly the parts an author is surprised by.

## 10. Consequences

- A new visualization component cannot ship without saying what it is made of and
  why; `build:check` fails on the omission.
- A component that changes construction (an SVG rewrite of `progress`, say) fails
  `check:render-nature` until its declaration and note are updated with it.
- `chart-family.docs.md`'s prose support table is no longer the authority on what
  a member is made of; it now points at the field and the gate.
- The truth gate is on-demand, so a mismatch can sit undetected between runs. That
  is a real, accepted gap: running two minutes of Chromium on every PR to re-verify
  a field that changes a few times a year is not worth the merge-train cost. It
  belongs in the pre-merge sweep for any PR touching a visualization kernel.

## 11. Unverified

- The derivation reads the **HTML sidecar** surface. The PPTX and standalone-SVG
  export paths are not measured; a component whose nature differs there would not
  be caught. No component is known to differ today.
