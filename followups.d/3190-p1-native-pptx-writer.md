---
origin: 3190
priority: P1
recorded: 2026-11-13
area: engine
severity: high
swimlane: engineering/decisions/2026-11-13-native-pptx-writer.md §The design
deferred: large — a new OOXML writer for the CLI and the Studio, with a compatibility pass in four readers and the owner's export sign-off; a PR of its own, not the dependency bump that found it
source: https://github.com/Laticent/lattice/pull/3190
---

# Calco writes PowerPoint itself, and pptxgenjs leaves the tree

why now   — every project that installs @laticent/lattice gets image-size 1.x through pptxgenjs, and its npm audit
            lists a high advisory against us. npm overrides cannot remove it, and pptxgenjs has not been published
            since June 2025. The owner chose the native writer on 2026-11-13 ("long term and sustainable").
where     — docs/src/lib/calco/pptx.ts (writePptx, buildPptx and the post-processing it replaces),
            lib/export/pptx-export.js, lib/export/office-export.js, docs/src/components/studio/export/deck-export.js
            and pptx-assemble-worker.js, and the pptxgenjs entries in package.json and docs/package.json.
done when — `npm ls pptxgenjs` is empty at the root and in docs/; `npm audit --omit=dev` lists no image-size; the CLI,
            --editable and the Studio write PPTX through one calco writer; and the four readers in the note open the
            gallery deck in light and dark without a repair prompt.
evidence  — the structure, round-trip and parity tests in the note's §How it is proven, each with a failing arm; the
            Studio export chunk's gzip size before and after; the owner's export sign-off on the new bytes.
verify    — the adversarial trio: this replaces a third-party writer on an export path, which HARD RULE #25 counts
            as high blast radius. Run it on the PR that ships the writer.
