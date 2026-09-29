/**
 * THE GUIDE'S EXPRESSIONS STAY READABLE ON EVERY THEME (owner, 2026-09-27: "color and dim, be
 * mindful of AA"; engineering/decisions/2026-09-27-guide-storyboards.md §11).
 *
 * The live Guide focuses a part by giving it the emphasis ink and receding the rest
 * (`lib/base/base.focus.css`, `.lat-guide-*`). Over all 33 themes in both modes:
 *
 *   - focused text in the accent is AA body text (4.5:1) against the slide;
 *   - somber's heading ink is too;
 *   - highlighted text (on-accent-soft on the accent-soft band) is too;
 *   - RECEDED text keeps 3:1: context steps back, it never becomes unreadable. The depth is read
 *     from the CSS, so retuning `--guide-dim` below the floor fails here.
 *
 * Measured with `tools/composed-contrast.js`'s compositor, the same one the palette gates use.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cc = require('../../../tools/composed-contrast.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.focus.css'), 'utf8');
const TEXT_DIM = Number(/\.lat-guide-dim \{\s*opacity: var\(--guide-dim, ([\d.]+)\)/.exec(CSS)?.[1]);

const rows = [];
for (const theme of cc.listAllThemes()) {
	const merged = cc.mergedVars(theme);
	const vars = merged.vars || merged;
	for (const [mode, dark] of cc.MODES) {
		const ratio = (ink, { bg = null, opacity = 1 } = {}) => cc.evalSurface(vars, { base: '--bg', ink, groups: [{ bg, opacity }] }, dark)?.ratio ?? null;
		rows.push({
			key: `${theme} ${mode}`,
			focus: ratio('--accent'),
			somber: ratio('--text-heading'),
			highlight: ratio('--on-accent-soft', { bg: '--accent-soft' }),
			receded: ratio('--text-body', { opacity: TEXT_DIM }),
		});
	}
}

test('every delivery recedes text no deeper than the floor the CSS holds', async () => {
	const { DELIVERY_PRESETS } = await import('../../../lib/core/resolve-delivery.mjs');
	for (const [name, look] of Object.entries(DELIVERY_PRESETS)) assert.ok(look.dim >= TEXT_DIM, `${name} recedes text to ${look.dim}, below the ${TEXT_DIM} that holds 3:1`);
});

test('the receded-text depth is read from the CSS', () => {
	assert.ok(TEXT_DIM > 0 && TEXT_DIM <= 1, `could not read --guide-dim from base.focus.css (got ${TEXT_DIM})`);
});

for (const [field, floor, what] of [
	['focus', 4.5, 'focused text in the accent'],
	['somber', 4.5, "somber's focus in the heading ink"],
	['highlight', 4.5, 'highlighted text on its band'],
	['receded', 3, 'receded text'],
]) {
	test(`${what} holds ${floor}:1 on every theme, in both modes`, () => {
		const fails = rows.filter((r) => r[field] === null || r[field] < floor).map((r) => `${r.key}: ${r[field]?.toFixed(2) ?? 'unresolved'}`);
		assert.deepEqual(fails, [], `${what} falls below ${floor}:1`);
		assert.ok(rows.length >= 60, `only ${rows.length} theme-modes measured`);
	});
}
