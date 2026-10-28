/**
 * Integration: a focused table column in the editable office export (docs/src/lib/calco/reader.ts, the
 * `underPicture` test before GROUPS). The column's tint and ring are inset box-shadows, so they become ONE
 * picture that spans every row and joins no row's group. A cell's text paints over its own cell, so it must
 * come out above that picture, not inside its row's group, which is drawn before the picture.
 * Seen on examples/focus.md slide 4 (ring) and examples/focus-highlight-axes.md slide 3 (highlight).
 * Also: a highlighted card's inset outline (`outline-offset: -W`) is a native inside stroke, so the card is not a
 * picture (examples/focus-highlight-axes.md slide 8).
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { drawOrder, readSlide, restoreSlide } = require('@laticent/calco');

const TABLE = `<!doctype html><html><head><style>
body{margin:0;font-family:sans-serif}
section{width:1280px;height:720px;position:relative;background:#fff;color:#123;isolation:isolate}
table{position:absolute;left:64px;top:200px;width:1100px;border-collapse:collapse;font-size:20px}
tr{background:#f2f5fa;border-bottom:1px solid #889}
th,td{padding:8px 16px;text-align:left}
.f{background:#e8f0fa;box-shadow:inset 3px 0 0 #069,inset -3px 0 0 #069}
thead .f{box-shadow:inset 3px 0 0 #069,inset -3px 0 0 #069,inset 0 3px 0 #069}
tbody tr:last-child .f{box-shadow:inset 3px 0 0 #069,inset -3px 0 0 #069,inset 0 -3px 0 #069}
</style></head><body><section id="s" data-lattice-slide="1"><table>
<thead><tr><th>Criterion</th><th>Chorus</th><th class="f">Sprig</th></tr></thead>
<tbody><tr><td>Speed</td><td>Slow</td><td class="f">Fast</td></tr>
<tr><td>Setup</td><td>1 day</td><td class="f">Same day</td></tr></tbody>
</table></section></body></html>`;

// The same table with a box (z-index) over the focused "Fast" cell, painted after the column picture: the cell's text
// is lifted above the picture, and the box must still be above the text.
const TABLE_OVERLAY = TABLE.replace('</table></section>', '</table><div class="cover"></div></section>').replace(
  '</style>',
  '.cover{position:absolute;left:880px;top:236px;width:160px;height:40px;background:#c00;z-index:3}</style>',
);

// The other side: a picture drawn BEFORE the card (a gradient panel behind it) is already under the card's text,
// so the text stays in its card, and so stays under a box that covers it in the browser.
const PANEL = `<!doctype html><html><head><style>
body{margin:0;font-family:sans-serif}
section{width:1280px;height:720px;position:relative;background:#fff;color:#123;isolation:isolate}
.panel{position:absolute;left:40px;top:40px;width:800px;height:500px;background:radial-gradient(circle,#fde,#cdf);padding:40px}
.card{background:#eef;border:2px solid #446;padding:20px;width:400px;font-size:40px}
.card p{margin:0}
.cover{position:absolute;left:330px;top:90px;width:300px;height:120px;background:#c00;z-index:3}
</style></head><body><section id="s" data-lattice-slide="1">
<div class="panel"><div class="card"><p>Card text here long</p><p>Second para</p></div></div><div class="cover"></div>
</section></body></html>`;

// A highlighted card (`_focusStyle: highlight` on an item): its edge is an outline pulled in by its own width over
// a 1px border, as base.focus.css draws it. Chromium rounds the width to 2px and keeps the -2.3px offset.
const CARD = `<!doctype html><html><head><style>
body{margin:0;font-family:sans-serif}
section{width:1280px;height:720px;position:relative;background:#fff;color:#123;isolation:isolate}
ul{position:absolute;left:64px;top:200px;width:600px;list-style:none;padding:0;display:grid;gap:20px}
li{background:#f2f5fa;border:1px solid #898e95;border-radius:10px;padding:20px;font-size:20px}
li.f{background:#d8e6f1;outline:2.3125px solid #006fa8;outline-offset:-2.3125px}
li p{margin:0}
</style></head><body><section id="s" data-lattice-slide="1">
<ul><li class="f"><p>Signal Intake</p></li><li><p>Scoring Model</p></li></ul>
</section></body></html>`;

describe('calco: a focused column keeps its text above its picture', () => {
  let browser;
  let tab;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    tab = await browser.newPage();
    await tab.setViewport({ width: 1280, height: 720 });
  });
  after(async () => {
    await browser?.close();
  });

  test('every focused cell draws after the column picture, and the other cells stay in their rows', async () => {
    await tab.setContent(TABLE, { waitUntil: 'load' });
    const h = await tab.$('#s');
    const slide = await h.evaluate(readSlide, { hide: true, shapes: true, sprites: true });
    await h.evaluate(restoreSlide);
    const text = (f) => f.lines.flat().map((r) => r.text).join('');
    const pics = slide.shapes.map((s, i) => [s, i]).filter(([s]) => s.kind === 'picture');
    assert.equal(pics.length, 1, 'the column is one picture');
    const [pic, picIndex] = pics[0];
    assert.equal(pic.group, undefined, 'the picture spans the rows, so no row holds it');
    // Where each thing lands in the drawn order.
    const order = drawOrder(slide, () => false).flatMap((o) => o.items);
    const at = (pred) => order.findIndex(pred);
    const picAt = at((d) => 'shape' in d && d.index === picIndex);
    for (const word of ['Sprig', 'Fast', 'Same day']) {
      const fi = slide.frames.findIndex((f) => text(f).toLowerCase() === word.toLowerCase());
      assert.ok(fi >= 0, `"${word}" is read as text`);
      assert.ok(at((d) => 'frame' in d && d.index === fi) > picAt, `"${word}" is drawn over the column picture`);
    }
    // A cell outside the column keeps its row's group.
    const chorus = slide.frames.find((f) => text(f).toLowerCase() === 'chorus');
    assert.notEqual(chorus.group, undefined, 'an unfocused header cell still moves with its row');
  });

  test('a lifted cell is drawn right after its picture, so a box painted later stays above it', async () => {
    await tab.setContent(TABLE_OVERLAY, { waitUntil: 'load' });
    const h = await tab.$('#s');
    const slide = await h.evaluate(readSlide, { hide: true, shapes: true, sprites: true });
    await h.evaluate(restoreSlide);
    const text = (f) => f.lines.flat().map((r) => r.text).join('');
    const picIndex = slide.shapes.findIndex((s) => s.kind === 'picture');
    const fi = slide.frames.findIndex((f) => text(f).toLowerCase() === 'fast');
    assert.equal(slide.frames[fi].above, picIndex, 'the lifted cell names the picture it clears');
    const order = drawOrder(slide, () => false).flatMap((o) => o.items);
    const picAt = order.findIndex((d) => 'shape' in d && d.index === picIndex);
    const textAt = order.findIndex((d) => 'frame' in d && d.index === fi);
    const coverAt = order.findIndex((d) => 'shape' in d && d.shape.kind === 'box' && d.shape.fill?.color === '#cc0000');
    assert.ok(coverAt >= 0, 'the covering box is a shape');
    assert.ok(picAt < textAt && textAt < coverAt, `picture (${picAt}) < text (${textAt}) < overlay (${coverAt})`);
  });

  test('a card inside a gradient panel keeps its text, under the box that covers it', async () => {
    await tab.setContent(PANEL, { waitUntil: 'load' });
    const h = await tab.$('#s');
    const slide = await h.evaluate(readSlide, { hide: true, shapes: true, sprites: true });
    await h.evaluate(restoreSlide);
    const text = (f) => f.lines.flat().map((r) => r.text).join('');
    const fi = slide.frames.findIndex((f) => text(f).startsWith('Card text'));
    assert.ok(fi >= 0, 'the card text is read');
    assert.notEqual(slide.frames[fi].group, undefined, 'the text still moves with its card');
    const order = drawOrder(slide, () => false).flatMap((o) => o.items);
    const textAt = order.findIndex((d) => 'frame' in d && d.index === fi);
    const coverAt = order.findIndex((d) => 'shape' in d && d.shape.kind === 'box' && d.shape.fill?.color === '#cc0000');
    assert.ok(coverAt >= 0, 'the covering box is a shape');
    assert.ok(textAt < coverAt, 'the text is drawn under the box that covers it');
  });

  test('a highlighted card is a native box with an inside stroke, and keeps its text', async () => {
    await tab.setContent(CARD, { waitUntil: 'load' });
    const h = await tab.$('#s');
    const slide = await h.evaluate(readSlide, { hide: true, shapes: true, sprites: true });
    await h.evaluate(restoreSlide);
    assert.equal(slide.shapes.filter((s) => s.kind === 'picture').length, 0, 'no card is a picture');
    const card = slide.shapes.find((s) => s.kind === 'box' && s.fill?.color === '#d8e6f1');
    assert.ok(card, 'the focused card is a box');
    assert.equal(card.stroke?.color, '#006fa8', 'its edge is the outline color, not the gray border');
    assert.ok(card.stroke.width > 2 && card.stroke.width < 2.5, `the stroke is the outline band (${card.stroke?.width})`);
    const text = (f) => f.lines.flat().map((r) => r.text).join('');
    const fi = slide.frames.findIndex((f) => text(f) === 'Signal Intake');
    const labelled = card.text === fi;
    assert.ok(labelled || slide.frames[fi].group === slide.shapes.indexOf(card), 'the card carries or groups its text');
  });
});
