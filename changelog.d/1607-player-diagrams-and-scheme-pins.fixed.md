- **Mermaid diagrams now reach the exported `.html` player with their labels.** The player
  sanitizes its slide DOM, and that sanitizer bars both things a Mermaid SVG leans on: the
  `<style>` mermaid injects into it, and `<foreignObject>` — where every node, edge and cluster
  label lives. Every exported player therefore shipped diagrams as shapes and arrows with no
  words, on both the CLI and the Studio. Each diagram is now baked to a self-styled SVG with
  native `<text>` labels (`flattenSvgStyles(…, { foreignObjectLabels: 'text' })`) before
  assembly, so the sanitizer stays strict and the diagram still reads. Charts are deliberately
  left token-driven — freezing their computed colors would pin them to the export-time scheme
  and kill the player's own light/dark toggle.
- **The Studio's Share → Webpage export renders its diagrams at all.** The browser render leaves
  a ```` ```mermaid ```` fence as a `<pre><code>` for the runtime to inflate, and the player ships
  no runtime — so the exported file froze the un-rendered form: raw Mermaid source on the slide,
  and a wall of it where Read·Article should have shown the diagram. The Studio now bakes the deck
  through the shared capture frame first, the browser-side twin of the CLI's own player capture.
  Runtime-inflated components (state-chart, function-plot) are baked by the same step.
- **A dark-authored deck no longer goes blank when the player is toggled to light.** The player
  replaces `light-dark()` with static CSS, which erased Lattice's per-slide scheme pins — so a
  `color-mode: dark` deck viewed in light gave every slide light surfaces under `--text-display`,
  a constant `#FFFFFF`: title, divider and closing rendered white on white. `section.dark` now
  carries the dark values in both player schemes, `.light`/`.color-light` keep light values in
  dark, and `.print` keeps its own band (previously overridden in dark mode, printing `#111111`
  ink on a `#001D33` canvas).
- **`waitForDiagrams` waits for the fences the runtime has not reached yet.** It counted only
  existing `.mermaid` boxes, and an untagged fence has none — so on the very deck it exists to
  wait for it saw nothing pending and returned at once. It now gates on the runtime's own
  `data-mermaid-state`, which also makes the PPTX/PDF raster of a diagram-heavy deck less racy.
