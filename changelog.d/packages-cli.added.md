- **Added: `lattice packages list | add | check | export | remove`.** Install a theme or
  component exported from the Studio with `lattice packages add <file>.zip`, and every
  deck that names it renders from the CLI. Finishes and motions install and export too,
  but the CLI doesn't render them by name yet. Packages live in
  `~/.lattice/packages`, or `$LATTICE_HOME/packages`, or the folder `--packages <dir>`
  names for one run. `add` runs the Studio's import checks, so CSS that loads from
  the network or a package that carries JavaScript is refused by name.
- **Changed: a deck naming a theme Lattice doesn't have fails with that name.** The
  error prints the `lattice packages add` command that fixes it.
- **Added: a `.lattice` project carries the saved theme, components and finishes the
  deck uses.** Opening it on another machine adds them to that Library through the
  same checks as a `.zip` import.
- **Changed: `jszip` is a declared runtime dependency.** The CLI reads and writes zips
  at run time. It used to arrive only through `pptxgenjs`'s own dependency, which a
  strict installer such as pnpm does not expose to Lattice.
