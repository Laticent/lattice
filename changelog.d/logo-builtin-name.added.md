- **Added: `logo: lattice`, a built-in mark that works on every surface.** A `logo:`
  path only means something where the deck FILE is — the CLI resolves it against the
  `.md`, and the web cannot, so a deck carrying `logo: ../lib/base/_logo/…` showed no
  mark in the Playground, none in the Studio, and failed the PDF export outright. The
  built-in name inlines Lattice's own mark, so it paints in the CLI, the Playground,
  the Studio, an exported `.html` opened offline, and on a phone. Your own mark still
  takes a path or a URL — on a web surface it needs one the viewer can fetch. The
  jargon gallery now uses the name, and its rendered pages are unchanged.
