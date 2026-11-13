---
origin: 2988
priority: P3
recorded: 2026-11-05
area: website
severity: low
swimlane: tools/style-needs-common.js
deferred: off-path — main's own list fails its cap when regenerated; this PR only refreshed the hashes of modules it edits
---

# The Playground loader's start-up list can no longer be regenerated under its 40% cap

why now   — on `main@2df7d83`, `node tools/style-needs-common.js --write` adds `tail:base.table-reflow`
            (PR 3031's module, now needed by at least 70% of the 342 decks), and the floor the list
            builds then reaches 40% of the sheet, so `test/unit/tools/style-needs-common.test.js`'s
            size test fails. The committed list passes only because it predates that module. PR 2988
            refreshed the hashes of the five modules it edits and kept `main`'s set of ids.
where     — tools/style-needs-common.js (THRESHOLD), tools/style-needs-common.json, the size test.
done when — `--write` on `main` produces a list that passes every test in that file: a higher
            threshold, a smaller table-reflow module, or a cap the owner raises with a reason.
verify    — npm run css:build && node tools/style-needs-common.js --write && node --test test/unit/tools/style-needs-common.test.js
