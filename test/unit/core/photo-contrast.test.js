const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../lib/core/photo-contrast.mjs');
const card = () => import('../../../lib/core/card-ink.mjs');

const DARK_PHOTO = [20, 24, 32];
const BRIGHT_PHOTO = [235, 232, 220];
const NEAR_BLACK = [26, 28, 34];
const WHITE = [255, 255, 255];

test('dark ink on a dark photo fails, and pinning dark (light ink) is offered', async () => {
  const { judge } = await load();
  const v = judge({ photo: DARK_PHOTO, ink: NEAR_BLACK, pins: { dark: { ink: WHITE }, light: { ink: NEAR_BLACK } } });
  assert.equal(v.low, true);
  assert.equal(v.fix, 'dark');
  assert.ok(v.fixRatio >= v.floor);
});

test('light ink on a bright photo fails, and pinning light is offered', async () => {
  const { judge } = await load();
  const v = judge({ photo: BRIGHT_PHOTO, ink: WHITE, pins: { dark: { ink: WHITE }, light: { ink: NEAR_BLACK } } });
  assert.equal(v.low, true);
  assert.equal(v.fix, 'light');
});

test('text that already reads passes and offers nothing', async () => {
  const { judge } = await load();
  const v = judge({ photo: BRIGHT_PHOTO, ink: NEAR_BLACK, pins: { dark: { ink: WHITE } } });
  assert.equal(v.low, false);
  assert.equal(v.fix, null);
});

test('a pin that does not clear the floor is not offered', async () => {
  const { judge } = await load();
  const mid = [128, 128, 128];
  const v = judge({ photo: mid, ink: [140, 140, 140], pins: { dark: { ink: [150, 150, 150] }, light: { ink: [120, 120, 120] } } });
  assert.equal(v.low, true);
  assert.equal(v.fix, null);
  assert.equal(v.fixRatio, null);
});

test('a card fill over the photo counts: a solid light card rescues dark ink on a dark photo', async () => {
  const { judge, inkRatio } = await load();
  assert.ok(inkRatio({ photo: DARK_PHOTO, ink: NEAR_BLACK }) < 4.5);
  assert.equal(judge({ photo: DARK_PHOTO, card: [250, 249, 246, 1], ink: NEAR_BLACK }).low, false);
  // The same card at 10% lets the photo win, so the warning returns.
  assert.equal(judge({ photo: DARK_PHOTO, card: [250, 249, 246, 0.1], ink: NEAR_BLACK }).low, true);
});

test('the slide reads only as well as its worst ink', async () => {
  const { inkRatio } = await load();
  const both = inkRatio({ photo: BRIGHT_PHOTO, ink: [NEAR_BLACK, [225, 222, 210]] });
  assert.ok(both < 1.5);
});

test('ink with its own alpha is composited onto the backdrop', async () => {
  const { inkRatio } = await load();
  assert.ok(inkRatio({ photo: DARK_PHOTO, ink: [255, 255, 255, 0.05] }) < inkRatio({ photo: DARK_PHOTO, ink: [255, 255, 255, 1] }));
});

test('the ratio is card-ink.mjs contrast, so the two features cannot disagree', async () => {
  const { inkRatio } = await load();
  const { contrast } = await card();
  assert.equal(inkRatio({ photo: DARK_PHOTO, ink: WHITE }), contrast(WHITE, DARK_PHOTO));
});

test('describe names the ratio and the fix, or says nothing clears it', async () => {
  const { describe } = await load();
  assert.match(describe({ ratio: 1.3, floor: 4.5, fix: 'dark', fixRatio: 12.1 }), /1\.3:1.*Pinning the slide dark.*12\.1:1/);
  assert.match(describe({ ratio: 2, floor: 4.5, fix: null, fixRatio: null }), /Neither a dark nor a light slide.*card ink/);
});
