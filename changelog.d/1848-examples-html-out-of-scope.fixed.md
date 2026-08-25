- **Fixed: previewing an example deck can no longer redden the US-English gate.**
  `checkUsEnglish` now drops `examples/**/*.html` by path. The emulator writes a
  gitignored `.html` sibling beside every PDF it renders — ~375 British spellings for
  one 70-slide deck, roughly a third of the whole repo-wide budget — so a tree that
  had merely looked at a deck failed `npm run build` on bytes nobody authored while
  CI, on its clean checkout, stayed green. The `.md` decks themselves stay in scope.
