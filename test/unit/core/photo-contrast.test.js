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
  assert.match(describe({ ratio: 2, floor: 4.5, fix: 'ink-light', fixRatio: 9.4 }), /2\.0:1.*Setting the card ink light lifts it to 9\.4:1/);
  assert.match(describe({ ratio: 2, floor: 4.5, fix: 'solid', fixRatio: null }), /a solid card does/);
  assert.match(describe({ ratio: 2, floor: 4.5, fix: null, fixRatio: null }), /No fix here clears it/);
  // An estimate has no current ratio: it names the fix and says where the number came from.
  const est = describe({ ratio: null, floor: 4.5, fix: 'ink-light', fixRatio: 9.4, estimate: true });
  assert.match(est, /^Setting the card ink light lifts it to 9\.4:1\. \(Estimated from the photo file/);
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

// A statement's scrim, the default one in image.styles.css: two layers, densest at 0.86 and 0.72.
const SCRIM = [
  [[8, 14, 24, 0.86], [8, 14, 24, 0.5], [8, 14, 24, 0]],
  [[8, 14, 24, 0.72], [8, 14, 24, 0]],
];

test('strongestScrim stacks every layer at its densest stop', async () => {
  const { strongestScrim } = await load();
  const s = strongestScrim(SCRIM);
  assert.deepEqual(s.slice(0, 3).map(Math.round), [8, 14, 24]);
  // 1 - (1 - 0.86)(1 - 0.72)
  assert.ok(Math.abs(s[3] - 0.9608) < 1e-9);
});

test('strongestScrim is null when the scrim paints nothing (card-clear)', async () => {
  const { strongestScrim } = await load();
  assert.equal(strongestScrim(SCRIM.map((l) => l.map((c) => [...c.slice(0, 3), 0]))), null);
  assert.equal(strongestScrim([]), null);
});

test('strongestScrim composites two colors the way the browser stacks them', async () => {
  const { strongestScrim, over } = await load();
  // A red layer listed first (painted on top) over a blue one: over a white photo the stack and the single layer agree.
  const s = strongestScrim([[[255, 0, 0, 0.5]], [[0, 0, 255, 0.5]]]);
  const stacked = over([255, 0, 0, 0.5], over([0, 0, 255, 0.5], WHITE));
  for (const [i, v] of over(s, WHITE).entries()) assert.ok(Math.abs(v - stacked[i]) < 1e-9);
});

test('white on a bright photo under the default scrim reads; with the scrim cleared it fails', async () => {
  const { judge, strongestScrim } = await load();
  assert.equal(judge({ photo: BRIGHT_PHOTO, card: strongestScrim(SCRIM), ink: WHITE }).low, false);
  const clear = judge({ photo: BRIGHT_PHOTO, card: null, ink: WHITE, pins: { 'ink-dark': { card: null, ink: [14, 18, 26] } } });
  assert.equal(clear.low, true);
  assert.equal(clear.fix, 'ink-dark');
});

test('describe says "at most" for a ratio judged against the strongest scrim', async () => {
  const { describe } = await load();
  assert.match(describe({ ratio: 2.4, floor: 4.5, fix: null, fixRatio: null, atMost: true }), /reads at most 2\.4:1/);
  assert.match(describe({ ratio: 2.4, floor: 4.5, fix: null, fixRatio: null }), /reads at 2\.4:1/);
});

test('on a card lint flags, the inks go first and a pin is never offered', async () => {
  const { judge } = await load();
  // The pin would clear (white on the dark photo), but it would leave lint's thin-card-no-ink warning standing.
  const scene = { photo: DARK_PHOTO, ink: NEAR_BLACK, pins: { dark: { ink: WHITE }, 'ink-light': { ink: WHITE }, 'ink-dark': { ink: NEAR_BLACK } } };
  assert.equal(judge(scene).fix, 'dark');
  assert.equal(judge(scene, { inkFirst: true }).fix, 'ink-light');
  const noInk = { ...scene, pins: { dark: { ink: WHITE } } };
  assert.equal(judge(noInk, { inkFirst: true }).fix, null, 'no pin, even with nothing else');
  assert.equal(judge(noInk, { inkFirst: true, solidReads: true }).fix, 'solid', 'a spotlight falls back to a solid card');
});

test('wantFix names the ink even when the theme ink happens to read; an estimate has no ratio', async () => {
  const { judge, inkScenes } = await load();
  const reads = judge({ photo: DARK_PHOTO, ink: WHITE, pins: inkScenes('spotlight', 0, false) }, { inkFirst: true, wantFix: true });
  assert.equal(reads.low, false);
  assert.equal(reads.fix, 'ink-light');
  const est = judge({ photo: BRIGHT_PHOTO, ink: null, pins: inkScenes('spotlight', 0, true) }, { inkFirst: true, solidReads: true });
  assert.equal(est.ratio, null);
  assert.equal(est.fix, 'ink-dark');
});

test('inkScenes paints the stylesheet inks: the card under a spotlight, none under a statement', async () => {
  const { inkScenes } = await load();
  const { INK_FILL, INK_TEXT, INK_BODY } = await card();
  const spot = inkScenes('spotlight', 30, true);
  assert.deepEqual(spot['ink-light'], { card: [...INK_FILL.light, 0.3], ink: [INK_TEXT.light, INK_BODY.light] });
  assert.equal(inkScenes('spotlight', 0, false)['ink-dark'].card, null);
  assert.equal(inkScenes('statement', 30, false)['ink-dark'].card, null);
});

test('describe rounds down, so a ratio just under the floor never prints as the floor', async () => {
  const { describe } = await load();
  assert.match(describe({ ratio: 4.46, floor: 4.5, fix: null, fixRatio: null }), /reads at 4\.4:1/);
});

test('fixLabel is the one button label both views show', async () => {
  const { fixLabel } = await load();
  assert.deepEqual(['dark', 'light', 'ink-light', 'ink-dark', 'solid'].map(fixLabel), ['Pin this slide dark', 'Pin this slide light', 'Set card ink light', 'Set card ink dark', 'Use a solid card']);
});
