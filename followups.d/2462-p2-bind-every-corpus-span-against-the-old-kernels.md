---
origin: 2462
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2462
---

# Bind every migrated corpus span against the old kernel's output

why now   — #2462's inversion review: mutation testing only finds defects someone thought
            to inject, all in engine code. It cannot find a wrong SPECIFICATION (a schema
            that binds a word to the wrong parameter) or ambiguity in phase 2's own schemas.
            The only oracle for that is today's kernels on today's decks.
where     — tools/parser-bakeoff/ (the corpus and reference kernels); phase 2's schemas.
done when — every inline span in the decks and docs, migrated by the codemod, binds through
            Segno to the value the old kernel produced from the original, with every
            intended difference listed and justified.
evidence  — the parity table in phase 2's PR body.
verify    — tier 1; the harness run.
