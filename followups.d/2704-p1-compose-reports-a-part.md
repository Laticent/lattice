---
origin: 2704
priority: P1
recorded: 2026-10-15
area: website
severity: medium
swimlane: engineering/decisions/2026-10-15-fuoco-focus-sync.md §11
source: https://github.com/Laticent/lattice/pull/2704
---

# Compose reports a unit, not a part, so a Compose caret under a heading shows the slide's first rendered section

why now   — a heading-split deck is the default; in Compose the preview and rail stop at the authored slide's first section while the markdown editor reaches the right one.
where     — docs/src/components/studio/StudioShell.tsx onComposeChange → hub.reportUnit; Compose's own caret model.
done when — a Compose caret under the second `##` of a slide highlights that rendered slide in the rail and preview.
evidence  — a Studio screenshot of Compose on examples/split-headings.md with the caret under a later heading.
verify    — add a case to docs/e2e/compose-stress.spec.ts; drive the real Studio.
