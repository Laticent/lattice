home: +109
components: +109
getting-started: +109
No new code reaches these three routes: the Playground's Deck settings sheet now loads its panel through the Studio's `lazyPanel` (lazy-panel.tsx), and that import moves the shared chunk boundary between `panel` and `palette-label` (+9,052 B and −8,634 B gz in CI against main 992664b, with −310 B from `tooltip`), a net +109 B on every route that loads both.
Given back first: the Playground's own eager JS is −2,422 B and the Studio's −607 B against main, because the vanilla panel that used to load with the page (deck-config.js `createConfigPanel`) is gone and the new one loads only when the sheet opens.
