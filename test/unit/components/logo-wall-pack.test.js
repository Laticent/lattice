// logo-wall's equal-weight sizing (lib/core/logo-wall-pack.js): the plan,
// the CLI's string stamp, and the constants it shares with logo-wall.styles.css.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planWall, stampWall, aspectOfMarkHtml, stageShare, EYEBROW, CAPTION_SHORT_SIDE, LOGO_BAND, LOGO_GAP, LOGO_ROW_GAP, LOGO_COLS, MIN_AREA_SHARE } = require('../../../lib/core/logo-wall-pack');

const CSS = fs.readFileSync(path.join(__dirname, '../../../lib/components/inventory/logo-wall/logo-wall.styles.css'), 'utf8');
const areas = (plan) => plan.result.rects.map((r) => r.w * r.h);
const spread = (xs) => Math.max(...xs) / Math.min(...xs);

test('the band and column counts are the ones the stylesheet uses', () => {
  const block = (sel) => {
    const at = CSS.indexOf(`${sel} {`);
    assert.ok(at !== -1, sel);
    return CSS.slice(at, CSS.indexOf('}', at));
  };
  const base = block('section.logo-wall > .cell-stage');
  const dense = block('section.logo-wall.dense > .cell-stage');
  assert.equal(Number(/--logo-cell-h:\s*([\d.]+)cqi/.exec(base)[1]) / 100, LOGO_BAND.default);
  assert.equal(Number(/--logo-cell-h:\s*([\d.]+)cqi/.exec(dense)[1]) / 100, LOGO_BAND.dense);
  assert.equal(Number(/--logo-cols:\s*(\d+)/.exec(base)[1]), LOGO_COLS.default);
  assert.equal(Number(/--logo-cols:\s*(\d+)/.exec(dense)[1]), LOGO_COLS.dense);
  // The gaps are the 16:9 values of the tokens: --sp-2xl (5 section-cqi) and --sp-xl (3.75) over a
  // list 90 section-cqi wide.
  assert.match(base, /--logo-gap:\s*var\(--sp-2xl\)/);
  assert.match(dense, /--logo-gap:\s*var\(--sp-xl\)/);
  assert.ok(Math.abs(LOGO_GAP.default - 5 / 90) < 1e-4);
  assert.ok(Math.abs(LOGO_GAP.dense - 3.75 / 90) < 1e-4);

});

test('4:1, 1:1 and 1:2 marks get equal area, default and dense', () => {
  for (const dense of [false, true]) {
    const plan = planWall([4, 1, 0.5], { dense });
    assert.equal(plan.mode, 'packed');
    assert.ok(spread(areas(plan)) < 1 + 1e-9, `dense=${dense}: ${areas(plan)}`);
  }
});

test('a wall of one shape keeps its old size: 3:1 wordmarks still fill their cells', () => {
  const plan = planWall([3, 3, 3, 3], {});
  const cell = (1 - 3 * LOGO_GAP.default) / 4;
  for (const r of plan.result.rects) assert.ok(Math.abs(r.w - cell) < 1e-6, `${r.w} vs ${cell}`);
});

