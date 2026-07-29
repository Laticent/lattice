/**
 * The glossary slide's two structural transforms, as one kernel.
 *
 *   1. LIST → TABLE. A glossary slide is authored as an ordinary nested list
 *      (`- Term` / `  - Definition`, the house card shape — HARD RULE #5). It
 *      RENDERS as a two-column table so the terms align down a column.
 *   2. THE RANGE PILL. The `<h2>` gains ` <span class="range-pill">A – N</span>`,
 *      derived from the first letter of the first and last term.
 *
 * Two consumers (HARD RULE #1):
 *   - lib/integrations/markdown-it/plugins.js `glossaryListToTable` /
 *     `glossaryRange` — the engine's render path, operating on markdown-it
 *     tokens.
 *   - lib/runtime/index.js — the live-DOM path an Export-to-Marp bundle takes,
 *     where marp-core renders the deck and never runs our plugins. Without the
 *     mirror the generated Glossary slide arrived as a bare bullet list with no
 *     table, no column headers, and no range pill (#1256).
 *
 * The token path stays the authority on ORDER: the range pill reads the table,
 * so the list→table conversion must run first. `applyToDom` preserves that.
 */

/** First letter of a term cell's text, uppercased — the range pill's alphabet key. */
function rangeKey(text) {
  return (String(text || '').trim()[0] || '').toUpperCase();
}

/** `A`, or `A – N` when the ends differ. Mirrors the token path's spacing exactly. */
function rangeLabel(firstChar, lastChar) {
  if (!firstChar) return '';
  return firstChar === (lastChar || firstChar) ? firstChar : `${firstChar} – ${lastChar}`;
}

/**
 * Live-DOM adapter. For each `section.glossary`: convert the top-level
 * `- Term` / `  - Definition` list into the two-column table, then append the
 * range pill to the heading.
 *
 * Idempotent on both halves — a slide that already holds a `table` is not
 * re-converted, and a heading that already carries a `.range-pill` is not
 * re-stamped. This matters because the runtime re-runs every transform on each
 * pass, and because an EXPORTED deck may be re-rendered from HTML that already
 * contains the table.
 */
function applyToDom(root) {
  const doc = root?.ownerDocument ? root.ownerDocument : root;
  const scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
  if (!scope || typeof scope.querySelectorAll !== 'function') return;

  for (const section of scope.querySelectorAll('section.glossary')) {
    let keys = [];
    if (!section.querySelector('table')) {
      // The FIRST top-level list is the glossary body; a slide may carry other
      // prose after it, which is left alone (same scope as the token rule).
      const list = section.querySelector(':scope > ul, :scope > .cell-stage > ul');
      const body = doc.createElement('tbody');
      for (const li of list ? listItems(list) : []) {
        const nested = li.querySelector(':scope > ul, :scope > ol');
        const def = nested?.firstElementChild;
        if (!def) continue;

        // The term is the item's own lead content, with the nested list dropped.
        const lead = contentNodes([...li.childNodes].filter((n) => n !== nested));
        if (!lead.length) continue;

        const row = doc.createElement('tr');
        const termCell = doc.createElement('td');
        // An author who already bolded the term keeps their own markup; anything
        // else is wrapped, matching the token path's `<strong>` lift.
        if (lead.length === 1 && isBold(lead[0])) {
          termCell.append(...lead);
        } else {
          const strong = doc.createElement('strong');
          strong.append(...lead);
          termCell.appendChild(strong);
        }
        const defCell = doc.createElement('td');
        defCell.append(...contentNodes([...def.childNodes]));

        row.append(termCell, defCell);
        body.appendChild(row);
        keys.push(rangeKey(termCell.textContent));
      }
      if (body.childElementCount && list) {
        const table = doc.createElement('table');
        table.append(headerRow(doc), body);
        list.replaceWith(table);
      }
    }

    const h2 = section.querySelector('h2');
    if (!h2 || h2.querySelector('.range-pill')) continue;
    // Read the ends off the TABLE (built above, or already present on a
    // re-rendered export) so both halves agree on the same source of truth.
    const cells = [...section.querySelectorAll('tbody > tr > td:first-child')];
    if (cells.length) keys = cells.map((td) => rangeKey(td.textContent));
    const label = rangeLabel(keys[0], keys[keys.length - 1]);
    if (!label) continue;
    h2.append(doc.createTextNode(' '));
    const pill = doc.createElement('span');
    pill.className = 'range-pill';
    pill.textContent = label;
    h2.append(pill);
  }
}

/** `<thead><tr><th>Term</th><th>Definition</th></tr></thead>`, built as nodes. */
function headerRow(doc) {
  const head = doc.createElement('thead');
  const tr = doc.createElement('tr');
  for (const label of ['Term', 'Definition']) {
    const th = doc.createElement('th');
    th.textContent = label;
    tr.appendChild(th);
  }
  head.appendChild(tr);
  return head;
}

/** True for the markup an author uses to pre-bold a term. */
function isBold(node) {
  return node.nodeType === 1 && (node.tagName === 'STRONG' || node.tagName === 'B');
}

/**
 * The meaningful child nodes of a list item: edge whitespace dropped, and a lone
 * `<p>` wrapper (markdown-it adds one to a LOOSE list item; the table cells
 * don't want it) descended into.
 *
 * Returns the LIVE nodes, which the caller then MOVES into the new cell. That is
 * the point: the previous version serialized them to an HTML string and rebuilt
 * the table through `innerHTML`, which takes document content and reinterprets
 * it as markup — the DOM-text-into-HTML-sink flow (and the reason a definition
 * carrying `<` in prose could re-parse rather than render). Moving nodes has no
 * string round-trip at all, so inline markup the author really wrote (`<code>`,
 * `<em>`) survives byte-exact while text stays text.
 */
function contentNodes(nodes) {
  let out = nodes;
  const blank = (n) => n.nodeType === 3 && !n.nodeValue.trim();
  while (out.length && blank(out[0])) out = out.slice(1);
  while (out.length && blank(out[out.length - 1])) out = out.slice(0, -1);
  if (out.length === 1 && out[0].nodeType === 1 && out[0].tagName === 'P') {
    return contentNodes([...out[0].childNodes]);
  }
  return out;
}

/** Direct `<li>` children of a list. */
function listItems(list) {
  return [...list.children].filter((el) => el.tagName === 'LI');
}

module.exports = { rangeKey, rangeLabel, applyToDom };
