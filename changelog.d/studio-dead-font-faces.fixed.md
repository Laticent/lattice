- **Fixed: the Studio's Webpage export no longer ships a second set of font faces that cannot
  load.** The player removed the deck sheet's own `@font-face` rules only when they were spelled
  `url(fonts/…)`, the CLI's form; the Studio's `url(/playground/v/…/fonts/…)` slipped through, left
  eight `error` faces in Chromium and Firefox, and blocked the identical-file font merge. One rule now
  covers both hosts. The `examples/html-player.md` export drops from 918,858 to 735,536 bytes and is
  pixel-identical in Chromium, WebKit and Firefox. The CLI's output is unchanged.
