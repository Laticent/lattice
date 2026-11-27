/**
 * cli-theme-import.js — `rootsOnBase`'s "does this palette import a theme" test (lib/export/cli-deck-sheet.js) as it
 * was before Segno P5b read it with the one CSS tokenizer.
 *
 * Frozen verbatim from lib/export/cli-deck-sheet.js at 893ade75. It is the ORACLE for
 * test/unit/export/cli-theme-import-differential.test.js. Nothing in lib/ may read it. Do not fix bugs here. Delete it
 * when nobody reads it.
 */
const THEME_IMPORT_RE = /@import\s*(['"])[A-Za-z0-9_-]+\1/;
const COMMENT_RE = /\/\*[\s\S]*?\*\//g;

const importsTheme = (css) => THEME_IMPORT_RE.test(css.replace(COMMENT_RE, ''));

module.exports = { importsTheme, COMMENT_RE, THEME_IMPORT_RE };
