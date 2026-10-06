---
origin: 2558
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2558
---

# Pin the red-team cases for Trama's `drawing()`

why now   — the red team's probe of the icon repaint held, but nothing pins it. And a forged
            `<circle r="1e308">` can paint over the whole chart, because the icon wrapper is
            `overflow="visible"`.
where     — test/unit/components/graph-icons.test.js; `drawing()` in docs/src/lib/trama/pipeline.ts;
            the fc-icon / sc-icon paint in the two `*.layout.js` adapters.
done when — tests pin `<animate>`/`<set>` inside a shape, a `</title>` breakout in the name, an
            entity-encoded quote, the 4000-character cap, prefixed and uppercase tags, and a `__proto__`
            id; geometry values are capped (about 1e4) or the overflow is dropped; the 265 shipped icons
            still paint intact.
evidence  — the new tests failing on a weakened `drawing()` and passing on the real one;
            examples/chart-icons.pdf pixel-identical.
verify    — tier 1 checker, because it hardens a sanctioned HARD RULE #22 sink.
