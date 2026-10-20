/**
 * Unit: the legend's SVG emitter (`laneSvg`, lib/components/chart/_chart-family/legend-svg.js) and
 * its first caller, the heatmap's authored callouts. Design:
 * engineering/decisions/2026-10-19-universal-legend.md, Wave 0.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { JSDOM } = require('jsdom');
const { laneSvg, laneIndent, laneHeight, plateSvg, markerSvg, markerShapes, MARKER_SHAPES, DIGIT_OF_HEIGHT, PLATE_CLASS } = require('../../../lib/components/chart/_chart-family/legend-svg');
const { collectLabelDrops } = require('../../../lib/components/chart/_chart-family/label-drops');
const { transformSection } = require('../../../lib/components/chart/heatmap/heatmap.transform');
const { narrateDataSeries, narrateChart } = require('../../../lib/core/chart-narration');
const { PLATE_SHAPES } = require('../../../lib/core/segno-slots');

const md = new MarkdownIt({ html: true });
const doc = (svg) => new JSDOM(`<!doctype html><body>${svg}</body>`).window.document;
/** An SVG shape's bounding box, whichever element draws it. */
const outline = (el) => {
  if (el.tagName === 'rect') return { l: +el.getAttribute('x'), r: +el.getAttribute('x') + +el.getAttribute('width'), t: +el.getAttribute('y'), b: +el.getAttribute('y') + +el.getAttribute('height') };
  if (el.tagName === 'circle') { const [cx, cy, r] = ['cx', 'cy', 'r'].map((a) => +el.getAttribute(a)); return { l: cx - r, r: cx + r, t: cy - r, b: cy + r }; }
  const p = el.getAttribute('points').split(' ').map((q) => q.split(',').map(Number));
  return { l: Math.min(...p.map((q) => q[0])), r: Math.max(...p.map((q) => q[0])), t: Math.min(...p.map((q) => q[1])), b: Math.max(...p.map((q) => q[1])) };
};

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
    // Each sits on a knockout; the first callout's shape is the circle.
    assert.equal(d.querySelectorAll('.legend-knockout').length, 2);
    assert.equal(d.querySelectorAll('circle.legend-plate[data-shape="circle"]').length, 2);
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

  test('the marker on a mark takes the caller\'s height; the one in the lane carries a digit as large as its label', () => {
    const { svg } = laneSvg([{ text: 'A', target: { cx: 30, cy: 30, w: 60, h: 60, mark: 0 } }], { ...opts, markerHeight: 14 });
    const sizes = [...doc(`<svg>${svg}</svg>`).querySelectorAll('text.legend-number')].map((t) => Number(t.getAttribute('font-size')));
    assert.deepEqual(sizes, [Math.round(14 * DIGIT_OF_HEIGHT * 100) / 100, opts.fontSize]);
  });

  test('numbers run in reading order: row by row, then left to right', () => {
    const at = (text, cx, cy, mark) => ({ text, target: { cx, cy, w: 10, h: 10, mark } });
    const { placed } = laneSvg([at('Right', 40, 30, 2), at('Lower', 10, 50, 3), at('Left', 10, 30, 1)], opts);
    assert.deepEqual(placed.map((p) => p.n), [2, 3, 1]);
  });

  test('a marker sits inside its mark\'s top-left corner, else on a badge there, else at the gutter crossing, or is left off', () => {
    const t = { cx: 30, cy: 30, w: 40, h: 40, mark: 0, gutter: 2 };
    const pin = (avoid) => {
      const { svg, placed } = laneSvg([{ text: 'A', target: t }], { ...opts, markerHeight: 10, avoid });
      const k = [...doc(`<svg>${svg}</svg>`).querySelectorAll('.legend-knockout')].map(outline).filter((b) => b.l < opts.x);
      return { box: k[0], pinned: placed[0].pinned };
    };
    // Nothing to avoid: whole inside the top-left corner.
    const inside = pin([]);
    assert.ok(inside.pinned && inside.box.l >= 10 && inside.box.t >= 10);
    // The corner's inside taken: a badge, partly off the mark, up and to the left.
    const badge = pin([{ left: 19, right: 50, top: 19, bottom: 50 }]);
    assert.ok(badge.pinned && badge.box.l < 10 && badge.box.t < 10);
    // Everything around the mark taken: no marker on the mark; never a different corner.
    const none = pin([{ left: -1e9, right: 1e9, top: -1e9, bottom: 1e9 }]);
    assert.equal(none.pinned, false);
    assert.equal(none.box, undefined);
  });

  test('two markers never sit on each other', () => {
    const at = (cx, mark) => ({ text: `L${mark}`, target: { cx, cy: 30, w: 12, h: 12, mark, gutter: 1 } });
    const { svg } = laneSvg([at(10, 0), at(23, 1)], { ...opts, markerHeight: 8, minMarkerHeight: 4 });
    const boxes = [...doc(`<svg>${svg}</svg>`).querySelectorAll('.legend-knockout')].map(outline).filter((b) => b.l < opts.x);
    assert.equal(boxes.length, 2);
    assert.ok(boxes[0].r <= boxes[1].l || boxes[1].r <= boxes[0].l || boxes[0].b <= boxes[1].t || boxes[1].b <= boxes[0].t, JSON.stringify(boxes));
  });

  test('every marker on a figure shares one height, one spot and one choice of digit', () => {
    // A roomy mark and a tight one: the tight one decides for both.
    const roomy = { text: 'A', target: { cx: 30, cy: 30, w: 40, h: 40, mark: 0, gutter: 1 } };
    const tight = { text: 'B', target: { cx: 30, cy: 80, w: 40, h: 9, mark: 1, gutter: 1 } };
    const { placed } = laneSvg([roomy, tight], { ...opts, bottom: 200, markerHeight: 12, minMarkerHeight: 4 });
    assert.ok(placed.every((p) => p.pinned));
    assert.equal(placed[0].digit, placed[1].digit);
  });

  test('the lane indents its words past its widest marker, whichever shape it draws', () => {
    const six = MARKER_SHAPES.map((_, i) => ({ text: `L${i}`, target: { cx: 10, cy: 10 + i * 12, w: 10, h: 10, mark: i } }));
    const { svg } = laneSvg(six, { ...opts, bottom: 200 });
    const d = doc(`<svg>${svg}</svg>`);
    const textX = Number(d.querySelector('text.legend-text--bare tspan').getAttribute('x'));
    const inLane = [...d.querySelectorAll('.legend-knockout')].map(outline).filter((k) => k.l >= opts.x - 0.01);
    assert.equal(inLane.length, 6);
    for (const k of inLane) assert.ok(k.r < textX, `${k.r} < ${textX}`);
    // The indent is the same however many callouts there are: the lane reserves the widest shape.
    assert.equal(laneIndent([{ text: 'A' }], 7.5), laneIndent(six, 7.5));
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
    assert.equal((value.svg.match(/class="legend-target"/g) || []).length, 3);
  });

  test('the label\'s pill words shape and color its marker; the words stay bare', () => {
    const { svg } = laneSvg([entry('LIVE', 20, 0, { plate: 'tag', color: 4 })], opts);
    // `tag` reads as the square.
    assert.equal((svg.match(/<rect class="legend-plate" data-c="c4" data-shape="square"[^>]*\/><text class="legend-text legend-text--plated legend-number"/g) || []).length, 2);
    assert.match(svg, /<text class="legend-text legend-text--bare"[^>]*><tspan[^>]*>LIVE</);
  });

  test('every pill shape has a plate class and draws', () => {
    assert.deepEqual(Object.keys(PLATE_CLASS), PLATE_SHAPES);
    const box = { left: 0, right: 20, top: 0, bottom: 8 };
    for (const shape of PLATE_SHAPES) assert.match(plateSvg(shape, box, 7), /legend-plate/);
  });

  test('callouts take the six shapes in number order, one each', () => {
    assert.deepEqual(markerShapes(Array.from({ length: 6 }, () => ({}))), ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star']);
    // A pill word claims its shape; a second claim on it takes the next free shape instead.
    assert.deepEqual(markerShapes([{}, { plate: 'diamond' }, { plate: 'diamond' }]), ['circle', 'diamond', 'square']);
    assert.deepEqual(markerShapes([{ plate: 'chevron-right' }, { plate: 'tag' }]), ['circle', 'square']);
  });

  test('every shape is drawn about as tall as asked, and the lane digit is as large as the label', () => {
    for (const shape of MARKER_SHAPES) {
      const body = outline(doc(`<svg>${markerSvg(1, 0, 0, shape, 10, 0, 1).svg}</svg>`).querySelector('.legend-plate'));
      const h = body.b - body.t;
      assert.ok(h > 8.5 && h < 11, `${shape}: ${h}`);
    }
    assert.equal(laneHeight(7.5) * DIGIT_OF_HEIGHT, 7.5);
    // With or without its digit, a marker is the same shape element with the same slot: no attribute
    // may tell the stylesheet to paint the two copies of one callout differently.
    const plate = (svg) => /<\w+ class="legend-plate"[^>]*>/.exec(svg)[0].replace(/ (cx|cy|r|x|y|width|height|points)="[^"]*"/g, '');
    assert.equal(plate(markerSvg(1, 0, 0, 'star', 10, 0, 3, false).svg), plate(markerSvg(1, 5, 5, 'star', 14, 0, 3).svg));
  });

  test('every shape is drawn inside the box it reports, centered on its point, knockout around the shape', () => {
    for (const shape of MARKER_SHAPES) {
      for (const digit of [true, false]) {
        const m = markerSvg(1, 50, 40, shape, 6, 0, 1, digit);
        const d = doc(`<svg>${m.svg}</svg>`);
        const knock = outline(d.querySelector('.legend-knockout'));
        const body = outline(d.querySelector('.legend-plate'));
        const at = `${shape}${digit ? '' : ' (bare)'}`;
        assert.ok(Math.abs(knock.r - knock.l - m.width) < 0.05 && Math.abs(knock.b - knock.t - m.height) < 0.05, `${at}: box`);
        assert.ok(Math.abs((knock.l + knock.r) / 2 - 50) < 0.05 && Math.abs((knock.t + knock.b) / 2 - 40) < 0.05, `${at}: centered`);
        assert.ok(body.l > knock.l && body.r < knock.r && body.t > knock.t && body.b < knock.b, `${at}: knockout encloses`);
      }
    }
  });

  test('where a digit would be too small to read, the shape alone marks the mark, and its label keeps the digit', () => {
    const t = { cx: 30, cy: 30, w: 20, h: 20, mark: 0, gutter: 1 };
    const { svg, placed } = laneSvg([{ text: 'A', target: t }], { ...opts, markerHeight: 6, minDigit: 3.75 });
    assert.equal(placed[0].pinned, true);
    assert.equal(placed[0].digit, false);
    const d = doc(`<svg>${svg}</svg>`);
    assert.equal(d.querySelectorAll('.legend-plate[data-shape="circle"]').length, 2, 'on the mark and in the lane');
    assert.equal(d.querySelectorAll('text.legend-number').length, 1, 'the digit only in the lane');
  });

  test('the stylesheet paints every marker in one tone per mode, so a cell\'s marker matches its label\'s', () => {
    // The bug this pins: shapes on the cells took one tier (`mark`) and the lane's markers the other
    // (`fill`), and a theme's two tiers of one slot need not even share a hue (indaco: pale pink and olive).
    const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../../lib/plugins/legend/legend.styles.css'), 'utf8');
    for (let i = 1; i <= 12; i++) {
      const rules = [...css.matchAll(new RegExp(`([^{}]*\\[data-c='c${i}'\\][^{}]*)\\{([^}]*)\\}`, 'g'))].filter((m) => /data-shape/.test(m[1]));
      assert.equal(rules.length, 1, `c${i}: one marker rule`);
      assert.match(rules[0][2], new RegExp(`fill: light-dark\\(var\\(--cat-${i}-mark\\), var\\(--cat-${i}-fill\\)\\)`));
    }
    assert.doesNotMatch(css, /data-bare/);
    // The digit's ink, on the text AND its tspan, and `!important`: Mermaid's stylesheet paints every
    // text and tspan under any `.legend` group `!important` (followups.d/2816-p2-mermaid-legend-rules-leak.md).
    assert.match(css, /text\.legend-text\.legend-number\[data-c\],\s*text\.legend-text\.legend-number\[data-c\] tspan \{\s*fill: light-dark\(var\(--cat-on-mark\), var\(--cat-on-fill\)\) !important;/);
  });

  test('the ring around a mark takes its callout\'s color, over a canvas-color halo', () => {
    const at = (text, cy, mark, more = {}) => ({ text, ...more, target: { cx: 10, cy, w: 10, h: 10, mark } });
    const { svg } = laneSvg([at('A', 20, 0), at('B', 40, 1, { color: 7 })], opts);
    const d = doc(`<svg>${svg}</svg>`);
    const ringSlot = (m) => d.querySelector(`rect.legend-target[data-mark-for="${m}"]`).getAttribute('data-c');
    const markerSlot = (m) => d.querySelector(`.legend-plate[data-mark-for="${m}"]`).getAttribute('data-c');
    assert.equal(ringSlot(0), markerSlot(0));
    assert.equal(ringSlot(1), 'c7');
    assert.equal(d.querySelectorAll('rect.legend-target-halo').length, 2);
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

  test('every marker shape in the lane stays inside the figure and off the grid', () => {
    const six = Array.from({ length: 6 }, (_, i) => `{Onboarding change ${i}, for=${i}}`).join(', ');
    const d = doc(render(`\`@legend{[${six}]}\``));
    const cellRight = Math.max(...[...d.querySelectorAll('rect.heatmap-cell')].map((r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width'))));
    const lane = [...d.querySelectorAll('.legend-knockout')].map(outline).filter((k) => k.l > cellRight);
    assert.equal(lane.length, 6);
    for (const k of lane) assert.ok(k.r <= 320, `${k.r} <= 320`);
  });

  test('a span that does not read stays on the slide as the author wrote it', () => {
    assert.match(render('`@legend{x}`'), /<code>@legend\{x\}<\/code>/);
  });

  test('the marker on a cell grows with the cell, never past the lane\'s own marker', () => {
    const height = (table) => {
      const d = doc(transformSection(md.render(`## R\n\n${table}\n\n\`@legend{{X, for=0}}\``), {}));
      const k = [...d.querySelectorAll('.legend-knockout')].map(outline);
      return Math.min(...k.map((b) => b.b - b.t)); // the cell's marker: the lane's is the larger or equal
    };
    const roomy = height('| | A |\n|---|--:|\n| r | 1 |');
    const dense = height(`| | ${Array.from({ length: 12 }, (_, i) => `C${i}`).join(' | ')} |\n|---|${'--:|'.repeat(12)}\n${Array.from({ length: 7 }, (_, r) => `| R${r} | ${Array.from({ length: 12 }, () => '5').join(' | ')} |`).join('\n')}`);
    assert.ok(roomy > dense, `${roomy} > ${dense}`);
  });

  test('on a dense grid with long values, no marker covers a printed value or a column name', () => {
    const cols = Array.from({ length: 12 }, (_, i) => `January${i}`);
    const rowsMd = Array.from({ length: 6 }, (_, r) => `| Region ${r} | ${cols.map((_, c) => 1000 + r * 40 + c).join(' | ')} |`).join('\n');
    const table = `| | ${cols.join(' | ')} |\n|---|${'--:|'.repeat(12)}\n${rowsMd}`;
    const out = transformSection(md.render(`## R\n\n${table}\n\n\`@legend{[{Corner, row=Region 0, col=January0}, {Next, row=Region 0, col=January1}, {Mid, row=Region 5, col=January5}]}\``), {});
    const d = doc(out);
    const box = outline;
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
      // A badge may reach into the strip between the grid and its names, never onto the names.
      assert.ok(k.t >= gridTop - 3 - 0.01 && k.l >= gridLeft - 5 - 0.01, 'clear of the column and row names');
      for (const v of values) assert.ok(!(k.l < v.r && v.l < k.r && k.t < v.b && v.t < k.b), `marker ${JSON.stringify(k)} covers value ${JSON.stringify(v)}`);
    }
  });

  test('on the densest four-digit grid every callout keeps its shape, and no numeral drops below the floor', () => {
    // engineering/decisions/2026-10-19-universal-legend.md § 18: where the digit has no room, the shape
    // alone marks the cell, so the link is shape and color, never position alone (WCAG 1.4.1).
    const cols = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    const rowsMd = Array.from({ length: 10 }, (_, r) => `| R${r} | ${cols.map((_, c) => 1000 + ((r * 7919 + c * 104729) % 8999)).join(' | ')} |`).join('\n');
    const table = `| | ${cols.join(' | ')} |\n|---|${'--:|'.repeat(9)}\n${rowsMd}`;
    const six = '{A, row=R0, col=Jan}, {B, row=R1, col=Jun}, {C, row=R2, col=Mar}, {D, row=R4, col=Jul}, {E, row=R8, col=Aug}, {F, row=R9, col=Sep}';
    const out = transformSection(md.render(`## R\n\n${table}\n\n\`@legend{[${six}]}\``), {});
    const d = doc(out);
    assert.ok(d.querySelectorAll('text.heatmap-value').length > 80, 'the grid prints its values');
    assert.equal(d.querySelectorAll('rect.legend-target').length, 6, 'every callout rings its cell');
    const shapes = [...d.querySelectorAll('.legend-plate[data-shape]')].map((p) => p.getAttribute('data-shape'));
    for (const shape of MARKER_SHAPES) assert.equal(shapes.filter((x) => x === shape).length, 2, `${shape}: on the cell and in the lane`);
    const sizes = [...d.querySelectorAll('text.legend-number')].map((t) => Number(t.getAttribute('font-size')));
    assert.ok(sizes.every((x) => x >= 7.5 * 0.4), `no numeral below the type floor: ${sizes}`);
  });

  test('past six callouts the rest are not drawn; their words reach the description and the cell', () => {
    const seven = Array.from({ length: 7 }, (_, i) => `{C${i + 1}, for=${i % 6}${i === 6 ? ', detail="Late note"' : ''}}`).join(', ');
    const out = render(`\`@legend{[${seven}]}\``);
    const d = doc(out);
    assert.equal(d.querySelectorAll('text.legend-text--bare').length, 6);
    assert.match(d.querySelector('desc').textContent, /Not drawn: "C7" \(past the 6-callout limit\)\./);
    assert.match(out, /C7: Late note/);
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

test('narration says the six callouts the chart draws, and not a seventh', () => {
  const seven = Array.from({ length: 7 }, (_, i) => `{C${i + 1}, for=${i % 6}}`).join(', ');
  const said = String(narrateDataSeries(`<!-- _class: heatmap -->\n\n## R\n\n${TABLE}\n\n\`@legend{[${seven}]}\``));
  assert.match(said, /Callout at [^:]*: C6\./);
  assert.doesNotMatch(said, /C7/);
});
