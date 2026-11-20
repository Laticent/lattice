// The grain banding platform suite's measure (docs/scripts/ios-safari/grain-banding.mjs), on synthetic pictures: a glow
// drawn in flat bands reads long runs, the same glow with a faint grain reads short ones, and the probe fails when the
// arm that should carry the grain still bands. The suite itself runs in real Safari on a macOS runner
// (.github/platform-suites.json, ios-safari-grain-banding).
const test = require('node:test');
const assert = require('node:assert/strict');

let m;
test.before(async () => {
	m = await import('../../../docs/scripts/ios-safari/grain-banding.mjs');
});

/** A W x H RGBA picture whose color at (x, y) is f(x, y) -> [r, g, b]. */
function picture(W, H, f) {
	const data = new Uint8Array(W * H * 4);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const [r, g, b] = f(x, y);
			data.set([r, g, b, 255], (y * W + x) * 4);
		}
	}
	return { width: W, height: H, data };
}

// A dark radial glow two levels deep across the slide, the shape of finish-nimbus: drawn without dither, each level is a
// wide flat ring. Seeded noise of +-2 levels stands in for the grain.
const W = 960, H = 540;
const level = (x, y) => Math.round(2 * Math.max(0, 1 - Math.hypot(x - 700, y - 160) / 700));
const banded = picture(W, H, (x, y) => [20, 40 + level(x, y), 60 + level(x, y)]);
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const grained = picture(W, H, (x, y) => {
	const d = Math.floor(rnd() * 5) - 2;
	return [20 + d, 40 + level(x, y) + d, 60 + level(x, y) + d];
});

test('flatRuns: a banded glow has long runs, the same glow with grain has short ones', () => {
	const b = m.flatRuns(banded, 2);
	const g = m.flatRuns(grained, 2);
	assert.ok(b.p90Css > m.GRAIN_MAX_P90_CSS, `banded p90 ${b.p90Css} CSS px`);
	assert.ok(g.p90Css <= m.GRAIN_MAX_P90_CSS, `grained p90 ${g.p90Css} CSS px`);
	assert.equal(b.p90Css, b.p90 / 2, 'CSS px are device px over the pixel ratio');
});

test('flatRuns: the measured strips skip the title band in the middle of the slide', () => {
	// Words drawn only across the middle third must not change the measure.
	const words = picture(W, H, (x, y) => (y > H * 0.4 && y < H * 0.6 && x % 7 < 3 ? [240, 240, 240] : [20, 40 + level(x, y), 60 + level(x, y)]));
	assert.deepEqual(m.flatRuns(words, 2), m.flatRuns(banded, 2));
});

const io = (grainImg, plainImg) => ({
	players: { grain: 'grain', plain: 'plain' },
	go: async (url) => {
		io.at = url;
	},
	info: async () => ({ dpr: 2, width: 1280, ua: 'test' }),
	shot: async () => io.at,
	decode: (which) => (which === 'grain' ? grainImg : plainImg),
});

test('runGrainBanding: passes when the grain arm is short-run, and reports the plain arm', async () => {
	const r = await m.runGrainBanding(io(grained, banded));
	assert.equal(r.ok, true, JSON.stringify(r.steps));
	assert.ok(r.measures.plain.p90Css > r.measures.grain.p90Css);
	assert.ok(r.steps.some((s) => s.name.startsWith('reported · without the grain')));
});

test('runGrainBanding: fails when the arm that should carry the grain still bands', async () => {
	const r = await m.runGrainBanding(io(banded, banded));
	assert.equal(r.ok, false);
	assert.ok(r.steps.some((s) => !s.pass && s.name.startsWith('with the grain')));
});
