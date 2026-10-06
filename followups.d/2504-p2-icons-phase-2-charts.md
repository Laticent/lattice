---
origin: 2504
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2504
---

# Icons phase 2: `icon=` and `icon-only` on flowchart, state-chart and hub-spoke

why now   — phase 1 shipped the plugin and the `services` point; the chart kernels are its next
            callers (engineering/decisions/2026-09-29-inline-icons.md § 5.3, § 10, § 12).
where     — lib/components/chart/flowchart, state-chart (their `segno` style slots gain a named
            `icon` and an `icon-only` flag; each manifest declares `"plugins": { "optional": ["icons"] }`),
            hub-spoke once #2396 lands; the kernels call lib/plugins/services.js `service('icons', …)`.
done when — a node draws its icon beside its text (before it in `lr`, above it in `tb`, § 11 q1),
            `icon-only` keeps the text as the accessible name and title, lint refuses an
            `icon-only` node with no text, and with the plugin off a node shows its text alone.
evidence  — a demo deck rendered light and dark; the bundle delta.
verify    — tier 1 checker; the chart galleries render unchanged without icons.
