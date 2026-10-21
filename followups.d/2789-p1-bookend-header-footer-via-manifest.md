---
origin: 2789
priority: P1
recorded: 2026-10-20
area: engine
severity: low
swimlane: design/design-principles.md §2.2
source: the pagination rework, 2026-10-20
---

# Bookends still drop the header and footer by hand

why now   — title, divider and closing now drop their page number through their manifest (`"chrome": { "pagination": false }`), but every deck still writes `<!-- _header: '' -->` / `<!-- _footer: '' -->` on them (design-principles.md §2.2). The same manifest field could carry `header` and `footer`, with `with-header` / `with-footer` as the way back.
where     — lib/components/manifest.schema.json `chrome`, tools/build-packages-index.js `renderChrome`, lib/core/pagination.js (as a general chrome rule), lib/core/marp-bundle-scope.js.
done when — the owner rules on it; if yes, a bookend needs no `_header` / `_footer` lines and Export to Marp writes Marp's own.
evidence  — dark and light renders of a deck before and after, plus a Marp CLI render of the bundle.
verify    — tier 1 checker, engine change.
