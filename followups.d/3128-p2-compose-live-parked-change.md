---
origin: 3128
priority: P2
recorded: 2026-11-11
area: website
severity: low
swimlane: engineering/decisions/2026-11-10-compose-first.md §4
deferred: large — a co-editor's change and an IME composition on the same deck need a merge of two texts, not a replay of one; Compose's whole-deck emit has no merge step, and the live sync layer is shared with Source
source: https://github.com/Laticent/lattice/pull/3128
---

# A co-editor's change that arrives during an IME composition in Compose

why now   — #3128 made Compose apply a co-editor's change at once in a Live session (the external-source
            effect in ComposeView.tsx, `liveRef`), so a guest typing in Compose no longer drops the host's
            edit (filo-live.spec.ts, "a guest typing in Compose keeps the host's edit that arrived
            meanwhile"). It still HOLDS the change while an IME composition is open, because rebuilding the
            state mid-composition breaks the composition. When the composition ends, ProseMirror dispatches
            the composed text first; that local edit clears the held change (`pendingResyncRef.current =
            null` in the emit branch) and emits the whole deck without the co-editor's words.
where     — docs/src/components/studio/ComposeView.tsx: the external-source effect's `liveRef` branch and the
            emit branch of `dispatchTransaction`; the session sync in StudioShell.tsx (`onLiveEditorChange`,
            `h.sync`).
done when — a change that arrives mid-composition survives the composition's end: the emit after a
            composition in a session is merged with the held change (or applied as a step on top of it), and
            the composed text lands where the author typed it.
evidence  — a filo-live case that opens a composition on the guest (CDP `Input.imeSetComposition` in
            Chromium), edits on the host, commits the composition, and checks both texts on both sides.
verify    — filo-live.spec.ts on Chromium; the IME path on a real device with a Japanese or Chinese keyboard.