test('never more rows or more per row than the old wall, and never taller than the stage', () => {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(rnd() * 18);
    const aspects = Array.from({ length: n }, () => 0.25 + rnd() * 5.75);
    const dense = k % 2 === 1;
    const family = k % 5 === 0 ? 'tall' : undefined;
    const captions = k % 3 === 0;
    const plan = planWall(aspects, { dense, family, captions });
    const cols = family ? (dense ? 3 : 2) : dense ? 6 : 4;
    const band = dense ? LOGO_BAND.dense : LOGO_BAND.default;
    const gap = family ? LOGO_GAP.reflow : dense ? LOGO_GAP.dense : LOGO_GAP.default;
    const rowGap = family ? LOGO_ROW_GAP.reflow : dense ? LOGO_ROW_GAP.dense : LOGO_ROW_GAP.default;
    const rows = Math.ceil(n / cols);
    const stage = (stageShare(16 / 9) - EYEBROW) / 0.9 / (16 / 9) - (captions ? rows * (CAPTION_SHORT_SIDE * (9 / 16)) / 0.9 : 0);
    // With no room left once the row gaps (and captions) are paid for, the wall keeps the old grid.
    if ((rows - 1) * rowGap >= stage) {
      assert.equal(plan.mode, 'fallback', `case ${k}`);
      continue;
    }
    // A wall that would pack below the legibility floor keeps the old grid too.
    if (plan.mode === 'fallback') continue;
    assert.ok(plan.result.area >= MIN_AREA_SHARE * band * band - 1e-12, `case ${k}: floor`);
    assert.ok(plan.result.rows.length <= rows, `case ${k}: rows`);
    assert.ok(plan.result.rows.every((r) => r.length <= cols), `case ${k}: per row`);
    assert.ok(1 / plan.result.aspect <= stage + 1e-9, `case ${k}: height`);
    // A captioned wall never draws a mark taller than the band, as before.
    if (captions) assert.ok(plan.result.rects.every((r) => r.h <= band + 1e-9), `case ${k}: caption cap`);
    // Every row fills the line exactly, less the slack, so the browser breaks where the plan does.
    assert.equal(Number(/--logo-gx:([\d.]+)/.exec(plan.listStyle)[1]), Math.floor(gap * 1e5) / 1e5, `case ${k}: column gap`);
    // The STAMPED values of each row (cells, paddings, gaps) never sum past the width.
    for (const row of plan.result.rows) {
      const v = (i, name) => Number((new RegExp(`${name}:([\\d.]+)`).exec(plan.itemStyles[i]) || [0, 0])[1]);
      const used = row.reduce((s, i) => s + v(i, '--logo-cell') + v(i, '--logo-ps') + v(i, '--logo-pe'), 0) + (row.length - 1) * Number(/--logo-gx:([\d.]+)/.exec(plan.listStyle)[1]);
      assert.ok(used <= 1, `case ${k}: stamped row ${used}`);
    }
  }
});

test('rows are balanced: ten marks at four a row break 4/3/3, nine break 3/3/3', () => {
  assert.deepEqual(planWall(new Array(10).fill(3), {}).result.rows.map((r) => r.length), [4, 3, 3]);
  assert.deepEqual(planWall(new Array(9).fill(3), {}).result.rows.map((r) => r.length), [3, 3, 3]);
});

test('a wall that would pack its marks too small to read keeps the old grid, so the overflow still shows', () => {
  // 24 captioned marks in dense: the old wall overflowed; packing them fit only at about 5 px.
  const many = Array.from({ length: 24 }, (_, i) => [4, 1, 0.5, 3][i % 4]);
  assert.deepEqual(planWall(many, { dense: true, captions: true }), { mode: 'fallback' });
});

test('an unknown mark leaves the whole wall on the old grid', () => {
  assert.deepEqual(planWall([3, null, 1], {}), { mode: 'fallback' });
  assert.deepEqual(planWall([], {}), { mode: 'fallback' });
});

test('the stage estimate follows the measured canvases and stays below them', () => {
  // Measured stage share of the slide height, no eyebrow (see STAGE_SHARE).
  for (const [aspect, measured] of [[16 / 9, 0.608], [4 / 3, 0.706], [1, 0.733], [0.8, 0.751], [0.5625, 0.819], [0.4615, 0.85]]) {
    assert.ok(Math.abs(stageShare(aspect) - measured) < 1e-9, String(aspect));
    assert.ok(stageShare(aspect) - EYEBROW < measured);
  }
  assert.ok(stageShare(1.5) < 0.706 && stageShare(1.5) > 0.608);
});

