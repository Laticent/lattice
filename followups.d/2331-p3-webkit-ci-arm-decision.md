---
origin: 2331
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2331
---

# Decide whether a WebKit slide-render arm runs, and where

```text
why now   — nothing in npm test, the integration tier or per-PR CI renders a slide in WebKit, so a WebKit-only regression (#2297, #1554) has no gate. The nightly already installs WebKit, but only for Studio specs.
where     — docs/playwright.config.ts (webkit projects exist), .github/workflows/studio-e2e-nightly.yml (installs webkit), .github/workflows/ci.yml.
done when — the owner picks an option from the measured table in #2331's P3 section; this is a CI-contract change (CLAUDE.md second filter, row 2) and is not the agent's call.
evidence  — measured in #2331: structural check 11.6 s over 197 slides; screenshots ~226 s; provisioning ~38 s; cross-engine pixel diff unusable (median 87,512 px/slide).
verify    — tier 0; then whatever tier the chosen option's own PR needs.
```
