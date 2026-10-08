---
origin: 2599
priority: P1
recorded: 2026-10-08
area: engine
severity: medium
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
source: https://github.com/Laticent/lattice/pull/2599
---

# Give #2599's port onto the Marp bundle engine an independent checker pass

why now   — #2599 carried four fixes onto #2589's Export-to-Marp engine (`</title></svg>` before the
            peeled runtime lines, the trailer guard comment, Lattice's own comments kept out of the
            speaker notes, the in-order unclosed-`<title>` report). The fixes came out of three checker
            rounds on a parallel engine; their application to #2589's engine was self-reviewed and
            re-measured only. Its pre-merge card graded confidence high on exactly that axis. The
            bundle is an export on a security boundary.
where     — lib/core/marp-bundle-html.js (`bundleConfig` → `latticeBundle`, `latticeBundleNotes`,
            `unclosedTitle`, `withoutComments`), lib/core/marp-bundle.js (`RUNTIME_BLOCK_GUARD`,
            `RUNTIME_SCRIPTS_RE`), docs/src/components/studio/share-export.ts (`marpExportNote`);
            § 13 of the decision note, "Markup left open over the trailer".
done when — an independent checker has read that diff (squash 7ed666a7) against #2589's design, run
            real marp-cli + Chrome on hostile tails (open RCDATA/RAWTEXT/foreign content, nested SVG,
            tables, templates), and any finding is fixed with an arm that fails before the fix.
evidence  — the checker's report; for any fix, the failing-then-passing integration arm in
            test/integration/export/marp-bundle-author-script.test.js.
verify    — tier 1 checker (tier 2 trio if it finds a way to run script), because it is the one axis
            that held #2599 below very high.
