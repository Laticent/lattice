- **Changed: the command is `lattice` everywhere, and `lattice --help` fits one screen.**
  `--version` prints `lattice 1.0.0`, and the help, usage and examples show `lattice deck.md
  deck.pdf` rather than `node lattice-emulator.js deck.md deck.pdf`: the CLI stopped emulating
  Marp long ago, and its name had not caught up. `lattice --help` now shows the output formats
  and the options most decks need; `lattice --help all` (or `--help=all`) prints every option,
  as before. The package's CLI files are `dist/lattice.js` and `dist/lattice-min.js`; the
  `lattice` bin and the `@laticent/lattice` and `@laticent/lattice/min` imports are unchanged.
- **Breaking:** the CLI source file in the package is `lattice.js`, not `lattice-emulator.js`, so a
  script that ran `node node_modules/@laticent/lattice/lattice-emulator.js` must run `npx lattice`
  (or that `lattice.js`) instead; and `lattice --version` prints `lattice <version>`, not
  `lattice-emulator <version>`.
