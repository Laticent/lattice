/**
 * marp-vscode-stub.js — `stubOf` of lib/export/marp-vscode-stub.js as it was before Segno P5b read it with the one CSS
 * tokenizer.
 *
 * Frozen verbatim from lib/export/marp-vscode-stub.js at 3176d626. It is the ORACLE for
 * test/unit/export/marp-vscode-stub-differential.test.js. Nothing in lib/ may read it. Do not fix bugs here. Delete it
 * when nobody reads it.
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
