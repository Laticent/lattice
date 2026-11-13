- **Fixed: an approved code package or npm plugin no longer fails to draw at random when the CLI runs as root.**
  The sandbox browser's hand-built command line repeated `--disable-features`, and Chromium keeps only the last
  copy, so it dropped puppeteer's list and ran the package's frame in a process of its own. puppeteer then lost
  that frame on about half the renders under load, and the slide carried "it did not load" instead of the drawing.
