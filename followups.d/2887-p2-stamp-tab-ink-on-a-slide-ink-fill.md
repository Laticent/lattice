---
origin: 2887
priority: P2
recorded: 2026-10-24
area: theming
severity: low
swimlane: lib/base/base.variants.css
source: https://github.com/Laticent/lattice/pull/2887
---

# The default stamp tab writes `--on-accent` on a slide-ink fill

```text
  P2 · stamp tab ink is not paired with its fill
       why now   — the status survey for #2887 found the default stamp (`.confidential`, `.wip`,
                   `.draft`, … and `stamp-tab`) paints `color: var(--on-accent)` on
                   `background: var(--stamp-color)`, and `--stamp-color` is the slide ink
                   `--fail` / `--warn`. `--on-accent` is solved against `--accent`, not against
                   those inks, so nothing guarantees the tab's label clears 4.5:1 on its fill.
       where     — lib/base/base.variants.css, the DEFAULT + TAB rule (`section.stamp-tab::before`)
                   and the `--stamp-color` assignments above it.
       done when — the tab's label ink is paired with its fill by construction (for example the
                   status solid under `--on-solid`, as every status mark now is), and a
                   tools/composed-contrast.js surface scores it on every palette and face.
       evidence  — no composed-contrast surface models the stamp tab today; the pairing is
                   visible in the rule itself.
       verify    — node tools/composed-contrast.js lists a stamp-tab surface with no pair below 4.5.
```

Off the path of #2887: stamps are document classification (CONFIDENTIAL, DRAFT), not status
marks, and the PR does not touch them (engineering/decisions/2026-10-24-status-is-one-system.md
§5). The pairing predates the PR.
