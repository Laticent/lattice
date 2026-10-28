---
origin: 2932
priority: P3
recorded: 2026-10-28
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2932
---

# A list row on a statement slide may keep the theme's ink over the dark scrim

why now   — A statement colors its heading and paragraph with the fixed card ink (`--_card-heading-ink`,
            `--_card-body-ink`, white by default) and pairs the scrim with it. No rule colors a statement's
            `li`, so a list row appears to inherit the theme's text color: dark in a light deck, on a dark scrim.
            Found by the independent check of the statement photo-contrast work, reasoned from the CSS and
            not rendered. The Coach's reader now leaves `li` out for statements, so this is not measured either.
where     — `lib/components/imagery/image/image.styles.css`, the statement `.image-text` rules (h2, p) near line 519.

done when — A light-mode statement with a bullet list is rendered and either its rows read on the scrim, or the
            statement colors `li` with `--_card-body-ink` and the Coach reads it again.
