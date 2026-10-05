---
origin: 2532
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2532
---

# CLI PDF / PPTX exports can embed the deck, like the Studio's "Re-openable in Lattice"

why now   — #2532 lets a Studio PDF or PowerPoint carry its `.lattice`, so a recipient can
            import and edit it. A deck built with `lattice export --pdf/--pptx` cannot, so
            the same deck is re-openable or not depending on which tool exported it.
where     — lib/export (PDF and PPTX writers) + the CLI flags; reuse the payload shape and
            part names in docs/src/components/studio/embedded-source.ts (move the embed half
            to lib/core so both callers share it, HARD RULE #1).
done when — an opt-in flag (e.g. `--reopenable`) embeds a comment-free `.lattice`, and a CLI
            export imports through the Studio's Import deck byte-for-byte.
evidence  — engineering/decisions/2026-10-05-reopenable-exports.md §6.
verify    — export a deck with the flag, import the PDF and PPTX in the Studio, and compare
            the stored source.
