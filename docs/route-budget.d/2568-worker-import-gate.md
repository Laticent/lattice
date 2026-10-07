studio: +41
playground: +21
home: +23
The code package worker's wall grew: `workerScript` (lib/packages/code-shape.mjs) now makes `eval`, `Function` and every function kind's `constructor` into throwing stubs and guards the timers, so no string becomes code in the worker. That module is in each route's eager bundle; the acorn parse that refuses a dynamic `import()` loads lazily, only when a zip or a render meets a code package. A security fix with nothing to give back without weakening the wall.
CI measured the first commit at +41 / +19 / +15; with the theme move added and a newer `main` underneath, it measured +25 / +21 / +23, so the larger of each pair is declared.
