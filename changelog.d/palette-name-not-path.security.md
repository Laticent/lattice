- **Fixed: `--palette` and `LATTICE_PALETTE` took a PATH, not a name.** The value is joined onto the
  themes directory to build a file path, and the front-matter reader has always constrained it with
  `SAFE_PALETTE_NAME` — but the CLI argument and the environment variable did not. So
  `--palette ../../elsewhere/sheet` loaded a stylesheet from anywhere on disk, measured carrying a
  `section:nth-of-type(6)` rule into an exported artifact. All three sources take the same
  constraint now.
  **It refuses rather than falling back**, because a silent fallback to the default palette is the
  failure `lib/core/resolve-palette.js`'s own docblock was written about: a deck rendering in indaco
  while its author believes they asked for something else. The error names the source that carried
  the bad value.
