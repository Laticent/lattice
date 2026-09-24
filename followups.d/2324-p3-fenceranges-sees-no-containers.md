---
origin: 2324
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2324
---
# Compose's `fenceRanges` sees no list or blockquote containers

why now   — the 2324-p1 fix bounds a closer at the opener's column plus three, which is
            exact at top level but only approximate inside containers, where CommonMark
            measures from the container's content column. Two gaps remain, both older
            than that fix and not made worse by it:
            (1) a list-item opener indented past the content column — `- a\n\n     ```\n
            x\n       ```` — closes at column 7 here; markdown-it keeps that line as
            body. Code after it reads as prose, so a `_class` comment there would hoist.
            (2) a blockquote fence (`> ```` … `> ````) is invisible: the regex takes no
            `>` prefix, so its body is not masked. Math inside it over-locks (safe); a
            `_class` comment inside it would hoist.
where     — docs/src/components/studio/slide-directives.ts `fenceRanges`. The engine's
            own splitters (lib/core/split-slides.js, lib/authoring/slide-split.js) share
            the container-blind shape, so a shared, container-aware scanner is the
            honest fix (HARD RULE #1), not a Compose-only patch.
done when — both inputs above mask exactly what markdown-it's fence tokens cover, pinned
            by a unit test that compares `fenceRanges` against `MarkdownIt().parse` fence
            maps over a small corpus that includes list, nested-list and blockquote fences.
evidence  — the differential test failing before and passing after.
verify    — tier 1 checker, because the scanner decides the Compose slide lock.
