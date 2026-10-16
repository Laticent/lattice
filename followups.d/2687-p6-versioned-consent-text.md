---
origin: 2687
priority: P6
recorded: 2026-10-14
area: engine
severity: low
swimlane: engineering/decisions/2026-10-14-plugin-inline-door.md §11
source: https://github.com/Laticent/lattice/pull/2687
---

# Version the plugin consent text before approvals pile up in users' browsers

why now   — `pluginConsentText` (lib/packages/code-shape.mjs) grows a segment only when the segment is present (the
            fence, then the inline kinds and their slots). Each new pinned thing (the opt-in "reads every code span"
            tier of the note's §5, a `styles.css` decision) widens it the same way, and a format change invalidates
            every approval. The inversion lens on #2687 asked for a versioned, structured text while re-approval is
            still cheap.
where     — lib/packages/code-shape.mjs `pluginConsentText`, lib/packages/trust.js and docs/src/lib/code-packages/door.ts
            `pluginDigest`, the approval stores (`lattice-code-package-approvals`, the CLI trust file).
done when — the text leads with a version, the doors accept the current and the previous version for one release, and
            a test pins both digests. Before phase G.
evidence  — the unit arms in test/unit/cli/code-door-fence.test.js.
verify    — tier 1 checker; the red team if the migration keeps old approvals.
