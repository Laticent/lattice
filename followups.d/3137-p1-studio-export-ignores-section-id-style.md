---
origin: 3137
priority: P1
recorded: 2026-11-22
area: engine
severity: medium
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
deferred: off-path — logged from a session archive sweep; the Studio export's style handling is not touched by the PR that records it
source: https://github.com/Laticent/lattice/pull/3137
---

# The Studio export ignores a deck's own `section[id]` `<style>` rules

why now   — #3137 saw the Studio export drop the effect of a deck's own `<style>` rules that target `section[id]`.
            The cause was not traced. It may be the sanitizer working as designed (`sanitizeStyleText`, HARD RULE
            #22), or the same scoping leak as followups.d/3122-p2-engine-style-scoped-leaks.md.
where     — the Studio export path (docs/src/components/studio/export/); lib/core/sanitize-style-text.mjs; the
            engine's `<style>` handling named in 3122-p2.
done when — the cause is named. If it is the sanitizer by design, the authoring docs say so and lint warns on the
            form. If it is a defect, the Studio export and the CLI export agree on a deck with a `section[id]` rule,
            pinned by a test.
evidence  — #3137's report; not reproduced in this sweep.
verify    — export one deck with a `section[id]` rule from the CLI and from the real Studio, and compare the pages.
