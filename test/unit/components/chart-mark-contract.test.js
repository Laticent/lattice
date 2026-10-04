/**
 * The mark contract (engineering/decisions/2026-09-07-chart-design-language/slot-contract.md):
 * every categorical mark says which of the eight hues it wears (`data-hue`), what that color
 * encodes (`data-encodes`) and which property carries it (`data-paint`). A chart finish
 * repaints through those three attributes, so a mark that drops them silently keeps the
 * as-shipped paint. These pins cover the helpers that stamp them and the members whose
 * stamps the chart gallery does not reach (a quadrant hull polygon, an out-of-range slot).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../../../lib/engine');
const { hueContract } = require('../../../lib/components/chart/flowchart/flowchart.transform');
const cells = require('../../../lib/core/matrix-grid-cells');
const { buildQuadrant, parseQuadrant } = require('../../../lib/components/chart/quadrant/quadrant.transform');

/**
 * Every opening tag in `html`, found by a linear scan rather than a regex: the patterns this
 * file needs (`<tag … class="x" …>`) are polynomial as regexes over long markup (CodeQL
 * js/polynomial-redos).
 */
function openTags(html) {
  return String(html).split('<').slice(1).filter((t) => /^[a-z]/.test(t)).map((t) => `<${t.slice(0, t.indexOf('>') + 1)}`);
}
/** The opening tags of `tag` elements whose class attribute is exactly `cls`. */
const tagsOf = (html, tag, cls) => openTags(html).filter((t) => (!tag || t.startsWith(`<${tag} `)) && t.includes(` class="${cls}"`));

describe('flowchart hueContract', () => {
  test('a category-painted node carries its slot as the hue', () => {
    assert.equal(hueContract({ slot: 3 }, 'bg'), ' data-hue="3" data-encodes="hue" data-paint="bg"');
    assert.equal(hueContract({ slot: 8 }, 'fill'), ' data-hue="8" data-encodes="hue" data-paint="fill"');
  });
  test('a status, an explicit fill or no slot carries nothing', () => {
    assert.equal(hueContract({}, 'bg'), '');
    assert.equal(hueContract({ slot: 2, status: 'done' }, 'bg'), '');
    assert.equal(hueContract({ slot: 2, fill: 4 }, 'bg'), '');
  });
});

describe('matrix-grid cell kernel', () => {
  const filled = cells.parseCell('[x] Senior');
  test('a filled body cell names its row hue, wrapping after eight', () => {
    const hues = Array.from({ length: 10 }, (_, r) => +/data-hue="(\d)"/.exec(cells.cellHtml(filled, r))[1]);
    assert.deepEqual(hues, [1, 2, 3, 4, 5, 6, 7, 8, 1, 2]);
    assert.match(cells.cellHtml(filled, 0), /data-encodes="hue" data-paint="bg"/);
  });
  test('outlined, empty and row-less cells carry nothing', () => {
    assert.doesNotMatch(cells.cellHtml(cells.parseCell('[-]'), 0), /data-hue/);
    assert.doesNotMatch(cells.cellHtml(cells.parseCell('[ ]'), 0), /data-hue/);
    assert.doesNotMatch(cells.cellHtml(filled), /data-hue/);
  });
});

describe('quadrant cohort hull', () => {
  test('a three-member cohort draws a stamped polygon', () => {
    const ul = '<li>Bets<ul><li>A <code>{2, 70}</code></li><li>B <code>{4, 90}</code></li><li>C <code>{3, 60}</code></li></ul></li>' +
      '<li>Wins<ul><li>D <code>{8, 40}</code></li></ul></li><li>Defer<ul><li>E <code>{4, 20}</code></li></ul></li>' +
      '<li>Sinks<ul><li>F <code>{7, 10}</code></li></ul></li>';
    const scale = { x: { min: 0, max: 10, label: 'Effort' }, y: { min: 0, max: 100, label: 'Reach' }, targets: null };
    const out = buildQuadrant(parseQuadrant(ul), 'cohort', scale);
    const [hull] = tagsOf(out, 'polygon', 'quadrant-hull');
    assert.ok(hull, 'expected a hull polygon');
    assert.match(hull, /data-hue="\d" data-encodes="hue" data-paint="fill"/);
  });
});

