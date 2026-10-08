studio: +64
playground: +16
The Studio's Share sheet now loads KaTeX before an Export-to-Marp of a math deck (`share-export.ts` imports `ensureKatexProvider` / `deriveKatexProviderUrl`, which the Studio already ships for its preview) and its toast counts equations that could not be typeset: CI measured +8 B gz on the studio route and +1 B on the playground against main. Declared with headroom for gzip variation. The bake itself (`lib/core/marp-bundle-math.js`) rides in the playground engine bundle, which loads on demand, not on the eager path.
