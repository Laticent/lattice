studio: +350
playground: +1250
home: +1350
components: +120
getting-started: +120
The growth is the security dependency bumps (PR #3051, P1), measured by CI against main 56253e0: markdown-it
14.1 → 14.3.3 (+860 B gz; its linear html_inline and reference rules fix four quadratic-time advisories),
DOMPurify 3.4.16 → 3.4.17 in the slide sanitizer chunk (+395 B; a critical advisory), and the docs site's
astro/vite patch bumps (`schema` +2,714 B, `preload-helper` +151 B; the astro, vite and devalue advisories).
The bytes are the fixes, so none can be given back without refusing an advisory fix.
Given back already: the vite bump reshuffles the shared chunks (`anima` −3,487 B on the Studio, `zdog` −21,654 B
against `compile` +22,447 B on the playground), which keeps the Studio's net growth to +299 B. CI owed
studio +299, playground +1,162, home +1,267, components +98 and getting-started +95; each line above
rounds up for gzip variation in CI's build.
