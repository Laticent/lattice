---
origin: 2466
priority: P2
recorded: 2026-10-14
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
source: https://github.com/Laticent/lattice/pull/2688
---

# The other two red Dependabot groups: docs security (#2569) and routine (#2582)

```text
  P2 · [no ticket] land the two Dependabot groups still red after the DOMPurify fix
       why now   — GitHub reported 122 open vulnerability alerts on main on 2026-10-14
                   (1 critical, 51 high). #1497's DOMPurify and esbuild bumps landed by hand
                   (decisions/2026-10-14-dependabot-prs-never-merge.md §5); these two still
                   cannot merge.
       where     — #2569 (docs: sharp 0.34 → 0.35, esbuild 0.27 → 0.28, svgo 4.1) fails
                   docs-build tests; #2582 (routine, 17 updates) fails lint on the new Biome's
                   rules (useOptionalChain) and the build's lint-coverage check.
       done when — both groups' updates are on main, by Dependabot or by hand, with any code
                   the new versions need.
       evidence  — the merged PRs; the vulnerability count GitHub prints on push, before/after.
       verify    — tier 0 gates for the Biome fixes; tier 1 checker for sharp/svgo, because
                   they touch image and SVG output.
```
