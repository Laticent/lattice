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

// Each element of class `cls`: its attributes and its first text run. A split on
// `<`, not a `class="…"[^>]*attr=` regex, which CodeQL flags as polynomial on a run
// of repeated marks (#2714 code scanning 423/424).
function tags(svg, cls) {
  const out = [];
  const parts = svg.split('<');
  parts.forEach((p, i) => {
    const end = p.indexOf('>');
    if (end < 0) return;
    const head = p.slice(0, end);
    if (!head.includes(`class="${cls}"`) && !head.includes(`class="${cls} `)) return;
    const next = parts[i + 1] || '';
    // A wrapped label carries its position on the first `<tspan>`, not the `<text>`.
    const tspan = next.startsWith('tspan') ? next.slice(0, next.indexOf('>')) : '';
    const read = (from, name) => {
      const key = ` ${name}="`;
      const a = from.indexOf(key);
      return a < 0 ? null : from.slice(a + key.length, from.indexOf('"', a + key.length));
    };
    const attr = (name) => read(head, name) ?? read(tspan, name);
    let text = p.slice(end + 1);
    if (!text && next.startsWith('tspan')) text = next.slice(next.indexOf('>') + 1);
    out.push({ attr, text });
  });
  return out;
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
      assert.ok(tags(svg, 'tower-note').some((t) => t.text === '$50M'), 'the retention note is its size alone; the band says Retained');
      for (const edge of ['$50M', '$90M', '$160M', '$360M']) {
        assert.equal(tags(svg, 'tower-edge').filter((t) => t.text === edge).length, 1, edge);
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
      const shares = tags(out, 'tower-share');
      const widths = shares.map((t) => Number(t.attr('width')));
      const rect = shares[0].attr('x');
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

  // The independent checker's repros on #2714, each pinned so it cannot come back.
  describe('the checker repros', () => {
    const { readTowerSize } = require('../../../lib/core/tower-size');

    test('a malformed size is dropped, never read as a retention', () => {
      for (const bad of ['$40M xs', 'xs $50M', '40 xs 50 xs 60', '40% xs 50%', '$40M xs -$10M', '0', '-$5M']) {
        assert.equal(readTowerSize(bad), null, bad);
      }
      assert.equal(readTowerSize('USD 40mn x/s USD 50mn').attach, 50e6);
    });

    test('shares a hair under 100 leave no phantom Open', () => {
      const m = parseTower(ul([['L1', '$10M xs $5M', [['A', '33.33%'], ['B', '33.33%'], ['C', '33.33%']]]]));
      assert.equal(m.layers[0].open, 0);
      assert.doesNotMatch(buildTower(m, {}), /tower-open|Open/);
    });

    test('a reinsurer written twice in a layer is summed into one segment', () => {
      const m = parseTower(ul([['L1', '$10M xs $5M', [['Acme', '30%'], ['Acme', '20%']]]]));
      assert.deepEqual(m.layers[0].segs.map((x) => [x.name, x.pct]), [['Acme', 50]]);
    });

    test('a gap or an overlap prints each figure against its own band, and says so', () => {
      const edgesOf = (svg) => tags(svg, 'tower-edge').map((t) => [t.text, Number(t.attr('y'))]);
      const gap = buildTower(parseTower(ul([['Upper', '$50M xs $100M'], ['Lower', '$40M xs $50M']])), {});
      const ys = edgesOf(gap).map(([, y]) => y);
      assert.equal(new Set(ys).size, ys.length, 'no two boundary figures share a y');
      assert.match(gap, /Uncovered from \$90M to \$100M/);
      const over = buildTower(parseTower(ul([['A', '$50M xs $50M'], ['B', '$50M xs $80M']])), {});
      assert.match(over, /B overlaps A from \$80M to \$100M/);
    });

    test('the key swatch carries the mark contract a finish keys on', () => {
      const svg = buildTower(parseTower(ul(PROGRAM)), {});
      assert.match(svg, /class="chart-key-swatch tower-swatch" data-hue="1" data-encodes="hue" data-paint="fill"/);
    });

    test('the popover and the description name who Others is', () => {
      const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      const out = buildTower(parseTower(ul([['L1', '$10M xs $5M', names.map((n) => [n, '10%'])]])), {});
      assert.match(out, /<li>Others 20% \(F 10%, G 10%\)<\/li>/);
      assert.match(out.match(/<desc>[^<]*<\/desc>/)[0], /Others 20% \(F 10%, G 10%\)/);
    });

    test('a crowded tower in a small pane prints no names across each other', () => {
      const layers = Array.from({ length: 11 }, (_, i) => [`L${i}`, `$10M xs $${10 * (i + 1)}M`]);
      const svg = buildTower(parseTower(ul(layers)), { paneView: { w: 140, h: 72 } });
      assert.doesNotMatch(svg, /class="tower-name"/);
      assert.doesNotMatch(svg, /Ret…/);
    });
  });

  describe('narration mirrors the kernel', () => {
    const { narrateChart } = require('../../../lib/core/chart-narration');
    const say = (body) => narrateChart(['<!-- _class: tower -->', '', '## T.', '', ...body, ''].join('\n'));

    test('a dropped pill is not said, and marks keep the kernel order', () => {
      const out = say(['- Bad `$40M xs -$10M`', '- Layer 1 `$40M xs $50M`', '- Retention `$50M`']);
      assert.doesNotMatch(out, /Bad|down ten/);
      assert.ok(out.indexOf('Retention') < out.indexOf('Layer 1'));
    });

    test('only the first list is the tower', () => {
      const out = say(['- Layer 1 `$40M xs $50M`', '- Retention `$50M`', '', 'Notes:', '', '- Prior year `$30M xs $20M`']);
      assert.doesNotMatch(out, /Prior year: thirty/);
    });

    test('`*` bullets narrate, and a share nested a level deeper is not a share', () => {
      const out = say(['* Layer 1 `$40M xs $50M`', '  * Acme Re `60%`', '    * Acme line `20%`', '* Retention `$50M`']);
      assert.match(out, /Acme Re sixty percent, open forty percent/);
    });

    test('over-placement is said, as the description says it', () => {
      const out = say(['- Layer 1 `$40M xs $50M`', '  - A `70%`', '  - B `50%`']);
      assert.match(out, /over-placed at one hundred twenty percent/);
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
