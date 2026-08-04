// The docs-site binding of the shared `pace:` front-matter register. The names and the parse
// live once in the engine at `lib/core/resolve-pace.mjs` (HARD RULE #1), so the CLI, the export
// and the live Studio Present agree on what a deck's declared rhythm is. This thin re-export
// gives the docs a clean `@/lib/resolve-pace` import (the `@/lib/resolve-captions` precedent)
// without a deep relative path into the engine tree.
//
// The engine module is ESM (`.mjs`) for this reason: the docs production build is Rollup, and
// Rollup will not resolve named exports off a CommonJS file outside its root. A CJS register
// here passed vitest AND `tsc` and failed only at `astro build` — worth remembering, because two
// green suites and a clean typecheck said nothing was wrong.
export { DEFAULT_PACE, frontMatterPace, isKnownPace, PACE_NAMES, resolvePaceName } from '../../../lib/core/resolve-pace.mjs';
