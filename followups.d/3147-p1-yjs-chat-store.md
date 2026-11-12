---
origin: 3147
priority: P1
recorded: 2026-11-12
area: website
severity: high
swimlane: engineering/decisions/2026-11-12-chat-threads-crdt.md §8
deferred: blocked — builds on #3138's chat store; starts from main once #3138 merges (HARD RULE #17)
---

# Merge Studio chat threads across tabs with Yjs (the owner's choice)

why now   — a tab's whole-thread save is last-writer-wins, so another tab's turn can be lost; the owner chose Yjs on 2026-11-12 after the bake-off (note §7, §10)
where     — docs/src/components/studio/chat-store.ts, ArchitectChat.tsx; the note's §5 design and §8 plan
done when — chats live in one Y.Doc per deck, loaded with import('yjs') (nothing at boot); saves merge, never replace; v1 records convert inside their transaction; other tabs' turns show live
evidence  — the bake-off gate (bakeoff/property.ts) rebuilt against the real store, with mutants; two- and three-tab Playwright tests in Chromium, Firefox and WebKit; the iOS chat-storage suite on a v2 document
verify    — the adversarial trio (HARD RULE #25): it migrates user data a second time
