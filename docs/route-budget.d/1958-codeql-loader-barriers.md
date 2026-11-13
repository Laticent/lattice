studio: +135
playground: +148
home: +135
getting-started: +42

The script-URL loaders (ensure-engine, ensure-katex, the fence-grammar injector) now carry their
barrier INLINE at each `script.src` / `import()` sink: refuse an empty URL or one holding a markup
character or whitespace, resolve the rest, refuse it unless it shares the page's origin and scheme,
and inject only the resolved href. That is the only shape CodeQL's js/xss-through-dom reads as a
barrier; a check behind a helper it still traces through (#1958, PR #3187). The dedup that finds an
injected tag now compares resolved URLs (`scriptTagFor` in `_astro/engine-base`). Given back first:
home sat at +208 and crossed its hard ceiling, so the separate `scriptSrc` helper went (its scheme
check is the origin-and-scheme comparison, its character check moved inline) and each loader's three
refusal exits became one. `ensureEngine` now records the engine base only after its barrier (a refused
URL had overwritten a good base); that reorder costs home 38 bytes of compression. Measured locally
against this branch's base (`fa0d3870`) with the gate's own `measure()`; on current `main` home lands
at 320,658 B against a 320,684 ceiling.
