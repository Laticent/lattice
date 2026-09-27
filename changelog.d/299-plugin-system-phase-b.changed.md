- **Function plots run on the plugin host.** A ` ```functionplot ` fence is now the `function-plot`
  plugin (`lib/plugins/function-plot/`): one manifest, one fence renderer, and ONE browser function
  that draws the plot — the runtime bundles it, and the CLI export page runs the same function
  serialized. The two hand-kept copies it replaces had drifted (only the runtime's marked an error
  settled or showed the config when the library was missing). Plots draw exactly as before: the
  math gallery's PDFs are byte-identical in both themes.
- **Every capture waits for plugin figures to settle.** The CLI's PDF, PNG and PPTX captures, the
  `--player` bake and the Studio's export now wait until no plugin placeholder is `pending` or
  `hydrating` (bounded; a figure still waiting is exported showing its source, and the CLI says
  so). This used to hold only because function-plot happened to draw synchronously before `load`.
  The CLI also warns when a deck uses a plot and function-plot is not installed.
- **Added: a ` ```math ` fence** — display math the way GitHub and GitLab spell it. It typesets
  exactly like a `$$…$$` block; with math disabled it is an ordinary code block.
- **Fixed: a formula KaTeX cannot parse takes the theme's error ink.** KaTeX wrote failed math in an
  inline `#cc0000` — dark red on a dark slide, outside the token system. It now uses `var(--warn)`,
  on the error surface the math component had designed and never wired (`.katex-error` now; the
  dead `.math-error` rule is gone).
- **Fixed: a function plot that fails no longer overflows a `math canvas` slide.** Its error message
  (or its config, when the library is missing) was forced into the plot's aspect-ratio box and ran
  past the frame; the stage now sizes only a figure that is drawing or drawn.
- **Changed: a plugin fence is matched on the first word of its info string**, as markdown-it reads
  a language name. ` ```functionplot title ` used to be a code block and now draws; a
  ` ```math ` block that was plain code now typesets (no tracked deck had one).
- The fence wrapper chain is gone: one fence table in the plugin host owns every plugin fence, and
  a name a code language already owns (`json`, `tex`, …) cannot be claimed. ` ```anima ` moved onto
  it as the `anima` plugin.
- A ` ```latticeplot ` fence (the deprecated alias) now reports `function-plot/deprecated-alias` in
  `render().diagnostics`.
- **Breaking:** for deep importers only — `functionPlotFences` and `animaSceneFences` are no longer
  exported from `lib/integrations/markdown-it/plugins.js`, and `lib/core/function-plot-viewbox.js`
  is removed; the engine installs both fences through `installPlugins` (`lib/plugins/host.js`). A
  function-plot placeholder carries `data-lattice-hydrate` / `data-lattice-config` /
  `data-lattice-settle` (`pending` → `hydrating` → `rendered` / `error` / `unavailable`, plus
  `data-lattice-final`) instead of `data-fp-config` / `data-fp-inflated` / `data-fp-state` /
  `data-fp-final`.
- **Added: a component's plugins in `components.json` and the pick list.** A component that is
  designed around a plugin now carries `plugins: { requires, optional }` in
  `dist/docs/components.json`, and `components.pick.md` has a `plugins` column — so an agent
  choosing `math` sees that it needs the math plugin (and can use function-plot).
- **Added: `lattice packages new plugin <name>`** writes a plugin package — a manifest, a fence
  renderer, a token-only stylesheet, docs and two fixtures — into `lib/plugins/<name>/` (or
  `--dir`), refusing a name a plugin, a plugin fence or a code language already owns. It builds and
  passes the conformance harness unedited. **`spec/LPM.md`** is the first draft of the plugin
  contract: the package, the manifest, the module shapes, the `api: 1` host API and the settle
  protocol.
- The plugin conformance harness now also parses every fixture with the engine's own parser, and
  proves every plugin rule declines every character it does not declare as a trigger — the two
  limits phase A recorded.
- **Fixed: the Studio's Read pane no longer scans deck HTML in quadratic time** to decide whether
  to bake it. A run of unclosed `<code` tags (deck text can come from a shared link) took 247 ms
  at 8,000 and four times that at twice as many; the check is now one pass of the shared tag
  tokenizer.
