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
  assert.match(describe({ ratio: 2, floor: 4.5, fix: 'ink-light', fixRatio: 9.4 }), /Neither a dark nor a light slide.*card ink light.*9\.4:1/);
  assert.match(describe({ ratio: 2, floor: 4.5, fix: null, fixRatio: null }), /No pin and no card ink clears it/);
});

test('when no pin clears, the card ink that does is offered', async () => {
  const { judge } = await load();
  const muted = [90, 92, 98, 0.8];
  const v = judge({
    photo: DARK_PHOTO,
    ink: [NEAR_BLACK, muted],
    pins: { dark: { ink: [WHITE, muted] }, 'ink-light': { ink: [WHITE, [255, 255, 255, 0.88]] }, 'ink-dark': { card: null, ink: [NEAR_BLACK, [14, 18, 26, 0.8]] } },
  });
  assert.equal(v.low, true);
  assert.equal(v.fix, 'ink-light');
  assert.ok(v.fixRatio >= v.floor);
});

test('a pin that clears wins over a card ink that clears higher', async () => {
  const { judge } = await load();
  const v = judge({ photo: DARK_PHOTO, ink: NEAR_BLACK, pins: { dark: { ink: [200, 200, 200] }, 'ink-light': { ink: WHITE } } });
  assert.equal(v.fix, 'dark');
});

test('when both inks clear, the higher ratio wins', async () => {
  const { judge } = await load();
  // On a mid-gray photo white reads at about 6.9:1; near-black on the ink-dark card beats it when the card is solid
  // (about 16:1) and loses when the card is at 30% (about 4.9:1).
  const gray = [90, 90, 90];
  const scene = (alpha) => ({ photo: gray, ink: [100, 100, 100], pins: { 'ink-dark': { card: [250, 249, 246, alpha], ink: NEAR_BLACK }, 'ink-light': { ink: WHITE } } });
  assert.equal(judge(scene(1)).fix, 'ink-dark');
  assert.equal(judge(scene(0.3)).fix, 'ink-light');
});

test('a card ink that does not clear the floor is not offered either', async () => {
  const { judge } = await load();
  const mid = [128, 128, 128];
  const v = judge({ photo: mid, ink: [140, 140, 140], pins: { 'ink-light': { ink: [160, 160, 160] }, 'ink-dark': { ink: [100, 100, 100] } } });
  assert.equal(v.fix, null);
});
