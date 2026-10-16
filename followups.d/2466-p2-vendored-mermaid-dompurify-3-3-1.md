---
origin: 2466
priority: P2
recorded: 2026-10-14
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
source: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
---

# The vendored Mermaid bundles DOMPurify 3.3.1, which the 3.4.16 bump does not reach

```text
  P2 · [no ticket] bring the vendored Mermaid's DOMPurify up to date, or show it is not reachable
       why now   — the 2026-10-14 bump moved every npm-resolved DOMPurify to 3.4.16, but
                   Mermaid's diagram labels are sanitized by the copy inside
                   lib/plugins/mermaid/vendor/mermaid.min.js (`DOMPurify 3.3.1`). Mermaid is
                   vendored and ignored by Dependabot on purpose, so nothing will move it.
       where     — lib/plugins/mermaid/vendor/; `npm run vendor:plugins` (dependabot.yml's
                   comment on vendored plugin libraries); the mermaid pin in package.json.
       done when — either the vendored Mermaid carries DOMPurify ≥ 3.4.16 (a Mermaid upgrade or
                   a re-vendor), or a note shows which 3.3.1 → 3.4.16 fixes Mermaid's config
                   can reach and that none applies.
       evidence  — `grep -o 'DOMPurify [0-9.]*' lib/plugins/mermaid/vendor/mermaid.min.js`;
                   for an upgrade, the Mermaid gallery rendered dark and light (export sign-off).
       verify    — tier 1 checker, because it changes a sanitizer on a rendered surface.
```
