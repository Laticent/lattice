- `npm run parser:bakeoff:languages:browsers` times Segno's generated CSS, HTML and Markdown
  parsers in Chromium, Firefox and WebKit, before and after a generator change. The 2026-10-07
  generator changes made all three faster in every engine (Firefox 1.24x–1.56x, WebKit
  1.21x–1.55x).
- `npm run parser:bakeoff:segno` no longer counts spans written in Segno's notation as ordinary
  code. The retired kernel passes those through in about 30 ns while Segno reads them as records,
  which inflated the ordinary-code row from about 1.9x to 4.5x. They now have a row of their own.
- Segno tests a character set with more than 16 ranges above ASCII by binary search, in both
  `compile()` and `generate()`. A 32k-range set read 256k characters in 11.4 s; it now takes
  about 6 ms. No shipped parser changes.
