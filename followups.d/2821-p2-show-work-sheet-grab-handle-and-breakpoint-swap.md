---
origin: 2821
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-chat-transparency.md
source: https://github.com/Laticent/lattice/pull/2821
---

# Show work sheet: the grab handle does not drag, and crossing 640 px swaps sheet and dialog

```text
  P2 · [no ticket] Two nits in the Show work bottom sheet that #2821 shipped knowingly.
       why now   — the independent check on #2821 found both and the PR body names them;
                   neither blocks, but a handle that looks draggable and is not is a small lie
                   on the surface the owner will test by thumb.
       where     — docs/src/components/studio/ChatTraceDialog.tsx: the decorative handle
                   (`mt-2 mx-auto h-1 w-9`) and `useNarrow`, which switches Sheet and Dialog
                   at 640 px.
       done when — either the handle drags to dismiss (or is removed), and resizing across
                   640 px with the trace open keeps the open sections and the Raw toggle
                   (or is documented as acceptable because a phone does not cross it).
       evidence  — a WebKit run on the `webkit-phone` project (e2e/chat-sheet-webkit.spec.ts)
                   that swipes the handle down and sees the sheet close; for the swap, a
                   test that opens a `<details>`, resizes, and finds it still open.
       verify    — tier 0 gates plus the WebKit spec. Check what Claude Code's mobile sheet
                   does first: removing the handle may be the cheaper honest answer.
```
