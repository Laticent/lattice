- **Changed: the Studio no longer parses every saved deck at boot.** `loadDeckList` used to split
  each saved deck and count its slides for the deck switcher's label, in a menu that starts
  closed. It now splits a deck's `slides` on first read, and the switcher counts a row's slides
  when it opens (`deckMetaFor`, remembered by source). For an author with sixteen saved decks
  this takes about 140 ms of CPU off a phone's boot; a first visit is unchanged. `StudioDeck` no
  longer has a `meta` field.
- **Changed: `docs/scripts/react-mount-profile.mjs` takes `SEED=<file.json>`**, with
  `docs/scripts/seed-saved-decks.mjs` to write one, so the profile can measure a returning author
  with saved decks instead of only a first visit.
