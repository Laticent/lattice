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

const { readFences } = require('./read-fences.js');

/**
 * The Markdown with every record removed; a deck with none comes back byte-identical. Only the record
 * span goes: a record written as a list item's first line (`- \`@code{…}\``) or inside a quote keeps
 * its `- ` or `>`, so the item and the fence it holds stay where they were. A line left blank goes.
 * @param {string} markdown
 * @returns {string}
 */
function withoutCodeRecords(markdown) {
  const src = String(markdown ?? '');
  if (!src.includes('`@code{')) return src;
  const { records } = readFences(src);
  if (!records.length) return src;
  const drop = new Set(records);
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (!drop.has(i)) {
      out.push(line);
      return;
    }
    const prefix = line.slice(0, line.indexOf('`')).replace(/\s+$/, '');
    if (prefix.trim()) out.push(prefix);
  });
  return out.join('\n');
}

module.exports = { withoutCodeRecords };
