---
origin: 2665
priority: P1
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md §6
source: https://github.com/Laticent/lattice/pull/2665
---

# Two gaps the photo-export work found and left: no writer-side check on the 200 MB carrier cap, and the 1440px photo-import specs skip Chromium

why now   — (1) A re-openable PDF or PowerPoint can now hold 32 MB more (its embedded photos), and nothing on the export side checks the finished file against `MAX_CARRIER_BYTES` (200 MB), so a very large deck could save a file this Studio then refuses to reopen. (2) Playwright's `desktop` project drops any title carrying `@webkit-*` unless it also carries `@crosswidth`, so the 1440px copies of the two Images-tab specs in `docs/e2e/library-images.spec.ts` (tagged through `OTHER_ENGINES`) have never run on Chromium; only the 820 and 390 copies do.
where     — (1) `docs/src/components/studio/share-export.ts` `embeddableLattice` / `sharePdf`, `embedded-source.ts` `MAX_CARRIER_BYTES`. (2) `docs/e2e/library-images.spec.ts:130` `OTHER_ENGINES`, `docs/playwright.config.ts` desktop `grepInvert`.
done when — (1) The export drops the embedded photos, and says so, when the finished file would pass the importer's cap. (2) Each 1440px copy runs on Chromium and on the other engines (the `@gecko` / `@webkit-tablet` twin pattern in `library-images-export.spec.ts` `onEveryEngine`).
evidence  — `npx playwright test --list --project=desktop e2e/library-images.spec.ts` lists only the 820 and 390 copies.
verify    — The same `--list` command shows 1440 copies on `desktop`; a deck of large photos exported re-openable stays under 200 MB or is reported.
