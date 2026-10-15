/**
 * lib/plugins/code/shared/marp-export.js — what the code plugin's syntax becomes in an Export-to-Marp
 * bundle (engineering/decisions/2026-10-15-code-plugin.md §11, slice 7).
 *
 * The record line, `@code{…}` directly above a fence, configures the block in the engine
 * (../code.syntax.mjs) and renders nothing there. Marp reads no such rule, so the line would print as
 * inline code above every block that has one. The bundle kernel (lib/core/marp-bundle.js) removes it
 * from the bytes through this function, found by the engine's own block rule: a record quoted inside
 * a fence, or one with no fence below it (which the engine renders as text too), stays. What the
 * record asked for (line numbers, focus, marks, diff bands, a title, wrapping) is not drawn by Marp,
 * and lib/core/marp-fidelity.js says so in the bundle's README.
 */

const { code_record: codeRecordRule } = require('../code.syntax.mjs');

let md = null;

/**
 * The Markdown with every record line removed; a deck with none comes back byte-identical.
 * @param {string} markdown
 * @returns {string}
 */
function withoutCodeRecords(markdown) {
  const src = String(markdown ?? '');
  if (!src.includes('`@code{')) return src;
  if (!md) {
    md = require('markdown-it')({ html: true });
    md.block.ruler.before('fence', 'code_record', codeRecordRule);
  }
  const drop = new Set();
  for (const t of md.parse(src, {})) if (t.type === 'code_record' && t.map) drop.add(t.map[0]);
  if (!drop.size) return src;
  return src.split('\n').filter((_, i) => !drop.has(i)).join('\n');
}

module.exports = { withoutCodeRecords };
