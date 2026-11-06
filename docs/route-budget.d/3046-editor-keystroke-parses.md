studio: +300
playground: +150
home: +150
`commentBlocks` (lib/core/meta-record.mjs) now remembers each slide's comment blocks by text, which takes a real Studio keystroke from 59.5 full parses to 1.1; its memo code sits in the shared `slide-boundaries` chunk that all three routes load (+123 B). The Studio also gains the editors' deriver install in `deck-outline` (+18 B) and `deriveFromNearest` with `diffSpan`, which the bundler placed in the `tts-voice-catalog` chunk (+128 B). Measured in CI against main eab53904: studio +269, playground +125, home +125; the declared figures leave room for gzip spread.
