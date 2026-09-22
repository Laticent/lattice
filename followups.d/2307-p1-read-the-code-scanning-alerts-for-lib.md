---
origin: 2307
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2307#issuecomment-5777628875
backfill: true
---

# Read the code-scanning alerts for lib/authoring/lint-core.js

Backfilled verbatim from the continuation brief on #2307 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Read the code-scanning alerts for lib/authoring/lint-core.js
       why now   — #2307's changelog says it "removes the spanning tag regex CodeQL's
                   bad-tag-filter query flags". The regex removal is directly verified;
                   the alert clearing is not. No alerts API was reachable from the
                   sandbox session, and an Analyze job concludes success whether or not
                   alerts exist. This is the last unverified claim from that PR.
       where     — the repo's Security → Code scanning tab, filtered to
                   lib/authoring/lint-core.js on 9ab285748. Also check whether
                   js/bad-tag-filter has hits ELSEWHERE in the tree — never enumerated.
       done when — the alert on that file is gone (or is named, with a reason it stands),
                   and the tree-wide hit count for that query is known.
       evidence  — the alert list for that query, pasted or screenshotted.
       verify    — tier 0, because it reads a dashboard and changes no behavior.
```
