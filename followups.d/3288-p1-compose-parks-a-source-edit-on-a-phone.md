---
origin: 3288
priority: P1
recorded: 2026-11-17
area: website
severity: high
swimlane: engineering/decisions/2026-11-17-compose-empty-deck.md §4
deferred: blocked — only the iPhone Studio suite has shown it, and that suite cannot reach this step until PR 3291 fixes the red compose probe that runs first; a local repro did not reproduce it
source: https://github.com/Laticent/lattice/pull/3288
---

# On an iPhone with a keyboard, Compose may park a Source edit made just before the switch

why now   — The empty-deck probe on PR 3288 restored a deck in Source, then switched back to Compose, on the iPhone
            simulator (runs 44087025343 and 44092405081). Both times Compose kept showing the empty deck: 20 characters in
            the editor, the editor focused, and the start grid still up 10 s later. Source held the restored text, and the
            next probe (the icon grid) read it there. The same steps pass on Playwright's WebKit at the iPhone size.
where     — docs/src/components/studio/ComposeView.tsx: the `source` effect parks an outside change while the view has focus
            (`pendingResyncRef`, D2), and a fresh local edit supersedes a parked one (the emit branch). StudioShell.tsx
            `composeFocusAtMount` / `takeArriveFocus`: a phone's Compose pane is rebuilt when it comes back, and takes the
            keyboard when one is attached (`hasRealKeyboard`), as the simulator's is.
done when — a probe (or e2e test) shows which of these holds, and the code matches it: (a) the shell's `source` reaches a
            rebuilt Compose before it takes the focus, so nothing is parked; or (b) it can arrive after, and then a parked
            change is applied at once when the author has not typed in Compose yet, instead of waiting for a blur.
mechanism — Found by reading, not reproduced. A Source edit reaches the shell's `source` inside a React transition
            (StudioShell.tsx `setSourceFromEditor`: `React.startTransition(() => setSourceRaw(text))`), so `source` can trail
            the Source editor. The phone's Compose cell switches with `setEditMode(m, { focus: fromEditor })`, which is true
            from Source, and a desktop switch asks for focus when `hasRealKeyboard()`. If the switch renders before the
            transition commits, Compose is built from the old text and takes the focus; the edit then arrives as an outside
            change and is parked, and the author's next keystroke supersedes it.
repro     — Not reproduced on 2026-11-17: in desktop Chromium (1440px) and Playwright WebKit (iPhone 15 Pro), Source text
            replaced by `execCommand('insertText')` and Compose clicked in the same task left Compose unfocused and showing
            the edit, and the edit survived a keystroke. The scripted click did not give Compose the focus there, so the
            path above was not reached; the iPhone simulator did reach it (focus on ProseMirror in both runs).
evidence  — Unproven. If (b), a person with a hardware keyboard who edits in Source and switches to Compose quickly would see
            the old text, and their first keystroke in Compose would supersede the Source edit, losing it. The probe log
            lines: "the saved deck is back, and the start grid stands down (… Compose shows 20 characters, Source holds no
            editor, focus on ProseMirror ProseMirror-focused)". The probe now restores the deck in Source and stays there,
            so this note is the only record of the question.
