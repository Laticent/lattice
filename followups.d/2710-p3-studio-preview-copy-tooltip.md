---
origin: 2710
priority: P3
recorded: 2026-10-15
area: code
severity: low
swimlane: engineering/decisions/2026-10-15-code-plugin.md §9
source: https://github.com/Laticent/lattice/pull/2710
---

# The copy buttons' tooltip never shows in the Studio preview

why now   — the Studio's preview box is `pointer-events-none` and its frame `tabindex=-1`, so neither hover nor keyboard focus reaches the buttons there; a click works through the tap bridge (code-copy-host.js). The tooltip works in the Playground, Present and the exported webpage.
where     — docs/src/playground/code-copy-host.js, StudioShell.tsx preview holder.
done when — hovering a copy button in the Studio preview shows its label, from a parent-side hover bridge, or the decision not to is recorded.
evidence  — a screenshot of the Studio preview with the tooltip shown.
verify    — docs/e2e/code-copy.spec.ts.
