---
origin: 3472
priority: P1
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-01-icon-font.md
deferred: blocked — reproduces only on #2988's runner; needs a gecko trace of the exported page's font loading over time, which no run has recorded
source: https://github.com/Laticent/lattice/pull/3472
---

# On gecko under load, the exported webpage's FontFaceSet reads `loading` with no face loading

why now   — #3472 fixed the test that hung on it: icon-font-studio.spec.ts awaited `document.fonts.ready`, and on #2988's
            runner (gecko, --workers=4) that promise did not settle in 15 s on the Share → Webpage export, about 1 run in
            5. With the fix, the same command went 20 of 20 there. A one-off log on that runner, just before the check:
            `document.fonts.status` read `loading` in 3 of 20 runs, yet every listed face read `loaded` or `unloaded`,
            the same as the 17 runs reading `loaded`. So no listed face is stuck. A load that starts and settles inside
            a tick, or one Firefox starts after layout, fits. A reader-facing defect is not shown either way.
where     — the export's embedded faces: docs/src/playground/font-embed.js (`buildFontEmbedCss`, `ensureFontsLoaded`),
            all inline `data:` woff2, so a trace lists no network request for them.
done when — the export page's FontFaceSet is sampled over time on that runner (status and each face, every frame for a few
            seconds), and it is shown either to settle (harmless) or to strand a face a reader sees (then fixed).
evidence  — that sampled log, from a gecko run on the failing runner.
verify    — tier 0 plus a real-surface check of the exported page in Firefox.
