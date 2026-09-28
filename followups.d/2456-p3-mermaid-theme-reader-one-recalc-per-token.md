---
origin: 2456
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2456
priority: P3
---

# The Mermaid theme reader forces a style recalc per token

why now   — With the Playground's virtual filmstrip (#2456) a diagram renders when its slide
            scrolls into view, so this cost now lands mid-scroll: the worst frame reading the
            58-slide Jargon gallery at 4x CPU is ~1.2s, most of it `read` in the runtime (914ms
            self time over the scroll). Each diagram group reads 166 tokens, each one setting a
            probe's `color` and reading it back.
where     — `openSectionReader` in `lib/runtime/index.js`. Shared with the Studio and the export
            parity gate (`test/unit/core/diagram-theme-parity.test.js`), so maker-checker at least.
done when — one style recalculation per diagram group: set every probe, then read them all.
evidence  — a CPU profile of the reading-speed scroll, same method as the note
            `engineering/decisions/2026-09-28-playground-virtual-filmstrip.md` §1.
verify    — tier 1: the diagram-theme parity test; tier 2: a Mermaid deck in the Playground and
            the Studio, light and dark.
