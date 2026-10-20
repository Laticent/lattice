/**
 * lib/core/card-ink.mjs — which ink a thin spotlight card needs.
 *
 *   1. the class readers and `needsInk`, the question the linter asks;
 *   2. the contrast arithmetic agrees with lib/theme/color.js, and the ink choice follows the photo;
 *   3. the cover-fit mapping from a box on the panel to pixels on the photo;
 *   4. the fills and inks restated here match the ones image.styles.css paints.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { contrastRatio } = require(path.join(ROOT, 'lib/theme/color.js'));
const load = () => import(path.join(ROOT, 'lib/core/card-ink.mjs'));
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

test('class readers: the last word wins, and a level is a percent', async () => {
  const k = await load();
  assert.equal(k.backingPercent(['image', 'spotlight']), null);
  assert.equal(k.backingPercent(['card-soft']), 80);
  assert.equal(k.backingPercent(['card-sheer']), 55);
  assert.equal(k.backingPercent(['card-clear']), 0);
  assert.equal(k.backingPercent(['card-o35']), 35);
  assert.equal(k.backingPercent(['card-soft', 'card-o35']), 35);
  assert.equal(k.backingPercent(['card-o30', 'card-soft']), 30, 'a level sits after the names in the CSS, so it wins whatever the class order');
  assert.equal(k.inkOf(['ink-dark']), 'dark');
  assert.equal(k.inkOf(['image']), null);
});

test('painted levels: pinned to the register, and a level with no CSS rule sets nothing', async () => {
  const k = await load();
  const { BACKING_LEVELS } = require(path.join(ROOT, 'lib/core/resolve-image-card.js'));
  assert.deepEqual([...k.PAINTED_LEVELS], BACKING_LEVELS, 'the policy and the register list the same levels');
  const css = fs.readFileSync(path.join(ROOT, 'lib/components/imagery/image/image.styles.css'), 'utf8');
  for (const n of k.PAINTED_LEVELS) assert.ok(css.includes(`.card-o${n} {`), `card-o${n} is painted`);
  for (const n of [0, 55, 80, 100]) {
    assert.ok(!css.includes(`.card-o${n} {`), `card-o${n} has no rule`);
    assert.equal(k.backingPercent([`card-o${n}`]), null, `card-o${n} sets no backing`);
  }
});

test('needsInk: only a thin spotlight card with no ink, from the slide or the deck', async () => {
  const k = await load();
  assert.equal(k.needsInk(['image', 'spotlight', 'card-o35']), true);
  assert.equal(k.needsInk(['image', 'spotlight', 'card-clear']), true);
  assert.equal(k.needsInk(['image', 'spotlight', 'card-sheer']), true, '55% is thin');
  assert.equal(k.needsInk(['image', 'spotlight', 'card-o60']), false, '60% is not');
  assert.equal(k.needsInk(['image', 'spotlight', 'card-soft']), false);
  assert.equal(k.needsInk(['image', 'spotlight']), false, 'a default card is solid');
  assert.equal(k.needsInk(['image', 'spotlight', 'card-o35', 'ink-light']), false, 'an ink on the slide answers it');
  assert.equal(k.needsInk(['image', 'spotlight'], ['card-o35']), true, 'a thin deck backing counts');
  assert.equal(k.needsInk(['image', 'spotlight'], ['card-o35', 'ink-dark']), false, 'a deck ink answers it');
  assert.equal(k.needsInk(['image', 'spotlight', 'card-solid'], ['card-o35']), false, 'the slide overrides the deck backing');
  assert.equal(k.needsInk(['image', 'statement', 'card-o35']), false, 'a statement ink is fixed');
  assert.equal(k.needsInk(['image', 'card-o35']), false, 'a composition the slide does not name is not guessed');
  assert.equal(k.needsInk(['image', 'card-o35'], [], 'spotlight'), true, '...unless the caller knows it');
});

test('contrast agrees with lib/theme/color.js', async () => {
  const k = await load();
  for (const [a, b] of [[[255, 255, 255], [12, 18, 28]], [[14, 18, 26], [250, 249, 246]], [[120, 130, 140], [30, 40, 60]], [[200, 60, 40], [20, 20, 20]]]) {
    assert.ok(Math.abs(k.contrast(a, b) - contrastRatio(hex(a), hex(b))) < 1e-9, `${hex(a)} on ${hex(b)}`);
  }
});

test('pickCardInk follows the photo behind a thin card', async () => {
  const k = await load();
  assert.equal(k.pickCardInk([20, 30, 50], 30).ink, 'light', 'a dark photo wants white words');
  assert.equal(k.pickCardInk([240, 235, 220], 30).ink, 'dark', 'a bright photo wants dark words');
  assert.equal(k.pickCardInk([20, 30, 50], 0).ink, 'light', 'with no card at all the photo decides outright');
  const solid = k.pickCardInk([128, 128, 128], 100);
  assert.ok(solid.light > 15 && solid.dark > 15, `a solid card reads either way (${solid.light.toFixed(1)}, ${solid.dark.toFixed(1)})`);
  const mid = k.pickCardInk([128, 128, 128], 30);
  assert.ok(Math.max(mid.light, mid.dark) >= 3, 'the winner on a mid-gray photo still clears 3:1');
});

test('meanRgb averages in linear light and skips transparent pixels', async () => {
  const k = await load();
  assert.deepEqual(k.meanRgb(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])), [188, 188, 188], 'black and white average to 188, not 128');
  assert.deepEqual(k.meanRgb(new Uint8ClampedArray([10, 20, 30, 255, 200, 200, 200, 0])), [10, 20, 30]);
  assert.equal(k.meanRgb(new Uint8ClampedArray([1, 2, 3, 0])), null);
});

test('coverSourceRect maps a panel box to photo pixels', async () => {
  const k = await load();
  // A 2000x1000 photo covers a 1280x720 panel at scale 0.72 (height-bound), cropping 80px a side.
  const whole = k.coverSourceRect(2000, 1000, 1280, 720, { x: 0, y: 0, w: 1280, h: 720 });
  // 80 panel px is 111.1 photo px at 0.72, so the visible band is x 111.1 to 1888.9.
  assert.ok(Math.abs(whole.x - 111.1) < 0.2 && Math.abs(whole.w - 1777.8) < 0.2, JSON.stringify(whole));
  const box = k.coverSourceRect(2000, 1000, 1280, 720, { x: 640, y: 360, w: 72, h: 72 });
  assert.ok(Math.abs(box.x - 1000) < 1 && Math.abs(box.y - 500) < 1 && Math.abs(box.w - 100) < 1, JSON.stringify(box));
  assert.equal(k.coverSourceRect(0, 1000, 1280, 720, { x: 0, y: 0, w: 10, h: 10 }), null);
  assert.equal(k.coverSourceRect(2000, 1000, 1280, 720, { x: 5000, y: 0, w: 10, h: 10 }), null, 'a box off the photo');
});

test('the fills and inks restated here are the ones image.styles.css paints', async () => {
  const k = await load();
  const css = fs.readFileSync(path.join(ROOT, 'lib/components/imagery/image/image.styles.css'), 'utf8');
  const rgb = ([r, g, b]) => `rgb(${r} ${g} ${b})`;
  for (const ink of ['light', 'dark']) {
    const block = css.slice(css.indexOf(`.${`ink-${ink}`} {`));
    const end = block.indexOf('}');
    const rule = block.slice(0, end);
    assert.ok(rule.includes(`--_card-fill: ${rgb(k.INK_FILL[ink])}`), `ink-${ink} fill`);
    assert.ok(rule.includes(`--_card-heading-ink: ${rgb(k.INK_TEXT[ink])}`) || rule.includes(`--_card-heading-ink: rgb(${k.INK_TEXT[ink].join(' ')} / `), `ink-${ink} heading ink`);
  }
  assert.equal(k.THIN_BACKING, 60);
});

test('lint: thin-card-no-ink warns on a thin spotlight card with no ink, and only then', () => {
  const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));
  const deck = (fm, cls) => `---\ntheme: indaco\n${fm}---\n\n<!-- _class: ${cls} -->\n\n## A photo.\n\nWords.\n\n![bg](sample:photo-wide.svg)\n`;
  const hits = (src) => lintText(src).filter((f) => f.rule === 'thin-card-no-ink');
  const one = hits(deck('', 'image spotlight card-o35'));
  assert.equal(one.length, 1, JSON.stringify(one));
  assert.equal(one[0].classToken, 'card-o35');
  assert.match(one[0].message, /35%/);
  assert.equal(hits(deck('', 'image spotlight card-o35 ink-light')).length, 0, 'an ink answers it');
  assert.equal(hits(deck('', 'image spotlight card-o65')).length, 0, '65% is not thin');
  assert.equal(hits(deck('', 'image spotlight')).length, 0, 'a default card is solid');
  assert.equal(hits(deck('', 'image statement card-o35')).length, 0, 'a statement ink is fixed');
  assert.equal(hits(deck('image-card: 35%\n', 'image spotlight')).length, 1, 'a thin deck backing counts');
  assert.equal(hits(deck('image-card: 35% light\n', 'image spotlight')).length, 0, 'a deck ink answers it');
  assert.equal(hits(deck('image-card: 35%\n', 'image spotlight card-solid')).length, 0, 'the slide overrides the deck');
  assert.equal(hits(deck('', 'image statement spotlight card-o30')).length, 0, 'the first composition word wins, as in the engine: this renders a statement');
  assert.equal(hits(deck('', 'image spotlight statement card-o30')).length, 1, '...and here it renders a spotlight');
});
