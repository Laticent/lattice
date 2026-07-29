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
    const rows = [];
    if (!section.querySelector('table')) {
      // The FIRST top-level list is the glossary body; a slide may carry other
      // prose after it, which is left alone (same scope as the token rule).
      const list = section.querySelector(':scope > ul, :scope > .cell-stage > ul');
      for (const li of list ? [...li0(list)] : []) {
        const nested = li.querySelector(':scope > ul, :scope > ol');
        if (!nested) continue;
        const def = nested.firstElementChild;
        if (!def) continue;
        // The term is the item's own lead content, with the nested list removed.
        const lead = li.cloneNode(true);
        for (const n of lead.querySelectorAll(':scope > ul, :scope > ol')) n.remove();
        const termHtml = unwrapParagraph(lead.innerHTML).trim();
        rows.push({
          termHtml: /^<(?:strong|b)\b/.test(termHtml) ? termHtml : `<strong>${termHtml}</strong>`,
          defHtml: unwrapParagraph(def.innerHTML).trim(),
          key: rangeKey(lead.textContent),
        });
      }
      if (rows.length && list) {
        const table = doc.createElement('table');
        table.innerHTML = '<thead><tr><th>Term</th><th>Definition</th></tr></thead><tbody>'
          + rows.map((r) => `<tr><td>${r.termHtml}</td><td>${r.defHtml}</td></tr>`).join('')
          + '</tbody></table>';
        list.replaceWith(table);
      }
    }

    const h2 = section.querySelector('h2');
    if (!h2 || h2.querySelector('.range-pill')) continue;
    // Read the ends off the TABLE (built above, or already present on a
    // re-rendered export) so both halves agree on the same source of truth.
    const cells = [...section.querySelectorAll('tbody > tr > td:first-child')];
    const first = cells.length ? rangeKey(cells[0].textContent) : rows[0]?.key;
    const last = cells.length ? rangeKey(cells[cells.length - 1].textContent) : rows.at(-1)?.key;
    const label = rangeLabel(first, last);
    if (!label) continue;
    h2.append(doc.createTextNode(' '));
    const pill = doc.createElement('span');
    pill.className = 'range-pill';
    pill.textContent = label;
    h2.append(pill);
  }
}

/** Direct `<li>` children of a list. */
function li0(list) {
  return [...list.children].filter((el) => el.tagName === 'LI');
}

/**
 * markdown-it wraps a loose list item's content in `<p>`; the table cells don't.
 *
 * Deliberately string ops, not a regex: the natural form here is
 * `/^\s*<p>([\s\S]*)<\/p>\s*$/`, whose `\s*`-wildcard-`\s*` shape is polynomial
 * on a non-matching input — and the input is `innerHTML` off a live document, so
 * it is exactly the untrusted-source-into-superlinear-regex flow CodeQL flags.
 * Trim-and-slice is linear and matches the greedy regex's semantics (strip the
 * FIRST `<p>` and the LAST `</p>`).
 */
function unwrapParagraph(html) {
  const s = String(html || '');
  const t = s.trim();
  return t.startsWith('<p>') && t.endsWith('</p>') ? t.slice(3, -4) : s;
}

module.exports = { rangeKey, rangeLabel, applyToDom };
