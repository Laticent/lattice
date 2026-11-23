---
origin: 3472
priority: P1
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-01-icon-font.md
deferred: blocked — needs a gecko trace with the exported page's font loads; only #2988's runner has reproduced it, and its trace recorded no network or console events for that page
source: https://github.com/Laticent/lattice/pull/3472
---

# On gecko under load, some face on the exported webpage never finishes loading

why now   — #3472 fixed the test that hung on it: icon-font-studio.spec.ts awaited `document.fonts.ready`, and on #2988's
            runner (gecko, --workers=4) that promise never settled on the Share → Webpage export, about 1 run in 5. The
            test no longer waits on it, but which face stayed `loading` is unknown. If it is a text face that never
            finishes, a reader of the exported page on a loaded machine sees a fallback font: a product defect.
where     — the export's embedded faces: docs/src/playground/font-embed.js (`buildFontEmbedCss`, `ensureFontsLoaded`),
            all inline `data:` woff2, so a trace lists no network request for them.
done when — the face that stays `loading` is named (log each `document.fonts` entry's family, weight and status when
            `fonts.ready` has not settled after a bound), and either it is shown harmless or the export is fixed.
evidence  — a gecko run on the failing runner that logs the FontFaceSet; before/after on the same machine.
verify    — tier 0 plus a real-surface check of the exported page in Firefox.
