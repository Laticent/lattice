/* Responsive-table prototype: the MARKUP half. It stands in for what the engine would emit
 * at render time; it does no layout. All switching lives in proto.css.
 *
 * For every table it adds a `data-lat-col` (the column header) to each cell, ARIA roles so a
 * display switch keeps table semantics, and a wrapper `.rt` the CSS queries. For the types
 * whose narrow form repeats the row labels (periods, crosstab, options) it also renders that
 * form, because CSS cannot copy content: `.rt-k2` (labels + two columns per block) and
 * `.rt-k1` (labels + one column per block). For independent lists it renders `.rt-cols`,
 * one block per column. The type comes from the lab deck's footer number; in the real engine
 * it comes from lib/core/table-shape.js. With the prototype switched off the tables return to
 * the stage, so the lab shows the engine's own layouts (lib/base/base.table-reflow.css). */
(() => {
  const TYPES = { 1: 'records', 2: 'keyvalue', 3: 'periods', 4: 'options', 5: 'crosstab', 6: 'lists', 7: 'ranked', 8: 'prose', 9: 'schedule' };
  const REPEAT = { periods: 1, crosstab: 1, options: 1 };

  const cellsOf = (row) => [...row.cells];
  const wrapped = []; // [wrapper, table]: with the prototype OFF the table goes back to the stage

  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  for (const s of document.querySelectorAll('#deck > section')) {
    const t = s.querySelector(':scope > .cell-stage > table');
    const m = (s.getAttribute('data-footer') || '').match(/^(\d)/);
    if (!t || !m || !t.tHead || !t.tBodies[0]) continue;
    const type = TYPES[m[1]];
    const head = cellsOf(t.tHead.rows[0]);
    const names = head.map((c) => c.textContent.trim());
    const rows = [...t.tBodies[0].rows].map(cellsOf);

    t.setAttribute('role', 'table');
    t.tHead.rows[0].setAttribute('role', 'row');
    for (const c of head) c.setAttribute('role', 'columnheader');
    [...t.tBodies[0].rows].forEach((r, ri) => {
      r.setAttribute('role', 'row');
      rows[ri].forEach((c, i) => {
        c.setAttribute('data-lat-col', names[i]);
        c.setAttribute('role', i === 0 && REPEAT[type] ? 'rowheader' : 'cell');
      });
    });

    const wrap = el('div', 'rt');
    wrap.setAttribute('data-rt', type);
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
    wrapped.push([wrap, t]);
    t.classList.add('rt-wide');
    // Container-query em resolves against the wrapper's own text size, so give the wrapper the
    // table's size: every switch point then reads in the table's real text. (The engine would
    // set this from the table's type token instead of measuring.)
    wrap.style.fontSize = getComputedStyle(t).fontSize;

    const data = head.slice(1).map((_, i) => i + 1);
    const total = data.filter((i) => /^total$/i.test(names[i]));
    const plain = data.filter((i) => !total.includes(i));
    wrap.setAttribute('data-d', String(plain.length));
    wrap.setAttribute('data-tot', String(total.length));

    // A small table: the label column plus the given data columns. Copies cell markup and alignment.
    const mini = (cols) => {
      const tb = el('table', `${t.className.replace('rt-wide', '').trim()} rt-mini`);
      const th = tb.createTHead().insertRow();
      for (const ci of [0, ...cols]) {
        const c = el('th'); c.innerHTML = head[ci].innerHTML; c.setAttribute('style', head[ci].getAttribute('style') || ''); th.appendChild(c);
      }
      const body = tb.createTBody();
      for (const r of rows) {
        const tr = body.insertRow();
        for (const ci of [0, ...cols]) {
          const c = el('td'); c.innerHTML = r[ci].innerHTML; c.setAttribute('style', r[ci].getAttribute('style') || ''); tr.appendChild(c);
        }
      }
      return tb;
    };

    if (REPEAT[type]) {
      // The recommended option (a bold header) leads once an option table stacks.
      const rec = type === 'options' ? plain.filter((i) => head[i].querySelector('strong')) : [];
      const order = [...rec, ...plain.filter((i) => !rec.includes(i))];
      const k1 = el('div', 'rt-alt rt-k1');
      k1.setAttribute('aria-hidden', 'true');
      for (const i of order) { const b = mini([i, ...total]); if (rec.includes(i)) b.classList.add('rt-pick'); k1.appendChild(b); }
      wrap.appendChild(k1);
      if (type !== 'options' && plain.length > 2) {
        const k2 = el('div', 'rt-alt rt-k2');
        k2.setAttribute('aria-hidden', 'true');
        for (let j = 0; j < plain.length; j += 2) k2.appendChild(mini([...plain.slice(j, j + 2), ...total]));
        wrap.appendChild(k2);
      }
    }

    if (type === 'lists') {
      const cols = el('div', 'rt-alt rt-cols');
      cols.setAttribute('aria-hidden', 'true');
      head.forEach((h, ci) => {
        const b = el('div', 'rt-list');
        const hd = el('div', 'rt-list-head'); hd.innerHTML = h.innerHTML; b.appendChild(hd);
        const ul = el('ul');
        for (const r of rows) { if (r[ci]?.textContent.trim()) { const li = el('li'); li.innerHTML = r[ci].innerHTML; ul.appendChild(li); } }
        b.appendChild(ul);
        cols.appendChild(b);
      });
      wrap.appendChild(cols);
    }
  }

  // With the prototype OFF, each table sits where the engine put it (a direct child of the
  // stage), so the engine's own narrow layouts (base.table-reflow.css) are what the lab shows.
  const root = document.documentElement;
  const sync = () => {
    const on = root.getAttribute('data-proto') === 'on';
    for (const [wrap, t] of wrapped) {
      if (on && t.parentNode !== wrap) wrap.insertBefore(t, wrap.firstChild);
      if (!on && t.parentNode === wrap) wrap.parentNode.insertBefore(t, wrap);
    }
  };
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-proto'] });
  sync();
})();
