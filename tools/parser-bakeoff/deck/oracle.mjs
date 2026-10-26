// markdown-it's BLOCK structure for a document, as a list of strings: the oracle every arm must match.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const MarkdownIt = require('markdown-it');
export const md = new MarkdownIt('commonmark', { html: true, breaks: true }).enable(['table', 'strikethrough']);
md.core.ruler.disable(['inline', 'text_join']);
const KEEP = new Set(['paragraph_open', 'paragraph_close', 'heading_open', 'heading_close', 'bullet_list_open', 'bullet_list_close',
  'ordered_list_open', 'ordered_list_close', 'list_item_open', 'list_item_close', 'blockquote_open', 'blockquote_close',
  'fence', 'code_block', 'html_block', 'hr', 'table_open', 'table_close', 'thead_open', 'tbody_open', 'tr_open', 'th_open', 'td_open']);
/** One line per block token: type, tag, map, and for leaves the info/markup that decides it. */
export function blockSignature(src) {
  const out = [];
  for (const t of md.parse(src, {})) {
    if (!KEEP.has(t.type)) continue;
    let s = `${t.type} ${t.tag}`;
    if (t.map) s += ` ${t.map[0]}-${t.map[1]}`;
    if (t.type === 'fence') s += ` ${JSON.stringify(t.info)}`;
    if (t.type === 'ordered_list_open' && t.attrGet('start')) s += ` start=${t.attrGet('start')}`;
    if ((t.type === 'paragraph_open') && t.hidden) s += ' tight';
    out.push(s);
  }
  return out;
}
