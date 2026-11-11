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

test('a radar on a phone page draws its labels at their role and thins its ring figures to what fits', () => {
  const radar = (size) => `---\ntheme: indaco\nsize: ${size}\n---\n\n<!-- _class: radar -->\n\n## Meridian leads.\n\n` +
    '- Meridian\n  - Performance `9`\n  - Pricing `6`\n  - Support `8`\n  - Ecosystem `5`\n  - Security `9`\n' +
    '- Vantage\n  - Performance `7`\n  - Pricing `8`\n  - Support `5`\n  - Ecosystem `8`\n  - Security `6`\n';
  for (const size of ['mobile', 'square']) {
    const html = createEngine().render(radar(size)).html;
    assert.match(html, /data-chart-form="fit" class="radar-svg/, `${size}: the kernel placed it`);
    // The diagram group is scaled by k and sets its role sizes at 1/k, so they print at the role.
    const g = /<g transform="translate\([\d.]+ [\d.]+\) scale\(([\d.]+)\)" style="--chart-fs-category:([\d.]+)px;--chart-fs-tick:([\d.]+)px/.exec(html);
    assert.ok(g, `${size}: the scaled diagram group`);
    const svgFs = Number(/--chart-fs-category:([\d.]+)px/.exec(/<svg data-chart-roles[^>]*class="radar-svg[^>]*>|<svg [^>]*data-chart-roles[^>]*>/.exec(html)[0])[1]);
    assert.ok(Math.abs(Number(g[1]) * Number(g[2]) - svgFs) < 0.05, `${size}: ${g[1]} x ${g[2]} prints at ${svgFs}`);
    // Every ring figure printed sits at least 1.6 figure-heights from the next (they thin to every other ring, or one).
    const ticks = (html.match(/class="radar-tick"/g) || []).length;
    assert.ok(ticks >= 1 && ticks <= 4, `${size}: ${ticks} ring figures`);
  }
});

test('a map on a phone page scales its basemap into the cell and prints its key at the key role', () => {
  const deck = `---\ntheme: indaco\nsize: square\n---\n\n<!-- _class: map world -->\n\n## Where the program runs.\n\n` +
    '- India `48.2`\n- Nigeria `36.4`\n- Kenya `31.0`\n- Brazil `27.5`\n- Indonesia `19.3`\n';
  const html = createEngine().render(deck).html;
  assert.match(html, /data-chart-form="fit" class="map-svg"/);
  // The regions draw in a scaled group; the key draws at the size the kernel laid it out at.
  assert.match(html, /<g transform="translate\(-?[\d.]+ -?[\d.]+\) scale\([\d.]+\)">/);
  const key = Number(/--chart-fs-key:([\d.]+)px/.exec(html)[1]);
  const keyG = Number(/<g style="--chart-fs-key:([\d.]+)px">/.exec(html)[1]);
  assert.ok(keyG >= key * (11 / 13) - 0.01 && keyG <= key + 0.01, `key at ${keyG}, role ${key}`);
});

test('arrangeKeyed steps the key toward the floor, then lays an over-capacity chart out on a larger box', () => {
  const { withRoles } = require('../../../lib/plugins/chart-family/shared/chart-roles');
  const keyRows = ['North America', 'Europe', 'Asia Pacific'].map((label) => ({ label }));
  const run = (box) => withRoles(972, 972 / 320, () => chartForm.withForm(box, () => chartForm.arrangeKeyed({ rows: keyRows, plot: { minW: 150, minH: 140 } })));
  const roomy = run({ w: 320, h: 600 });
  assert.equal(roomy.over, false);
  assert.match(roomy.keySvg(), /--chart-fs-key:/);
  // A box shorter than the plot's 140-unit floor fits nothing at 11pt: the drawing is laid out taller and marked over capacity.
  const tight = run({ w: 320, h: 100 });
  assert.equal(tight.over, true);
  assert.ok(tight.layout.h > 100);
});

test('a key heading takes a line of its own across the key, and the entries lay out under it', () => {
  const headed = [{ head: true, label: 'Managed operations' }, ...rows];
  const tile = chartForm.swatchKeyTile(headed, 11, { flow: true, headFs: 13 });
  for (const t of [tile.under(300), tile.beside(400, 160)]) {
    assert.ok(t, 'the headed key has a form');
    const [head, ...entries] = t.placed;
    assert.equal(head.head, true);
    assert.equal(head.y, 0);
    assert.ok(entries.every((r) => r.y >= head.h), 'every entry starts under the heading');
    assert.equal(entries.length, rows.length);
  }
});

test('a stacked bar on a phone page keeps its names whole and its drawing the canvas width', () => {
  const deck = (cls, body) => `---\ntheme: indaco\nsize: mobile\n---\n\n<!-- _class: ${cls} -->\n\n## Mix.\n\n${body}`;
  const rowsBody = '- Professional services\n  - Delivery `4.2`\n  - Training `1.6`\n- Platform subscriptions\n  - Delivery `11.8`\n  - Training `2.1`\n';
  const row = createEngine().render(deck('stacked-bar row', rowsBody)).html;
  assert.match(row, /data-chart-form="fit" class="cart-svg stacked-bar-svg"/);
  // The name column wraps at spaces: no category name is split mid-word.
  assert.doesNotMatch(row, />Professio</);
  assert.match(row, /class="chart-key-head"/, 'the key names the bar its values read');
  // Totals too wide for their bars beside a direct-name column: the names reflow to a key, and every total prints whole.
  const wide = createEngine().render(deck('stacked-bar', '- 2024\n  - Property `USD 250mn`\n  - Casualty `USD 180mn`\n- 2025\n  - Property `USD 310mn`\n  - Casualty `USD 190mn`\n')).html;
  const vbW = Number(/class="cart-svg stacked-bar-svg" viewBox="0 0 ([\d.]+)/.exec(wide)[1]);
  assert.ok(vbW <= 320.5, `viewBox ${vbW} wide`);
  assert.doesNotMatch(wide, /sbar-total[^>]*>(?:<[^>]+>)*[^<]*…/);
});

test('at a venue the box comes off every block the venue enlarges, so the chart keeps its role sizes', () => {
  const deck = (venue) => `---\ntheme: indaco\nsize: mobile\n${venue ? `venue: ${venue}\n` : ''}---\n\n<!-- _class: bar -->\n\n` +
    '`Hall · labels at the back row`\n\n## Growth is concentrated in two regions.\n\n- North America `$4.2M`\n- EMEA `$3.1M`\n- APAC `$1.8M`\n';
  const h = (venue) => {
    const html = createEngine().render(deck(venue)).html;
    return Number(/class="cart-svg bar-svg" viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(html)[1]);
  };
  // `hall` sets the title, eyebrow and page number 1.5 times larger: the canvas is shorter by more than two of the
  // title's extra lines (92px each, about 30 units at 972/320 px a unit), and a laptop deck's canvas is unchanged.
  assert.ok(h('hall') < h(null) - 60, `hall ${h('hall')} vs laptop ${h(null)}`);
  assert.equal(h('laptop'), h(null));
});

test('a heatmap on a phone page sets its band key as a tile and draws a grid too dense for 11pt whole, over capacity', () => {
  const months = Array.from({ length: 12 }, (_, i) => `M${i}`);
  const row = (name, n) => `| ${name} | ${months.map((_, i) => (i < n ? String(100 - i * 4) : '')).join(' | ')} |`;
  const table = [`| Cohort | ${months.join(' | ')} |`, `|---|${months.map(() => '---').join('|')}|`,
    row('January 2026 acquisition cohort', 12), row('February 2026', 11), row('March 2026', 10)].join('\n');
  const deck = (cls) => `---\ntheme: indaco\nsize: square\n---\n\n<!-- _class: ${cls} -->\n\n## Retention.\n\n${table}\n`;
  const dense = createEngine().render(deck('heatmap')).html;
  assert.match(dense, /data-chart-form="over" class="cart-svg heatmap-svg"/);
  // Every row name, column name and cell value prints whole.
  assert.doesNotMatch(dense, /…<\/tspan>/);
  assert.match(dense, />M11</);
  const small = '| Cohort | M0 | M1 | M2 |\n|---|---|---|---|\n| Jan | 100 | 62 | 48 |\n| Feb | 100 | 58 | 44 |\n';
  const keyed = createEngine().render(`---\ntheme: indaco\nsize: mobile\n---\n\n<!-- _class: heatmap scale -->\n\n## Retention.\n\n${small}`).html;
  assert.match(keyed, /data-chart-form="fit" class="cart-svg heatmap-svg"/);
  assert.match(keyed, /--chart-fs-key:/, 'the band key is a kernel tile at the key role');
});

test('a histogram on a phone page prints every value, over capacity when its bands are too narrow for 12pt', () => {
  const vals = [31, 22, 15, 10, 7, 5, 4, 2.5, 1.5, 1, 0.6, 0.4];
  const tick = '`';
  const list = vals.map((v, i) => `- ${tick}${i * 10}..${(i + 1) * 10}${tick} ${tick}${v}%${tick}`).join('\n');
  const html = createEngine().render(`---\ntheme: indaco\nsize: square\n---\n\n<!-- _class: histogram -->\n\n## A long tail.\n\n${list}\n`).html;
  assert.match(html, /data-chart-form="over" class="histogram-svg"/);
  // Every band's value prints (none is left to the hover card).
  for (const v of vals) assert.ok(html.includes(`>${v}%</tspan>`), `${v}% prints`);
  const four = createEngine().render(`---\ntheme: indaco\nsize: mobile\n---\n\n<!-- _class: histogram -->\n\n## Most years stay small.\n\n- ${tick}1..10${tick} ${tick}55%${tick}\n- ${tick}10..50${tick} ${tick}30%${tick}\n- ${tick}50..100${tick} ${tick}12%${tick}\n`).html;
  assert.match(four, /data-chart-form="fit" class="histogram-svg"/);
});

test('a waterfall on a phone page prints every step name whole, never cut to a stub', () => {
  const tick = '`';
  const steps = [['Opening cash', '120'], ['Operating inflow', '+48'], ['Working capital', '-17'], ['Capital spend', '-22'], ['Dividends', '-9'], ['Closing cash', '120']];
  const list = steps.map(([n, v]) => `- ${n} ${tick}${v}${tick}`).join('\n');
  for (const size of ['mobile', 'square']) {
    const html = createEngine().render(`---\ntheme: indaco\nsize: ${size}\n---\n\n<!-- _class: waterfall -->\n\n## Cash held.\n\n${list}\n`).html;
    assert.match(html, /data-chart-form="(fit|over)" class="cart-svg waterfall-svg/, size);
    assert.doesNotMatch(html, /…<\/tspan>/, `${size}: no name is cut`);
    for (const [n] of steps) for (const w of n.split(' ')) assert.ok(html.includes(w), `${size}: ${w}`);
  }
});

test('a long title on a tall phone page comes off the chart box line by line', () => {
  const deck = (title) => `---\ntheme: indaco\nsize: mobile\n---\n\n<!-- _class: bar -->\n\n## ${title}\n\n- North `+'`4`'+`\n- South `+'`3`'+`\n`;
  const h = (title) => Number(/class="cart-svg bar-svg" viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(createEngine().render(deck(title)).html)[1]);
  // A title on the two lines the base holds, then one on four (68 characters, measured): two 92px lines shorter, about
  // 30 units each at 972/320 px a unit.
  const two = h('Cloud overtook licenses in Q3.');
  const four = h('Two hurricanes added $210M of claims; reinsurance took back $140M.');
  assert.ok(Math.abs(two - four - (2 * 92) / (972 / 320)) < 1, `${two} vs ${four}`);
});

test('a crowded quadrant on a short phone box numbers its dots over capacity rather than dropping names', () => {
  const T = String.fromCharCode(96);
  const pt = (x, y) => `${T}{${x}, ${y}}${T}`;
  const lead = 'Five names in one corner, and their dots far enough apart to check the reading. An out-of-order position is still a clear one, so its cost rides the anchor preference and never the collision test.';
  const deck = `---\ntheme: indaco\nsize: portrait\n---\n\n<!-- _class: quadrant -->\n\n${T}[{Effort, 0..10}, {Reach, 0..100}]${T}\n\n## Order is worth an anchor. It is never worth a name.\n\n${lead}\n\n` +
    `- Strategic Bets\n  - Fraud-signal rewrite ${pt(3, 70)}\n- Quick Wins\n  - Weekly signal digest ${pt(8.4, 90)}\n  - Slack intake bot ${pt(7.6, 84)}\n` +
    `  - Decision-log API ${pt(8.2, 78)}\n  - Scoring model v2 ${pt(7.4, 72)}\n  - Partner API keys ${pt(8.6, 66)}\n- Defer\n  - Quarterly vendor review ${pt(2, 24)}\n- Time Sinks\n  - Bespoke board export ${pt(9, 22)}\n`;
  const html = createEngine().render(deck).html;
  assert.match(html, /data-chart-form="(fit|over)" class="quadrant-svg/);
  assert.doesNotMatch(html, /data-label-drops=/, 'every name prints');
});

test('a cohort quadrant beside its key names every cohort on the plane, or none', () => {
  const T = String.fromCharCode(96);
  const pt = (x, y) => `${T}{${x}, ${y}}${T}`;
  const deck = `---\ntheme: indaco\nsize: square\n---\n\n<!-- _class: quadrant cohort -->\n\n${T}[{Effort, 0..10}, {Reach, 0..100}]${T}\n\n## Where to put the next dollar — clustered by theme.\n\n` +
    `- Strategic Bets\n  - Scoring model v2 ${pt(3, 70)}\n  - Per-team calibration ${pt(5, 85)}\n- Quick Wins\n  - Weekly signal brief ${pt(8, 80)}\n  - Snapshot exports ${pt(9, 55)}\n` +
    `- Defer\n  - Vendor scoping ${pt(2, 30)}\n  - Manual recalibration ${pt(1, 22)}\n- Time Sinks\n  - Custom audit log UI ${pt(7, 18)}\n  - Bespoke board export ${pt(9, 28)}\n`;
  const html = createEngine().render(deck).html;
  assert.doesNotMatch(html, /data-label-drops=/, 'no cohort name is reported lost');
  const onPlane = (html.match(/class="quadrant-cohort-label"/g) || []).length;
  assert.ok(onPlane === 0 || onPlane === 4, `${onPlane} of 4 cohorts named on the plane`);
  assert.equal((html.match(/class="chart-key-label"/g) || []).length, 4, 'the key names all four');
});

test('a numbered bubble quadrant keeps every bubble on its plane and colors each key marker by its group', () => {
  const T = String.fromCharCode(96);
  const pt = (x, y, s) => `${T}{${x}, ${y}, size=${s}}${T}`;
  const deck = `---\ntheme: indaco\nsize: square\n---\n\n<!-- _class: quadrant bubble -->\n\n${T}[{Effort, 0..10}, {Reach, 0..100}]${T}\n\n## bubble sizes each point by a third value.\n\n` +
    `- Strategic Bets\n  - Scoring model v2 ${pt(3, 70, 2.4)}\n  - Per-team calibration ${pt(5, 85, 4.1)}\n- Quick Wins\n  - Weekly signal brief ${pt(8, 80, 0.9)}\n  - Snapshot exports ${pt(9, 55, 0.6)}\n` +
    `- Defer\n  - Vendor scoping ${pt(2, 30, 0.4)}\n- Time Sinks\n  - Custom audit log UI ${pt(7, 18, 1.3)}\n`;
  const html = createEngine().render(deck).html;
  assert.doesNotMatch(html, /data-label-drops=/, 'every name prints');
  assert.match(html, /quadrant-dot-num/, 'the dots are numbered (the names cannot sit on them at square)');
  const [, x0, y0, w, h] = html.match(/<rect class="quadrant-bounds" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/).map(Number);
  assert.ok(h >= w * 0.45 - 0.5, `the plane is ${h.toFixed(0)} tall and ${w.toFixed(0)} wide`);
  // A big bubble near an edge may reach past the plane (its center is the data); the quadrant names above and below
  // stand clear of the furthest one.
  const nameYs = [...html.matchAll(/<text class="quadrant-label"[^>]*>(.*?)<\/text>/g)]
    .flatMap(([, body]) => [...body.matchAll(/\sy="([\d.]+)"/g)].map(([, y]) => +y));
  const above = Math.max(...nameYs.filter((y) => y < y0));
  const below = Math.min(...nameYs.filter((y) => y > y0 + h));
  assert.ok(Number.isFinite(above) && Number.isFinite(below), 'quadrant names sit above and below the plane');
  for (const [, cx, cy, r] of html.matchAll(/class="quadrant-bubble"[^>]*cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
    assert.ok(+cy - +r > above && +cy + +r < below, `a bubble at y ${cy} (r ${r}) clears the names at ${above} and ${below}`);
    assert.ok(+cx - +r >= x0 - 0.5 && +cx + +r <= x0 + w + 0.5, `a bubble at x ${cx} (r ${r}) stays inside the plane`);
  }
  // Each key marker takes its item's group color: the bubbles carry the truth, by mark.
  const bubbleCell = new Map([...html.matchAll(/class="quadrant-bubble" data-cell="(\d)"[^>]*data-mark="(\d+)"/g)].map(([, c, m]) => [m, c]));
  const keyed = [...html.matchAll(/class="quadrant-dot" data-cell="(\d)"[^>]*data-mark-for="(\d+)"/g)];
  assert.equal(keyed.length, 6, 'the key lists all six');
  for (const [, c, m] of keyed) assert.equal(c, bubbleCell.get(m), `key marker ${m} takes its group's color`);
  assert.ok(new Set(keyed.map(([, c]) => c)).size === 4, 'four groups, four colors');
});
