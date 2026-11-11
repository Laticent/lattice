/**
 * The chart form kernel (lib/plugins/chart-family/shared/chart-form.js, engineering/decisions/2026-11-10-chart-form.md):
 * the text measure it lays pieces out by, the key tile it wraps names in, the arrangement search that places the
 * tiles around the plot, and the box a phone page hands it (chart-family.dispatch.js `formBoxPx`).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { textWidth, wrapWords, widestWord } = require('../../../lib/plugins/chart-family/shared/text-measure');
const chartForm = require('../../../lib/plugins/chart-family/shared/chart-form');
const { createEngine } = require('../../../lib/engine');

test('the text measure reads each glyph off the face it paints in', () => {
  // Proportional: an `i` is narrower than an `M`, at every weight.
  assert.ok(textWidth('iiii', 10) < textWidth('MMMM', 10) / 2);
  // Heavier is wider, and width scales with the font size.
  assert.ok(textWidth('Revenue', 10, { weight: 700 }) > textWidth('Revenue', 10, { weight: 400 }));
  assert.equal(Number(textWidth('Revenue', 20).toFixed(6)), Number((2 * textWidth('Revenue', 10)).toFixed(6)));
  // Figures are tabular: every digit is one width, so a column of values lines up.
  assert.equal(textWidth('1111', 10), textWidth('8888', 10));
  // Uppercase painting and tracking widen the run.
  assert.ok(textWidth('north', 10, { upper: true }) > textWidth('north', 10));
  assert.equal(Number((textWidth('ab', 10, { tracking: 0.1 }) - textWidth('ab', 10)).toFixed(6)), 2);
  // A glyph the table does not hold bills wide, never narrow: a CJK ideograph takes its full em.
  assert.equal(textWidth('東', 10), 10);
  assert.equal(textWidth('', 10), 0);
});

test('a name wraps at spaces and is never broken mid-word', () => {
  const name = 'Enterprise accounts receivable';
  const w = textWidth('Enterprise accounts', 10) + 1;
  const r = wrapWords(name, w, 10);
  assert.deepEqual(r.lines, ['Enterprise accounts', 'receivable']);
  assert.equal(r.fits, true);
  assert.ok(r.widest <= w);
  // A word wider than the line sits alone on it, whole, and the result says it does not fit.
  const narrow = wrapWords(name, widestWord(name, 10) - 1, 10);
  assert.equal(narrow.fits, false);
  assert.ok(narrow.lines.includes('receivable'));
  assert.equal(narrow.lines.join(' '), name);
});

const rows = ['North America', 'Europe, Middle East and Africa', 'Asia Pacific', 'Latin America'].map((label, i) => ({ label, i }));

test('a key tile holds every name whole, under or beside the plot', () => {
  const tile = chartForm.keyTile({ rows, fs: 11, markerW: 14, markerH: 6 });
  const forms = [tile.under(300), tile.beside(400, 160)];
  assert.ok(forms.every(Boolean), 'the key has a form under and a form beside');
  for (const t of forms) {
    assert.equal(t.placed.length, rows.length);
    for (const p of t.placed) assert.equal(p.lines.join(' '), rows[p.i].label, 'every name prints whole, in order');
  }
});

test('the arrangement keeps every tile whole and gives the plot what is left', () => {
  const box = { w: 320, h: 480 };
  const at = chartForm.arrange({
    box, gap: 11, plot: { minW: 150, minH: 140 },
    tiles: [{ id: 'key', ...chartForm.swatchKeyTile(rows, 11, { flow: true }) }],
  });
  assert.ok(at, 'a tall box holds the plot and its key');
  const key = at.cells.key;
  assert.ok(at.w <= box.w + 0.5 && at.h <= box.h + 0.5, 'the layout stays inside the box');
  assert.ok(at.plot.w >= 150 && at.plot.h >= 140);
  // The key and the plot do not overlap.
  const apart = key.y >= at.plot.y + at.plot.h || key.y + key.h <= at.plot.y || key.x >= at.plot.x + at.plot.w || key.x + key.w <= at.plot.x;
  assert.ok(apart, JSON.stringify({ key, plot: at.plot }));
  // No box holds a plot larger than the box itself: a too-small box returns null and the kind takes its next form.
  assert.equal(chartForm.arrange({ box: { w: 120, h: 100 }, gap: 11, plot: { minW: 150, minH: 140 }, tiles: [] }), null);
});

const towerDeck = (meta) => `---\ntheme: indaco\nsize: mobile\n${meta ? `meta: "${meta}"\n` : ''}---\n\n<!-- _class: tower -->\n\n` +
  '`Property catastrophe program · 2027`\n\n## Acme Re\'s line runs through every layer.\n\n' +
  '- Layer 2 `$70M xs $90M`\n  - Acme Re `40%`\n  - Vantage Re `60%`\n- Layer 1 `$40M xs $50M`\n  - Acme Re `100%`\n- Retention `$50M`\n';
const viewH = (html) => Number(/class="tower-svg"[^>]*viewBox="0 0 [\d.]+ ([\d.]+)"|viewBox="0 0 [\d.]+ ([\d.]+)"[^>]*class="tower-svg"/.exec(html)?.slice(1).find(Boolean));

test('on a phone page the kernel draws the chart, and a meta line under the title takes its height off the box', () => {
  const plain = createEngine().render(towerDeck(null)).html;
  const meta = createEngine().render(towerDeck('Board pack | Confidential')).html;
  assert.match(plain, /data-chart-form="fit"/);
  assert.doesNotMatch(plain, /data-meta-lines/);
  assert.match(meta, /<section data-meta-lines="2"/);
  // Two 48px lines on a page that prints one unit at 972/320 px: 32 units shorter, so the text keeps its size.
  assert.equal(Math.round(viewH(plain) - viewH(meta)), Math.round((2 * 48) / (972 / 320)));
});

test('a hero pie on a phone page draws on a canvas as narrow as its body, at the same scale', () => {
  const deck = '---\ntheme: indaco\nsize: mobile\n---\n\n<!-- _class: piechart donut claim-hero -->\n\n## Revenue\n\n' +
    '- Subscriptions `48%`\n- Services `27%`\n- Licensing `15%`\n- Other `10%`\n';
  const html = createEngine().render(deck).html;
  const vb = /class="piechart-svg"[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"|viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*class="piechart-svg"/.exec(html);
  const w = Number(vb[1] ?? vb[3]);
  // The hero body is 833px wide, not 972: 320 units at 972/320 px each would print the key at 86% of its role.
  assert.equal(Math.round(w), Math.round((320 * 833) / 972));
  // Every key entry's value ends inside the canvas (a running key centered on its names alone overran it).
  const key = /<g transform="translate\(([\d.]+) [\d.]+\)"><g style="--chart-fs-key/.exec(html);
  const ends = [...html.matchAll(/class="chart-key-value"[^>]*x="([\d.]+)"/g)].map((m) => Number(key[1]) + Number(m[1]));
  assert.ok(ends.length === 4 && ends.every((x) => x <= w + 0.5), JSON.stringify({ w, ends }));
});
