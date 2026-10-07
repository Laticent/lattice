studio: +220
playground: +210
home: +220
The `sample:` images fix (#2575) adds two small pieces to code every route loads eagerly:
`withOwnOrigin` and `sampleName` in `lib/core/remote-ref.js`, which stop the preview from
hatching the site's own sample art as a web image, and `samplesBaseFor`
(`docs/src/lib/samples-base.ts`), the one helper the single-slide renderer, the Playground engine
and the Studio's exports now share to pass the samples folder to the engine. Measured +185 / +174
/ +185 B gz against main; declared with headroom for gzip variation.
