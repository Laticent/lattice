---
status: shipped
summary: Sample art lived in four places and resolved four ways, so the Studio showed hatched placeholders for its own portraits and logos and its Add slide templates named files that never existed. All of it now lives in one flat lib/samples/, decks name it `sample:<name>`, every host passes the folder as `samplesUrl`, and previews count the site's own origin as allowed.
---

# Sample images — one folder, one name, every surface (2026-10-07)

**Owner rulings (2026-10-07):** one flat `lib/samples/` folder rather than subfolders; a
`sample:` prefix rather than plain names or relative paths.

## The ask

"The studio lacks awareness of where images referenced could be … we need to make sure images
referenced by add slide templates are the real images not some placeholders … our images should
work in the playground including gallery decks and the studio … all these images co-located."

## What was broken (measured 2026-10-07, docs dev server, Chromium)

1. **Every team-profile portrait and logo-wall mark showed as a hatched placeholder** on the
   component pages and in the Studio. The files were staged and served with HTTP 200. The
   preview resolved `ada.svg` to an ABSOLUTE same-origin URL (`https://<site>/playground/v/<hash>/samples/ada.svg`).
   It then ran `blockWebImages` (`lib/core/remote-ref.js`) with an allow list that never held
   the site's own origin, so the blocker swapped each picture for the "web image" placeholder.
   The Playground path never runs the blocker, which is why gallery decks looked fine there.
2. **The Studio's Add slide templates named files that did not exist.** `logo-wall`'s skeleton
   named `logo-1.svg` … `logo-6.svg`, and `team-profile`'s named `portrait.jpg` and
   `portrait-2.jpg`. No copy of any of them existed anywhere in the tree, so every inserted slide
   showed broken images. No gate looks at a skeleton's image targets.
3. **The art lived in four places and was named four ways.** It sat in
   `lib/components/imagery/image/`, `…/inventory/team-profile/`, `…/inventory/logo-wall/` and
   `lib/base/_logo/`, with byte-identical copies in `examples/assets/` and `examples/`. Decks
   reached it as `ada.svg`, `team-profile/ada.svg`, `../lib/components/inventory/team-profile/ada.svg`
   and `assets/sample-photo-wide.svg`, depending on where the deck sat. The site staged it by
   walking every component folder for SVGs and mirroring gallery paths.
4. **A `video` poster and a non-image `![bg]` never went through the resolver.** In a website
   preview both resolved against the parent page's URL.

## The decision

**One flat folder, `lib/samples/`.** About 30 pictures, named by kind: `photo-*`, `portrait-*`,
`logo-*`, `video-poster.svg`. It is flat because the site serves it flat and a flat name is the
same string on every surface. The prefix carries what a subfolder would have. `lib/` ships in the
npm package, so CLI users get the art too.

**Decks name a sample as `sample:<name>`.** The engine resolves it in one kernel,
`resolveAssetUrl(url, baseUrl, samplesUrl)` in `lib/core/bg-image.js`. The grammar lives in
`sampleName` in `lib/core/remote-ref.js`: one path segment of plain characters, never `..`. It
lives there because that module is loaded as-is in the browser and takes no imports. Each host
supplies `samplesUrl`:

| Host | `samplesUrl` |
|---|---|
| CLI (`lattice-emulator.js`) | `file://<package>/lib/samples/` |
| Playground, Studio, component pages | the staged `samples/` copy (`docs/src/lib/samples-base.ts`) |
| Studio exports (`share-export.ts`) | the same staged copy, which `inlineUrlMedia` embeds as same-origin pictures |

Every engine path that paints a picture honors it: an image slide, a section background, a prose
image, a `logo-wall` mark, a `team-profile` portrait, a `video` poster and a deck `logo:`.

**The engine resolves `sample:`, and component transforms never do.** It happens in two places
the engine owns:

- An image token's target is resolved right after inline parsing
  (`installSampleImages` in `lib/engine/background-image.js`).
