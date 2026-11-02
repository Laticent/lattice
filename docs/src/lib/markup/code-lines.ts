/**
 * code-lines.ts — highlighted code split into one balanced HTML fragment per SOURCE line, so line N on a slide is
 * line N of the fence, whatever the tokens span.
 *
 * A newline inside a highlighter's `<span>` (a multi-line comment or string) closes every open span at the end of
 * its line and re-opens them at the start of the next, so each fragment is balanced on its own. The newline that
 * ends the last line is a terminator, not the start of an empty extra line (markdown-it always leaves one).
 *
 * The input is highlight.js's output: text with `<` and `>` escaped, plus `<span …>` and `</span>` tags. Other
 * tags pass through as text.
 */
export function splitCodeLines(code: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let cur = '';
  let i = 0;
  while (i < code.length) {
    if (code.startsWith('<span', i)) {
      const e = code.indexOf('>', i);
      if (e < 0) {
        cur += code.slice(i);
        break;
      }
      const tag = code.slice(i, e + 1);
      cur += tag;
      open.push(tag);
      i = e + 1;
      continue;
    }
    if (code.startsWith('</span>', i)) {
      cur += '</span>';
      open.pop();
      i += 7;
      continue;
    }
    const ch = code[i];
    if (ch === '\n') {
      lines.push(cur + '</span>'.repeat(open.length));
      cur = open.join('');
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  // What follows the final newline is a line only if it holds TEXT. Tags alone are not one: a grammar that wraps the
  // whole block in a sub-language span (erb, handlebars, php-template, every template language) closes that span
  // after the last newline, which once counted as an extra, empty line. highlight.js escapes `<` and `>` in code
  // text, so a raw one is only ever part of a tag: the fragment holds text when a character other than `<` starts it
  // or follows a tag's `>`.
  if (/(?:^|>)[^<]/.test(cur) || lines.length === 0) lines.push(cur);
  return lines;
}
