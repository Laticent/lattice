- **The Studio refuses a plugin package by name instead of dropping it.** Importing a zip that held
  a plugin with no code imported nothing and said nothing; one with code was refused as "a plugin
  package is data". Both now get the refusal `lattice packages add` gives, from one shared string:
  plugins are in-tree only until the plugin zip channel ships.
  (`docs/src/components/studio/package-zip.ts`, `lib/packages/import-gate.js`)
