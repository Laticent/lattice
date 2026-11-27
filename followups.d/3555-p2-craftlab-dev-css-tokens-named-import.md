---
origin: 3555
priority: P2
recorded: 2026-11-27
area: website
severity: medium
swimlane: lib/theme/chain.mjs
deferred: blocked — the fix is lib/ code (lib/theme/chain.mjs), which #3555's brief excluded; met while screenshotting the deck-settings guide, reproduced on main, dev server only
source: https://github.com/Laticent/lattice/pull/3555
---

# Every CraftLab is blank under `astro dev`: `chain.mjs` takes a named import from a CommonJS file

On `npm run dev`, every `<CraftLab>` (the live lab on `/guides/deck-settings/` and the Craft pages)
renders an empty stage. The browser console shows:

```
Error hydrating /src/components/craft/CraftLab.tsx SyntaxError: The requested module
'/@fs/home/user/lattice/lib/core/css-tokens.js' does not provide an export named 'cssImports'
```

`lib/theme/chain.mjs:39` reads `import { cssImports } from '../core/css-tokens.js';` (added by #3294).
`css-tokens.js` is CommonJS, and Vite's dev server serves a CJS file that requires nothing through
the leaf shim, which supports only a default import (`engineering/gotchas/docs-site.md`, "named import
from a CJS leaf"). A production build is not affected, since Rollup converts CJS. Reproduced on
`main` at 90a387d4: the same blank stage, the same error.

The rot guard, `docs/src/plugins/vite-cjs-lib-dev.test.ts`, scans only `docs/src`, so it misses a
`lib/` ESM file that the browser reaches.

done when — `chain.mjs` takes a default import (`import cssTokens from …; const { cssImports } = cssTokens;`),
the rot guard also scans the `lib/**/*.mjs` files a `docs/src` browser source reaches, and the
deck-settings lab renders on `npm run dev`.
