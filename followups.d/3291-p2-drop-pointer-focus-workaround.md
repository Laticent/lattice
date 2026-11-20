---
origin: 3291
priority: P2
recorded: 2026-11-19
area: website
severity: low
swimlane: engineering/gotchas/studio-playground.md
deferred: blocked — prosemirror-view 1.42.9 fixes the first-focus race for WebKit only; Gecko still needs the module until upstream fixes it
---

# Delete Compose's pointer-focus workaround once prosemirror-view fixes the race in Gecko too

why now   — `docs/src/lib/compose/pointer-focus-caret.ts` (PR 3291, fix B) reads a click's caret before prosemirror-view's
            20 ms focus timer writes the old caret back. 1.42.9 changed that timer to write back only if the DOM caret has
            not moved since the focus. That fixes WebKit, which fires `focus` before the click moves the caret. It does
            not fix Gecko, which fires `focus` with the caret already at the click (instrumented: `focus@5` before the
            first `selectionchange`, against WebKit's `focus@0`), so the check sees no move and the timer still writes
            back when Firefox's `selectionchange` arrives after 20 ms.
measured  — real-click first-click probe, the 134 KB deck, 4 workers, module unwired (2026-11-20, the PR that took 1.42.9):
            1.42.8 WebKit 45/96, Gecko 2/96; 1.42.9 WebKit 0/192, Gecko 1/192. Every miss landed at the top of the deck.
where     — `docs/src/lib/compose/pointer-focus-caret.ts`, its test, the two `handleDOMEvents` lines in
            `docs/src/components/studio/ComposeView.tsx`, and the gotcha's mitigation paragraph in
            `engineering/gotchas/studio-playground.md`.
unblocks  — a prosemirror-view release whose focus timer also stands down when the DOM caret already differs from
            ProseMirror's selection at focus time because of a pointer (an upstream report would need the owner's OK).
done when — on that release, the real-click probe (WebKit and Gecko, 4 workers, the 134 KB deck) shows 0 misplaced first
            clicks with the module removed, and the module, its test and its wiring are deleted.
evidence  — the probe counts with the module removed, against the 1.42.8 and 1.42.9 counts above.
verify    — tier 1: self-review with the gates, plus the probe run.
