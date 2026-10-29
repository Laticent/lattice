/**
 * perturb — the content variations the fit harness samples, one slide at a time.
 *
 * A split policy that looks right on the gallery can still break on a real deck: one more
 * member, longer copy, a long word. These edits model that. Each takes ONE slide's markdown
 * (no front matter, no `---`) and returns the edited slide, or null when the slide has nothing
 * the edit applies to. They edit only the slide's primary collection: its top-level list items
 * or its table rows. Edits are deterministic, so a run is repeatable.
 *
 * engineering/decisions/2026-10-28-fit-everywhere-model.md §4.
 */

// Words to grow copy with: the same plain register as calibrate-core's FILLER, so grown text
// reads like an author's line rather than a token soup.
const BANK = 'clear concise ready signal weekly across teams before review ranked by confidence and measured against outcomes each quarter'.split(' ');
const LONG = ['internationalization', 'responsibilities', 'interoperability', 'decarbonization'];

const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+/;
const FENCE = /^(```|~~~)/;

/** Split a slide into lines and find its top-level list items, as [start, end) line ranges. */
function listItems(lines) {
  const items = [];
  let fence = false;
  let cur = null;
  lines.forEach((line, i) => {
    if (FENCE.test(line.trim())) fence = !fence;
    if (fence) return;
    if (LIST_ITEM.test(line)) {
      if (cur) cur.end = i;
      cur = { start: i, end: lines.length };
      items.push(cur);
    } else if (cur && line.trim() && !/^\s/.test(line)) {
      // a top-level non-list line ends the list
      cur.end = i;
      cur = null;
    }
  });
  if (cur) cur.end = Math.min(cur.end, trimEnd(lines, cur));
  return items.length >= 2 ? items : [];
}
function trimEnd(lines, item) {
  let e = item.end;
  while (e > item.start + 1 && !lines[e - 1].trim()) e--;
  return e;
}

/** Table data rows: lines starting with `|` after the header separator. */
function tableRows(lines) {
  const sep = lines.findIndex((l) => /^\s*\|?\s*:?-{3,}/.test(l) && l.includes('|'));
  if (sep < 1) return [];
  const rows = [];
  for (let i = sep + 1; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push({ start: i, end: i + 1 });
  return rows.length >= 2 ? rows : [];
}

function members(slide) {
  const lines = slide.split('\n');
  const list = listItems(lines);
  return { lines, rows: list.length ? list : tableRows(lines), kind: list.length ? 'list' : 'table' };
}

/** Edit the prose part of a line: the text before its first inline code, keeping markup intact. */
function editProse(line, fn) {
  const m = line.match(/^(\s*(?:[-*+]|\d+[.)])?\s*)(.*)$/);
  const lead = m ? m[1] : '';
  const rest = m ? m[2] : line;
  const cut = rest.search(/`|\{|\|/);
  const prose = cut < 0 ? rest : rest.slice(0, cut);
  const tail = cut < 0 ? '' : rest.slice(cut);
  const words = prose.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return line;
  const out = fn(words);
  return `${lead}${out.join(' ')}${tail ? ` ${tail}` : ''}`;
}

function scaleText(slide, factor) {
  const { lines, rows } = members(slide);
  if (!rows.length) return null;
  const touched = new Set();
  for (const r of rows) for (let i = r.start; i < r.end; i++) if (lines[i].trim()) touched.add(i);
  const grow = (w, i) => {
    if (factor > 1) {
      const add = Math.max(1, Math.round(w.length * (factor - 1)));
      return [...w, ...Array.from({ length: add }, (_, k) => BANK[(i + k) % BANK.length])];
    }
    return w.slice(0, Math.max(1, Math.round(w.length * factor)));
  };
  const out = lines.map((line, i) => {
    if (!touched.has(i)) return line;
    if (line.trim().startsWith('|')) {
      // a table row: every cell after the row label
      const cells = line.split('|');
      return cells.map((c, k) => (k < 2 || k === cells.length - 1 || !c.trim() || /`/.test(c) ? c : ` ${grow(c.trim().split(/\s+/), i + k).join(' ')} `)).join('|');
    }
    return editProse(line, (w) => {
      if (factor > 1) {
        const add = Math.max(1, Math.round(w.length * (factor - 1)));
        const extra = Array.from({ length: add }, (_, k) => BANK[(i + k) % BANK.length]);
        // New words go before the line's closing punctuation, so the sentence still ends once.
        const last = w[w.length - 1];
        const p = last.match(/[.!?;:]+$/);
        return p ? [...w.slice(0, -1), last.slice(0, -p[0].length), ...extra.slice(0, -1), extra[extra.length - 1] + p[0]] : [...w, ...extra];
      }
      const keep = Math.max(2, Math.round(w.length * factor));
      return w.slice(0, keep);
    });
  });
  return out.join('\n');
}

const EDITS = {
  /** One more member: a copy of the last one. */
  add(slide) {
    const { lines, rows } = members(slide);
    if (!rows.length) return null;
    const last = rows[rows.length - 1];
    // Insert at the item's TRIMMED end: copying its trailing blank lines would put a blank line
    // between items, which turns a tight list loose (`<li><p>`) and changes every member's markup.
    let end = last.end;
    while (end > last.start + 1 && !lines[end - 1].trim()) end--;
    const copy = lines.slice(last.start, end);
    // One distinct word, so the new member is not mistaken for the one it copies.
    copy[0] = copy[0].trim().startsWith('|') ? copy[0].replace(/\|\s*([^|]*?)\s*\|/, '| $1 again |') : editProse(copy[0], (w) => [...w, 'again']);
    return [...lines.slice(0, end), ...copy, ...lines.slice(end)].join('\n');
  },
  /** One fewer member, keeping at least two. */
  remove(slide) {
    const { lines, rows } = members(slide);
    if (rows.length < 3) return null;
    const last = rows[rows.length - 1];
    return [...lines.slice(0, last.start), ...lines.slice(last.end)].join('\n');
  },
  /** Every member's prose 40% longer. */
  longer: (slide) => scaleText(slide, 1.4),
  /** Every member's prose 40% shorter. */
  shorter: (slide) => scaleText(slide, 0.6),
  /** Small edits, ±10%: a page plan that moves on these is jank. */
  nudgeUp: (slide) => scaleText(slide, 1.1),
  nudgeDown: (slide) => scaleText(slide, 0.9),
  /** One long word in each member's first line. */
  longwords(slide) {
    const { lines, rows } = members(slide);
    if (!rows.length) return null;
    const firsts = new Set(rows.map((r) => r.start));
    return lines.map((l, i) => (firsts.has(i) && !l.trim().startsWith('|') ? editProse(l, (w) => [...w.slice(0, -1), LONG[i % LONG.length]]) : l)).join('\n');
  },
};

/** Split a deck's body (front matter removed) into slides on `---` lines outside code fences. */
function slidesOf(body) {
  const out = [];
  let cur = [];
  let fence = false;
  for (const line of body.split('\n')) {
    if (FENCE.test(line.trim())) fence = !fence;
    if (!fence && line.trim() === '---') {
      out.push(cur.join('\n'));
      cur = [];
    } else cur.push(line);
  }
  out.push(cur.join('\n'));
  return out.filter((s) => s.trim());
}

module.exports = { EDITS, slidesOf, members };
