---
origin: 3159
priority: P3
recorded: 2026-11-12
area: website
severity: medium
swimlane: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md §2
deferred: blocked — the fix changes a Firefox export's bytes, which needs the owner's sign-off (QUALITY BAR, exports)
source: https://github.com/Laticent/lattice/pull/3159
---

# Same-origin images in a Firefox preview frame are blocked by img-src 'self'

why now   — in a Gecko srcdoc frame 'self' does not match the parent origin, so a sample: image (an absolute same-origin URL) is likely blocked online and offline; font-src was already fixed this way
where     — lib/core/subresource-csp.mjs subresourceCspPolicy (img-src, media-src); docs/src/playground/preview-csp.js passes the page origin as fontOrigins
done when — img-src and media-src name the page origin as font-src does; a gecko e2e shows a sample: image in the Studio preview; a light and dark export of a deck with images is signed off
evidence  — the #3159 inversion reviewer's probe (img-src 'self' blocks a same-origin img in a Gecko srcdoc frame; img-src 'self' <origin> loads it)
verify    — a gecko spec rendering a deck with a sample: image in the Studio preview
