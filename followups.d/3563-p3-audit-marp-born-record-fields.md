---
origin: 3563
priority: P3
recorded: 2026-11-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
deferred: blocked — the owner asked for the audit first and will decide after #3563 and the one-record PR land (2026-11-27)
source: https://github.com/Laticent/lattice/pull/3563
---

# Decide the Marp-born record fields: background-*, color, style, paginate

why now   — The owner asked which `@meta` fields are load-bearing for Lattice and which only exist because Marp had
            them. Measured on 2026-11-27 over the shipped decks (examples, exemplars, baselines: 4,292 records):
            · `background-color`, `background-image`, `background-position`, `background-repeat`, `background-size`:
              Marp's directives. A record writes raw inline CSS on the `<section>` (`background-color:#123456`),
              past the theme and the finishes. 0 uses.
            · `color`: Marp's. Inline text color (`color:#ff0000`), past the theme. 0 uses.
            · `style`: Marp's. In a record it does nothing: no HTML and no CSS. 0 uses.
            · `paginate`: Marp's old name for `pagination`. 0 uses.
            · `theme`, `size`, `lang`, `marp`: Marp's deck keys; front matter only, 0 in records.
            · Lattice-native and used: `layout`/`variant`/`class` (1,730), `footer` (1,072), `header` (231),
              `pagination`, `hide`, `logo`, `focus`, `focus-style`, `focus-steps`, `build`, `track`, `debug`, `lens`.
            The recommendation put to the owner: retire all eight Marp-only fields from the record vocabulary, each
            with a lint error and a fix (`background-image` becomes a `![bg](…)` line, `paginate` becomes
            `pagination`, the rest are removed in favor of a theme, finish or tone). The owner chose to decide later.
where     — the `meta` plugin manifest (lib/plugins/meta), lib/core/meta-keys.mjs, the apply step in lib/engine/slides.js,
            lib/authoring/lint-core.js, the Export-to-Marp writer, spec/LFM-2.0.md §2.1 and the docs that list fields.
done when — the owner has ruled on each field, and the vocabulary, lint, docs and spec match the ruling.
evidence  — this census rerun on the day, and the render probe for each field.
verify    — render a slide with each field before and after; lint:deck --fix on a deck that uses each.
