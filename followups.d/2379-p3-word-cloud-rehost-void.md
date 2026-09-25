---
origin: 2379
priority: P3
recorded: 2026-09-25
---

# The Read · Article word cloud fills a third of its box and clips its leftmost word

why now   — the figure's caption shows since the one-style-delivery P3 fix, so the void between
            the cloud and the caption at the bottom of the 3:2 box is now framed by it.
where     — `lib/export/player-core.mjs` `rehostContainerCss` and the `#lp-article .lp-spatial`
            rules in `playerCss` (`aspect-ratio:3/2`); `word-cloud.styles.css`
            (`.word-cloud-canvas` is 85.9375cqi × 25cqi against the figure).
done when — the re-hosted cloud fills its figure with no clipped word at 1440, 820 and 390, light
            and dark, in the CLI player, the Studio player and the Studio Reading view, and
            `check:render`'s reading pass still compares clean.
evidence  — examples/read-article-chart-paints.md, slide "A word cloud keeps its caption too." in
            the `--player` Read · Article at 1200px: the cloud occupies the top ~180 of 557px of
            chart row and "momentum" is cut at the figure's left edge. The same on `main`.
verify    — before/after Read · Article screenshots of that slide, light and dark.
