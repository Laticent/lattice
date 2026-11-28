/**
 * lib/export/marp-vscode-stub.js — the theme a Marp hand-off registers with Marp for VS Code: the real theme's directives and
 * nothing else.
 *
 * Marp for VS Code re-processes every registered theme on every keystroke, and re-processing our 1.1 MB engine stylesheet was most
 * of the preview's typing delay (engineering/gotchas/vscode.md, "Typing is slow in the VS Code preview"). So the copy-and-go kit
 * and an Export-to-Marp bundle register this stub in `.vscode/settings.json` instead: the `@theme` name and its `@size` list,
 * which Marp needs to find the theme and size the slides, and a palette's `@import` of the theme it extends. The styling arrives
 * from the VS Code-shaped stylesheet the deck links (tools/build-marp-vscode-css.js), which that build cuts by packing the real
 * theme against THIS stub, so the two halves cannot disagree. marp-cli keeps registering the full theme.
 *
 * Pure, fs-free: the CLI producer, the Studio's in-browser producer and the build all call it.
 */

const { cssTokens, cssImports } = require('../core/css-tokens');

/**
 * The stub of one theme file: its directive comment (the one naming `@theme`) and its `@import`s of other themes, by name.
 * Read on the one CSS tokenizer (Segno P5b): the directives are the closed comments before the first token that is not
 * whitespace or a comment, and an import is an `@import` of a quoted plain name ended by a `;`, so one inside a comment
 * or a string is not one, and one spelled `@IMPORT` is.
 * @param {string} css  a theme file as the hand-off registers it
 * @returns {string}
 */
function stubOf(css) {
  const text = String(css);
  const directives = [];
  for (const t of cssTokens(text)) {
    if (t.type === 'ws') continue;
    if (t.type !== 'comment') break;
    const comment = text.slice(t.from, t.to);
    if (comment.length < 4 || !comment.endsWith('*/')) break;
    if (comment.includes('@theme')) directives.push(comment);
  }
  if (!directives.length) throw new Error('no @theme directive comment at the top of the theme');
  const imports = cssImports(text)
    .filter(({ to, target }) => target?.type === 'string' && target.closed && THEME_NAME.test(target.value) && text[to - 1] === ';')
    .map(({ target }) => `@import '${target.value}';`);
  return `${directives.join('\n')}\n${[...new Set(imports)].join('\n')}\n`;
}

// A theme name as the stub has always written it: what `@import '<name>';` can carry without escaping.
const THEME_NAME = /^[\w-]+$/;

module.exports = { stubOf };
