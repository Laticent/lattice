---
origin: 2466
priority: P1
recorded: 2026-10-14
area: infra
severity: high
swimlane: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
source: https://github.com/Laticent/lattice/pull/2688
---

# No Dependabot PR can merge; the DOMPurify security fix has been blocked since 2026-08-09

```text
  P1 · [no ticket] unblock Dependabot, starting with the security group (#1497)
       why now   — DOMPurify, the sanitizer behind sanitizeSlideHtml (HARD RULE #22), has a
                   patch release (3.4.11 → 3.4.16) that has not landed in two months. 0 of 60
                   Dependabot CI runs went green from 2026-09-20 to 10-14.
       where     — engineering/decisions/2026-10-14-dependabot-prs-never-merge.md §3–§4;
                   #1497 (build:check: three stale lib/export/*-bundle.generated.mjs),
                   #2569 (docs-build tests), #2582 (Biome lint rules).
       done when — the owner has picked an option in that note's §4 and it is carried out:
                   at least the security bumps are on main with the bundles rebuilt.
       evidence  — the merged PR; for a bundle rebuild, dark and light renders of a demo deck
                   for export sign-off (CLAUDE.md QUALITY BAR export exception).
       verify    — tier 1 checker, because it changes shipped export bundles and a sanitizer.
```
