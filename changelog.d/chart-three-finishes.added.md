- The chart finish register resolves to three colour-forward looks — **pigment**
  (full strength in the body: pick it when you want colour), **etching** (in the
  line and the letter: the modern look) and **tone** (one hue carried in VALUE:
  the conservative, restrained look) — separating on mark body depth, which is
  present on 20 of 21 members and needs no gradient. The four-finish attempt that
  varied furniture opacity is kept as `finishes.superseded.spec.js`, since nobody
  could tell it apart on a chart without one.
- **The third finish is `tone`, not `ground`.** The competition picked `ground`
  and this line said so; the swap to `tone` was made afterwards with no record,
  which is why the two disagreed for a while. `tone` is the settled answer and
  `engineering/decisions/2026-09-07-chart-design-language/tone-is-the-third-finish.md`
  is where it is written down.
- **The register is a SPEC, not shipped engine CSS.** The three finishes exist as
  a generated stylesheet driven from `finishes.spec.js` and measured against real
  renders; no `finish:` value in `lib/` selects one yet. The `finish:` front-matter
  register that does ship is the backdrop layer, which is a different thing with
  the same word on it.
