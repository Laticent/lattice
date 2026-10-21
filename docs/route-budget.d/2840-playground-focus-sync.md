studio: +720
playground: +1280
The Playground's editor, preview and slide map now share one Fuoco focus hub, and the editor and preview
scroll together. The playground's +1,249 B gz (CI against main b2990c6; +1,280 covers gzip variation) is the
editor's slide band, scroll and layout hooks (editor.js +963) and their wiring in the island (+829), net of
the deleted `caretSlideIndex` scanner (-698 in playground-controller). Given back first: the hub, the deck
outliner and the sync rules (lib/playground-sync.ts, fuoco/align.ts, deck-frame.ts) load by dynamic import
after first paint, which took the first cut from +9,601 B to +1,249 B; `deckFrame`/`deckTitleEnd` sit in
their own module so the Studio does not carry them, and the line table (`focusPlace`) is a function rather
than a hub method for the same reason.
The Studio's +699 B gz is what it shares with the hub: Fuoco's outline now carries an optional `kinds`
(a deck says slide and page; deck-outline.js +476) and the hub chunk reshuffles by about +130 B around the
React adapter; +720 covers gzip variation. Home is 613 B under main (the scanner leaving the controller).
