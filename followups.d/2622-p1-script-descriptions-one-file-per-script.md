---
origin: 2622
priority: P1
recorded: 2026-10-09
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-09-generated-indexes-uncommitted.md §6
source: engineering/decisions/2026-10-09-generated-indexes-uncommitted.md
---

# Move npm script descriptions out of the one shared SCRIPT_META map

```text
  P1 · [no ticket] Give each npm script's description its own file, so SCRIPT_META stops
       being a map every script-adding PR edits.
       why now   — tools/build-capabilities.js was in 9 of the 50 commits to 953301c4. The
                   capability index stopped being committed in #2622; its source map is now
                   the shared file in that path.
       where     — tools/build-capabilities.js (SCRIPT_META, read it from a folder instead),
                   a new one-file-per-script folder, test/unit/tools/capabilities-row-budget.test.js.
       done when — adding an npm script touches package.json and one new file, and no shared
                   map; `capabilities:check` still fails on an undescribed script.
       evidence  — `git log --no-merges -50 --name-only <base> | grep -c build-capabilities.js`
                   before and after a few weeks.
       verify    — tier 1: build:check green; capabilities:check fails on a script with no file.
```
