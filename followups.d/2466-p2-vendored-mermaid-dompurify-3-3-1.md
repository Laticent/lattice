---
origin: 2466
priority: P2
recorded: 2026-10-14
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
deferred: large — the last step is the Mermaid 12 migration: 11 Mermaid integration tests fail on it, and its mermaid-cli 12 needs puppeteer 25
source: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
---

# The vendored Mermaid's DOMPurify is 3.4.12, still behind the 3.4.17 every npm copy runs

```text
  P2 · [no ticket] finish bringing the vendored Mermaid's DOMPurify up to date
       why now   — 2026-11-06: the vendored Mermaid moved 11.14.0 → 11.17.2, so its bundled
                   DOMPurify went 3.3.1 → 3.4.12 (21 published advisories → 5), and zenuml moved
                   0.2.2 → 0.2.3 (DOMPurify 3.2.5 → 3.3.1). Five advisories still cover 3.4.12
                   (GHSA-cg2g-xh64-v4q7 critical, GHSA-mrv2-3pqr-j5jr high, and three low/moderate).
                   Each needs IN_PLACE, a DOM output mode with SAFE_FOR_TEMPLATES, or an XHTML
                   PARSER_MEDIA_TYPE. Mermaid calls DOMPurify on strings and, at the runtime's
                   securityLevel 'strict', runs the default config (removeScript) before any
                   author `dompurifyConfig`. That is a reading of Mermaid's source, not an exploit
                   test, and `dompurifyConfig` is not in Mermaid's `secure` key list, so a deck's
                   %%{init}%% can set it.
       where     — package.json mermaid pin; lib/plugins/mermaid/vendor/ (npm run vendor:plugins).
                   Mermaid 11.17.2 is the last 11.x and bundles 3.4.12. Mermaid 12.3.0 bundles
                   3.4.17 but fails 11 tests in test/integration/mermaid/ (font keys, look
                   support, init merge, the render worker), and @mermaid-js/mermaid-cli 12 peers
                   on puppeteer ^25. No zenuml release bundles DOMPurify 3.4 (1.0.1 has 3.3.1).
       done when — the vendored Mermaid carries DOMPurify ≥ 3.4.17, or a test shows a deck's
                   %%{init}%% cannot set `dompurifyConfig` and the five residual advisories are
                   argued unreachable with a repro for each.
       evidence  — grep -o 'DOMPurify [0-9.]*' lib/plugins/mermaid/vendor/*.min.js; the Mermaid
                   gallery rendered dark and light (export sign-off).
       verify    — tier 1 checker; it changes a sanitizer on a rendered surface.
```
