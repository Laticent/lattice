- **Fixed: the Studio renders decks again on the local dev server.** Every preview on
  `npm run dev` showed "This preview couldn't render" because the Studio's image-size memo
  default-imported `lib/core/bg-image.js`, a CommonJS module with its own requires, which the
  dev server serves raw. The `![bg …]` pattern now lives in the require-free
  `lib/core/bg-directive.js`, and a test fails if a docs source imports a CommonJS `lib/`
  file the dev server cannot serve. The production site was never affected.
- **Fixed: a portrait `split-panel pullquote` footer was invisible.** The panels stack in
  portrait, so the footer sits on the white supporting field, and it kept the panel's white
  ink: 1.00:1 on all 32 themes. It now takes the ink of the field it lands on, at 5.05:1 or
  better. `split-panel mirror` on a portrait deck also stacks now, with the featured panel at
  the bottom; before, it stayed side by side and clipped its quote.
- **Fixed: `split-compare` no longer drops an extra paragraph.** A block the layout has no slot
  for (a second context paragraph, a note under the options) vanished from exports and sat in
  front of both panels in the Studio. Both render paths now put it in the options zone, after
  the two cards and before the verdict, and a slide that splits into pages carries it to the
  closing page after the verdict. A blockquote nested inside an option no longer replaces the
  recommendation, a verdict written above the options keeps its own bullets, and a speaker
  note that mentions `<blockquote>` or `<ul>` no longer empties the option cards.
- **Fixed: a split `split-compare` run's closing page showed a stray page number.** On portrait
  and square decks the slide's page number was carried into the closing band as if it were
  content, and the run's `1.4`-style number landed on that copy while the corner kept a bare `1`.
  The closing page now shows one page number, in the corner, with its run suffix. A split-compare
  slide with no verdict no longer ends its run on a near-empty page that held only that stray
  number.
