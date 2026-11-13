studio: +97
playground: +110
home: +97
getting-started: +42

The script-URL loaders (ensure-engine, ensure-katex, the fence-grammar injector) now carry their
barrier INLINE at each `script.src` / `import()` sink: refuse an empty URL or one holding a markup
character or whitespace, resolve the rest, refuse it unless it shares the page's origin and scheme,
and inject only the resolved href. That is the only shape CodeQL's js/xss-through-dom reads as a
barrier; a check behind a helper it still traces through (#1958, PR #3187). The dedup that finds an
injected tag now compares resolved URLs (`scriptTagFor` in `_astro/engine-base`). Given back first:
home sat at +208 and crossed its hard ceiling, so the separate `scriptSrc` helper went (its scheme
check is the origin-and-scheme comparison, its character check moved inline) and each loader's three
refusal exits became one. Measured locally against this branch's base (`fa0d3870`) with the gate's
own `measure()`; on current `main` home lands at 320,620 B against a 320,684 ceiling.
