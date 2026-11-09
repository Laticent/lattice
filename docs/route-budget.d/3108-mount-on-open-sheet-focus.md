studio: +281
playground: +108
home: +108
getting-started: +108
Every route carries `ui/sheet.tsx`'s focus return (+108 in the shared `overlay-back` chunk): a sheet opened from a
plain button now gives focus back to it on close, but only when nothing else has taken focus. Before, focus was
left on the page body. The Studio adds +127 for the eleven `useLatch` mounts and `DeckSwitcherMeta`, and +48 in
`studio-store` for `deckMetaFor` / `deckSourceFor`; together they take 50-65 ms of render, and for an author with
sixteen saved decks ~140 ms of CPU, off a phone's boot (engineering/decisions/2026-11-09-studio-react-mount-profile.md
§5-§6). Nothing to give back: each byte is the fix itself.
