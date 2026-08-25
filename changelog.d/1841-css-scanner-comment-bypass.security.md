- **A string spelling `/*` could blank an exfil payload out of the component
  gate.** Every scanner in `lib/layout/gate.js` blanked comments with a naive
  `/\/\*[\s\S]*?\*\//` — the exact regex `lib/core/css-comments.mjs` exists to
  abolish. Comments and strings are not independent layers, so a
  `content: "/*"` paired with the next real closer and blanked everything
  between: `gateCss` returned **zero findings** over CSS carrying both a remote
  `@import` beacon and a remote `url()` exfil, in the gate that decides whether
  CSS reaches a same-origin preview frame holding the user's OpenRouter key. The
  scanners now read comments through the canonical walk.
- **The CSS safety scanners moved to `lib/core/css-scan.js`**, shared by the
  component gate and the new theme gate. Reaching them through the component gate
  pulled a 41 KB manifest schema into the theme browser bundle for two regex
  scanners that know nothing about components.
- **`findCssExfil` no longer reports against the wrong line** when a stylesheet
  carries CSS escapes (it was counting lines in the shortened decoded copy), and
  both scanners index line numbers once instead of per finding — a 260 KB sheet
  went from 9.4s to 45ms, and a 20 000-statement paste from 17.2s to 0.5s, in
  scanners a live editor runs on every keystroke.
