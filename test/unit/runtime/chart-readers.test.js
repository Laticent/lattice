/**
 * Unit: every chart READER (lib/runtime/chart-readers/) reads its kind's source back from the exported
 * marks WHOLE, on every chart in the kind's gallery.
 *
 * The oracle needs no hand-written expectation: export the gallery with the engine, read each chart back,
 * redraw the list with the engine's own kernel at the box the export drew for, and the redrawn chart body
 * must be the exported one, byte for byte (render-scoped ids renumbered, and the engine post-pass's
 * accessible-name ids dropped, since the runtime names a redrawn SVG itself). A reader that loses a
 * category, a value, a series name, a note or a modifier's effect fails here on a real deck. Then each
 * chart is redrawn for a phone (portrait, a 200-unit canvas): it must draw, and show the same marks.
 *
 * A chart a reader refuses keeps its exported drawing; `REFUSED` pins how many per gallery, so a new
 * refusal is a visible change, never a silent one.
 * engineering/decisions/2026-11-03-responsive-tables.md §"Charts redraw on demand".
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const { transformChartSection } = require('../../../lib/transformers/chart-frame');
// The runtime's readers, plus the ones written and HELD from it (lib/runtime/chart-readers/index.js says why).
const READERS = { ...require('../../../lib/runtime/chart-readers'), journey: require('../../../lib/runtime/chart-readers/journey').read };

const KINDS = path.join(__dirname, '..', '..', '..', 'lib', 'plugins', 'chart-family', 'kinds');

/** Charts in each kind's gallery a reader refuses (they keep the exported drawing), and why. */
const REFUSED = {
  'line': [],
  'slope': [],
  'ep-curve': [],
  'tower': [],
  'stacked-bar': [],
  'waterfall': [],
  'bullet': ['slide 5: hand-written Band zones carry no value, and a 0% bar cannot prove its printed target'],
  'heatmap': [],
  'funnel': [],
  'piechart': [],
  'map': [],
  'hub-spoke': [],
  'journey': [],
  'roadmap': ['slide 3: the horizons card form drops the workstream column header, and draws the same cards in every box'],
};

/** Render-scoped ids differ between two renders: renumber them by first appearance, longest first. */
function normalize(html) {
  let h = html.replace(/ aria-(labelledby|describedby)="[^"]*"/g, '').replace(/<(title|desc) id="[^"]*">/g, '<$1>');
  const ids = [...new Set([...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))];
  const byLength = [...ids].sort((a, b) => b.length - a.length);
  for (const id of byLength) h = h.split(id).join(`ID${ids.indexOf(id)}_`);
  return h;
}

/** Parse a kernel's output and swap each note placeholder for the exported note node, as the runtime does. */
function freshBody(html, exported) {
  const fresh = new JSDOM(`<div>${html}</div>`).window.document.querySelector('.chart-body');
  if (!fresh) return null;
  for (const t of fresh.querySelectorAll('template.chart-detail[data-mark]')) {
    const was = exported.querySelector(`template.chart-detail[data-mark="${t.getAttribute('data-mark')}"]`);
    if (was) t.outerHTML = was.outerHTML;
  }
  return fresh;
}

/** A drawing's marks as a sorted multiset of label=value. */
const marks = (body) => [...body.querySelectorAll('[data-mark], [data-value]')]
  .filter((m) => m.dataset.value !== undefined)
  .map((m) => `${m.dataset.label ?? ''}=${m.dataset.value}`).sort();

for (const kind of Object.keys(READERS)) {
  describe(`chart reader: ${kind}`, () => {
    const md = fs.readFileSync(path.join(KINDS, kind, `${kind}.gallery.md`), 'utf8');
    const doc = new JSDOM(engine.render(md, {}).html).window.document;
    const charts = [...doc.querySelectorAll('section.chart-frame')].filter((s) => s.classList.contains(kind))
      .map((s) => ({ s, body: s.querySelector(':scope > .cell-stage > .chart-body, :scope > .chart-body') }))
      .filter((c) => c.body);
    const read = (c) => READERS[kind](c.body.cloneNode(true));
    const clsOf = (s) => [...s.classList].filter((c) => c !== 'chart-frame').join(' ');

    test('the gallery has charts to read', () => assert.ok(charts.length > 0));

    test(`refuses exactly ${REFUSED[kind]?.length ?? 0} gallery chart(s)`, () => {
      assert.equal(charts.filter((c) => !read(c)).length, REFUSED[kind]?.length ?? 0);
    });

    for (const c of charts) {
      const name = `slide ${c.s.id} (${clsOf(c.s)})`;
      test(`${name}: read back and redrawn at the export's box, byte for byte`, (t) => {
        const list = read(c);
        if (!list) { t.skip('refused: keeps the exported drawing'); return; }
        const out = transformChartSection(`<h2>.</h2>${list}`, clsOf(c.s), c.s.getAttribute('data-orientation') || undefined, undefined, null, undefined);
        assert.ok(out.transformed, 'the kernel drew the list');
        const fresh = freshBody(out.html, c.body);
        assert.equal(normalize(fresh.innerHTML), normalize(c.body.innerHTML));
      });

      test(`${name}: redrawn for a phone, the same marks`, (t) => {
        const list = read(c);
        if (!list) { t.skip('refused'); return; }
        const out = transformChartSection(`<h2>.</h2>${list}`, clsOf(c.s), 'portrait', { w: 200, h: 188 }, null, undefined);
        assert.ok(out.transformed, 'the kernel drew the list for a phone');
        assert.deepEqual(marks(freshBody(out.html, c.body)), marks(c.body));
      });
    }
  });
}
