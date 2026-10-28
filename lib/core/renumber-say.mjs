/**
 * lib/core/renumber-say.mjs
 *
 * The WRITE side of the front-matter `say:` map, whose reader is `resolve-narration.mjs` (`frontMatterSayMap`). Its
 * own module because only the Studio's slide ops call it: inside `resolve-narration.mjs` it rode a chunk every docs
 * route loads, and cost the home page and the Playground bytes they never run. Pure and dependency-free.
 */

/**
 * Renumber the front-matter `say:` keys after the deck's slides moved. `map(n)` gives the numbers slide `n` has now:
 * an empty list drops its entry (the slide was deleted), two or more copy it (the slide was duplicated, and its copy
 * reads the same words). Only the key digits of `say:` entry lines change, so every other byte of the deck, the
 * comments and quoting inside `say:` included, comes back as it was. Returns `md` itself when nothing changed.
 * The deck ops call this so a move, add, duplicate or delete keeps each entry on its slide
 * (engineering/decisions/2026-10-27-slide-structure-strip.md §8).
 */
export function renumberFrontMatterSay(md, map) {
  if (!md || typeof md !== 'string') return md;
  const fm = md.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!fm) return md;
  const start = md.indexOf('\n') + 1;
  const body = fm[1];
  // Lines with their own line endings, so the rewrite can put back exactly what it read.
  const lines = body.split(/(?<=\n)/);
  const block = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].replace(/\r?\n$/, '');
    if (!inBlock) {
      if (/^say:[ \t]*$/.test(text)) inBlock = true; // root indent only, as `blockLines` reads it
      continue;
    }
    if (text.trim() === '') continue;
    const indent = text.match(/^(\s*)/)[1].length;
    if (indent === 0) break;
    block.push({ i, indent, text });
  }
  if (!block.length) return md;
  const entryIndent = Math.min(...block.map((l) => l.indent));
  let changed = false;
  const out = lines.slice();
  for (const { i, indent, text } of block) {
    const m = indent === entryIndent ? text.match(/^(\s*)(\d+)(\s*:[\s\S]*)$/) : null;
    if (!m) continue;
    const n = Number(m[2]);
    const to = map(n);
    if (to.length === 1 && to[0] === n) continue;
    changed = true;
    const eol = lines[i].slice(text.length);
    out[i] = to.map((k) => `${m[1]}${k}${m[3]}${eol || '\n'}`).join('');
    // The block's last line may have had no line ending; keep it that way.
    if (to.length && !eol) out[i] = out[i].slice(0, -1);
  }
  if (!changed) return md;
  return md.slice(0, start) + out.join('') + md.slice(start + body.length);
}

export default { renumberFrontMatterSay };
