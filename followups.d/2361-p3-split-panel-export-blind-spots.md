---
origin: 2361
priority: P3
recorded: 2026-10-06
---

# Two split-panel clips the export's overflow probe does not report

why now   — found by the checker on font-scale-fit.md Amendment (10). Both are real defects on
            the slide, and both predate that change.
            • `proof`: when the SIGNAL row is the tallest, its text runs under the cards and the
              export lists no clipped page. The rows are `1fr` with `min-height: 0`, so the signal
              `li` clips inside itself (scrollHeight 1189 against 898 at conference, 60-word
              signal) and the probe's `squeezed` measure misses it. Lint's points model reads these
              slides +13% to +51% over, so the scorer counts them "false" where lint is right.
              `capstone` overlaps the same way and is not measured for that reason.
            • `metric`: on a deck with a `header:` the LEFT panel clips by 17 to 38 px on every
              `metric` slide (the checker's p-metric probes; `gallery.md` 98 is one of them).
where     — lib/core/overflow-probe.js (`probeSectionOverflow`'s squeezed path);
            lib/components/statement/split-panel/split-panel.styles.css (the `metric` panel
            under `:has(> header)`, line 842)
done when — the export flags a `proof` signal that spills under the cards, and a `metric` slide
            under a header renders whole or is flagged; lint's points model then reads its
            signal-tallest slides as right, not false
evidence  — the checker's probe decks rebuilt (a `proof` slide with a 60-word signal; a `metric`
            slide on a header deck), rendered before and after
verify    — tier 1 checker: the overflow probe is shared by every export
