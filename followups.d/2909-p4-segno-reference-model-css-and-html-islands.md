---
origin: 2909
priority: P4
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: large — D8 makes R4 one PR per consumer, each its own migration with its own differential; the CLI's HTML export is the one left
source: https://github.com/Laticent/lattice/pull/2909
---

# The CLI's HTML export keeps its own CSS reference reader (R4, the last consumer)

why now   — R4 moved the gallery gate, the Studio's Webpage export and the narrator onto the shared readers
            (`scanHtml`, `cssRefSpans`), and found the linter had no reader to move (the note's three "R4" sections).
            The inversion review of the narrator's PR found one more reader no list had named:
            `lib/export/html-player.js` `inlineDocAssets`, which embeds a deck's local files into the CLI's
            self-contained HTML. It finds them with `mapCssUrls` and its own `cssString`, `cssUnescape` and
            `mapSrcset`, and matches only a literal `url(`, so it misses `u\72l(a.png)`.
where     — lib/export/html-player.js (`mapCssUrls`, `mapSrcset`, `inlineDocAssets`); the note's R4 row and "Left".
done when — `inlineDocAssets` reads `url()` with `cssRefSpans` (and markup with `scanHtml` where it reads tags), and its
            own tokenizer is gone; then R4 is closed and the census of private reference readers is zero.
evidence  — a frozen copy of `html-player.js`'s reader in `tools/segno-legacy/`, a differential on every rendered deck
            (same embedded bytes), seeded CSS soups against Chromium, and a failing arm, as the other R4 PRs did.
verify    — tier 2 trio: it decides which local files a self-contained export reads off disk.
