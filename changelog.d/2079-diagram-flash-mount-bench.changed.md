- **Changed: `bench:flash` can now measure a preview's FIRST MOUNT, not only its swaps.**
  `cd docs && npm run bench:flash -- --scenario mount --deck diagram|prose` reloads the
  Studio and times the reload against the preview's first painted slide, in both clocks
  (page-total, and the frame's own — the low-variance half that leaves out the Studio's own
  boot). It answers "what does opening a deck that contains a diagram cost", which was
  previously a number from a script nobody committed.
