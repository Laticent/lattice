- **Fixed: a viewer's own scroll re-seats a `bounds: 'host'` walkthrough's chrome.** The caption and
  the Exit chip are measured against the visible part of the host and live in a fixed layer, so a
  scroll left them describing where the host used to be. The handler is rAF-coalesced and compares
  the seated geometry before it writes, so a scroll of a host that already spans the window — the
  common case — does no layout work at all. Registered only under `bounds: 'host'`, which no shipped
  Lattice tour uses today: this closes a library-API limit rather than a Studio defect.
