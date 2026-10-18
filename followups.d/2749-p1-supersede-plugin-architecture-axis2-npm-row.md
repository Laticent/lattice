---
origin: 2749
priority: P1
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2749
area: docs
severity: low
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6
---

# Supersede the npm row of Axis 2 in the plugin-architecture note.

why now   — the Axis 2 table still says an npm plugin carries code, Node-side, resolved at build
            time. The owner decided on 2026-10-17 that npm plugins run only in the locked
            page in v1, with no bake, and send no code to a viewer's browser; they may hand data to the host (threat-model note §6 decision 10). A later session reading Axis 2 would build against the old contract. This
            PR only adds a pointer inside the row.
where     — engineering/decisions/2026-09-13-plugin-architecture.md Axis 2, and the matching row
            of engineering/decisions/2026-09-27-plugin-system.md §4.10.
done when — both rows say what v1 allows (locked page, fragment or host-sanitized data back, never code, no bake, no Studio or desktop
            loading) and mark the earlier wording superseded with a link, with
            `status: superseded` and `superseded-by` set only if a whole note is replaced.
evidence  — the two edited rows and `node tools/build-decisions-index.js --check`.
verify    — tier 0 gates, a docs-only edit.
