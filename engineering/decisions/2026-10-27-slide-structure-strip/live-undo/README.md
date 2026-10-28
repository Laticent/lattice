# Evidence: Undo for slide ops in a real Live session, on Filo

Ran on 2026-10-28 against this branch after its rebase onto Filo (#2940; item 6 of the design note, §7). The check
uses two separate headless Chromium processes, the real Live transport over the public Nostr relays and real WebRTC,
and the docs dev server (`cd docs && npx astro dev --port 4321`). Like `tools/live-session-check.mjs` it reaches
third-party relays, so it is on-demand only. Run it with
`BASE=http://localhost:4321/studio/ node engineering/decisions/2026-10-27-slide-structure-strip/live-undo/live-undo.mjs`
while the dev server is up.

In a Live session Filo hands ⌘Z to the binding's undo manager, which undoes only this browser's edits. A strip op is a
step of its own there (`stopCapturing` around its shared-text write). `live-undo.mjs` starts a session on a five-slide
deck (Alpha … Echo) at 1440px, sets the link to **Can edit**, and admits a second 1440px browser.

**A. Undo after a peer's edit.**

| Step | Host | Guest |
|---|---|---|
| Host taps Delete on Bravo; others are in the room, so it asks first | asked: **yes**, then deleted | Alpha Charlie Delta Echo |
| Guest types "Guest typed." at the end of Echo | has the typing | — |
| Host presses Ctrl+Z with focus on a strip control | Alpha **Bravo** Charlie Delta Echo, typing kept | the same, docs equal |
| Host presses Ctrl+Shift+Z from the strip | Alpha Charlie Delta Echo | the same |
| Host presses Ctrl+Z again | Alpha Bravo Charlie Delta Echo | the same, typing kept |

**B. The note's Undo with nothing changed since.**

| Step | Host | Guest |
|---|---|---|
| Host deletes Delta; the note reads "Slide deleted." with Undo | Alpha Bravo Charlie Echo | the same |
| Host taps the note's Undo | Alpha Bravo Charlie **Delta** Echo | the same |

**C. A deck that changed and came back.** The host deletes Charlie, types "x", pauses, and presses Backspace, so the deck
reads exactly as the delete left it (checked: true). The note's Undo is gone (shown: 0), because it would take back the
Backspace, not the delete. ⌘Z from the strip then walks back in order:

| ⌘Z | Host | Stray "x" |
|---|---|---|
| 1 (the Backspace) | Alpha Bravo Delta Echo | yes |
| 2 (the typing) | Alpha Bravo Delta Echo | no |
| 3 (the delete) | Alpha Bravo **Charlie** Delta Echo, guest the same | no |

The first build of item 6 had its own slide history beside the editor's undo; its two-browser record is in this PR's
history. Filo's one history replaced it, and these runs pin the result.
