---
origin: 3033
priority: P3
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-11-03-security-findings-spine.md
deferred: blocked — the stale list reproduces only in the built Studio (jsdom renders no cmdk rows), so each attempt costs a full docs build, and the cause is not found yet
source: https://github.com/Laticent/lattice/pull/3033
---

# A command palette opened before a row applies never shows that row

why now   — Found driving the editor-lint "Fix all" spec in Gecko and WebKit. `StudioShell` rebuilds `studioCommands` every
            render and adds "Fix all issues" once `fixableIssues > 0`, and the toolbar's Fix all button enables then. But a
            palette that was already open, filtered to "Fix all", keeps showing only "How do I fix every issue at once?",
            even after the search is typed again. Closing and reopening it shows the row. A person who opens ⌘K while lint
            is still counting a large deck sees no Fix all row.
where     — docs/src/components/studio/CommandPalette.tsx (the Actions group), cmdk 1.1.1.
done when — a row that starts to apply while the palette is open appears in it, with an e2e arm that fails on today's code:
            type a large deck, open ⌘K at once, fill "Fix all", and wait for the row without closing.
evidence  — the probe in the continuation PR: in Gecko the button enabled 1.3 s after typing, the open palette's options
            stayed ["How do I fix every issue at once?"] after a retype, and a reopen listed ["Fix all issues", …].
verify    — self-review plus that e2e arm in Chromium, Gecko and WebKit.
