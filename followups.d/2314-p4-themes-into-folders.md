---
origin: 2314
priority: P4
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Move themes into themes/<name>/ folders (phase 5) and seed a motion library

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — the owner chose one shape for every kind.
where     — themes/ (70 files), ~67 source files that reference theme paths, package.json exports remap ./themes/*.css -> ./themes/*/*.css; lib/motion/.
done when — no flat theme remains, the published import path still resolves, and example motion ships as packages.
evidence  — require.resolve of @laticent/lattice/themes/indaco.css from a packed tarball.
verify    — build:check + integration.
```

## Why PR #2314 stopped short of this (2026-09-24)

Scoped and measured, not started:

- **Reach: 153 files** reference a theme path (`grep -rlE "themes/[${a-z'\"\` ]|'themes'|\"themes\""`
  over `lib tools docs/src lattice-emulator.js test docs/scripts scripts .github`, generated
  files excluded). That is the §9 Q2 figure with tests, JSON, YAML and shell counted.
- **The remap resolves.** On Node 22.22, a package whose `exports` puts
  `"./themes/*.css": "./themes/*/*.css"` BEFORE `"./themes/*": "./themes/*"` resolves
  `@laticent/lattice/themes/indaco.css` to `themes/indaco/indaco.css`, and
  `themes/indaco/indaco.manifest.json` still resolves through the second entry. The key order
  matters: the more specific pattern has to come first.
- **What the remap does NOT cover:** a consumer that reads
  `node_modules/@laticent/lattice/themes/<name>.css` off disk instead of resolving it. The
  desktop wrapper is the known embedder and is outside this repo, so nobody here can check it.
  Before the move, confirm how the wrapper loads themes, or ship flat compatibility copies
  for one release.
- The Marp export (`lib/core/marp-bundle.js`, `tools/export-marp.js`) copies `themes/<file>`
  into the bundle by filename. That output layout is also what a Marp user sees, so it
  should stay flat even after the source moves.

The motion-library half is also unstarted. The examples hold 7 scenes (`examples/anima-scene.md`
×3, `examples/motion-asset.md` ×4) that could seed `lib/motion/<name>/`, but nothing yet LISTS
shipped motion except `lattice packages list`. So seed it together with the Studio surface that
inserts from it, or the shipped data sits unread.
