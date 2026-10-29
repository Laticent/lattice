---
origin: 2964
priority: P2
recorded: 2026-10-29
area: website
severity: medium
deferred: off-path — Studio service-worker warm-up; PR 2964 changes page copy only
swimlane: engineering/decisions/2026-07-02-docs-pwa.md
source: https://github.com/Laticent/lattice/pull/2964
---

# Three Studio offline warm-up specs fail on main, and the nightly that should say so times out

```text
  P2 · [no ticket] make the Studio's offline warm-up specs green again
       found     — 2026-10-29, while proving PR 2964's "works offline" claim. On a real
                   build:e2e + preview, desktop project, --retries=0, three specs in
                   docs/e2e/studio-warm-offline.spec.ts fail:
                   :80  Present and the reading view open offline — "the warm-up never cached
                        PresentOverlay, ReadArticle, narration-projection, player-core.generated,
                        player-prune.generated, lattice-katex.js"
                   :132 a diagram never rendered online draws offline — settles "error"
                   :182 every on-demand Studio surface opens offline — "Workspace launcher"
                        click times out
                   The other three (Fabricate offline, Save-Data, the phone tabs) pass.
       not 2964  — the same three fail identically with main's versions of the three docs
                   files that PR changes; nothing in it touches the Studio or docs/public/sw.js.
       why now   — the specs are nightly-only, and studio-e2e-nightly has not reported:
                   10-28 timed out at 45 min, 10-27 failed, 10-26 cancelled. So the comparison
                   page's "works offline" is true for the Studio shell but not, today, for
                   Present, the reading view or a first-time diagram.
       suspect   — #2906 (97b3034) "drop the home runtime prefetch" touched the warm-up
                   path; bisect from there.
       done when — the three specs pass on a real build with --retries=0, and the nightly
                   finishes inside its timeout.
```
