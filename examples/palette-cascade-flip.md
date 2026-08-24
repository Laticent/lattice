---
marp: true
theme: indaco
paginate: true
header: "Lattice · palette cascade (#1527)"
---

<!-- _class: title -->

# The palette wins the cascade

`Export · Theming · #1527`

Every surface on this deck is painted from a token the exported PDF used to ignore.

---

<!-- _class: content -->
<!-- _footer: "What changed" -->

`the one-line change`

## The engine sheet loads first, the palette last.

- The order every theme declares
  - Each `themes/*.css` opens with `@import 'lattice';`, which means the engine's rules come first and the theme's own win at equal specificity.
- The order three of four sites already used
  - The Mermaid token reader, `engine.addThemes` and the Studio's composed sheet. Only the export bundle disagreed.
- What that cost
  - 925 declarations across 37 tokens, on all 32 palettes, resolved to the engine's value. A deck looked one way in the Playground and another in the PDF.

Render this deck at any palette: what you see is what that palette's author wrote.

---

<!-- _class: code -->
<!-- _footer: "The twelve --hljs-* tokens" -->

## Each palette's own syntax ramp paints now.

```js
// Before the flip this panel showed Night Owl's purple and pink on every theme.
// Now it shows whatever ramp the chosen palette curated for its own code panel.

const ENGINE = readFileSync('dist/lattice.css', 'utf8');
const PALETTE = themeChain(name).map(readTheme).join('\n');

function deckStylesheet() {
  // Parent first, engine first: a palette ':root' then beats the base's at
  // equal specificity — which is what `@import 'lattice';` meant all along.
  return `${ENGINE}\n${PALETTE}\n/* lattice:palette-end */`;
}

export const cascade = deckStylesheet();   // one order, every render path
```

Try `cuoio` for warm terracotta and amber, `ardesia` for muted slate and teal.

---

<!-- _class: checklist -->
<!-- _footer: "--pass · --warn · the state marks" -->

## The status trio comes from the palette, not the engine.

- [x] Done rows take the palette's own pass ink
- [-] Partial rows take its warn ink `amber`
- [ ] Open rows keep the neutral ring
- [x] An achromatopsia palette paints three grays
- [/] Descoped rows stay struck and muted
- [-] Three signals, three weights, one palette

On `a11y-achromatopsia` these were engine green and amber — one gray to the reader they are for.

---

<!-- _class: gantt -->
<!-- _footer: "The --diagram-* state family" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## Plan bars take their status tints from the palette.

Nine of these tokens used to resolve two ways in one render — the baked SVG from the palette, the CSS around it from the engine.

- Cascade
  - Measure it `Q1..Q2` `done`
  - Sweep it `Q2..Q3` `done` `after: Measure it`
  - Flip it `Q3..Q4` `live` `after: Sweep it`
- Palette
  - Respace `Q3..Q4` `at-risk`
  - Concrete `Q4` `milestone` `after: Respace`
- Prober
  - Per-fragment underlays `Q3..Q4` `done`

---

<!-- _class: redline -->
<!-- _footer: "Own-hue bands: --pass-bg / --fail-bg" -->

## The struck clause sits on a tint of the palette's own red.

`lattice-emulator.js:847 · #1527`

> The deck stylesheet is assembled as <del>the palette then the engine bundle</del> <ins>the engine bundle then the palette</ins>, so a token the palette declares at `:root` <del>loses to the engine default</del> <ins>wins</ins> at equal specificity. A palette's syntax ramp, status trio and diagram state family therefore <del>resolve to the engine's value on the export path while the Playground shows the palette's</del> <ins>resolve the same way everywhere</ins>, and the nine tokens read by both the stylesheet and the Mermaid token map <del>can no longer</del> <ins>no longer</ins> paint a bar and the rule beside it from one name and two values.

- **Why this matters.** The ink and the band behind it both move with the token, so this surface is where a palette's status hue is hardest to read — and where the sweep found the numbers that mattered.

---

<!-- _class: closing -->
<!-- _footer: "#1527" -->

# Same deck, same palette, one cascade

`One order · every render path`

Preview and export finally agree.
