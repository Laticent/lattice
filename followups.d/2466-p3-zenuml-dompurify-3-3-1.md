---
origin: 2466
priority: P3
recorded: 2026-11-10
area: engine
severity: low
swimlane: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
deferred: blocked — no @mermaid-js/mermaid-zenuml release bundles DOMPurify 3.4 (1.0.1, the latest, carries 3.3.1)
source: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
---

# The vendored ZenUML still bundles DOMPurify 3.3.1

```text
  P3 · [no ticket] bring the vendored ZenUML's DOMPurify up to date
       why now   — 2026-11-10: the vendored Mermaid moved 11.17.2 → 12.3.0 and its DOMPurify
                   3.4.12 → 3.4.17, which closes the five advisories the earlier note tracked for
                   Mermaid. ZenUML moved 0.2.3 → 1.0.1 in the same change and still bundles
                   DOMPurify 3.3.1. ZenUML draws only a `zenuml` fence, and only in the CLI bake's
                   locked page (lib/plugins/host-page-worker.js: no network, strict CSP), so the
                   reach is narrower than Mermaid's was.
       where     — package.json `@mermaid-js/mermaid-zenuml` pin; lib/plugins/mermaid/vendor/
                   mermaid-zenuml.min.js (npm run vendor:plugins).
       done when — a ZenUML release bundles DOMPurify ≥ 3.4.17 and the plugin vendors it, or a
                   test shows a `zenuml` fence's labels cannot reach ZenUML's DOMPurify with an
                   IN_PLACE, SAFE_FOR_TEMPLATES or XHTML config.
       evidence  — grep -o 'DOMPurify [0-9.]*' lib/plugins/mermaid/vendor/mermaid-zenuml.min.js
       verify    — tier 1 checker; it changes a sanitizer on a rendered surface.
```
