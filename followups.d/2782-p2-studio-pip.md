---
origin: 2782
priority: P2
recorded: 2026-10-19
area: studio
severity: medium
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2782
---

# Adopt Veduta in the Studio: picture-in-picture on live, wireframe and pill tiles.

```text
  why now   — the Studio is the intended first user; held until the Playground adoption is proven.
  where     — docs/src/components/studio (SlideRail, FocusedPreview); pool rank/onSettle diff from
              the audit spikes.
  done when — the Studio preview mounts what Veduta asks for, reports capacity with settle, and
              has first/last commands.
  evidence  — three-width screenshots; Studio e2e smoke run and stated.
  verify    — adversarial trio (HARD RULE #25): shared preview path, high blast radius.
```
