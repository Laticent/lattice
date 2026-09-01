- Corrected three authoring rules that the Studio sends its model on every turn
  and that the agent kit ships verbatim as `authoring/rules.md`. The title slide
  is `# H1` → backtick eyebrow → subtitle, not eyebrow-first: the eyebrow is
  matched as the paragraph immediately after the h1, so the old order rendered it
  as a second subtitle with no error on any surface. There is no ` ```chart `
  fence — the engine rewrites `mermaid`, `functionplot` and `anima`, and the
  chart layouts are authored as nested Markdown lists. The nested-bullet rule now
  names all eleven card-style layouts plus `split-panel` / `split-compare` (it had
  drifted four behind `lint-core.js`) and states the indent width for both marker
  kinds: 2 spaces under `-`, 3 under `1.`.
- `premise`'s "Common mistakes" told authors to write each row as one flat line,
  contradicting its own slot table, its gallery and `premise.styles.css`. A row is
  a numbered term plus two bullets nested three spaces under it; a flat row leaves
  both columns empty.
