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
