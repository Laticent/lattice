- **Fixed: the Studio renders decks again on the local dev server.** Every preview on
  `npm run dev` showed "This preview couldn't render" because the Studio's image-size memo
  default-imported `lib/core/bg-image.js`, a CommonJS module with its own requires, which the
  dev server serves raw. The `![bg …]` pattern now lives in the require-free
  `lib/core/bg-directive.js`, and a test fails if a docs source imports a CommonJS `lib/`
  file the dev server cannot serve. The production site was never affected.