test('a nonsense slide aspect is ignored, not planned for', () => {
  const plain = JSON.stringify(planWall([4, 1, 0.5], {}).itemStyles);
  for (const slideAspect of [784 / 120, 0, -1, NaN]) assert.equal(JSON.stringify(planWall([4, 1, 0.5], { slideAspect }).itemStyles), plain, String(slideAspect));
});

test('a mark\'s aspect comes from its inline svg or a data: SVG mask', () => {
  assert.equal(aspectOfMarkHtml('<span class="logo-mark logo-mark-svg"><svg viewBox="0 0 320 80"></svg></span>'), 4);
  const b64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="80"/>').toString('base64');
  assert.equal(aspectOfMarkHtml(`<span class="logo-mark" style="--logo-mask:url('data:image/svg+xml;base64,${b64}')"></span>`), 0.5);
  assert.equal(aspectOfMarkHtml(`<span class="logo-mark" style="--logo-mask:url('data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 10 10">')}')"></span>`), 1);
  assert.equal(aspectOfMarkHtml(`<span class="logo-mark" style="--logo-mask:url('https://x.test/a.svg')"></span>`), null);
});

const mark = (w, h, label) => `<span class="logo-mark logo-mark-svg" role="img" aria-label="${label}"><svg viewBox="0 0 ${w} ${h}"><path d="M0 0"/></svg></span>`;
const section = (cls, items) => `<section class="${cls}" data-family="wide"><div class="cell-stage">\n\n<ul>\n${items.join('\n')}\n</ul>\n</div></section>`;

test('stampWall stamps the list and each top-level item, and is idempotent', () => {
  const html = section('logo-wall', [`<li>${mark(320, 80, 'A')}</li>`, `<li>${mark(120, 120, 'B')}\n<ul>\n<li>B</li>\n<li><code>Seed</code></li>\n</ul>\n</li>`, `<li>${mark(80, 160, 'C')}</li>`]);
  const out = stampWall(html, 16 / 9);
  assert.match(out, /<ul data-logo-wall="packed" style="--logo-gx:0\.0556;--logo-gy:0\.0556">/);
  const styled = [...out.matchAll(/<li style="(--logo-cell[^"]*)"/g)].map((m) => m[1]);
  assert.equal(styled.length, 3, 'the caption list items are not marks');
  assert.deepEqual(styled, planWall([4, 1, 0.5], { captions: true, family: 'wide', slideAspect: 16 / 9 }).itemStyles);
  assert.equal(stampWall(out, 16 / 9), out);
  // A list that carries its own attributes keeps them, style merged after the plan's.
  const own = stampWall(html.replace('<ul>', '<ul class="x" style="color:red">'), 16 / 9);
  assert.match(own, /<ul data-logo-wall="packed" class="x" style="--logo-gx:[\d.]+;--logo-gy:[\d.]+;color:red">/);
  assert.equal(stampWall(own, 16 / 9), own);
});

test('stampWall leaves other sections alone and marks an unreadable wall as fallback', () => {
  const other = section('cards-grid', [`<li>${mark(1, 1, 'A')}</li>`]);
  assert.equal(stampWall(other, 16 / 9), other);
  const remote = section('logo-wall dense', [`<li><span class="logo-mark" role="img" style="--logo-mask:url('https://x.test/a.svg')"></span></li>`]);
  const out = stampWall(remote, 16 / 9);
  assert.match(out, /<ul data-logo-wall="fallback">/);
  assert.doesNotMatch(out, /--logo-cell/);
});

test('the packed CSS reads every stamped property', () => {
  for (const v of ['--logo-gx', '--logo-gy', '--logo-cell', '--logo-ps', '--logo-pe', '--logo-mw', '--logo-ar', '--logo-mpad']) assert.match(CSS, new RegExp(`var\\(${v}`), v);
  // After the family reflow, so a packed wall's columns come from the packer.
  assert.ok(CSS.indexOf('ul[data-logo-wall="packed"]') > CSS.indexOf('[data-family="tall"]'));
});
