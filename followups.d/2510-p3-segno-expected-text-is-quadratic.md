---
origin: 2510
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2510
---

# Segno builds every "expected …" message eagerly, which is quadratic on growing chains

why now   — The checker on the FIRST/FOLLOW fix (claude/segno-phase-2) found that once those
            fixpoints are linear, `expectedAt()` dominates: it writes the "expected …" text for
            every expression up front, and on a chain whose FIRST sets grow from rule to rule
            (`r_i = alt(chars(c_i), ref(r_i+1))`) each text lists everything reachable. 6.5 s to
            lint 2,000 such rules; at 4,000, `expectedAt()`'s recursive `walk` overflows the stack
            (`RangeError`), on main as well. `leadingRefs()` is the next entry in the profile, and
            `visit()` overflows on 2,000 levels of nested `opt`. Only grammars written at runtime
            (the /segno page) can reach these sizes; no shipped grammar is near them.
where     — docs/src/lib/segno/grammar.ts: `expectedAt()` (its `add()` also scans with
            `parts.includes`), `leadingRefs()`, `visit()`; compile() and codegen.ts, which ask for
            the text at build time.
done when — the expected text is built on the error path only (or capped, with a count of the
            rest), the walks are iterative, and a 4,000-rule growing chain lints in under a second
            with no RangeError.
evidence  — lint() times at 1k/2k/4k on the growing chain, before and after; the segno suites
            and the 320,000-grammar differential (scratch harness in the PR) unchanged.
verify    — tier 1: generated messages are what an author reads, and the generator's output must
            stay byte-identical for the shipped notation grammar.
