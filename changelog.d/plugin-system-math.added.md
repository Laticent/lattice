- **A plugin system, with math as its first plugin.** A plugin is one folder under
  `lib/plugins/<name>/` — a manifest that declares what it contributes and which plugins it
  needs, a grammar module, a renderer module, docs and conformance fixtures — and the build
  freezes every plugin into one registry the engine, the boundary parser and the linter all read.
  The build fails, naming the plugin, when a manifest and its code disagree, a required plugin is
  missing, the dependencies form a cycle, or two plugins claim one syntax trigger, token or
  component. Math (`$…$`, `$$…$$`, the `math` slide class) moved onto it with **no change to any
  render**: 4,059 engine renders across every tracked deck at three slide sizes and three math
  settings, and every boundary-parser token stream, are byte-identical before and after.
  `lattice packages list --type plugin` lists it. `createEngine({ math: false, mathOutput })`
  keeps working; `createEngine({ plugins: { disabled, options } })` is the general form. Design
  and roadmap (function-plot, Mermaid and the chart family next):
  `engineering/decisions/2026-09-27-plugin-system.md`.
- **Moved:** `lib/engine/math.js` → `lib/plugins/math/math.render.js`, and
  `lib/engine/math-detect.mjs` + `lib/core/math-block-rule.{js,mjs}` →
  `lib/plugins/math/math.syntax.mjs` (`sourceHasMath`, `hasDisplayMath` and `hasInlineMath` keep
  their names). A consumer that imported one of those files through the `./lib/*` export updates
  the path.
