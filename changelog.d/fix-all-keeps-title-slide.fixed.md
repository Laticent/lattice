- **Fixed: `lint:deck --fix` no longer deletes a deck's title slide.** When a fix removed the only front-matter key
  (for example a retired `logo-on: all`), it left an empty `---`/`---` block. Every front-matter reader takes that block
  as running on to the first slide break, so the title slide became front matter and disappeared from the render, and
  lint afterwards reported nothing. A fix that empties the front matter now removes the block. The fix is in the shared
  fixer (`applyFix`), so any other caller of it gets the same protection.
