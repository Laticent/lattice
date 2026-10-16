- An Export-to-Marp bundle now follows the deck's plugin admission: a host that narrowed its
  default set (`tools/export-marp.js --default-plugins=none`, `--disable-plugin=…`, or the Studio
  under `LatticePlayground.setPluginDefaults`) writes the plugins it left off into the bundle's
  settings block, and the bundled runtime leaves those Mermaid fences as source and those charts as
  lists, and its Marp config turns Marp's own math off when math is not loaded. Default-set
  bundles are unchanged.
- Under a narrowed plugin set, the Studio's lint and slide rail now split a deck where the engine
  does (with math not loaded, a `---` inside `$$` is a slide break in both).
