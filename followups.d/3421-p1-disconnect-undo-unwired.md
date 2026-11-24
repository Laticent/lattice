---
origin: 3421
priority: P1
recorded: 2026-11-22
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §2
deferred: off-path — the Studio's Workspace › API key panel (`ApiKeyPanel.tsx`); this PR settles audit findings and touches no Studio UI
source: release-blockers audit, 2026-11-06 (finished session; findings existed only in its chat)
---

# Disconnect has no Undo, though the backend for one is built

why now   — The Workspace's Disconnect / Remove button drops the key at once and says so in a plain toast. The backend
            already offers `openRouterKeySnapshot()` and `restoreOpenRouter()` "so the settings UI can offer an Undo on
            Disconnect" (`architect-model.js`), and the lifecycle note §2 speaks of "the Disconnect Undo's `restore`" as if
            it shipped. Nothing in the UI calls the snapshot. A mistaken Disconnect of a signed-in key costs a fresh OAuth
            round, and on iPhone a minted key can take ~90 s to activate.
where     — `docs/src/components/studio/ApiKeyPanel.tsx` `remove()`; `docs/src/lib/notify.ts` `notifyAction`;
            `architect-model.js` `openRouterKeySnapshot` / `restoreOpenRouter`; direct providers' `keySnapshot`.
done when — Either: Disconnect / Remove shows an Undo action (`notifyAction`) that restores the same key and the same
            `via` (oauth or key), for OpenRouter and the direct providers, and the snapshot is dropped when the toast
            ends; or the unused snapshot API is deleted and the lifecycle note §2 stops naming an Undo. Pick one; both
            are fine. If Undo ships, the snapshot must not outlive the toast (a held key after "Disconnect" is the one risk).
evidence  — `grep -rn openRouterKeySnapshot docs/src` finds only its definition; `ApiKeyPanel.tsx` `remove()` calls
            `notify`, not `notifyAction`.
verify    — Playwright on the Studio: connect a pasted test key, Disconnect, Undo: the row reads the same key hint and
            `via`; Disconnect and let the toast lapse: the key is gone and no reference to it remains in the module.
            Screenshots at 1440, 820 and 390 px.
