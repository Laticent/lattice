---
origin: 3150
priority: P3
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §8
deferred: off-path — product code in Compose's caret handling that this test-only PR does not touch; the cause is not found yet and needs its own trace
source: https://github.com/Laticent/lattice/pull/3150
---

# Compose: the first ArrowRight after a click and Home can leave the caret where it was

why now   — traced on #3150 (desktop Chromium, the deck in `compose-pill-editor.spec.ts`): after the pills draw, a click
            in "Shipped …", `caretSettled`, and `Home`, the first ArrowRight left the browser's caret on the same text
            node at offset 0 in 1 of 24 bare runs; every later press moved it. It is not two DOM spots for one visible
            place: both readings are `#text "Shipped "@0`. With listeners for keydown, selectionchange and DOM mutations
            installed (even from an init script, before the page loads) it did not happen in 216 runs, so the extra
            work hides it. #2875-p4 saw the same hiding under `trace: 'on'`. An author pressing an arrow just after the
            deck opens may see the first press do nothing.
where     — docs/src/components/studio/compose (the ProseMirror view and its plugins); the spec walk that forgives one
            lost press is `walkOntoFirstPill` in docs/e2e/compose-pill-editor.spec.ts.
done when — the cause is named (which handler eats or undoes the press) and fixed, and `walkOntoFirstPill` goes back to
            failing on any lost press (cap 8, not 9), passing 48 of 48 under `--workers=8`.
evidence  — the per-press trace from #3150 (offsets 0,0,1…8 in the lost run; 0,1…8 in the rest).
verify    — tier 1 checker.

tried     — (2026-11-12, #3150) keydown `defaultPrevented` was false on every press in the runs that did not lose one;
            no lost run was caught with the listeners on, so the handler is still unknown. Next try: a test hook that
            exposes the EditorView, so the spec can read `state.selection` without adding listeners.
