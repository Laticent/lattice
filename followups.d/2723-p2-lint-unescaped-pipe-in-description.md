---
origin: 2723
priority: P2
recorded: 2026-10-16
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
source: owner decision, 2026-10-16 (model note §7, `|` in a description)
---

# Lint an unescaped `|` in a chart description, and offer the fix

why now   — the owner decided that `|` in a description is allowed and the author escapes it as `\|`.
            A table cell splits on an unescaped `|` before Segno reads it, so a bare `|` in a table
            description adds a cell and shifts every value after it, with no error. Without a rule
            the author sees a wrong chart and no reason.
where     — `lib/authoring/lint-core.js` only (HARD RULE #7), beside the other chart-value rules
            (`chart-value-malformed` is the neighbor). Segno decision 4 keeps `|` reserved inside a record.
done when — a table row with one more cell than its header, where the extra cell follows a `{> …}`
            description, warns and its `fix:` says to write `\|`; a correctly escaped `\|` is silent;
            a `|` in a list description (a `>` blockquote under the item) is silent.
evidence  — a lint fixture with the three cases, before and after, and the corpus run showing 0 new findings.
verify    — self-review with the gates; it is a warning and moves no rendered value.
lands with — the first `{> …}` table description (phase 3). Nothing ships a table description today,
            so there is no deck to break before then.
