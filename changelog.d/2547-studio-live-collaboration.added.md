- **Edit a deck together, live, in the Studio.** A new **Live** button on the left toolbar (and
  a *Collaborate live* row at the top of the Share sheet) starts a session and copies an invite
  link. The person who opens it sees who invited them and to which deck, types a name and
  **knocks**; you admit or deny them from a toast or the Live panel. Once in, everyone edits the
  same source with colored carets, the slide navigator shows who is on which slide, you can
  **follow** someone or **bring everyone to your slide**, and the panel carries the session's
  chat. Up to **4 people**. Undo only undoes your own edits. A guest keeps a copy of the deck
  when the session ends. Audio and video are not in this release.
- **No server of ours is involved.** Edits travel browser to browser over WebRTC; peers find
  each other through public Nostr relays (Trystero 0.26.0), and the link's secret lives in the
  URL fragment, which browsers never send anywhere. Office networks that block direct
  browser-to-browser traffic will not connect. (`docs/src/components/studio/live/`)
- **New library: Tavola** (`docs/src/lib/tavola`, `@laticent/tavola`) — the invite link, the
  knock-and-admit handshake, the roster gate (only admitted members send or receive the
  document, and view-only members' edits are refused by every honest peer), the cap and rejoin
  by token, with the transport and document passed in. `checkTavolaBoundary` keeps it
  dependency-free apart from its Trystero adapter. `tools/live-session-check.mjs` drives a real
  two-browser session on demand.
