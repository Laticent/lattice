---
origin: 2509
priority: P5
recorded: 2026-10-07
area: infra
severity: low
swimlane: engineering/decisions/2026-09-27-plugin-system.md
---

# The packages plugins vendor are still runtime dependencies, so an install downloads what nothing reads

why now   — every plugin library is now a copy the plugin owns (lib/plugins/<name>/vendor/,
            lib/plugins/payload-path.js), and no surface reads `mermaid`, `katex`, `function-plot`,
            `@mermaid-js/mermaid-zenuml` or `@mermaid-js/mermaid-cli` from node_modules at run time
            (test/unit/plugins/plugin-libraries-owned.test.js pins that). They stay in
            `dependencies` only because `npm run vendor:plugins` refreshes the copies from them. So a
            consumer's `npm install` still fetches all five (mermaid-cli alone brings a dependency
            tree), and the tarball now carries the copies as well: 23.3 → 26.4 MB packed.
where     — package.json `dependencies` → `devDependencies` for the five; the tests that `require`
            the packages to compare output (carousel, relationship, tex-linebreak, math-memo) are dev
            already. Check `npm pack` and a clean consumer install (`npm i <tarball>` in an empty
            dir, then a CLI PDF of the diagram and math galleries) before and after.
done when — a consumer install of the tarball renders both galleries byte-identically without the
            five packages present.
evidence  — the consumer-install render, and `npm ls` of that install.
verify    — tier 1 checker; this changes what a consumer installs, so it is the owner's call first.

**Measured 2026-10-07, not changed (the P3 of #2577's brief; the owner's call).** The P1 tarball,
repacked with the five moved to `devDependencies` and installed into an empty directory
(`PUPPETEER_SKIP_DOWNLOAD=1`): 217 packages and 231 MB of `node_modules`, against 332 packages and
525 MB with them. The installed CLI rendered the math and diagram galleries, bucket and component
(72 pages, the component math gallery covering `functionplot`), pixel-identical to the in-tree
render (`compare -metric AE` = 0 on every page at 72 dpi) with the same console output. The one
runtime reach into `@mermaid-js/mermaid-cli` left in `lattice-emulator.js` is `loadPuppeteer`'s
fallback, which never fires because `puppeteer` is a direct dependency. A tarball is not
byte-comparable across packs (timestamps), so "byte-identically" above is pixel-identity here.
