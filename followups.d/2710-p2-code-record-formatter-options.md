---
origin: 2710
priority: P2
recorded: 2026-10-15
area: code
severity: medium
swimlane: engineering/decisions/2026-10-15-code-plugin.md §9
source: https://github.com/Laticent/lattice/pull/2710
---

# `@code` formatter options: indent, quotes, and a line-width lint

why now   — the owner chose all three on 2026-10-15 (PR #2710), as a follow-up PR. A code block's readability and copy-paste fidelity depend on its indentation and quote style, and today the record cannot set either; a line wider than the panel is clipped silently unless `wrap` is on.
where     — lib/plugins/code/shared/record.js (SPEC), lib/authoring/code-format/adapters.mjs (Prettier `tabWidth`/`useTabs`/`singleQuote`, ruff `indent-width`/`quote-style`, sql-formatter `tabWidth`/`useTabs`), lib/plugins/code/code.styles.css (`tab-size`), lib/authoring/lint-core.js (rule 12c).
done when — `indent=2|4|tab` and `quotes=single|double` are record fields and deck defaults (`code: indent=4`), each formatter honors them, a tab renders at the chosen width instead of the browser's 8, and lint:deck warns when a code line is wider than its panel fits (the same column budget `width=` uses), with no option for chaining, which none of the formatters has.
evidence  — golden outputs per formatter for each option; a rendered slide with `indent=tab` before and after.
verify    — test/unit/authoring/code-format.test.js, test/unit/plugins/code-record.test.js, a lint-core arm.
