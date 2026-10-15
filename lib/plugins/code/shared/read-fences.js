/**
 * lib/plugins/code/shared/read-fences.js — a deck's fenced blocks and their `@code{…}` records, read
 * exactly as the render reads them: markdown-it with the code plugin's own `code_record` block rule
 * (../code.syntax.mjs). The one reader for every consumer outside the render (HARD RULE #1):
 *
 *   - the formatter's planner (lib/authoring/code-format/plan.mjs) — which blocks to format;
 *   - the Marp export (./marp-export.js) — which record lines to take out of the bundle.
 *
 * Reading with the engine's parser is what makes a fence inside an HTML comment or an HTML block not
 * a fence, a record written under a sentence not a record (it continues the paragraph), and a closing
 * fence indented four spaces not a close — for every consumer, the way the slide shows it.
 */

const { code_record: codeRecordRule } = require('../code.syntax.mjs');

let md = null;
function parser() {
  if (!md) {
    md = require('markdown-it')({ html: true });
    md.block.ruler.before('fence', 'code_record', codeRecordRule);
  }
  return md;
}

/**
 * @param {string} markdown  the deck (front matter blanked or absent, so line numbers stay the deck's)
 * @returns {{ fences: Array<{ start: number, end: number, info: string, markup: string, content: string,
 *   nested: boolean, record: string|null }>, records: number[] }}
 *   `start`/`end`: 0-based line indices of the opener and one past the last line (markdown-it's map);
 *   `nested`: inside a list or a blockquote; `record`: the `@code{…}` text configuring this fence;
 *   `records`: the 0-based line of every record the render reads as one
 */
function readFences(markdown) {
  const src = String(markdown ?? '');
  const fences = [];
  const records = [];
  if (!/^ {0,3}(?:`{3,}|~{3,})/m.test(src) && !src.includes('`@code{')) return { fences, records };
  const tokens = parser().parse(src, {});
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === 'code_record' && t.map) records.push(t.map[0]);
    if (t.type !== 'fence' || !t.map) continue;
    const prev = tokens[i - 1];
    fences.push({
      start: t.map[0],
      end: t.map[1],
      info: t.info,
      markup: t.markup,
      content: t.content,
      nested: t.level !== 0,
      record: prev?.type === 'code_record' ? prev.content : null,
    });
  }
  return { fences, records };
}

module.exports = { readFences };
