- A deck that does not load a plugin now draws none of it on any surface that shows the engine's
  render. The engine marks such a
  plugin's code fence `data-lattice-off="<plugin>"`, and the browser runtime's Mermaid pass, the
  Studio's drawn-fence probes and the preview's ink-withholding rule all skip it, so the Studio's
  preview and export and a `--fluid` or `--player` page show the source instead of a diagram.
  `--disable-plugin` now reaches `--fluid` and `--player` pages too.
- `--default-plugins <names|none>` narrows the CLI's default plugin set for one run. The CLI decides
  admission once and hands it to the engine, the plugins' bakes and its source-side slide splits.
- `LatticePlayground.setPluginDefaults(names | null)` and `render(…, { pluginDefaults })` let a
  browser host narrow the default set per bundle or per render; the Studio's one-slide renders
  take the whole deck's admission (`pluginAdmission`), since a slide class anywhere loads its plugin.
