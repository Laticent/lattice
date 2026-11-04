/**
 * Table reflow, the DOM half: the mirror of the markdown-it `tableReflow` plugin.
 *
 * It lives apart from lib/core/table-shape.js so the engine, which stamps tables while it
 * parses and never needs this, does not ship it: only the browser runtime requires this file.
 * (The docs site's engine bundle sits at its size ceiling, and every byte of the kernel ships
 * twice, once in the engine and once in the runtime.) The verdict itself stays in one place,
 * lib/core/table-shape.js (HARD RULE #1).
 */

const { RAW_REFLOW_ATTR, REFLOW_CLASS, ROW_LABELED, OVERRIDE, resolveReflow, labelText, rowLabelText, labelColumn, splitAlign } = require('../core/table-shape.js');

/**
 * The DOM half: stamp every table under `root` with its reflow class and give each body cell
 * its column header as `data-lat-col`. The mirror of the markdown-it `tableReflow` plugin, for
 * the browser runtime (the VS Code Marp preview and a Marp render of an exported bundle,
 * where our markdown-it plugins never ran). IDEMPOTENT: a table carrying `data-lat-reflow`
 * has been judged and is skipped.
 *
 * @param {ParentNode} root  a document, or any element containing the sections
 */
function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const sections = [...root.querySelectorAll('section')];
  if (typeof root.matches === 'function' && root.matches('section')) sections.unshift(root);
  for (const section of sections) {
    const engineDeclinedRaw = section.hasAttribute(RAW_REFLOW_ATTR);
    // Only the tables the reflow can apply to: directly in the slide, its content area, or a
    // pane's content area (the scope base.table-reflow.css styles). A table a component or chart
    // builds (a figure's screen-reader table) is never judged, so whether the mirror runs before
    // or after the chart draws cannot change the page.
    for (const table of section.querySelectorAll(':scope > table, :scope > .cell-stage > table, lat-pane > .cell-stage > table')) {
      if (table.hasAttribute('data-lat-reflow')) continue;
      // A table the engine's walker could not read (raw HTML): it keeps its shape there, so here too.
      if (engineDeclinedRaw) { table.setAttribute('data-lat-reflow', 'none'); continue; }
      // A pane's table answers to the pane's classes, as it does in the pane's own render on the
      // engine path; a slide-level override on the host reaches it there too (lib/core/panes.js).
      const pane = table.closest('lat-pane');
      const classTokens = pane && section.contains(pane)
        ? [...pane.classList, ...[...section.classList].filter((c) => c in OVERRIDE && ![...pane.classList].some((p) => p in OVERRIDE))]
        : [...section.classList];
      const headRow = table.querySelector('thead > tr')
        || [...table.querySelectorAll('tr')].find((tr) => tr.querySelector('th'));
      const headers = headRow ? [...headRow.children].map((c) => c.textContent || '') : [];
      const bodyRows = [...table.querySelectorAll('tr')].filter((tr) => tr !== headRow && tr.querySelector('td'));
      const rows = bodyRows.map((tr) => [...tr.children].map((c) => c.textContent || ''));
      const reflow = resolveReflow(classTokens, { headers, rows });
      table.setAttribute('data-lat-reflow', reflow || 'none');
      if (!reflow) continue;
      table.classList.add(REFLOW_CLASS[reflow]);
      // The same two stamps the markdown-it plugin writes: the card's label column, and each
      // cell's alignment moved out of its inline style (lib/core/table-shape.js).
      if (reflow === 'cards' && !table.hasAttribute('data-lat-labels')) table.setAttribute('data-lat-labels', labelColumn(headers));
      for (const cell of table.querySelectorAll('td, th')) {
        const { align, rest } = splitAlign(cell.getAttribute('style'));
        if (!align) continue;
        cell.setAttribute('data-lat-align', align);
        if (rest) cell.setAttribute('style', rest);
        else cell.removeAttribute('style');
      }
      // ARIA roles: the reflow changes `display`, which can drop table semantics in some browsers.
      if (!table.hasAttribute('role')) table.setAttribute('role', 'table');
      for (const tr of table.querySelectorAll('tr')) {
        if (!tr.hasAttribute('role')) tr.setAttribute('role', 'row');
        for (const c of tr.children) {
          if (c.hasAttribute('role')) continue;
          // A `th` in the header row names a column; one in a body row (`scope="row"`) names its row.
          const inHead = tr === headRow || tr.parentElement?.tagName === 'THEAD';
          c.setAttribute('role', c.tagName !== 'TH' ? 'cell' : inHead ? 'columnheader' : 'rowheader');
        }
      }
      const rowLabeled = ROW_LABELED.includes(reflow);
      bodyRows.forEach((tr, r) => {
        [...tr.children].forEach((cell, i) => {
          if (headers[i] != null && !cell.hasAttribute('data-lat-col')) cell.setAttribute('data-lat-col', labelText(headers[i]));
          // A layout that repeats the row labels: each value cell carries its row's label too.
          if (rowLabeled && i > 0 && !cell.hasAttribute('data-lat-row')) cell.setAttribute('data-lat-row', rowLabelText(rows[r][0]));
        });
      });
    }
  }
}

module.exports = { applyToDom };
