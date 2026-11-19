---
origin: 3291
priority: P2
recorded: 2026-11-19
area: website
severity: low
swimlane: engineering/gotchas/studio-playground.md
deferred: blocked — waits on the prosemirror-view 1.42.9 bump in Dependabot PR #3295, which carries the upstream fix
---

# Delete Compose's pointer-focus workaround once prosemirror-view 1.42.9 lands

why now   — `docs/src/lib/compose/pointer-focus-caret.ts` (PR 3291, fix B) reads a click's caret before prosemirror-view
            1.42.8's 20 ms focus timer writes the old caret back. 1.42.9 fixes that timer upstream ("Fix an issue that
            could cause a selection change right after focus to be overwritten by the old selection"): it now writes
            back only if the DOM caret has not moved since the focus, and a click moves it. On 1.42.9 the workaround is
            redundant and harmless; the upstream report PR 3291 drafted is moot, so it was not filed.
where     — `docs/src/lib/compose/pointer-focus-caret.ts`, its test, the two `handleDOMEvents` lines in
            `docs/src/components/studio/ComposeView.tsx`, and the gotcha's mitigation paragraph in
            `engineering/gotchas/studio-playground.md`.
done when — on 1.42.9 or later, the real-click first-click probe (WebKit and Gecko, 4 workers, the 134 KB deck) shows
            0 misplaced first clicks with the module removed, and the module, its test and its wiring are deleted.
evidence  — the probe counts with the module removed, against PR 3291's 15/768 unwired on 1.42.8.
verify    — tier 1: self-review with the gates, plus the probe run.
