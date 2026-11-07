studio: +40
playground: +40
home: +40
`ensureKatexProvider` (docs/src/lib/ensure-katex.ts, which ships in the startup `video-overlay` chunk) now clears its poll when a load error rejects, instead of leaving it reading `window` for ~10 s. Declaring the handle before `fail` and clearing it there costs CI-measured +34 B gz on each of these routes; declared with a little room for gzip variation.
