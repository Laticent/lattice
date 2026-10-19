---
origin: 2782
priority: P3
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2782
---

# On real WebKit at the tablet box, a jump to 25% of a 15-slide deck can leave a placeholder under the middle of the view 600 ms later.

Found while checking #2782 on WebKit. It reproduces identically on the code before #2782's filmstrip change (19a5a50^) and after it, so it is not a regression from that PR.

```text
  why now   — a placeholder in view is the one visible failure of the virtual filmstrip.
  where     — `docs/e2e` `webkit-tablet` project; the Playground at `?c=kpi&view=read`.
              Scroll the preview frame with `scrollTo(0, 0.25 * max)`, wait 600 ms, read the
              element under the frame's vertical middle with getBoundingClientRect.
  done when — either the probe is shown to be wrong (a transform-scaled slide under the middle
              is a real section) or `syncVirtual` mounts the slide in view after a jump.
  evidence  — the probe's mounted counts and the frame at the failing offset, on WebKit.
  verify    — tier 1 checker; the real surface is WebKit (HARD RULE #23). Phone passes.
```
