---
origin: 3345
priority: P3
recorded: 2026-11-21
area: website
severity: medium
swimlane: .github/platform-suites.json (docs-scrollbars-windows serves the Linux build because of this)
deferred: off-path — a pre-existing Windows build failure in a shared engine module, found by #3345's new Windows suite; #3345 changes neither the module nor the docs build
source: https://github.com/Laticent/lattice/actions/runs/44853144110/job/136698181855
---
# The docs site does not build on Windows

why now   — The first run of the `docs-scrollbars-windows` platform suite (#3345) built the docs site on
            `windows-2025` and failed before any test: `bake-newcomer-frame FAILED: ReferenceError: module is not
            defined` at `lib/core/content-policy.js:222`, evaluated by Vite's SSR module runner
            (`/src/lib/playground-engine.ts`). The suite now serves the site built on Linux instead
            (`E2E_PREBUILT=1`), as the iOS Simulator suites always have. The Laticent desktop app is meant to wrap
            this engine and will be built on Windows too.
what is known — the same build passes on Linux. On Windows the CommonJS `module.exports` in
            `content-policy.js` is run as ESM by Vite's SSR runner; a path check that matches `/`-separated paths
            only (an `ssr.noExternal`, an optimize-deps include, or a CJS-interop rule) is the first suspect, since
            Windows paths reached it as `D:/a/lattice/...`. Not investigated further.
done when — `npm run build:e2e` in `docs/` passes on `windows-2025` (dispatch `build-windows` or add the step), and
            `docs-scrollbars-windows` can drop `E2E_PREBUILT=1` if wanted.
