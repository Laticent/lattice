- **Fixed: the deck logo no longer disappears on `divider light`, or on a `print` slide.**
  The rule that flips the mark to a light-gray watermark named layout classes (`title`,
  `divider`, `closing`, `dark`) while its own comment claimed to name dark canvases. Those
  agree only while those layouts are always dark, and they are not: `divider light`
  replaces the canvas with `--bg`, and the `print` band remaps everything to paper. On
  those slides the mark rendered light-gray on a light ground — present in the DOM,
  correctly positioned, and invisible. The issue reported one canvas; the rule was wrong
  on three.
- **Changed: the flip is now a token the canvas sets**, `--deck-logo-filter` /
  `--deck-logo-opacity`, declared beside the `color-scheme: dark` that makes the canvas
  dark, with the light-canvas values as the `var()` fallback. There is one predicate
  instead of two copies free to drift, and a new dark canvas gets the flip by setting the
  token rather than by being added to a selector list. A theme retunes the inverted
  treatment with `:root { --deck-logo-filter-inverse: … }`.
