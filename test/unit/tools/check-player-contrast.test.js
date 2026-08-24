const test = require('node:test');
const assert = require('node:assert/strict');

// The pure kernels of the player-contrast sweep. The sweep itself needs Chromium and a real
// export, so it lives in the nightly; what is unit-testable is the part that decides what
// counts as the same finding and what counts as a regression — which is precisely the part
// that can be wrong while every render is perfect.
const { collapse, diffBaseline, findingKey, over, ratio, HIDE_INK, blessRatchet } = require('../../../tools/check-player-contrast.js');

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

test('HIDE_INK erases SVG paint on TEXT only, never on shapes', () => {
	// A blanket `*{fill:transparent}` erases the geometry too — the boxes of an ER diagram,
	// the wedges of a pie, the bars of a chart — so the screenshot behind the glyphs shows
	// whatever sits under the ERASED shape rather than the surface the text is on. Measured
	// on mermaid-sketch-labels p5: white labels on hatched blue boxes sampled as pure white
	// and scored 1.00:1, twelve confident wrong rows on one deck. With the paint erasure
	// scoped to text the same run reads 6.49:1, which is what the render shows.
	assert.match(HIDE_INK, /\btext,tspan,textPath\{[^}]*fill:transparent/, 'text paint is erased');
	// The universal selector must NOT carry fill/stroke.
	const universal = HIDE_INK.slice(0, HIDE_INK.indexOf('}') + 1);
	assert.doesNotMatch(universal, /fill:/, 'the universal rule never erases fill');
	assert.doesNotMatch(universal, /stroke:/, 'the universal rule never erases stroke');
	// It must still erase the things that only affect glyphs.
	assert.match(universal, /color:transparent/);
	assert.match(universal, /text-shadow:none/);
});

// ── the bless ratchet (#1808) ───────────────────────────────────────────────

test('blessRatchet refuses to write a ratio DOWN', () => {
	// The defect: `--bless` wrote whatever tonight measured, in both directions. Writing a
	// ratio down records that a surface got worse and files it as known — the one edit a
	// baseline must never make on its own, because the gate's entire question is "did
	// tonight make something worse" and a bless can answer it by moving the goalposts.
	const seen = collapse([row({ text: 'a', r: 2.00 })]);
	const { blessed, held } = blessRatchet(seen, { 'd|as exported|5|kanban|span|a': 3.20 });
	assert.equal(blessed['d|as exported|5|kanban|span|a'], 3.20, 'the committed value is KEPT');
	assert.deepEqual(held.map((h) => [h.key, h.was, h.now]), [['d|as exported|5|kanban|span|a', 3.20, 2.00]]);
});

test('a held row leaves the nightly RED, which is the point', () => {
	// Holding is not cosmetic: the next comparison scores the measurement against the value
	// that was kept, so the finding still reports WORSE until a human explains it.
	const rows = [row({ text: 'a', r: 2.00 })];
	const { blessed } = blessRatchet(collapse(rows), { 'd|as exported|5|kanban|span|a': 3.20 });
	assert.equal(diffBaseline(rows, blessed).worse.length, 1);
});

test('--allow-loosen is the only way down, and it takes the measurement', () => {
	const seen = collapse([row({ text: 'a', r: 2.00 })]);
	const { blessed, held } = blessRatchet(seen, { 'd|as exported|5|kanban|span|a': 3.20 }, { allowLoosen: true });
	assert.equal(blessed['d|as exported|5|kanban|span|a'], 2.00);
	assert.equal(held.length, 1, 'still REPORTED — a loosening is never silent, only permitted');
});

test('an improvement, a new finding and a fixed one all pass straight through', () => {
	const seen = collapse([row({ text: 'a', r: 4.00 }), row({ text: 'b', r: 1.50 })]);
	const prior = { 'd|as exported|5|kanban|span|a': 3.20, 'd|as exported|5|kanban|span|gone': 2.0 };
	const { blessed, held, tightened, added, dropped } = blessRatchet(seen, prior);
	assert.equal(blessed['d|as exported|5|kanban|span|a'], 4.00, 'a better ratio is recorded');
	assert.deepEqual(tightened, ['d|as exported|5|kanban|span|a']);
	assert.deepEqual(added, ['d|as exported|5|kanban|span|b']);
	assert.deepEqual(dropped, ['d|as exported|5|kanban|span|gone'], 'a finding that no longer reproduces is dropped');
	assert.deepEqual(held, []);
});

test('there is NO slack, and the asymmetry with diffBaseline is deliberate', () => {
	// `diffBaseline` carries a 0.05 band so sub-pixel jitter does not cry wolf. The ratchet
	// carries none: holding the higher of two numbers a few thousandths apart costs nothing,
	// because that same band absorbs it on the next comparison — while any slack HERE
	// compounds across blesses, and a floor that can be walked down a digit per run is not a
	// floor. The 1e-9 below is binary representation, not policy.
	const held = (now, was) => blessRatchet(collapse([row({ text: 'a', r: now })]), { 'd|as exported|5|kanban|span|a': was }).held.length;
	assert.equal(held(3.19, 3.20), 1, 'a hundredth down is still down');
	assert.equal(held(3.20, 3.20), 0, 'equal is not a loosening');
});
