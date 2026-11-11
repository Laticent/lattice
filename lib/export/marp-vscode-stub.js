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

/**
 * The stub of one theme file: its directive comment (the one naming `@theme`) and its `@import`s of other themes, by name.
 * @param {string} css  a theme file as the hand-off registers it
 * @returns {string}
 */
function stubOf(css) {
  const text = String(css);
  // The comments the file opens with, read by position rather than by a pattern: Marp reads `@theme` from them.
  const directives = [];
  for (let at = 0; ;) {
    while (at < text.length && /\s/.test(text[at])) at++;
    if (!text.startsWith('/*', at)) break;
    const end = text.indexOf('*/', at + 2);
    if (end < 0) break;
    const comment = text.slice(at, end + 2);
    if (comment.includes('@theme')) directives.push(comment);
    at = end + 2;
  }
  if (!directives.length) throw new Error('no @theme directive comment at the top of the theme');
  const imports = [...text.matchAll(/@import\s*["']([\w-]+)["']\s*;/g)].map((m) => `@import '${m[1]}';`);
  return `${directives.join('\n')}\n${[...new Set(imports)].join('\n')}\n`;
}

module.exports = { stubOf };
