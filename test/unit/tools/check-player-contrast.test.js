const test = require('node:test');
const assert = require('node:assert/strict');

// The pure kernels of the player-contrast sweep. The sweep itself needs Chromium and a real
// export, so it lives in the nightly; what is unit-testable is the part that decides what
// counts as the same finding and what counts as a regression — which is precisely the part
// that can be wrong while every render is perfect.
const { collapse, diffBaseline, findingKey, over, ratio } = require('../../../tools/check-player-contrast.js');

const row = (over_) => ({ deck: 'd', state: 'as exported', page: '5', cls: 'kanban', tag: 'span', text: 'growth', need: 4.5, ...over_ });

test('collapse keeps the WORST ratio when a finding key legitimately collides', () => {
	// A key CAN name two elements: examples/kanban-chart-redesign.md p5 carries two different
	// cards whose lane label is both the word "growth". Keeping the worst is the conservative
	// read; keeping an arbitrary one makes the result depend on DOM order.
	const seen = collapse([row({ r: 4.47 }), row({ r: 4.02 })]);
	assert.equal(seen.size, 1);
	assert.equal([...seen.values()][0].r, 4.02);
	// Order must not change the answer.
	assert.equal([...collapse([row({ r: 4.02 }), row({ r: 4.47 })]).values()][0].r, 4.02);
});

test('a freshly blessed baseline compares clean against the sweep that produced it', () => {
	// The regression this pins. `--bless` built its map with `Object.fromEntries`, which keeps
	// the LAST row for a duplicate key, while the comparison kept the WORST — so the two
	// "growth" cards blessed at 4.47 and compared at 4.02, and the very first nightly against
	// a fresh baseline reported a 0.45 regression that did not exist. A gate that cries wolf
	// on its own baseline is worse than no gate.
	const rows = [row({ r: 4.47 }), row({ r: 4.02 }), row({ text: 'other', r: 3.1 })];
	const blessed = Object.fromEntries([...collapse(rows)].map(([key, r]) => [key, r.r]));
	const { added, worse } = diffBaseline(rows, blessed);
	assert.deepEqual([added.length, worse.length], [0, 0], 'a baseline must agree with its own sweep');
});

test('diffBaseline reports a NEW finding, and a WORSE one only outside the jitter band', () => {
	const base = { [findingKey(row({}))]: 4.0 };
	assert.equal(diffBaseline([row({ r: 4.0 })], base).worse.length, 0, 'unchanged is not news');
	// The backdrop is sampled from rendered pixels, so a sub-pixel shift moves a ratio in the
	// third decimal with nothing having changed. The band is for that, not slack.
	assert.equal(diffBaseline([row({ r: 3.97 })], base).worse.length, 0, 'inside the band');
	assert.equal(diffBaseline([row({ r: 3.5 })], base).worse.length, 1, 'outside the band');
	// A ratio that IMPROVED is never a failure.
	assert.equal(diffBaseline([row({ r: 4.4 })], base).worse.length, 0, 'better is not worse');
	assert.equal(diffBaseline([row({ text: 'fresh', r: 2 })], base).added.length, 1, 'an unknown key is new');
	// A baseline row that stopped reproducing is reported, not failed — it is the signal the
	// baseline wants re-blessing, and without it a fix reads exactly like a skipped deck.
	assert.deepEqual(diffBaseline([], base).fixed, Object.keys(base));
});

test('the ink is composited over the pixel it sits on, not over a modelled backdrop', () => {
	// A translucent ink composited over backdrop A and then scored against backdrop B
	// describes no pixel on screen — and the whole --on-*-secondary / -ghost / -watermark ramp
	// is color-mix(… N%, transparent).
	assert.deepEqual(over([255, 255, 255], [0, 0, 0], 0.5), [128, 128, 128]);
	assert.deepEqual(over([255, 255, 255], [0, 0, 0], 1), [255, 255, 255]);
	assert.equal(ratio([255, 255, 255], [0, 0, 0]).toFixed(0), '21');
});
