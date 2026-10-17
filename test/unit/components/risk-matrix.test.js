/**
 * risk-matrix — the likelihood × impact register kernel
 * (lib/components/chart/risk-matrix/) and its narrator.
 *
 * Pins the parse (a point record per risk, an optional mitigation target), the
 * bands, the rows the chart cannot place, a crowded cell, the drawn arrowhead,
 * the description, the narration, and the FS mirror against the stylesheet.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseRiskMatrix, buildRiskMatrix, FS } = require('../../../lib/components/chart/risk-matrix/risk-matrix.transform');
const { bandOf, cellOf } = require('../../../lib/core/risk-matrix-model');

const STYLES = path.join(__dirname, '../../../lib/components/chart/risk-matrix/risk-matrix.styles.css');

const ul = (rows) => rows.map(([label, ...pills]) => `<li>${label} ${pills.map((p) => `<code>${p}</code>`).join(' ')}</li>`).join('');

const REGISTER = [
  ['Cyber outage', '{4, 5}', '{2, 4}'],
  ['Hurricane season', '{3, 5}'],
  ['FX swing', '{4, 2}'],
  ['Pandemic', '{1, 5}'],
];

// Each element of class `cls`: its attributes. A split on `<`, not a
// `class="…"[^>]*attr=` regex, which CodeQL flags as polynomial.
function tags(svg, cls) {
  return svg.split('<').filter((p) => p.split('>')[0].includes(`class="${cls}"`)).map((p) => {
    const head = p.split('>')[0];
    return (name) => {
      const key = ` ${name}="`;
      const a = head.indexOf(key);
      return a < 0 ? null : head.slice(a + key.length, head.indexOf('"', a + key.length));
    };
  });
}

describe('risk-matrix', () => {
  test('bands follow likelihood × impact: 1–4 low, 5–9 medium, 10–14 high, 15–25 critical', () => {
    assert.deepEqual([1, 4, 5, 9, 10, 14, 15, 25].map((s) => bandOf(s).key),
      ['low', 'low', 'medium', 'medium', 'high', 'high', 'critical', 'critical']);
  });

  test('a cell is two whole numbers from 1 to 5, and nothing else', () => {
    assert.deepEqual(cellOf('{4, 5}'), { l: 4, i: 5 });
    for (const bad of ['{0, 3}', '{6, 2}', '{2.5, 3}', '{3}', '3, 4', '']) assert.equal(cellOf(bad), null, bad);
  });

  test('parses each risk, numbers them in authored order, and keeps a mitigation target', () => {
    const m = parseRiskMatrix(ul(REGISTER));
    assert.deepEqual(m.risks.map((r) => [r.n, r.label, r.score, r.band]),
      [[1, 'Cyber outage', 20, 'critical'], [2, 'Hurricane season', 15, 'critical'], [3, 'FX swing', 8, 'medium'], [4, 'Pandemic', 5, 'medium']]);
    assert.deepEqual(m.risks[0].to, { l: 2, i: 4 });
    assert.equal(m.risks[1].to, null);
  });

  test('a row the grid cannot place is left out, and nothing to draw is null', () => {
    const m = parseRiskMatrix(ul([['Placed', '{2, 2}'], ['Off the grid', '{6, 2}'], ['No record', 'high']]));
    assert.deepEqual(m.risks.map((r) => r.label), ['Placed']);
    assert.equal(parseRiskMatrix(ul([['Nothing', '{0, 0}']])), null);
  });

  describe('buildRiskMatrix', () => {
    const svg = buildRiskMatrix(parseRiskMatrix(ul(REGISTER)), {});

    test('25 cells, each shaded by its band, and no color in the markup', () => {
      const cells = tags(svg, 'risk-cell');
      assert.equal(cells.length, 25);
      const crit = cells.filter((a) => a('data-l') === '5' && a('data-i') === '5')[0];
      assert.equal(crit('data-band'), 'critical');
      assert.doesNotMatch(svg, /#[0-9a-f]{3,6}\b|rgb\(/i, 'HARD RULE #3: the kernel emits no color');
    });

    test('a mitigation is a dashed target and a DRAWN arrowhead, not an SVG marker', () => {
      assert.equal(tags(svg, 'risk-target').length, 1);
      assert.equal(tags(svg, 'risk-arrowhead').length, 1);
      assert.doesNotMatch(svg, /<marker\b|marker-end/, 'the PDF writer and PPTX export drop markers');
    });

    test('the key lists every risk worst first', () => {
      const keyNumbers = svg.split('class="risk-key-number"').slice(1).map((s) => s.split('>')[1].split('<')[0]);
      assert.deepEqual(keyNumbers, ['1', '2', '3', '4']);
      const order = parseRiskMatrix(ul([['Mild', '{1, 1}'], ['Worst', '{5, 5}']]));
      const out = buildRiskMatrix(order, {});
      assert.deepEqual(out.split('class="risk-key-number"').slice(1).map((s) => s.split('>')[1].split('<')[0]), ['2', '1']);
    });

    test('a crowded cell shrinks its markers to stay inside the cell', () => {
      const crowded = buildRiskMatrix(parseRiskMatrix(ul(['A', 'B', 'C', 'D'].map((n) => [n, '{3, 3}']))), {});
      const marks = tags(crowded, 'risk-marker');
      const cell = tags(crowded, 'risk-cell').find((a) => a('data-l') === '3' && a('data-i') === '3');
      const [x0, w] = [Number(cell('x')), Number(cell('width'))];
      for (const m of marks) {
        const cx = Number(m('cx'));
        const r = Number(m('r'));
        assert.ok(cx - r >= x0 && cx + r <= x0 + w, `marker at ${cx} r=${r} stays inside ${x0}..${x0 + w}`);
      }
    });

    test('the description reads worst first, in words, with the planned move', () => {
      const desc = svg.match(/<desc>([^<]*)<\/desc>/)[1];
      assert.match(desc, /1\. Cyber outage: likelihood likely, impact critical, rated critical, moving to likelihood unlikely, impact severe, medium/);
      assert.ok(desc.indexOf('Cyber outage') < desc.indexOf('Pandemic'));
    });
  });

  describe('narration', () => {
    const { narrateChart } = require('../../../lib/core/chart-narration');
    const slide = ['<!-- _class: risk-matrix -->', '', '`Register · Q4`', '', '## Two risks in the red.', '',
      '- FX swing `{4, 2}`', '- Cyber outage `{4, 5}` `{2, 4}`', '- Off the grid `{6, 1}`', ''].join('\n');
    const said = narrateChart(slide);

    test('says each risk in words, worst first, never the bare numbers', () => {
      assert.match(said, /Cyber outage, risk two: likelihood likely, impact critical, rated critical; mitigation takes it to likelihood unlikely, impact severe, medium\./);
      assert.ok(said.indexOf('Cyber outage') < said.indexOf('FX swing'));
      assert.doesNotMatch(said, /four, five/);
    });

    test('drops what the chart drops, and speaks the eyebrow first', () => {
      assert.doesNotMatch(said, /Off the grid/);
      assert.ok(said.startsWith('Register · Q4.'));
    });
  });

  // The independent checker's repros on #2714, each pinned so it cannot come back.
  describe('the checker repros', () => {
    const { narrateChart } = require('../../../lib/core/chart-narration');
    const say = (rows) => narrateChart(['<!-- _class: risk-matrix -->', '', '## T.', '', ...rows, ''].join('\n'));

    test('a pane draws inside its own viewBox, grid and key', () => {
      const out = buildRiskMatrix(parseRiskMatrix(ul(REGISTER)), { paneView: { w: 140, h: 72 } });
      const [, , w, h] = out.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      for (const cls of ['risk-cell', 'risk-marker', 'risk-key-marker']) {
        for (const a of tags(out, cls)) {
          const right = cls === 'risk-cell' ? Number(a('x')) + Number(a('width')) : Number(a('cx')) + Number(a('r'));
          const bottom = cls === 'risk-cell' ? Number(a('y')) + Number(a('height')) : Number(a('cy')) + Number(a('r'));
          assert.ok(right <= w + 0.01 && bottom <= h + 0.01, `${cls} stays inside ${w}×${h}`);
        }
      }
    });

    test('a target ring takes its own slot, never the center under another marker', () => {
      const out = buildRiskMatrix(parseRiskMatrix(ul([['A', '{3, 3}', '{2, 2}'], ['B', '{2, 2}']])), {});
      const ring = tags(out, 'risk-target')[0];
      const b = tags(out, 'risk-marker')[1];
      assert.notEqual(`${ring('cx')},${ring('cy')}`, `${b('cx')},${b('cy')}`);
    });

    test('ten risks in one cell stay inside it', () => {
      const out = buildRiskMatrix(parseRiskMatrix(ul(Array.from({ length: 10 }, (_, k) => [`R${k}`, '{3, 3}']))), {});
      const cell = tags(out, 'risk-cell').find((a) => a('data-l') === '3' && a('data-i') === '3');
      const [y0, h] = [Number(cell('y')), Number(cell('height'))];
      for (const m of tags(out, 'risk-marker')) assert.ok(Number(m('cy')) - Number(m('r')) >= y0 && Number(m('cy')) + Number(m('r')) <= y0 + h);
    });

    test('a key number shrinks with its disk on a long register', () => {
      const out = buildRiskMatrix(parseRiskMatrix(ul(Array.from({ length: 20 }, (_, k) => [`R${k}`, '{2, 2}']))), {});
      assert.ok(out.split('class="risk-key-number"').slice(1).every((t) => /^[^>]*style="font-size:/.test(t)));
    });

    test('a target on its own cell is no move, in the description as in the drawing', () => {
      const out = buildRiskMatrix(parseRiskMatrix(ul([['C', '{4, 4}', '{4, 4}']])), {});
      assert.doesNotMatch(out.match(/<desc>[^<]*<\/desc>/)[0], /moving to/);
    });

    test('the narrator keeps exactly the rows the kernel draws', () => {
      // A `>` note under a risk; a name that wraps; a lone `_`; an image-only name; a tag-only name.
      assert.match(say(['- A `{4, 5}`', '  > because', '- B `{2, 2}`']), /A, risk one:.*B, risk two:/s);
      assert.match(say(['- A long', '  name `{4, 5}`']), /A long name, risk one:/);
      assert.match(say(['- _ `{4, 5}`', '- B `{2, 2}`']), /_, risk one:/);
      assert.match(say(['- ![a](x.png) `{4, 5}`', '- B `{2, 2}`']), /B, risk one:/);
      assert.match(say(['- <b></b> `{4, 5}`', '- B `{2, 2}`']), /B, risk one:/);
    });
  });

  test('FS mirrors risk-matrix.styles.css', () => {
    const css = fs.readFileSync(STYLES, 'utf8');
    const sizeOf = (cls) => Number(css.match(new RegExp(`\\.${cls}[^{]*\\{[^}]*font-size:\\s*([\\d.]+)px`))[1]);
    assert.equal(sizeOf('risk-tick'), FS.tick);
    assert.equal(sizeOf('risk-axis'), FS.axis);
    assert.equal(sizeOf('risk-key-label'), FS.key);
  });
});
