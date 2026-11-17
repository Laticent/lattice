---
origin: 3288
priority: P2
recorded: 2026-11-17
area: website
severity: medium
swimlane: engineering/decisions/2026-11-17-compose-empty-deck.md §4
deferred: off-path — the parked-change rule predates PR 3273 and PR 3288 does not change it; proving it needs a probe of its own and ~20-minute iOS Simulator runs
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
evidence  — Unproven. If (b), a person with a hardware keyboard who edits in Source and switches to Compose quickly would see
            the old text, and their first keystroke in Compose would supersede the Source edit, losing it. The probe log
            lines: "the saved deck is back, and the start grid stands down (… Compose shows 20 characters, Source holds no
            editor, focus on ProseMirror ProseMirror-focused)". The probe now restores the deck in Source and stays there,
            so this note is the only record of the question.
