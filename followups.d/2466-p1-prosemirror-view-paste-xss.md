---
origin: 2466
priority: P1
recorded: 2026-10-26
area: website
severity: medium
swimlane: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
source: https://github.com/Laticent/lattice/issues/1958
---

# prosemirror-view 1.42.1 has a paste-handling XSS, and the fixed versions make a Compose paste test fail more often

```text
  P1 · [no ticket] take the prosemirror-view paste fix without breaking Compose paste on Firefox
       why now   — GHSA-c8x8-7fp4-3x9w (XSS in prosemirror-view's paste handling, < 1.42.3). The
                   Studio's Compose editor bundles prosemirror-view 1.42.1, so a hostile clipboard
                   could run script in the Studio origin, where API keys live. The bump was tried
                   on claude/fix-e-security-sweep and taken back out.
       measured  — e2e/compose-math-html.spec.ts:134 ("copying a math span and an HTML block pastes
                   the same bytes"), project gecko, real Firefox, the Studio rebuilt per version:
                     1.42.1 + model 1.25.11: 1 failure in 23 runs (flaky on main already)
                     1.42.3 + model 1.25.11: 7 failures in 20 runs (10 x 4 workers, twice)
                     1.42.8 + model 1.25.12: 5 failures in 24 runs
                   The failure is a click that times out after the paste. The undo-flash spec
                   (compose-change-flash.spec.ts:49) is flaky on every version alike (1.42.1 failed
                   2 of 8), so it is not part of this.
       where     — docs/package.json (prosemirror-view); the Compose paste path
                   (docs/src/components/studio/Compose*, clipboardTextParser / transformPasted);
                   prosemirror-view's 1.42.3 changelog for what the paste fix changed.
       done when — prosemirror-view >= 1.42.3 is in the lockfile and the gecko paste spec passes
                   at the 1.42.1 rate or better over 20+ runs.
       evidence  — the per-version run counts, before and after.
       verify    — tier 1 checker; real Firefox, Chromium and WebKit runs of the compose-* specs.
```
