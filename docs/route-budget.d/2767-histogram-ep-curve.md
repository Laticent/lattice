studio: +64
playground: +32
home: +32
CI measured, on 7c0196f against main: Studio +44 B of eager JS, gzipped, Playground +13 B and Home +19 B; the declaration leaves the same headroom #2714's did.
- **The two new charts' names.** `histogram` and `ep-curve` join the docs site's chart family (`families.mjs`), the Studio's component lists (`registers.ts`), the Present-mode mark selector (`chart-interact.js`) and the chart-count chip (`single-slide-render.ts`). Their kernels load on demand and are budgeted under chartKernelGz, not here.
Given back first: nothing; each is a name in a list the chart must join to be reachable.