describe('the chart gallery through the real engine', () => {
  const md = fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/chart.gallery.md'), 'utf8');
  const html = String(engine.render(md).html);
  // Each row: a mark's opening tag, and the encoding its stamp must name.
  const rows = [
    ['piechart', 'path', 'wedge', 'hue'],
    ['funnel', null, 'funnel-band', 'hue'],
    ['quadrant', 'circle', 'quadrant-dot', 'hue'],
    ['matrix-grid', 'span', 'cell cell-filled', 'hue'],
    ['heatmap', 'rect', 'heatmap-cell', 'ramp'],
    ['radar', 'polygon', 'radar-poly', 'layered'],
    ['radar dot', null, 'radar-dot', 'hue'],
    ['map ramp region', 'path', 'map-region map-region--on', 'ramp'],
    ['journey actor dot', 'span', 'journey-actor-dot', 'hue'],
    ['stacked-bar segment', 'rect', 'sbar-seg', 'hue'],
    ['bar mark', 'rect', 'bar-mark', 'hue'],
    ['scatter dot', 'circle', 'scatter-dot', 'hue'],
    ['line dot', 'circle', 'line-dot', 'hue'],
  ];
  // A KEY carries the contract of the marks it keys, so a finish repaints the two together:
  // a tone finish whose wedges went tonal while its key kept five categorical colors was the
  // defect. A categorical swatch names its hue; the map's ramp swatch carries its own --mix.
  test('key swatches carry the contract of the marks they key', () => {
    const sw = tagsOf(html, 'rect', 'chart-key-swatch');
    // A key whose marks the a11y themes texture names its hue as `data-hue` (pie).
    const hue = sw.filter((t) => /data-hue="\d"/.test(t));
    assert.ok(hue.length >= 5, 'the pie key');
    for (const t of hue) assert.match(t, /data-encodes="hue" data-paint="fill"/, t);
    // A key whose marks they do NOT texture names it as `data-key-hue` (radar), and never as
    // `data-hue`: a11y-base's `figure.chart-frame .chart-key-swatch[data-hue]` would otherwise
    // texture radar's key in Read·Article while its polygons stay plain (red-team finding).
    const keyOnly = sw.filter((t) => /data-key-hue="\d"/.test(t));
    assert.ok(keyOnly.length >= 3, 'the radar key');
    for (const t of keyOnly) {
      assert.doesNotMatch(t, / data-hue=/, t);
      assert.match(t, /data-encodes="hue" data-paint="fill"/, t);
    }
    const ramp = sw.filter((t) => /data-encodes="ramp"/.test(t));
    assert.ok(ramp.length, 'the map key');
    for (const t of ramp) assert.match(t, /data-paint="fill" style="--mix:[\d.]+%"/, t);
  });

  for (const [name, tag, cls, encodes] of rows) {
    test(`${name} marks carry the contract`, () => {
      const tags = tagsOf(html, tag, cls);
      assert.ok(tags.length, `the gallery renders no ${name} mark`);
      for (const t of tags) assert.match(t, new RegExp(`data-encodes="${encodes}"`), t);
    });
  }
});

describe('marks the gallery does not render', () => {
  const render = (md) => String(engine.render(md).html);

  // Checker finding: stamping a slotted GROUP made a finish paint it as a saturated 82% body
  // with its title unreadable on it. A group is a container; a finish leaves it alone.
  test('a slotted flowchart group carries no contract; its shapes and tile key do', () => {
    const md = '<!-- _class: flowchart -->\n\n## F\n\n- Ingest `:c2`\n  - Pull `:c3` -> Parse `:c3`\n\n`[{:c2, Ingest}, {:c3, Step}]`\n';
    const html = render(md);
    const { browserJs } = require('../../../lib/components/chart/flowchart/flowchart.layout');
    // The group is drawn by the browser pass; its template must not stamp the contract.
    assert.doesNotMatch(browserJs(), /fc-group"[^\n]*data-hue/);
    const keys = tagsOf(html, 'span', 'fc-key-swatch');
    const tile = keys.find((t) => t.includes('data-kind="tile"'));
    assert.ok(tile, 'a tile key swatch');
    assert.match(tile, /data-hue="3" data-encodes="hue" data-paint="bg"/);
    const group = keys.find((t) => t.includes('data-kind="group"'));
    assert.ok(group, 'a group key swatch');
    assert.doesNotMatch(group, /data-hue/);
  });

  // Inversion finding: marks only a variant draws were unpinned, so a dropped stamp would put
  // one chart back on its shipped paint inside a finished deck. Each row renders the member's
  // own docs example for that variant.
  const docsExample = (member, variant) => {
    const md = fs.readFileSync(path.join(__dirname, `../../../lib/components/chart/${member}/${member}.docs.md`), 'utf8');
    const from = md.indexOf(`### \`${variant}\``);
    assert.ok(from >= 0, `${member}.docs.md has a ${variant} section`);
    const fence = /```markdown\n([\s\S]*?)\n```/.exec(md.slice(from));
    return fence[1];
  };
  for (const [member, variant, cls, encodes] of [
    ['line', 'area', 'line-area', 'hue'],
    ['line', 'stacked-area', 'line-band', 'hue'],
    ['scatter', 'bubble', 'scatter-bubble', 'layered'],
    ['quadrant', 'bubble', 'quadrant-bubble', 'hue'],
    ['quadrant', 'trail', 'quadrant-trail-after', 'hue'],
    ['radar', 'quadrant', 'radar-sector', 'hue'],
    ['flowchart', 'tb', 'fc-node', 'hue'],
  ]) {
    test(`${member} ${variant}: ${cls} carries the contract`, () => {
      const tags = tagsOf(render(docsExample(member, variant)), null, cls);
      const stamped = tags.filter((t) => t.includes(`data-encodes="${encodes}"`));
      assert.ok(stamped.length, `no stamped ${cls} in the ${variant} example`);
    });
  }

  // Found sweeping every variant's key: the cohort key kept the shipped colors while a finish
  // repainted the dots it names. A quadrant key names its hue as data-key-hue (no a11y texture).
  test('a quadrant cohort key carries the hue of the cohort it names', () => {
    const keys = tagsOf(render(docsExample('quadrant', 'cohort')), 'rect', 'chart-key-swatch');
    assert.ok(keys.length >= 2, 'the cohort key');
    for (const k of keys) {
      assert.match(k, /data-key-hue="\d" data-encodes="hue" data-paint="fill"/, k);
      assert.doesNotMatch(k, / data-hue=/, k);
    }
  });

  // Checker finding: the band key kept the shipped ramp while its cells moved.
  test('a heatmap band key carries the ramp contract of the cells it keys', () => {
    const html = render('<!-- _class: heatmap scale -->\n\n## H\n\n|  | A | B |\n| --- | --: | --: |\n| X | 1 | 5 |\n| Y | 9 | 3 |\n');
    const keys = tagsOf(html, 'rect', 'chart-key-swatch heatmap-cell');
    assert.ok(keys.length >= 2);
    for (const k of keys) assert.match(k, /data-encodes="ramp" data-paint="fill"/);
  });
});
