- **Changed: a deck's Mermaid diagrams now render in ONE `mmdc` invocation instead of
  one per diagram.** `mmdc` boots its own Chromium, and it was booting one for every
  fence — ~2.9s each, which on the 14-fence diagram gallery was 40.7s of a 44.3s render.
  Measured across the 118 fences in the example and gallery corpus: **454.5s → 245.5s,
  a 46% cut in total render wall.** A deck with a single diagram is unaffected; the
  saving scales with fence count and wins from two fences up.
- Batching is safe across theme bands because each fence carries its own baked
  `%%{init}%%` palette, so a light fence and a dark fence in one batch still render with
  their own colors. If a batch cannot be completed the renderer falls back to one
  invocation per diagram, keeping the existing per-diagram retry and per-diagram
  fallback — one malformed fence still costs only itself.
- **Fixed along the way: every diagram now gets a unique SVG id on every path.** The id
  isolation that keeps one diagram's embedded `<style>` from overriding another's
  previously lived only in the one-at-a-time renderer. It now runs wherever a diagram
  is finished, so batched and unbatched output are identical.
- New `tools/diagram-oracle.mjs` captures a per-fence hash of every baked diagram in
  the corpus and compares two captures, so a change to the diagram path can be shown to
  alter nothing rather than asserted to.
