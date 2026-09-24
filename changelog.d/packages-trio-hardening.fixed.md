- **Fixed: opening a `.lattice` project never changes your saved themes, components or
  finishes.** An asset in the file that differs from one you saved is added under a new
  name (`brand-2`), and the deck you opened uses it; your other decks keep yours.
- **Fixed: a saved or installed component can't take a slide class Lattice uses**, such as
  `finish`, `print` or `dark`. It saves or installs as `<name>-custom`.
- **Fixed: the CLI checks installed packages every time it renders**, not only at
  `lattice packages add`, so a package copied into the store by hand is checked too. A
  deck naming a component nobody has now gets a warning instead of unstyled slides.
- **Fixed: a finish saved before the halo/nimbus print fix gets the fix** without being
  saved again.
