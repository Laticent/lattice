studio: +1850
playground: +850
home: +850
getting-started: +850
Every route carries two accessibility fixes in shared chrome. `ui/sheet.tsx` returns focus to a sheet's opener on close
(+108 in `overlay-back`). `ui/tooltip.tsx` now describes each tooltip's trigger to a screen reader from mount, by what
the hint adds to the name, through one hidden container (+421 in `tooltip`): before, a VoiceOver swipe heard no
description, every bar icon lost its hint and nine hints only repeated their button's name. Every command palette
row now carries a one-line description of what it does (`CommandItem`'s `description`): about 1 KB of those lines on
the Studio, in `studio-commands.ts`, and the site menu's in `NavActions`. Without them VoiceOver read its generic option
hint after each row's name. The Studio adds +83 for the
eleven `useLatch` mounts and `DeckSwitcherMeta` and +48 in `studio-store` for `deckMetaFor` / `deckSourceFor`, which take
50-65 ms of render, and for an author with sixteen saved decks ~140 ms of CPU, off a phone's boot
(engineering/decisions/2026-11-09-studio-react-mount-profile.md §5-§6). Nothing to give back: each byte is the fix itself.
