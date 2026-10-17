/**
 * tower — the reinsurance program kernel (lib/components/chart/tower/).
 *
 * Pins the parse (the market's `limit xs attachment` notation, the retention,
 * shares), the one-color-per-reinsurer rule, the Open remainder, the fold past
 * six reinsurers, and the FS mirror against tower.styles.css.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseTower, buildTower, FS } = require('../../../lib/components/chart/tower/tower.transform');

const STYLES = path.join(__dirname, '../../../lib/components/chart/tower/tower.styles.css');

// The <ul> inner HTML the dispatcher hands the kernel. A layer is
// [label, size, [[reinsurer, share], …]].
function ul(layers) {
  return layers.map(([label, size, shares = []]) =>
    `<li>${label} <code>${size}</code>` +
    (shares.length ? `<ul>${shares.map(([n, v]) => `<li>${n} <code>${v}</code></li>`).join('')}</ul>` : '') +
    '</li>').join('');
}

const PROGRAM = [
  ['Layer 3', '$200M xs $160M', [['Acme Re', '30%'], ['Globex Re', '25%']]],
  ['Layer 2', '$70M xs $90M', [['Acme Re', '40%'], ['Vantage Re', '60%']]],
  ['Layer 1', '$40M xs $50M', [['Globex Re', '60%'], ['Acme Re', '40%']]],
  ['Retention', '$50M'],
];

describe('tower', () => {
  describe('parseTower', () => {
    test('reads limit xs attachment, in all three spellings', () => {
      const m = parseTower(ul([
        ['A', '$40M xs $50M'], ['B', '$70M x/s $90M'], ['C', '$200M excess of $160M'],
      ]));
      assert.deepEqual(m.layers.map((l) => [l.limit, l.attach, l.top]),
        [[40e6, 50e6, 90e6], [70e6, 90e6, 160e6], [200e6, 160e6, 360e6]]);
    });

    test('sorts by attachment, lowest first, whatever the authored order', () => {
      const m = parseTower(ul(PROGRAM));
      assert.deepEqual(m.layers.map((l) => l.label), ['Retention', 'Layer 1', 'Layer 2', 'Layer 3']);
    });

    test('a size with no xs is the retention, from zero', () => {
      const r = parseTower(ul(PROGRAM)).layers[0];
      assert.equal(r.retention, true);
      assert.equal(r.attach, 0);
      assert.equal(r.top, 50e6);
    });

    test('reads money the way every chart does, on both sides of xs', () => {
      const m = parseTower(ul([['L1', 'EUR 40 Mio. xs EUR 50 Mio.']]));
      assert.equal(m.layers[0].limit, 40e6);
      assert.equal(m.layers[0].attach, 50e6);
    });

    test('one slot per reinsurer across every layer, by first appearance from the bottom', () => {
      const m = parseTower(ul(PROGRAM));
      assert.deepEqual(m.series.map((s) => s.name), ['Globex Re', 'Acme Re', 'Vantage Re']);
      const slotOf = (name) => new Set(m.layers.flatMap((l) => l.segs).filter((s) => s.name === name).map((s) => s.slot));
      assert.deepEqual([...slotOf('Acme Re')], [2], 'Acme keeps one color in all three layers');
      // Slot order inside a layer, so a reinsurer sits in the same place in each.
      assert.deepEqual(m.layers[3].segs.map((s) => s.name), ['Globex Re', 'Acme Re']);
    });

    test('what the shares leave is Open; a layer with no shares has no Open', () => {
      const m = parseTower(ul(PROGRAM));
      assert.equal(m.layers[3].open, 45);
      assert.equal(m.layers[2].open, 0);
      assert.equal(m.layers[0].open, 0);
    });

    test('a seventh reinsurer and beyond fold into Others, summed per layer', () => {
      const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      const m = parseTower(ul([['L1', '$10M xs $5M', names.map((n) => [n, '10%'])]]));
      assert.deepEqual(m.series.map((s) => s.name), ['A', 'B', 'C', 'D', 'E', 'Others']);
      const others = m.layers[0].segs.find((s) => s.name === 'Others');
      assert.equal(others.pct, 20);
      assert.equal(others.slot, 6);
    });

    test('nothing to draw returns null', () => {
      assert.equal(parseTower('<li>No size here</li>'), null);
    });
  });

  describe('buildTower', () => {
    const svg = buildTower(parseTower(ul(PROGRAM)), {});

    test('one share rect per reinsurer line, colored by slot, no color in the markup', () => {
      assert.equal((svg.match(/class="tower-share"/g) || []).length, 6);
      assert.doesNotMatch(svg, /#[0-9a-f]{3,6}\b|rgb\(/i, 'HARD RULE #3: the kernel emits no color');
    });

    test('draws the Open remainder and the retention, and keys both', () => {
      assert.equal((svg.match(/class="tower-open"/g) || []).length, 1);
      assert.equal((svg.match(/class="tower-retention"/g) || []).length, 1);
      assert.match(svg, />Open 45%</);
      assert.match(svg, /tower-swatch-open/);
      assert.match(svg, /tower-swatch-retained/);
    });

    test('prints each layer in the market notation and each boundary once', () => {
      assert.match(svg, />\$40M xs \$50M</);
      assert.match(svg, /class="tower-note"[^>]*>(?:<tspan[^>]*>)?\$50M</, "the retention note is its size alone; the band says Retained");
      for (const edge of ['$50M', '$90M', '$160M', '$360M']) {
        assert.equal((svg.match(new RegExp(`class="tower-edge"[^>]*>(?:<tspan[^>]*>)?\\${edge}<`, 'g')) || []).length, 1, edge);
      }
    });

    test('the description says it is not to scale and reads every share', () => {
      const desc = svg.match(/<desc>([^<]*)<\/desc>/)[1];
      assert.match(desc, /not to scale/);
      assert.match(desc, /Layer 3: \$200M excess of \$160M, Globex Re 25%, Acme Re 30%, open 45%/);
      assert.match(desc, /Retention: \$50M retained/);
    });

    test('over-placement is drawn inside the layer and said in the description', () => {
      const m = parseTower(ul([['L1', '$10M xs $5M', [['A', '70%'], ['B', '50%']]]]));
      const out = buildTower(m, {});
      const widths = [...out.matchAll(/class="tower-share"[^>]*width="([\d.]+)"/g)].map((x) => Number(x[1]));
      const rect = out.match(/class="tower-share"[^>]*x="([\d.]+)"/)[1];
      assert.ok(widths.reduce((a, b) => a + b, 0) <= 320 - Number(rect), 'never spills past the column');
      assert.match(out, /over-placed at 120%/);
    });
  });

  describe('narration', () => {
    const { narrateChart } = require('../../../lib/core/chart-narration');
    const slide = [
      '<!-- _class: tower -->', '', '`Cat program · 2027`', '', '## Who carries the program.', '',
      '- Layer 2 `$70M xs $90M`', '  - Acme Re `40%`', '  - Vantage Re `45%`',
      '- Layer 1 `$40M xs $50M`', '  - Globex Re `100%`', '- Retention `$50M`', '',
    ].join('\n');
    const said = narrateChart(slide);

    test('says the market notation as words, never the letters xs', () => {
      assert.match(said, /forty million dollars excess of fifty million dollars/);
      assert.doesNotMatch(said, /\bxs\b/);
    });

    test('reads bottom up, the way the kernel sorts, with the open share', () => {
      assert.ok(said.indexOf('Retention') < said.indexOf('Layer 1'));
      assert.ok(said.indexOf('Layer 1') < said.indexOf('Layer 2'));
      assert.match(said, /Acme Re forty percent, Vantage Re forty-five percent, open fifteen percent/);
      assert.match(said, /fifty million dollars, kept by the client/);
    });

    test('speaks the eyebrow first', () => {
      assert.ok(said.startsWith('Cat program · 2027.'));
    });
  });

  test('FS mirrors tower.styles.css', () => {
    const css = fs.readFileSync(STYLES, 'utf8');
    const sizeOf = (cls) => Number(css.match(new RegExp(`\\.${cls}[^{]*\\{[^}]*font-size:\\s*([\\d.]+)px`))[1]);
    assert.equal(sizeOf('tower-name'), FS.name);
    assert.equal(sizeOf('tower-note'), FS.note);
    assert.equal(sizeOf('tower-edge'), FS.edge);
    assert.equal(sizeOf('tower-share-value'), FS.share);
  });
});
