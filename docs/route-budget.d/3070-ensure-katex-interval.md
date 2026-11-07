studio: +100
playground: +100
home: +100
`ensureKatexProvider` (docs/src/lib/ensure-katex.ts) and its twin `ensureEngine` (docs/src/lib/load-engine.ts), both in the startup bundle, now clear their poll when a load error rejects, instead of leaving it reading `window` for ~10 s. CI measured +34 B gz per route for the first; the second is the same three lines, so this declares room for both plus gzip variation.
