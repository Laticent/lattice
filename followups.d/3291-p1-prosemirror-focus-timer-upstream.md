---
origin: 3291
priority: P1
recorded: 2026-11-17
area: website
severity: low
swimlane: engineering/gotchas/studio-playground.md
deferred: blocked — owner approval to file upstream (an issue on ProseMirror's tracker is externally visible)
---

# Report prosemirror-view's focus timer overwriting a click's caret before the click's `selectionchange` arrives

why now   — Compose now works around it (`docs/src/lib/compose/pointer-focus-caret.ts`, PR 3291), but the race is in
            prosemirror-view itself and hits every editor built on it. The workaround leans on the internal's 20 ms
            delay; `pointer-focus-caret.test.ts` fails if an upgrade changes it. An upstream fix would let us delete
            the workaround.
where     — prosemirror-view 1.42.8, `dist/index.js` line 3934, `handlers.focus`; and `selectionToDOM`, line 2300,
            whose guard against writing during a held mouse button applies on Chrome only (`if (!force && chrome &&
            mouseDown)`, line 2307).
done when — the owner has decided whether to file it; if yes, the issue below is filed and linked here, and this file
            is deleted when it lands or is declined.
evidence  — the report text below, ready to paste.
verify    — n/a (a decision, then a link).

## The report, ready to paste (not filed: the owner decides)

**Title:** Focus handler's 20 ms `selectionToDOM` can overwrite the caret a click just placed (WebKit, Firefox)

**What happens.** `handlers.focus` (prosemirror-view 1.42.8) starts a 20 ms timer when the editor gains focus. When it
fires, if `domObserver.currentSelection` differs from the DOM selection, it calls `selectionToDOM(view)` and writes the
state's selection back. When a mouse click is what focused the editor, the browser has already moved the DOM caret to
the click, but ProseMirror has not read it yet: that happens on `selectionchange`. On a busy page WebKit delivered that
`selectionchange` about 190 ms after the click, so the 20 ms timer saw a "foreign" DOM selection and reverted it. The
caret jumped back to the state's selection (the start of the document for a freshly opened editor), and the user's
first keystrokes went there. `selectionToDOM`'s guard for a held mouse button (`chrome && mouseDown`) covers Chrome only.

**Timeline (WebKit, Playwright real mouse, a long document, page under load):**
`mousedown` on paragraph 3 (DOM caret still at doc start) → `focus` (+20 ms) → `mouseup` (+31 ms, DOM caret now in
paragraph 3) → no transaction dispatched → `selectionchange` (+221 ms) reports the caret back at doc start.
Seen in 3 of 96 first clicks in WebKit on a 134 KB document; Firefox showed it at machine pace too.

**Minimal repro sketch.** A long document (enough that the first render keeps the main thread busy), an unfocused
editor, a real mouse click in a paragraph far from the selection, then type immediately. Repeat with the page under CPU
load; the typed text sometimes lands at the old selection.

**Suggested fix.** When the focus comes from a pointer (an active `view.input.mouseDown`), read the DOM selection
(`domObserver.flush()`) instead of writing the state's selection, or extend the `selectionToDOM` mouse-down guard beyond
Chrome.

**Our workaround.** On a focus caused by a mousedown, call `domObserver.flush()` on a 0 ms timer, which runs before the
20 ms one.
