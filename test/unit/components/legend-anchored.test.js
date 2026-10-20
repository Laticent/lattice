/**
 * Unit: the legend's SVG emitter (`laneSvg`, lib/components/chart/_chart-family/legend-svg.js) and
 * its first caller, the heatmap's authored callouts. Design:
 * engineering/decisions/2026-10-19-universal-legend.md, Wave 0.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { JSDOM } = require('jsdom');
const { laneSvg, laneIndent, plateSvg, PLATE_CLASS } = require('../../../lib/components/chart/_chart-family/legend-svg');
const { collectLabelDrops } = require('../../../lib/components/chart/_chart-family/label-drops');
const { transformSection } = require('../../../lib/components/chart/heatmap/heatmap.transform');
const { narrateDataSeries, narrateChart } = require('../../../lib/core/chart-narration');
const { PLATE_SHAPES } = require('../../../lib/core/segno-slots');

const md = new MarkdownIt({ html: true });
const doc = (svg) => new JSDOM(`<!doctype html><body>${svg}</body>`).window.document;

const TABLE = `|  | M0 | M1 | M2 |
| --- | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 |
| Feb 2026 | 100 | 58 | 31 |`;
const render = (extra = '') => transformSection(md.render(`## Retention\n\n${TABLE}\n\n${extra}`), {});

describe('laneSvg', () => {
  const entry = (text, cy, mark, more = {}) => ({ text, ...more, target: { cx: 10, cy, w: 10, h: 10, mark } });
  const opts = { x: 100, width: 60, top: 0, bottom: 100, fontSize: 7 };

  test('each label carries data-mark-for its mark, and never data-mark', () => {
    const { svg } = laneSvg([entry('A', 20, 3)], opts);
    const d = doc(`<svg>${svg}</svg>`);
    assert.equal(d.querySelector('text.legend-text--bare').getAttribute('data-mark-for'), '3');
    assert.equal(d.querySelectorAll('[data-mark]').length, 0);
    assert.ok(d.querySelector('rect.legend-target[data-mark-for="3"]'));
  });

  test('a number ties a label to its mark: one marker on the mark, the same one in the lane, no line', () => {
    const { svg } = laneSvg([entry('A', 20, 3)], opts);
    const d = doc(`<svg>${svg}</svg>`);
    const numbers = [...d.querySelectorAll('text.legend-number')];
    assert.deepEqual(numbers.map((t) => t.textContent), ['1', '1']);
    assert.ok(numbers.every((t) => t.getAttribute('data-mark-for') === '3'));
    // One on the mark (left of the lane), one in the lane.
    const xs = numbers.map((t) => Number(t.querySelector('tspan').getAttribute('x')));
    assert.ok(Math.min(...xs) < opts.x && Math.max(...xs) >= opts.x);
    // Each sits on a knockout, a circle by default.
    assert.equal(d.querySelectorAll('rect.legend-knockout').length, 2);
    assert.equal(d.querySelectorAll('rect.legend-plate--circle').length, 2);
    assert.equal(d.querySelectorAll('polyline').length, 0);
  });

  test('with no color word, a marker takes the next slot no author word has used; the author\'s word wins', () => {
    const at = (text, cy, mark, more = {}) => ({ text, ...more, target: { cx: 10, cy, w: 10, h: 10, mark } });
    const { svg } = laneSvg([at('A', 20, 0), at('B', 40, 1, { color: 7 }), at('C', 60, 2)], opts);
    const slots = [...doc(`<svg>${svg}</svg>`).querySelectorAll('text.legend-number')].map((t) => `${t.textContent}:${t.getAttribute('data-c')}`);
    assert.deepEqual([...new Set(slots)], ['1:c1', '2:c7', '3:c2']);
    // An author's c2 is not handed out again to the label after it.
    const { svg: two } = laneSvg([at('A', 20, 0, { color: 'c2' }), at('B', 40, 1)], opts);
    const used = [...new Set([...doc(`<svg>${two}</svg>`).querySelectorAll('text.legend-number')].map((t) => t.getAttribute('data-c')))];
    assert.deepEqual(used, ['c2', 'c1']);
  });

  test('the marker on a mark takes the caller\'s size; the one in the lane is sized from its label', () => {
    const { svg } = laneSvg([entry('A', 20, 0)], { ...opts, markerSize: 9 });
    const sizes = [...doc(`<svg>${svg}</svg>`).querySelectorAll('text.legend-number')].map((t) => Number(t.getAttribute('font-size')));
    assert.deepEqual(sizes, [9, Math.round(opts.fontSize * 0.82 * 100) / 100]);
  });

  test('numbers run in reading order: row by row, then left to right', () => {
    const at = (text, cx, cy, mark) => ({ text, target: { cx, cy, w: 10, h: 10, mark } });
    const { placed } = laneSvg([at('Right', 40, 30, 2), at('Lower', 10, 50, 3), at('Left', 10, 30, 1)], opts);
    assert.deepEqual(placed.map((p) => p.n), [2, 3, 1]);
  });

  test('the marker on a mark sits in the first spot clear of everything it must avoid, or is left off', () => {
    const t = { cx: 30, cy: 30, w: 40, h: 40, mark: 0 };
    const pinX = (avoid) => {
      const { svg, placed } = laneSvg([{ text: 'A', target: t }], { ...opts, avoid });
      const nums = [...doc(`<svg>${svg}</svg>`).querySelectorAll('text.legend-number tspan')].map((n) => Number(n.getAttribute('x')));
      return { xs: nums, pinned: placed[0].pinned };
    };
    // Nothing to avoid: inside the top-left corner.
    const free = pinX([]);
    assert.ok(free.pinned && free.xs[0] > 10 && free.xs[0] < 30);
    // The top-left quarter taken: the next corner, top right.
    const tr = pinX([{ left: 0, right: 30, top: 0, bottom: 30 }]);
    assert.ok(tr.pinned && tr.xs[0] > 30);
    // The whole mark and its surroundings taken: no marker on the mark, the lane's marker kept.
    const none = pinX([{ left: -1e9, right: 1e9, top: -1e9, bottom: 1e9 }]);
    assert.equal(none.pinned, false);
    assert.equal(none.xs.length, 1);
    assert.ok(none.xs[0] >= opts.x);
  });

  test('two markers never sit on each other', () => {
    const at = (cx, mark) => ({ text: `L${mark}`, target: { cx, cy: 30, w: 12, h: 12, mark } });
    const { svg } = laneSvg([at(10, 0), at(22, 1)], { ...opts, markerSize: 7 });
    const xs = [...doc(`<svg>${svg}</svg>`).querySelectorAll('text.legend-number tspan')].map((n) => Number(n.getAttribute('x'))).filter((v) => v < opts.x);
    assert.equal(xs.length, 2);
    assert.ok(Math.abs(xs[0] - xs[1]) > 5, `${xs}`);
  });

  test('the lane indents its words by its widest marker, shape and digits alike', () => {
    const plain = laneIndent([{ text: 'A' }], 7.5);
    assert.ok(laneIndent([{ text: 'A', plate: 'diamond' }], 7.5) > plain);
    assert.ok(laneIndent(Array.from({ length: 10 }, () => ({ text: 'A' })), 7.5) > plain);
    const { svg } = laneSvg([{ text: 'A', plate: 'diamond', target: { cx: 10, cy: 20, w: 10, h: 10, mark: 0 } }], opts);
    const d = doc(`<svg>${svg}</svg>`);
    const knock = [...d.querySelectorAll('polygon.legend-knockout')].pop().getAttribute('points').split(' ').map((p) => Number(p.split(',')[0]));
    const textX = Number(d.querySelector('text.legend-text--bare tspan').getAttribute('x'));
    assert.ok(Math.max(...knock) < textX, `${Math.max(...knock)} < ${textX}`);
    assert.ok(Math.min(...knock) >= opts.x - 0.01);
  });

  test('labels stack in the order their marks sit, never overlapping', () => {
    const { placed } = laneSvg([entry('Lower', 31, 1), entry('Upper', 30, 0), entry('Third', 32, 2)], opts);
    const boxes = placed.map((p) => p.box);
    const byTop = [...boxes].sort((a, b) => a.top - b.top);
    assert.deepEqual(byTop.map((b) => b.lines[0]), ['Upper', 'Lower', 'Third']);
    for (let i = 1; i < byTop.length; i++) assert.ok(byTop[i].top >= byTop[i - 1].bottom, 'no overlap');
  });

  test('a stack that runs off the bottom slides up, and what still cannot fit is dropped and reported', () => {
    const tight = { ...opts, top: 0, bottom: 20 };
    const { value, drops } = collectLabelDrops(() => laneSvg([entry('One', 18, 0), entry('Two', 19, 1), entry('Three', 20, 2)], tight));
    const kept = value.placed.filter(Boolean);
    assert.ok(kept.length >= 1 && kept.length < 3);
    for (const p of kept) assert.ok(p.box.bottom <= 20.01 && p.box.top >= -0.01);
    assert.equal(drops.length, 3 - kept.length);
    assert.equal(drops[0].reason, 'overlap');
    // The ring is drawn for a dropped label too: the mark is still the one the author named.
    assert.equal((value.svg.match(/legend-target/g) || []).length, 3);
  });

  test('the label\'s pill words shape and color its marker; the words stay bare', () => {
    const { svg } = laneSvg([entry('LIVE', 20, 0, { plate: 'tag', color: 4 })], opts);
    assert.equal((svg.match(/<rect class="legend-plate legend-plate--tag" data-c="c4"[^>]*\/><text class="legend-text legend-text--plated legend-number"/g) || []).length, 2);
    assert.match(svg, /<text class="legend-text legend-text--bare"[^>]*><tspan[^>]*>LIVE</);
  });

  test('every pill shape has a plate class and draws', () => {
    assert.deepEqual(Object.keys(PLATE_CLASS), PLATE_SHAPES);
    const box = { left: 0, right: 20, top: 0, bottom: 8 };
    for (const shape of PLATE_SHAPES) assert.match(plateSvg(shape, box, 7), /legend-plate/);
  });

  test('no entries, nothing drawn', () => {
    assert.deepEqual(laneSvg([], opts), { svg: '', placed: [] });
  });
});

describe('heatmap: authored callouts', () => {
  test('a heatmap with no legend draws no legend markup', () => {
    assert.doesNotMatch(render(), /legend/);
  });

  test('a callout names its cell by row and column, and the paragraph is lifted', () => {
    const out = render('`@legend{{Drop-off, tag, c4, for="Feb 2026 · M2"}}`');
    const d = doc(out);
    const label = d.querySelector('text.legend-text--bare');
    assert.equal(label.textContent, 'Drop-off');
    // Row 1, column 2 of a three-column grid: data-mark 5, the cell's own index.
    assert.equal(label.getAttribute('data-mark-for'), '5');
    assert.ok(d.querySelector('rect.heatmap-cell[data-mark="5"]'));
    assert.doesNotMatch(out, /<code>@legend/);
  });

  test('row= and col= name the cell by its labels, the documented form', () => {
    const out = render('`@legend{{Drop-off, row="Feb 2026", col=M2}}`');
    assert.match(out, /class="legend-text legend-text--bare"[^>]*data-mark-for="5"/);
    assert.doesNotMatch(out, /<code>@legend/);
  });

  test('for= by index works the same', () => {
    assert.match(render('`@legend{{Peak, for=0}}`'), /data-mark-for="0" data-anima-role="label"/);
  });

  test('the callout sits in the lane, right of every cell', () => {
    const d = doc(render('`@legend{{Drop-off, for="Feb 2026 · M2"}}`'));
    const cellRight = Math.max(...[...d.querySelectorAll('rect.heatmap-cell')].map((r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width'))));
    const x = Number(d.querySelector('text.legend-text--bare tspan').getAttribute('x'));
    assert.ok(x > cellRight, `${x} > ${cellRight}`);
  });

  test('a detail joins the cell\'s card and the speaker note', () => {
    const out = render('`@legend{{Dip, for="Jan 2026 · M1", detail="Pricing change"}}`');
    assert.match(out, /<template class="chart-detail" data-mark="1"><li>Dip: Pricing change<\/li><\/template>/);
    assert.match(out, /<!-- Jan 2026 · M1 \(62\): Dip: Pricing change -->/);
  });

  test('the description names each callout, and one that names no cell is reported, not drawn', () => {
    const out = render('`@legend{[{Dip, for="Jan 2026 · M1"}, {Lost, for="Mar · M9"}]}`');
    const desc = doc(out).querySelector('desc').textContent;
    assert.match(desc, /Callouts: Dip \(Jan 2026 · M1\)\./);
    assert.match(desc, /Not drawn: "Lost" \(for=Mar · M9, which names no cell\)\./);
    assert.equal(doc(out).querySelectorAll('text.legend-text--bare').length, 1);
  });

  test('a key legend is reported as not drawn, in its own words', () => {
    const desc = doc(render('`@legend{[{Poor, c1}], key}`')).querySelector('desc').textContent;
    assert.match(desc, /Not drawn: "Poor" \(a key legend, which a heatmap does not draw yet\)\./);
  });

  test('an earlier paragraph that starts with code, or a fence, does not hide the legend', () => {
    for (const before of ['`x` is a variable', '```js\nlet x;\n```']) {
      const out = transformSection(md.render(`## T\n\n${before}\n\n${TABLE}\n\n\`@legend{{Drop, for=0}}\``), {});
      assert.match(out, /legend-target/, before);
      assert.doesNotMatch(out, /<code>@legend/, before);
    }
  });

  test('a label the lane cannot hold is listed as not drawn, never as a callout', () => {
    const many = Array.from({ length: 8 }, (_, i) => `{Callout number ${i} that wraps over lines, for=${i % 6}}`).join(', ');
    const desc = doc(render(`\`@legend{[${many}]}\``)).querySelector('desc').textContent;
    assert.match(desc, /no room beside the grid/);
    const shown = (desc.match(/Callouts: ([\s\S]*?)\. Not drawn/) || ['', ''])[1];
    assert.ok(!/no room/.test(shown));
  });

  test('a chevron or diamond marker in the lane stays inside the figure and off the grid', () => {
    for (const shape of ['chevron-left', 'diamond', 'chevron-right']) {
      const d = doc(render(`\`@legend{{Onboarding change after the pricing move, ${shape}, for=4}}\``));
      // The lane's marker is the second: the first is pinned to the cell.
      const xs = d.querySelectorAll('polygon.legend-knockout')[1].getAttribute('points').split(' ').map((p) => Number(p.split(',')[0]));
      const cellRight = Math.max(...[...d.querySelectorAll('rect.heatmap-cell')].map((r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width'))));
      assert.ok(Math.min(...xs) > cellRight, `${shape}: ${Math.min(...xs)} > ${cellRight}`);
      assert.ok(Math.max(...xs) <= 320, `${shape}: ${Math.max(...xs)} <= 320`);
    }
  });

  test('a span that does not read stays on the slide as the author wrote it', () => {
    assert.match(render('`@legend{x}`'), /<code>@legend\{x\}<\/code>/);
  });

  test('the marker on a cell grows with the cell, within a floor and a ceiling', () => {
    const size = (table) => Number(doc(transformSection(md.render(`## R\n\n${table}\n\n\`@legend{{X, for=0}}\``), {})).querySelector('text.legend-number').getAttribute('font-size'));
    const roomy = size('| | A |\n|---|--:|\n| r | 1 |');
    const dense = size(`| | ${Array.from({ length: 12 }, (_, i) => `C${i}`).join(' | ')} |\n|---|${'--:|'.repeat(12)}\n${Array.from({ length: 7 }, (_, r) => `| R${r} | ${Array.from({ length: 12 }, () => '5').join(' | ')} |`).join('\n')}`);
    assert.ok(roomy > dense, `${roomy} > ${dense}`);
    assert.ok(dense >= 7.5 * 0.75 - 0.01 && roomy <= 7.5 * 1.1 + 0.01);
  });

  test('on a dense grid with long values, no marker covers a printed value or a column name', () => {
    const cols = Array.from({ length: 12 }, (_, i) => `January${i}`);
    const rowsMd = Array.from({ length: 6 }, (_, r) => `| Region ${r} | ${cols.map((_, c) => 1000 + r * 40 + c).join(' | ')} |`).join('\n');
    const table = `| | ${cols.join(' | ')} |\n|---|${'--:|'.repeat(12)}\n${rowsMd}`;
    const out = transformSection(md.render(`## R\n\n${table}\n\n\`@legend{[{Corner, row=Region 0, col=January0}, {Next, row=Region 0, col=January1}, {Mid, row=Region 5, col=January5}]}\``), {});
    const d = doc(out);
    const box = (el) => {
      if (el.tagName === 'rect') return { l: +el.getAttribute('x'), r: +el.getAttribute('x') + +el.getAttribute('width'), t: +el.getAttribute('y'), b: +el.getAttribute('y') + +el.getAttribute('height') };
      const p = el.getAttribute('points').split(' ').map((q) => q.split(',').map(Number));
      return { l: Math.min(...p.map((q) => q[0])), r: Math.max(...p.map((q) => q[0])), t: Math.min(...p.map((q) => q[1])), b: Math.max(...p.map((q) => q[1])) };
    };
    const cells = [...d.querySelectorAll('rect.heatmap-cell')].map(box);
    const gridTop = Math.min(...cells.map((c) => c.t));
    const gridLeft = Math.min(...cells.map((c) => c.l));
    const gridRight = Math.max(...cells.map((c) => c.r));
    const values = [...d.querySelectorAll('text.heatmap-value')].map((v) => {
      const cx = +v.querySelector('tspan').getAttribute('x');
      const cy = +v.querySelector('tspan').getAttribute('y');
      const half = (v.textContent.length * 7 * 0.6) / 2;
      return { l: cx - half, r: cx + half, t: cy - 3, b: cy + 3 };
    });
    const onGrid = [...d.querySelectorAll('.legend-knockout')].map(box).filter((k) => k.r <= gridRight + 0.01);
    for (const k of onGrid) {
      assert.ok(k.t >= gridTop - 0.01 && k.l >= gridLeft - 0.01, 'inside the grid, clear of the column and row names');
      for (const v of values) assert.ok(!(k.l < v.r && v.l < k.r && k.t < v.b && v.t < k.b), `marker ${JSON.stringify(k)} covers value ${JSON.stringify(v)}`);
    }
  });

  test('callouts and the band key share the figure: the key starts past the lane', () => {
    const out = transformSection(md.render(`## R\n\n${TABLE}\n\n\`@legend{{Drop-off, for=5}}\``), { classTokens: ['scale'] });
    const d = doc(out);
    const label = d.querySelector('text.legend-text--bare tspan');
    // The label's right edge, estimated as generously as the kernel does (0.6em a character).
    const labelRight = Number(label.getAttribute('x')) + label.textContent.length * 7.5 * 0.6;
    const keyLeft = Math.min(...[...d.querySelectorAll('rect.chart-key-swatch')].map((r) => Number(r.getAttribute('x'))));
    assert.ok(keyLeft > labelRight, `${keyLeft} > ${labelRight}`);
  });
});

test('narration does not speak a legend line markdown merged into a paragraph (the chart shows it as code)', () => {
  const slide = `<!-- _class: heatmap -->\n\n## Retention\n\n${TABLE}\n\nSee:\n\`@legend{{Dip, for=0}}\``;
  assert.doesNotMatch(String(narrateDataSeries(slide)), /Callout/);
});

test('narration reads a row= / col= callout, markdown in a row name included', () => {
  const slide = `<!-- _class: heatmap -->\n\n## R\n\n|  | M0 | M1 |\n| --- | --: | --: |\n| Jan_2026 | 1 | 2 |\n\n\`@legend{{Dip, row=Jan_2026, col=M1}}\``;
  assert.match(String(narrateDataSeries(slide)), /Callout at Jan2026, M1: Dip\./);
});

test('narration matches for= the way the chart does, markdown in a row name included', () => {
  const slide = `<!-- _class: heatmap -->\n\n## R\n\n|  | M0 | M1 |\n| --- | --: | --: |\n| Jan_2026 | 1 | 2 |\n\n\`@legend{{Dip, for="Jan_2026 · M1"}}\``;
  assert.match(String(narrateDataSeries(slide)), /Callout at Jan2026, M1: Dip\./);
});

describe('the author\'s switch: legend off', () => {
  const callout = '`@legend{{Dip, for="Jan 2026 · M1", detail="Pricing change"}}`';
  test('legend-off on the slide hides the callout and its line, and keeps the detail in the speaker note', () => {
    const out = transformSection(md.render(`## R\n\n${TABLE}\n\n${callout}`), { classTokens: ['legend-off'] });
    assert.doesNotMatch(out, /legend--anchored|legend-target|<code>@legend/);
    assert.doesNotMatch(doc(out).querySelector('desc').textContent, /Dip/);
    assert.match(out, /<!-- Jan 2026 · M1 \(62\): Dip: Pricing change -->/);
  });
  test('a host that switched the plugin off hides it the same way', () => {
    const out = transformSection(md.render(`## R\n\n${TABLE}\n\n${callout}`), { pluginsOff: new Set(['legend']) });
    assert.doesNotMatch(out, /legend--anchored/);
  });
  test('narration says nothing for a hidden callout: deck off, or slide off; legend-on wins', () => {
    const slide = (cls, fm = '') => `${fm}<!-- _class: ${cls} -->\n\n## R\n\n${TABLE}\n\n${callout}`;
    assert.doesNotMatch(String(narrateDataSeries(slide('heatmap legend-off'))), /Callout|legend/);
    assert.doesNotMatch(String(narrateDataSeries(slide('heatmap', '---\nlegend: off\n---\n\n'))), /Callout/);
    assert.match(String(narrateDataSeries(slide('heatmap legend-on', '---\nlegend: off\n---\n\n'))), /Callout at Jan 2026, M1: Dip\./);
  });
  test('narration of one split slide reads the deck it came from: front matter and the host\'s off-list', () => {
    // How every caller hands a slide over: split from the deck, so the front matter is not on it.
    const slide = `<!-- _class: heatmap -->\n\n## R\n\n${TABLE}\n\n${callout}`;
    assert.match(String(narrateChart(slide)), /Callout at Jan 2026, M1/);
    assert.doesNotMatch(String(narrateChart(slide, { frontMatter: 'marp: true\nlegend: OFF' })), /Callout/);
    assert.doesNotMatch(String(narrateChart(slide, { frontMatter: 'marp: true', pluginsOff: ['legend'] })), /Callout/);
    assert.match(String(narrateChart(slide.replace('heatmap', 'heatmap legend-on'), { frontMatter: 'legend: off' })), /Callout at Jan 2026, M1/);
    // The deck is set for one call only: the next slide without one hears the callout again.
    assert.match(String(narrateChart(slide)), /Callout at Jan 2026, M1/);
  });
});

test('narration reads a callout after the rows, then its detail', () => {
  const slide = `<!-- _class: heatmap -->\n\n## Retention\n\n${TABLE}\n\n\`@legend{{Dip, for="Feb 2026 · M2", detail="Pricing change"}}\``;
  const spoken = String(narrateDataSeries(slide));
  assert.match(spoken, /Callout at Feb 2026, M2: Dip\. Pricing change\.$/);
  assert.doesNotMatch(spoken, /legend/);
});
