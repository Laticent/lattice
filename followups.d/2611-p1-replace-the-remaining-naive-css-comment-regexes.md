---
origin: 2611
priority: P1
recorded: 2026-10-08
area: engine
severity: low
swimlane: lib/core/css-comments.mjs
source: https://github.com/Laticent/lattice/pull/2611
---

# Replace the remaining naive CSS-comment regexes

why now   — lib/core/css-comments.mjs says no caller should strip comments with
            /\/\*[\s\S]*?\*\//, because it reads "/*" inside a string or an
            unquoted url() as an opener; #2611 fixed minify-css, rootSpecificity
            and isRootIsh, and the tier 1 checker on #2611 found these still on it
where     — lib/components/surfaces.js:82; lib/export/cli-deck-sheet.js:64;
            lib/export/player-core.mjs:1180, 1223; lib/plugins/resolve.js:456;
            tools/build-forms.js:61, 124, 182; tools/build-packages-index.js:148;
            tools/palette-slide-parity.js:64; tools/cvd-audit.js:196, 209
            (line numbers at #2611's head; `grep -rn '\\\/\\\*\[\\s\\S\]' lib tools`)
done when — each site calls stripCssComments or maskCssComments, or carries a
            one-line reason it cannot (e.g. a browser bundle that must not grow);
            npm run build leaves every dist/*.css byte-identical
evidence  — per site, an input with "/*" inside a string that the old code
            misread, or a note that the site only ever sees comment-free text
verify    — tier 0 gates plus the dist byte diff; player-core.mjs ships in
            exported HTML, so an export-byte change there stops for sign-off
