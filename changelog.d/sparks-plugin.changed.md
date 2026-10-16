- **Sparks are a plugin.** The word-sized charts you write as `` `~{12 14 17}` `` now ship as the
  `sparks` plugin (`lib/plugins/sparks/`), alongside icons and avatars, and have a page in the
  plugin catalog. Decks render exactly as before: `sparks` is on by default, the `spark:` front-matter
  key and the `spark-*` slide classes work unchanged, and a deck can name it in `plugins: [sparks]`.
  The author's reference moved from `lib/base/base.docs.md` to `lib/plugins/sparks/sparks.docs.md`.
- **Breaking:** a host that narrows the default plugin set (`createEngine({ plugins: { defaults } })`,
  `--default-plugins`, `LatticePlayground.setPluginDefaults`) or disables plugins now turns sparks off
  too, unless it lists `sparks`. A spark that is off renders as inline code, like every plugin kind.
