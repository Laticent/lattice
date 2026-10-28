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

**Partial run, 2026-10-26 (PR claude/fix-e-security-sweep).** An independent checker read squash
7ed666a7 (through the API; the sandbox clone is shallow) and built a harness: `tools/export-marp.js
--no-agent`, then marp-cli 4.5.1 / marp-core 4.4.0 with the bundle's own `marp.config.cjs`, then
Chromium 131, recording `__hit*` globals, dialogs, every `<script>` with its namespace, every `on*`
attribute, iframes and `data-lattice-runtime`, over two arms (the stripped bundle, and the raw deck
plus the bundle's trailer). Only two benign decks ran, both clean; the `open-title` deck confirmed
fixes 1 and 4 on that one input (the export printed the unclosed-`<title>` report). The checker
was stopped before it built the hostile decks, so **every hostile tail below is still UNVERIFIED**:
open RCDATA/RAWTEXT (`<textarea>`, `<style>`, `<xmp>`, `<noscript>`, `<iframe>`, `<noembed>`,
`<plaintext>`), foreign content (`<svg><svg>`, `<math>`, `<svg><desc>`, `<svg><foreignObject>`),
open tables and foster parenting, `<template>`, an unclosed `<!--`, combinations, mid-deck
variants, and fix 3 under hostile input. From reading the code only: `<iframe>`, `svg`, `title`
and `desc` are on the bundle's allowlist, and `</title></svg>` closes exactly one title and one
SVG level, so a nested `<svg>`, an open `<iframe>` or an open `<math>` at the end of the deck is
the first place to look. The harness was not kept (it lived in `.scratch/`); rebuild it from this
description.
