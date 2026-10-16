---
origin: 2705
priority: P2
recorded: 2026-10-16
area: theming
severity: medium
swimlane: engineering/cascade.md
source: https://github.com/Laticent/lattice/pull/2705
---

# A finish's split-panel mask reset is dead in the live preview

why now   — `lib/base/base.finish.css:1172` starts with `:where(section.finish) :is(.panel-left,
            .panel-right, .compare-left)`. The engine's packer (lib/engine/css.js packSelector)
            prefixes any selector that does not START with `section`, so the live preview gets
            `article.lattice > section :where(section.finish) …`, a section inside a section,
            which matches nothing. The flat sheet the CLI and the exported players read keeps the
            written selector, so only the Studio's and the Playground's slide are affected. It is
            the same trap #2705 fixed in the code plugin's stylesheet. Found by the checker on
            #2705; the selector is confirmed dead, but the visible effect (a legacy finish leaving
            its section mask on a split panel, "painted white") was not rendered.
where     — lib/base/base.finish.css:1172; lib/engine/css.js packSelector.
done when — the rule is written `section.finish :where(:is(.panel-left, .panel-right,
            .compare-left))` (same weight, scopes correctly), and a split slide under a legacy
            finish computes the same `--fin-backdrop-mask` in the packed and the CLI sheet.
