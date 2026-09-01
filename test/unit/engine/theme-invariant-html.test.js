/**
 * WHAT A PALETTE CHANGES IN THE MARKUP — the theme's NAME, and nothing else.
 *
 * This started as the opposite claim. The sanitize memo in `docs/src/lib/single-slide-render.ts`
 * was written believing the engine's HTML is theme-invariant, so a palette flip would re-sanitize
 * a string already sanitized and cost nothing. Measured over the whole committed corpus, that
 * looked true — because the measurement ran with NO theme registered, and the engine stamps
 * `data-theme` / `--theme` only for a theme it actually knows. With the real sheets registered the
 * markup differs on every section, and the memo misses. The claim was removed rather than shipped.
 *
 * Both halves are worth a test:
 *   · the stamp EXISTS, so nothing downstream may assume a palette change is free; and
 *   · the stamp is ALL of it — replace the name and the two renders are byte-identical. If a
 *     future transform starts emitting palette-DERIVED markup (a resolved color inlined into an
 *     SVG, a categorical class), this row goes red and whoever wrote it gets to re-read the cache
 *     reasoning that hangs off it, which is what this file exists to force.
 *
 * SAMPLED, not corpus-wide: the shapes that would break it first — charts and diagrams that draw
 * their own SVG, imagery, and the baseline gallery.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { render, addThemes } = require('../../../lib/engine/index.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES = ['indaco', 'cuoio', 'onyx'];
// REGISTER THE REAL SHEETS FIRST. With no theme registered the engine renders every name with
// empty CSS and no stamp, which is how the original measurement fooled itself.
addThemes(THEMES.map((name) => ({ name, css: fs.readFileSync(path.join(ROOT, 'themes', `${name}.css`), 'utf8') })));

const DECKS = [
	'test/integration/baseline-decks/gallery.md',
	'examples/pricing.md',
	'lib/components/chart/chart.gallery.md',
	'lib/components/diagram/diagram/diagram.gallery.md',
	'lib/components/imagery/image/image.gallery.md',
	'lib/components/statement/split-panel/split-panel.gallery.md',
];

// A path that does not exist would otherwise "pass" as a per-deck ENOENT nobody reads as coverage.
test('every deck this file names actually exists', () => {
	for (const rel of DECKS) assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is not in the tree — fix the path, do not drop the row`);
});

for (const rel of DECKS) {
	test(`${rel} — a palette changes the theme stamp and nothing else`, async () => {
		const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
		const [a, b, c] = await Promise.all(THEMES.map((t) => render(src, t)));
		assert.notEqual(a.html, b.html, 'the theme is not reaching the markup at all — is the sheet registered?');
		assert.notEqual(a.css, b.css, 'two palettes produced identical CSS — the theme argument is not reaching the render');
		// The name is the whole difference: neutralize it and the renders coincide.
		const neutral = (html) => html.replace(new RegExp(THEMES.join('|'), 'g'), 'THEME');
		assert.equal(
			neutral(b.html),
			neutral(a.html),
			`${rel} renders differently under \`${THEMES[1]}\` than under \`${THEMES[0]}\` for a reason beyond the theme's NAME. ` +
				'Something now emits palette-derived MARKUP. That may be right — but re-read the cache reasoning in ' +
				'docs/src/lib/single-slide-render.ts before deleting this row.',
		);
		assert.equal(neutral(c.html), neutral(a.html));
	});
}
