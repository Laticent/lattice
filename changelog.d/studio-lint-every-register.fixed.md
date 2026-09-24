- **Fixed: the Studio now warns about a mistyped deck setting that `lint:deck` already
  flagged.** Before, the Studio editor and the Coach checked six of the deck's
  fixed-choice settings. Fifteen others went unchecked, including `guards:`, `cards:`,
  `claim:`, `corners:`, `pace:` and the `spectrum-*` family. So `guards: strcit` got no
  underline in the Studio and no Coach penalty, although the editor autocompleted the
  correct value. `buildVocabSets` now passes every setting's value list to the linter,
  so the Studio and `npm run lint:deck` report the same warnings.