- After every transform, `resolveInlineImageSrcs` resolves the `<img src>` and the inline-style
  `url(…)` a transform wrote. A video poster and a raw-HTML image are the two cases.

Transforms see only `baseUrl`, which is also all a component running as a sandboxed code package
is handed (`lib/packages/code-shape.mjs`). So the in-repo render and the package render give
the same markup, and `test/integration/export/code-package-parity.test.js` holds them to it. An
earlier draft passed `samplesUrl` into the transforms, and the packaged `video` poster then
differed from the in-repo one.

**Previews count the site's own origin as allowed.** `withOwnOrigin` in `remote-ref.js` adds
`location.origin` to the allow list in the five PREVIEW sinks. Those sinks are the single-slide
renderer, the presenter stage, the deck render, the deck preview frame and the article view. Their
frames already allow `'self'` in `img-src`, so only the markup rewrite was wrong. Loading the
site's own file tells no third party anything. The exports split two ways, and neither lets a
file call back to the site. The HTML player embeds same-origin pictures first
(`inlineUrlMedia`, which now also reads a `logo-wall` mark's `--logo-mask`), then keeps an empty
allow list. The PDF, PNG and PPTX capture frame does count the site's origin, in
`deck-export.js` `CAPTURE_WEB_ORIGINS`, because those files carry pixels rather than URLs.

**A well-formed `sample:` reference is local.** `isRemoteUrl` returns false for it, so a gallery
that shows sample art passes the package import gate (HARD RULE #22). A malformed one
(`sample:../x`, `sample://host/x`) resolves to nothing and stays on the refused side.

## Options not taken

- **Plain names, with the engine falling back to the samples folder** (`![](portrait-ada.svg)`).
  This needs no new syntax. It was declined because a missing author file would silently show a
  sample picture.
- **Relative paths** (`../../../samples/portrait-ada.svg`). These need no engine change, but they
  break when a deck moves, and the site would have to rewrite every `../` chain.
- **Subfolders** (`samples/people/ada.svg`). Easier to browse, but every reference carries the
  folder, and the site has to mirror the tree.

## The guard

`test/unit/core/sample-images.test.js` fails when any tracked deck, manifest, doc or snippet names
a `sample:` file that is not in `lib/samples/`. It also fails when a component's `skeleton` or
`sample` shows a picture that is not a real sample. With `logo-4.svg` put back in the
`logo-wall` skeleton, the test fails and names it.

## Known limits

- **Export to Marp carries `sample:` art, but the Studio's export carries no other local
  picture.** Both producers rewrite each `sample:` reference to `assets/<name>` and put the
  file in the bundle, front-matter `logo:` included, because Marp cannot read the prefix. Which
  references count is shared (`mapImageRefs` and `mapFrontMatterLogo` in
  `lib/core/marp-bundle.js`). The CLI (`tools/export-marp.js`) copies the file from
  `lib/samples/`. The Studio's in-browser producer has no filesystem, so it fetches the file
  from the site's staged `samples/` (`deck-export.js` `exportMarp`) and keeps the fetched
  `logo:` in the baked front matter (`bundledAssets`). It still drops any other relative
  `logo:` rather than bake a broken path (`withoutLocalAssetRefs`). A sample that fails to
  fetch keeps its `sample:` reference. Neither producer rewrites a raw-HTML `<img src>` or an
  inline-style `url()`.
- **An editor preview that does not run Lattice's engine**, such as Marp for VS Code, cannot
  resolve `sample:`. The snippets now insert it anyway, because before this change they named
  files that did not exist either.
- **The old staged names still resolve on the website.** `samples/ada.svg`,
  `samples/logo-wall/acme.svg` and the rest are staged as copies of the renamed files, so a deck
  someone saved in the Studio from an old component sample keeps its pictures
  (`docs/scripts/sync-playground-assets.mjs`).
- **The four JPEG photos now ship in the npm package** (about 237 KB). They used to live under
  `test/` and never shipped.
