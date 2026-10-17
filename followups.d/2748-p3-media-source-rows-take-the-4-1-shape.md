---
origin: 2748
priority: P3
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.1
source: https://github.com/Laticent/lattice/pull/2748
---

# The source rows have no `scheme` or `resolve`, and two CSS `sample:` matchers still sit beside the table

why now   — §4.1 gives each row a `scheme` and `resolve(id, host)`. PR #2748's rows carry `id`, `locality`, `exportAs` and
            `parse`, and `resolveAssetUrl` still branches on `row.id`, so a new source still edits that function. Two
            `(?:sample|asset):` text matchers remain in `bg-image.js` (`SAMPLE_CSS_URL` and the pre-checks beside it); they
            scan CSS text rather than classify a reference, so they were left, and they are the last place the grammar repeats.
where     — `lib/core/media-sources.js`; `lib/core/bg-image.js:118,133-134`; `lib/engine/background-image.js`.
done when — each row has `scheme` and `resolve`; `resolveAssetUrl` loops the table instead of branching; the CSS matchers read
            the table's scheme list; the differential test in `test/unit/core/media-sources.test.js` still passes.
verify    — `npm run build:check` and the unit suite; grep `lib/` for `sample|asset` regex literals and find none outside the table.
