---
origin: 3484
priority: P3
recorded: 2026-11-23
area: website
severity: low
swimlane: docs/src/components/ui/pill-tabs.tsx
deferred: off-path — unifying moves the Settings section strips, which #3484 does not touch
source: https://github.com/Laticent/lattice/pull/3484
---

# Two "fold into More" pill strips share their measuring code by copy

```text
  P3 · [no ticket] one measuring kernel under both overflow strips
       why now   — PillTabs `overflow` (#3484, the add-slide gallery's family pills) and
                   SettingsSectionTabs (docs/src/components/ui/settings-view.tsx) each keep a
                   hidden ruler, a ResizeObserver, a zero-width guard and a More/chevron pill
                   that wears the selected tab's name. The POLICIES differ on purpose: the
                   gallery folds least-used first (owner pick, 2026-11-23); Settings keeps the
                   leading run and pins the active pill. The checker on #3484 found the copy
                   had missed two lessons the original had already learned (zero-width row,
                   late web font); both were fixed there, which is the cost of two copies.
       done when — one hook measures (row width, pill widths, chevron width, font-load
                   refit) and both strips call it, each passing its own fold policy;
                   pill-tabs.overflow.test.tsx and settings-view.test.tsx stay green.
```
