---
status: shipped
summary: >
  `--border` draws every card, table rule and frame in the engine — 150 read sites across 52 files
  — and 50 of 64 palette-modes shipped an edge no contrast meter could find, `indaco` worst at
  1.11:1. The 14 that cleared were exactly `onyx` and the five a11y palettes inheriting it, at
  17-21:1, which is why a spot check always looked reassuring. Two gates were close enough to read
  as coverage: `theme-surface-aa` runs an INK-on-SURFACE matrix that `--border` is not a member of,
  and `check-slide-contrast` does not merely skip the token but EXEMPTS it, bucketing runs painted
  with it as decorative. The fill cannot carry the boundary (`--bg-alt` is ~1.08:1 against `--bg` by
  design, and a card that separated at 3:1 would be a slab), so the border owes contrast against
  both surfaces it touches. Re-curated lightness-only, in-hue, minimum step: 64 of 64 now clear.
  Gated by `surface-boundary-contrast.test.js`, filesystem-derived and floored at 30 themes.
---

# The card boundary: one token, 150 read sites, and no gate

**Status:** shipped.
**Scope:** `--border` across all 32 palettes, both color schemes.
**Related:** #1759 (the same defect shape in `--diagram-stroke`), #1730 (the stale-gallery backlog this change's rebuild clears), `test/unit/palette/surface-boundary-contrast.test.js`.

---

## 1. What was measured

A card has three candidate edges. Its fill against the canvas, its border against the
canvas, and its border against its own fill. If any one clears 3:1 the card has a
visible boundary. Across all 32 themes in both schemes — 64 palette-modes:

```
                fill/canvas   border/canvas   border/fill      best
indaco  light      1.09           1.21           1.11          1.21:1
cuoio   light      1.09           1.32           1.21          1.32:1
concrete light     1.35           1.99           2.70          2.70:1
onyx    light      1.09          17.40          15.96         17.40:1
a11y-base light    1.09          17.40          15.96         17.40:1
```

**14 of 64 cleared. Median best edge: 1.54:1.**

The 14 were not scattered. They were exactly `onyx` and the five a11y palettes that
`@import` it, in both schemes — 7 × 2. Every brand palette failed; every
accessibility palette passed by a factor of six.

## 2. Why the split existed, and why it hid the defect

Both regimes are authored deliberately, and each says so in the value:

```css
themes/onyx.css:58    --border: light-dark(#1A1A1A, …);  /* heavy black border light-mode */
themes/indaco.css:90  --border: light-dark(#E4EAF2, …);  /* hairline rule */
```

So this was never drift in the sense `--diagram-stroke` was. It was two intentions,
neither recorded as a contract and neither enforced — and the accessibility family
sitting at 17:1 is precisely what makes a spot check reassuring. Open `onyx`, see
17:1, conclude the token is healthy, and never look at the other 26.

## 3. Why no gate caught it

Two gates were close enough to look like coverage.

`theme-surface-aa.test.js` runs the `contrast-audit` PAIRS matrix over all 32 themes.
That matrix is **ink on surface** — a foreground text color against a backdrop.
`--border` is neither an ink nor a surface, so it was never a member of the
population. The gate's own scope statement is accurate; the token simply falls
outside it.

`check-slide-contrast.js`, the rendered-DOM gate that has found every contrast defect
this repo has shipped, does something stronger than skip `--border`. It **exempts**
it: the token is resolved through a probe element and its color added to
`exemptInks`, so any run painted with it is bucketed as decorative rather than
scored. The rationale is sound for what it was written for — `split-panel.steps`
paints an oversized decorative numeral with `--border` — but the effect is that the
one gate measuring real pixels was told by construction to look away from the token
drawing every card in the system.

## 4. Why the border and not the fill

A card is a fill plus a boundary, and only one of the two can carry the load.

The fill cannot. `--bg-alt` sits at ~1.08:1 against `--bg` on every palette, and that
is not an accident either — a card tint that separated from the canvas at 3:1 would
read as a dark slab, not a card. Raising it would change what a Lattice card *is*.

So the border owes the contrast, and it owes it against **both** surfaces it touches:
the canvas outside and the card fill inside. Clearing only one leaves an edge that
dissolves on the other side, which is why the gate asserts the pair rather than the
better of the two.

## 5. The repair

Lightness only, in each palette's own hue and chroma — the same shape as #1759's
`--diagram-stroke` fix, and the same reason: the value was a good hue at the wrong
lightness. The search takes the minimum step that clears 3:1 on both surfaces, so no
palette is darkened further than it has to be. Typical move is ΔL 0.20–0.29;
`concrete`, already the closest, needed 0.10.

`onyx` is untouched, and so is the a11y family through it. `carbone` keeps a single
flat value because it is a dark-only palette whose two schemes resolve identically.

**Result: 64 of 64 palette-modes clear, median best edge 3.57:1.**

## 6. The blast radius is the whole system, and that is the point

`--border` has **150 read sites across 52 files** — cards, table rules, kanban lanes,
math frames, image and video chrome, code panels, kpi tiles, chart hairlines. This is
a larger surface than `--diagram-stroke`'s fourteen Mermaid keys, and unlike that
change it is not confined to one component family. Essentially every deck moves.

That also settles a question #1759 had to answer the other way. There, a full artifact
rebuild was **off** the path — 96% of the churn belonged to #1730's stale-gallery
backlog rather than to the change, and the artifacts were restored to main's bytes.
Here a full rebuild is **on** the path: the token this change moves is read by nearly
every component, so the galleries would have to be re-rendered whether or not a
backlog existed. #1730's backlog is cleared as a consequence, not as a smuggled-in
side quest.

## 7. What is deliberately NOT claimed

- **This judges declared token values, not composed surfaces.** A component that
  tints `--border` down with `color-mix` renders below what the gate reports, and one
  that paints its own edge from a categorical token (`kanban`'s lane, `journey`'s
  stage) is outside this gate entirely and belongs to its own. Like the diagram
  non-text gate, this never reports a failure that is not real; it can miss one.
- **`--bg-alt` vs `--bg` is left at ~1.08:1 on purpose** — see §4. It is not a
  boundary and is not gated as one.
- **`--surface-inverse` vs `--bg` is 1.00:1 on dark on many palettes**, because the
  dark bookend panel *is* the dark canvas there. That is coherent, not a defect, and
  forcing 3:1 on it would be meaningless.
- **`check-slide-contrast.js` still exempts `--border`.** Narrowing that exemption to
  the decorative numeral it was written for is a separate change; the static gate
  added here does not depend on it.
