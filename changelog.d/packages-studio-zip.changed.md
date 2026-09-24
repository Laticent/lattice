- **Changed: a Studio asset `.zip` is now the package folder.** Exporting a theme,
  component, finish or motion from the Library writes `<name>/<name>.manifest.json`
  and its files under the names a Lattice repo uses (`<name>.styles.css`,
  `<name>.gallery.md`, `<name>.recipe.json`…), with no `manifest.json` envelope. A
  bundle holds one `<type>/<name>/` folder per asset. Zips exported before this
  change still import.
- **Changed: importing a package trusts its manifest, not its file names.** A folder
  a browser saved as `harbor (1)` imports as `harbor`, and the import message says
  what it renamed or left out. A package that carries JavaScript is refused by name.
- **Fixed: a component imported from a zip keeps its manifest.** The old format
  carried only the bucket, so an imported component couldn't be re-saved until its
  function, form, substance and description were filled in again. A package carries
  the whole manifest (and its docs), and exporting it again writes the same files.
