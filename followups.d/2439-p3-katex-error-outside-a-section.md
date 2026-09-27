---
origin: 2439
priority: P3
recorded: 2026-09-27
---

# `.katex-error` is unstyled outside a slide section

why now   — the math plugin styles `section .katex-error`. The `--player` Read · Article re-hosts
            slide content outside any `section`, so a formula KaTeX could not parse shows there in
            body type with no error surface (its ink, `var(--warn)`, is inline and still applies).
            Not a regression — it was unstyled before #2439 too (HARD RULE #25 red team).
where     — `lib/plugins/math/math.styles.css`, the article stylesheet in `lib/export/`.
done when — a failed formula in the player's article renders on the same error surface as on a
            slide, shown by a `--player` render of a deck with a broken formula.
evidence  — before/after screenshots of the article.
verify    — tier 0 gates plus a look at the article.
