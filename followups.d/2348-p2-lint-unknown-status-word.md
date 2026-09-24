---
origin: 2348
priority: P2
recorded: 2026-09-24
---

# An unknown status word draws silently in progress and timeline-list

why now   — The Status and labels guide has to tell authors "check each status word yourself", because `at risk` (a space) or a typo draws a pill in the informational color, the same one `pilot` and `decision` use, so a reviewer reads a typo as a deliberate verdict.
where     — `lib/components/chart/progress/progress.transform.js:33`, `lib/components/chart/timeline-list/timeline-list.transform.js:35` fall back without a finding; `lib/authoring/lint-core.js:3277` (`gantt-unknown-token`) is the only status-vocabulary check. `CHART_STATUS` is `lib/components/chart/transform-utils.js:117`.
done when — `lint:deck` and the Studio editor warn on a status-slot word outside `CHART_STATUS` in `progress` and `timeline-list`, with a did-you-mean (`at risk` → `at-risk`), and `docs/src/content/docs/guides/status/component-pills.mdx` §"Two mistakes nothing catches" plus the cheat sheet line are updated.
evidence  — Fact-check on #2348: only gantt warns; kanban folds an unknown word into the lane label, state-chart only accepts its own list.
verify    — A deck with `- Adoption \`68%\` \`at risk\`` on a progress slide gets one warning from `npm run lint:deck`.
