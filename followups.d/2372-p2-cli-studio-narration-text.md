---
origin: 2372
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2372
---

# The CLI and the Studio narrate different sentences for the same deck

Found by the independent check of `lattice video deck.md` (fork 10, CLI half).

why now   — a deck's video should say what its Studio export says (the video note's §0 rule). On
            test/fixtures/q3-board-review.md, 7 of 17 slides differ between the CLI's narration
            (`resolveReadAlong` in lattice-emulator.js, which `--captions` and `--narrate` share) and
            the Studio's bake (`resolveDeck` in docs/src/components/studio/narration-bake.ts):
            dividers read "The quarter in four numbers. Section 01." against "Section 01 The
            quarter in four numbers.", the table reads its cells by row against its header row,
            slide 6 splits a sentence differently, and the auto glossary slide is narrated only
            by the CLI.
where     — the CLI resolves per RENDERED page from its DOM projection; the Studio resolves per
            SOURCE slide and, when the render is longer than the source (`glossary: auto`), stands
            its projection down and narrates the markdown flatten (narration-bake.ts §resolveDeck's
            comment says why: Present does the same, and every stored clip is keyed on that text).
            The split predates the CLI voice: `--captions` sidecars already differed.
done when — one resolver decides the narration for both, or the difference is reduced to what
            the two render paths genuinely cannot share, stated in engineering/pipeline.md §6; the
            fixture's 17 slides say the same words on both paths.
evidence  — the per-slide text on both paths for the fixture, before and after.
verify    — tier 1 checker, because Present, the Studio's export and the CLI all read it.
