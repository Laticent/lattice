- **Fixed: the page number is one mark on every frame, not two chosen by the frame's kind.**
  A chrome-hosting frame (`minimal`, `standard`) drew it as a real
  `<span class="lat-pagination">` in its footer Cell; the other nine — every sovereign frame —
  fell back to the `section::after` pagination pseudo. Different box models, different styling
  surfaces, and nothing in the source or on the slide told an author which they had. A
  pagination Tile (`lib/forms/tile/pagination`) now mints the real element on every paginated
  frame that has none, and the pseudo retires wherever the element exists. Same corner, same
  insets, same type — the node changed, not the picture.
- **Fixed: rules that name the page number now reach it.** The chart family's hero/bleed
  recolor was dead code — a chart slide emits a footer Cell, so its pseudo was retired before
  that rule could paint — and the split cover carried three arms for one mark. Suppression is
  also honored on the packed web paths now: `packTheme` strips generated content from a
  slide-own `section…::after` rule, so hiding the number through the pseudo was inert in the
  Playground, the Studio and `lib/runtime`.
