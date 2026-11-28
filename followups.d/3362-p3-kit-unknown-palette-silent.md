---
origin: 3362
priority: P3
recorded: 2026-11-20
area: engine
severity: medium
deferred: off-path — the copy-and-go kit's theme registration; PR 3362 changes the coda and the kit's docs, not which palettes it ships
swimlane: engineering/decisions/2026-11-20-coda-and-marp-parity.md
source: https://github.com/Laticent/lattice/pull/3362
---

# A kit deck that names a palette the kit does not ship renders unstyled, silently

```text
  P3 · [no ticket] warn, or ship, when a kit deck names an unknown palette
       why now   — dist/marp-kit registers cuoio and cuoio-dark only. A deck with
                   `theme: indaco`, rendered with `marp --pdf` and the kit's
                   marp.config.cjs, came out as plain Marp default styling on all 41
                   slides, with no warning (measured 2026-11-20). The README's "If the
                   slides look plain" list does not name this cause.
       done when — either the kit ships every palette, or the runtime/README names
                   the unknown-theme cause, and a render of `theme: indaco` in the kit
                   shows the fix.
```
