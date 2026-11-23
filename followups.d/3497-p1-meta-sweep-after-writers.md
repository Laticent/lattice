---
origin: 3497
priority: P1
recorded: 2026-11-23
area: engine
severity: high
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
deferred: blocked — waits on #3433 (slice C), which moves the gallery generators, `injectDark` and `writeMeta` to `@meta`; this PR (#3497) finishes the items on its own branch once #3433 merges, and deletes this file
source: https://github.com/Laticent/lattice/pull/3497
---

# Slice D, the rest of the sweep: galleries under lib/, the lint skip, Lente's `_lens` writer

why now   — the cut (slice E) stops the engine reading directive comments; these are the last decks and tools the
            sweep has not moved, and E starts after D lands.
where     — after #3433 merges, rebase desk-meta/d-sweep only on a real conflict (#16), then:
            1. convert every manifest `sample` / `stressDoc.sample` / `variantDocs.*.sample` / `venueProbe` string with
               `migrateDeckText`, regenerate (`npm run build`), and run `lattice migrate meta` over the 4 hand-authored
               galleries (legal, logo, diagram bucket, diagram/diagram); delete `PENDING_GALLERY_TOOLS` in
               test/unit/core/meta-sweep-corpus.test.js;
            2. delete lib/authoring/legacy-meta-rules.js and its readers (tools/lint-deck.js, lib/authoring/scorecard.js,
               tools/lfm-conformance.js, tools/score-variance.js, test/unit/components/lint-deck.test.js,
               test/unit/authoring/coach-draft-contract.test.js); give back docs/route-budget.d/3429-meta-old-spellings.md.
               tools/lfm-conformance.js needs a rule for the 8 LFM-1.0 cases kept in comment form: put the options to the
               owner;
            3. Lente: inject a lens carrier (read + write) the way `suggestMembership`'s `classOf` is injected, backed by
               `readMetaField` / `writeMeta`, in docs/src/lib/lente/tags.ts and its Studio and tools callers; convert
               design/skills/lens.md and the Lente demo page; delete followups.d/3426-p2-lente-lens-writer-to-meta.md and
               followups.d/2772-p1-meta-step-5-codemod.md.
done when — `npm run lint:deck:all` (strict) passes with no skip; the tree test has no pending rule; Lente writes
            `@meta{lens=…}`.
evidence  — same HTML and CSS for every regenerated gallery (light and dark); `tools/pixel-check.js` `pixelDiff` on the
            4 hand-authored galleries' dark PDFs, plus a look at one; the tree test's failing arm.
verify    — tier 1 checker, because a gallery's dark PDF regressed silently once already (see #3497's checker table).
