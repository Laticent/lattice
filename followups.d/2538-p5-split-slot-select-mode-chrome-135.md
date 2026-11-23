---
origin: 2538
priority: P5
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/architecture.md
deferred: off-path — found while auditing #2538's brief for an archive check; no open PR touches the split slot parser
source: https://github.com/Laticent/lattice/pull/2538#issuecomment-6011016959
---

# The split slot parser's `<select>` mode follows Chrome 131, and Chrome 135+ parses `<select>` differently

why now   — #2538's brief marks this UNVERIFIED: the split slot parser (`docs/src/lib/markup/tags.ts`) models a
            minimal select mode taken from jsdom and Chrome 131. Chrome 135+ changed how it parses
            `<select>` content, so a slide whose split slot holds a `<select>` may split at a
            different heading than the browser renders. Nothing else records it.
where     — `docs/src/lib/markup/tags.ts` (the select-mode notes at line 101, `SELECT_CLOSERS`) and `test/unit/core/top-level-h2.test.js`.
done when — the select mode matches current Chrome's parse, or a test proves the two agree on the
            cases the parser handles; either way a pinned case covers `<select>` with a heading inside.
evidence  — the same fixture parsed by current Chromium and by the walk, before and after.
verify    — tier 0 gates plus the parser's unit tests.
