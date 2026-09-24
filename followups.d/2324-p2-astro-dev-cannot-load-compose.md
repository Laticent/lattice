---
origin: 2324
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2333
---
# `astro dev` cannot load Compose: a named import from a CommonJS kernel

why now   — under `npm run dev` the Studio's Compose pane never mounts. The page logs
            `SyntaxError: The requested module '/@fs/…/lib/core/fence-languages.js' does
            not provide an export named 'SCRIPT_TAGS'`, and the Studio ErrorBoundary catches
            it. `fence-languages.js` is CommonJS (`module.exports = {…}`), and Vite's dev
            server serves a file outside `docs/` untransformed, so the named ESM import
            fails. `astro build` bundles it through Rollup's CommonJS interop, so the
            shipped site and every CI job pass, and only the local inner loop breaks.
            Found while verifying #2333, where the workaround was build:e2e + preview:e2e.
where     — docs/src/lib/compose/fence-catalog.ts line 1 (the import);
            lib/core/fence-languages.js (the CommonJS kernel). Check how the docs site
            already imports other CommonJS `lib/` kernels (a default import, an `.mjs` twin,
            or a Vite `optimizeDeps`/`ssr` entry) and follow that pattern instead of
            inventing a new one (HARD RULE #15).
done when — `cd docs && npm run dev`, open /studio/, switch to Compose: the ProseMirror
            surface mounts with no console SyntaxError.
evidence  — a screenshot of Compose mounted under `astro dev`, plus the console clean of
            the SCRIPT_TAGS error.
verify    — tier 0 gates, because it is a one-import dev-server fix with no shipped-bytes
            change; `build:check` plus the docs build prove the production path held.
