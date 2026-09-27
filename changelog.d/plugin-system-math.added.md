- **A plugin system, with math as its first plugin.** A plugin is one folder under
  `lib/plugins/<name>/` — a manifest that declares what it contributes and which plugins it
  needs, a grammar module, a renderer module, docs and conformance fixtures — and the build
  freezes every plugin into one registry the engine, the boundary parser and the linter all read.
  The build fails, naming the plugin, when a manifest and its code disagree, a required plugin is
  missing, the dependencies form a cycle, or two plugins claim one syntax trigger or token. Math (`$…$`, `$$…$$`, the `math` slide class) moved onto it with **no change to any
  render**: 4,059 engine renders across every tracked deck at three slide sizes and three math
  settings, and every boundary-parser token stream, are byte-identical before and after.
  `lattice packages list --type plugin` lists it. `createEngine({ math: false, mathOutput })`
  keeps working; `createEngine({ plugins: { disabled, options } })` is the general form. Design
  and roadmap (function-plot, Mermaid and the chart family next):
  `engineering/decisions/2026-09-27-plugin-system.md`.
- **Breaking:** math's internals moved into the math plugin. `lib/engine/math.js` is now
  `lib/plugins/math/math.render.js` and no longer exports `installMath`: install math (and every
  other plugin) on a markdown-it instance with `installPlugins(md, { family, options, disabled })`
  from `lib/plugins/host.js`. `lib/engine/math-detect.mjs` and `lib/core/math-block-rule.{js,mjs}`
  are now `lib/plugins/math/math.syntax.mjs`, which keeps the `sourceHasMath`, `hasDisplayMath`,
  `hasInlineMath` and `mathBlockRule` exports. Only code that deep-imports these files through the
  `./lib/*` export is affected; `@laticent/lattice/engine` and `createEngine` are unchanged.
