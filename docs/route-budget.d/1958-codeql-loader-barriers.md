studio: +208
playground: +226
home: +208
getting-started: +139

The script-URL loaders (ensure-engine, ensure-katex, the fence-grammar injector) now carry a
same-origin barrier INLINE at each `script.src` / `import()` sink, which is the only shape CodeQL's
js/xss-through-dom reads as a barrier — a check behind a helper it still traces through (#1958, PR
#3187). The engine and its assets are same-origin, so nothing legitimate is refused. The bytes are
`_astro/engine-base` (+157 at 2a2b3a4: the shared `scriptSrc` gate and `scriptTagFor`, the dedup by
resolved URL) and `_astro/video-overlay` (+69: the inline `new URL` + origin comparisons; they cannot move behind a helper without the
query re-tracing the DOM-read URL to the sink, which is the whole defect). These routes already sit
above their soft target, so the growth is declared rather than taken from the free allowance.
