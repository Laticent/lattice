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

## Owner ruling, 2026-10-22 — do not work this item in the preview line

**Headers and footers get their own review session.** Several sessions are changing them, so no session in the preview line touches them. The proposal above (the manifest carrying `header` and `footer` for bookends) is not approved or rejected; the review session decides it against the rules below.

The owner's expectations, which that session starts from:

1. **Front matter sets it for every slide.** If the author puts `header:` or `footer:` in the front matter, every slide gets it, except a slide whose component turns it off by default in its manifest (the bookends today, for the page number).
2. **`with-header` / `with-footer` brings it back.** On any slide that opted out by default, the author can add the class and gets the header or footer. No cleverness: the author is always right, even when a smarter rule would say otherwise.
3. **`_header:` on a slide is that slide's own.** A slide-level `_header:` overrides the front-matter one for that slide.
4. **`no-header` beats a custom header.** A slide with both its own `_header:` and `no-header` shows no header. The same holds for footers.

The review session should check each rule against what the engine does today and list the gaps; it should not assume any of the four already holds.
