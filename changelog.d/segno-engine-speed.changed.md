- `npm run parser:bakeoff:languages:browsers` times Segno's generated CSS, HTML and Markdown
  parsers in Chromium, Firefox and WebKit, before and after a generator change. The 2026-10-07
  generator changes made all three faster in every engine (Firefox 1.24x–1.56x, WebKit
  1.21x–1.55x).
- `npm run parser:bakeoff:segno` no longer counts spans written in Segno's notation as ordinary
  code. The retired kernel passes those through in about 30 ns while Segno reads them as records,
  which inflated the ordinary-code row from about 1.9x to 4.5x. They now have a row of their own.
