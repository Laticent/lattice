---
origin: 3224
priority: P1
recorded: 2026-11-15
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-15-compose-layout-button.md §4
deferred: large — an audit of every manifest's variants, each needing a judgment on which looks exclude each other
---

# Declare which variants are one pick-one group in every manifest

why now   — Compose's layout menu (PR 3224) and Slide settings' Reshape both toggle a variant that no axis claims, so
            picking one look of a pick-one family adds it beside the other (`cards-grid three four`). Only `image` and,
            since PR 3224, `cards-grid` declare `variantAxes`; 80 manifests carry variants.
where     — lib/components/**/**.manifest.json `variantAxes`; read by docs/src/components/studio/slide-variants.ts
            `applyVariant` / `componentLooks`.
done when — every manifest whose variants include mutually exclusive looks declares them as an exclusive axis, and a
            test walks every component's looks through `applyVariant` and fails on any result that holds two members
            the component's docs call alternatives.
evidence  — measured in PR 3224: `cards-grid three` + pick `four` wrote `cards-grid three four`.
verify    — tier 0 (unit), then the layout menu on a sample of the changed components.
