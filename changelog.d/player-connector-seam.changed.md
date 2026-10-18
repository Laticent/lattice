- **Changed: the player refuses a document it cannot read, and its prune no longer passes on an
  empty check.** `assemblePlayer` now throws on a document with no Lattice slides, where it used to
  export a player with zero slides and no warning; the CLI reports "--player assembly failed". The
  prune's computed-style gate refuses when the element it watches is absent, where two empty
  snapshots used to pass. Its view-cycling is now declared data (`LATTICE_CONNECTOR` in
  `lib/export/player-prune.js`), which a reveal.js export used to show that the prune is not
  Lattice-specific. Lattice exports are unchanged.
