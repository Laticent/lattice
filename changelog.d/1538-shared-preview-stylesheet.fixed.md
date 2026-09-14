- **Fixed: every preview frame parsed its own private copy of the 640KB engine stylesheet.**
  `out.css` is a pure function of theme-name + geometry, so every tile in a thumbnail grid wants
  byte-identical CSS — but each frame inlined its own copy into its own `<style>`, which a browser
  has no way to recognize as the same bytes. Fifteen tiles meant fifteen parses and fifteen
  CSSOMs. The sheet now goes to every frame as one shared `blob:` `<link>`, keyed by content and
  compared byte-for-byte so a hash collision cannot serve the wrong theme. Measured as an A/B in
  one build, peak resident set for browsing the gallery once at 390×844: **Chromium
  +1041/+993MB → +393/+361MB (−63%)**, **WebKit +1469/+1399MB → +1189/+1064MB (−21%)**. The
  per-frame document went from ~769,000 bytes to 2,508. Renders are byte-identical: the same
  screenshot on both engines, with the cascade order (frame box → engine sheet → author CSS)
  preserved by keeping three elements rather than one. The runtime JS was already shared by URL
  and is unchanged; the two remaining inline scripts total 1.1KB.
- **Fixed: a blob-served stylesheet silently rendered every deck in fallback fonts.** Found while
  building the above and fixed before it shipped. A stylesheet's relative `url()` resolves against
  the *stylesheet's* base, and a `blob:` URL is an opaque-path URL with nothing to resolve
  against — so `url(/…/playfair-400.woff2)`, correct inline, becomes unfetchable from a blob. The
  sheet still parsed (3595 rules) and every color and box was right, so the failure was invisible
  to every structural check: 37 of 37 `@font-face` entries at `status: "error"` against 37 loaded
  inline, and the headline measuring 828px — the fallback width exactly — instead of 877px. URLs
  are now absolutized against the document before the blob is minted, and
  `docs/e2e/preview-shared-sheet.spec.ts` asserts the faces actually LOAD rather than that a sheet
  arrived (verified to go red without the fix).
