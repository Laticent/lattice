studio: +41
playground: +19
home: +15
The code package worker's wall grew: `workerScript` (lib/packages/code-shape.mjs) now makes `eval`, `Function` and every function kind's `constructor` into throwing stubs and guards the timers, so no string becomes code in the worker. That module is in each route's eager bundle; the acorn parse that refuses a dynamic `import()` loads lazily, only when a zip or a render meets a code package. A security fix with nothing to give back without weakening the wall.
