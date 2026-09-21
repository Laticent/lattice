- **Fixed: markup an author writes themselves is no longer mistaken for a slide
  under `--read`.** The engine passes raw HTML through unescaped, so a deck that
  teaches slide markup — by pasting a bare `<section data-lattice-slide>`, or the whole
  `<main id="deck">` export scaffold — had that example projected twice, once inside its
  real slide and once as a phantom slide with its own table-of-contents row, which is
  the double copy the flag exists to prevent. `--read` now resolves the real slide
  container as a node and asks it for its own children, rather than matching an `#deck`
  id selector that any pasted element can satisfy.
- **Fixed: a `--read` document no longer ships a `<main>` inside a `<main>`.** The
  article was inserted inside `main#deck`, and the "drop the container if it is left
  empty" branch then asked a container that held the whole article, so it could never
  fire. Measured with axe-core: three landmark violations, against zero for the same
  deck exported plain. The article now replaces the container, and `--read` joins the
  export shell and the player as a gated shell in `axe-a11y.test.js`.
- **Fixed: a code block in a reading article is reachable from the keyboard.** All
  three article hosts scroll a `<pre>` sideways rather than breaking the column, and a
  scrollable region that cannot be focused cannot be scrolled without a pointer. The
  shared projection now emits it focusable, so the player and the Studio view get it
  too — axe only ever saw it on `--read`, because that is the one host whose article is
  visible at load.
