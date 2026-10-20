/**
 * lib/plugins/mermaid/shared/nested-fences.js — the Mermaid fences INSIDE a blockquote or a list item,
 * which the CLI's line walker (lib/core/mermaid-fences.js) deliberately does not model.
 *
 * The walker opens a fence only at 0–3 spaces of indent with no `>` prefix, so `> ```mermaid` and a fence
 * under `10. Tenth step` indented four spaces shipped as highlighted source from the CLI while the
 * preview, the Studio and its Webpage export drew them, and every later figure's id shifted
 * (followups.d/2739-p7). The walker's header explains why it stops there: modelling list markers, lazy
 * continuation and quote prefixes is a block parser, and a wrong guess turns an indented CODE block into a
 * picture.
 *
 * So this does not model them. It asks the parser the engine uses: markdown-it, in the engine's own
 * configuration (`commonmark`, html on), reports each fence token with its line range, its info string and
 * its nesting level, and a candidate is a fence the engine itself will mark `language-mermaid`. A fence the
 * parser does not see as a fence is never a candidate, so what the engine reads as code cannot over-match.
 *
 * It is the engine's parser, not its whole pipeline: the engine adds math blocks and pane carving on top, which a
 * bare `commonmark` parse does not know, so a fence between two `$$` lines is skipped here (the engine reads it as
 * math). Node only (the bake is); the narrator reads these shapes through `firstMermaidFenceBody`'s prefix strip.
 *
 * @module
 */

const MarkdownIt = require('markdown-it');
const { isMermaidInfo, matchMermaidFences } = require('../../../core/mermaid-fences');

let md;
const parser = () => md || (md = new MarkdownIt('commonmark', { html: true, breaks: true }));

/**
 * Mermaid fences nested in a quote or a list, in document order: the ones the flat walker does not return, and
 * the indented ones it does return inside a list item (the caller drops its own entry for those).
 *
 * Each has `start`/`end` (character offsets of the whole fence, opener line start to closer line end),
 * `body`, and `prefix`: what stands before the fence marker on its opener line (`> `, `    `, `10. `),
 * which a replacement block must repeat on every line to stay inside the same container.
 *
 * @param {string} source markdown
 * @returns {Array<{ start: number, end: number, body: string, marker: string, prefix: string }>}
 */
function matchNestedMermaidFences(source) {
  const src = String(source || '');
  if (src.indexOf('mermaid') === -1) return [];
  let tokens;
  try {
    tokens = parser().parse(src, {});
  } catch {
    return [];
  }
  const flat = matchMermaidFences(src);
  const lines = src.split('\n');
  const lineStart = [];
  let at = 0;
  for (const l of lines) {
    lineStart.push(at);
    at += l.length + 1;
  }
  const out = [];
  for (const t of tokens) {
    if (t.type !== 'fence' || t.level === 0 || !t.map || !isMermaidInfo(t.info)) continue;
    const [first, end] = t.map;
    const open = lines[first] || '';
    const m = /(`{3,}|~{3,})/.exec(open);
    if (!m) continue;
    // The closer is the last mapped line, and it must close: an unclosed fence runs to the end of its
    // container, and a substitution that swallowed the rest of it is the worse failure.
    const closer = (lines[end - 1] || '').replace(/^[\s>]*/, '');
    if (end - 1 <= first || !new RegExp(`^${m[1][0] === '`' ? '`' : '~'}{${m[1].length},}\\s*$`).test(closer)) continue;
    // Between two `$$` lines the engine reads math, not a fence (a rule this bare parser does not have).
    if (lines.slice(0, first).filter((l) => /^[\s>]*\$\$\s*$/.test(l)).length % 2 === 1) continue;
    const start = lineStart[first];
    const stop = lineStart[end - 1] + (lines[end - 1] || '').length;
    // The flat walker also opens a fence indented one to three spaces, and inside a list item that is the
    // item's continuation (`- point:` then a blank line and `  ```mermaid`). Its splice starts at column 0, so
    // the figure left the item (the Studio draws it inside), and with it the rest of the list. Such a fence
    // is reported here with its indent as the prefix, and the bake takes this entry over the flat one
    // (followups.d/2739-p11). A fence the walker found at no indent is the walker's alone.
    const prefix = open.slice(0, m.index);
    if (!prefix && flat.some((f) => start < f.end && stop > f.start)) continue;
    out.push({ start, end: stop, body: t.content, marker: m[1], prefix });
  }
  return out;
}

/**
 * `html`, placed where a fence with this `prefix` stood: every line carries the container prefix, with a
 * list marker turned into spaces after the first line, and no blank line (it would end the HTML block, and
 * with it the quote or the item).
 *
 * @param {string} html
 * @param {string} prefix
 * @returns {string}
 */
function reprefix(html, prefix) {
  const rest = prefix.replace(/\d{1,9}[.)]|[-*+](?=\s)/, (m) => ' '.repeat(m.length));
  return String(html)
    .replace(/\n[ \t]*(?=\n)/g, '')
    .split('\n')
    .map((l, i) => (i === 0 ? prefix : rest) + l)
    .join('\n');
}

module.exports = { matchNestedMermaidFences, reprefix };
