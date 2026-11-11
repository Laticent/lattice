---
origin: 3129
priority: P2
recorded: 2026-11-11
area: website
severity: medium
swimlane: engineering/decisions/2026-11-11-studio-storage-pointer-records.md §4 item 4
deferred: off-path — #3129 shipped the three boot and silent-loss fixes the owner asked for; this is the plan's next item
source: https://github.com/Laticent/lattice/pull/3129
---

# Warn before localStorage fills, and move chats to IndexedDB

why now   — Deck text, chats and settings share one localStorage allowance per origin (about 5.2 M characters in
            Chromium and Firefox, half that in WebKit once a deck has a non-Latin-1 character). #3129 made a refused
            deck save visible; nothing yet warns before it happens. Chats are the cheapest thing to move: nothing
            reads them before paint or on `pagehide`.
where     — The Privacy & Data tab (`governance.ts`, `WorkspaceSheet.tsx`): a warning past 80% of the localStorage
            allowance. Chats: `CHAT_PREFIX` / `loadChat` / `saveChat` in `studio-store.ts`, readers in
            `ArchitectChat.tsx` and `panel-shells.tsx`.
done when — The tab warns past 80%; chats load from IndexedDB with a migration that deletes each localStorage key only
            after its transaction commits; the note's §4 item 4 decision (whether deck text must move) is taken with
            the warning's evidence.
evidence  — engineering/decisions/2026-11-11-studio-storage-pointer-records.md §2, §3, §6 (the constraints for moving
            deck text, if it comes to that).
verify    — `storage-bench.cjs` "everything" row before and after; an e2e that fills localStorage and sees the warning.
