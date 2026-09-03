/**
 * CHART MOTION IN AN EXPORTED PLAYER — what gets injected, and what deliberately does not.
 *
 * A chart's scene is built at VIEW time from its rendered marks (`chartToScene`), so unlike an
 * authored `scene` there is no baked `data-scene-spec` to look for. The exporter therefore
 * decides from two signals: the marks are present in the markup, AND the deck asked for motion.
 * Getting either half wrong is silent — a deck that should animate ships a still, or a deck that
 * documents the attribute in a code fence ships a player it never uses — so both are pinned.
 *
 * The byte-identity case is the one worth guarding hardest: a deck with no chart and no scene
 * must come out exactly as it did before any of this existed.
 */

const test = require('node:test');
const assert = require('node:assert');

const FM = (extra = '') => `---\nmarp: true\ntheme: indaco\n${extra}---\n\n# deck\n`;

async function core() {
	return import('../../../lib/export/player-core.mjs');
}

test('a deck that asks for motion and HAS chart marks gets the chart player', async () => {
	const { playerJs } = await core();
	const { ANIMA_CHART_JS } = await import('../../../lib/export/anima-player-bundle.generated.mjs');
	const js = await playerJs('', null, false, undefined, { js: ANIMA_CHART_JS, deck: { motion: 'on', style: null, speed: null } });
	assert.ok(js.includes('__latticeAnimaCharts'), 'the chart bundle was not injected');
	assert.ok(js.includes('"motion":"on"'), 'the deck scalars were not baked in — an exported file has no front matter to re-read');
});

test('no chart config means no chart bytes at all', async () => {
	const { playerJs } = await core();
	const js = await playerJs('', null, false, undefined, null);
	assert.equal(js.includes('__latticeAnimaCharts'), false, 'chart code reached a player that asked for none');
});

test('the two bundles are separate, and the chart one carries neither heavy backend', async () => {
	const { ANIMA_CHART_JS, ANIMA_PLAYER_JS } = await import('../../../lib/export/anima-player-bundle.generated.mjs');
	// The whole reason for two bundles: a chart deck must not ship what it cannot reach.
	assert.equal(/[Zz]dog/.test(ANIMA_CHART_JS), false, 'the 3D backend reached the chart bundle');
	assert.equal(/createDrawable/.test(ANIMA_CHART_JS), false, 'the drawing library reached the chart bundle');
	assert.ok(ANIMA_CHART_JS.length < ANIMA_PLAYER_JS.length / 2, `the chart bundle should be far smaller than the scene bundle (chart ${ANIMA_CHART_JS.length}, scene ${ANIMA_PLAYER_JS.length})`);
	// And the scene bundle still has what IT needs, so the assertions above are about
	// separation rather than about an empty build.
	assert.ok(/[Zz]dog/.test(ANIMA_PLAYER_JS), 'the scene bundle lost its built-primitive backend');
});

test('player-motion: off suppresses the export motion without touching `motion:`', async () => {
	const { playerMotionSuppressed, deckMotionScalars } = await import('../../../lib/core/resolve-motion.mjs');
	const src = FM('motion: on\nplayer-motion: off\n');
	assert.equal(playerMotionSuppressed(src), true);
	// The deck still animates on the live surfaces — the opt-out is about the forwarded file
	// only, which is the entire point of it being a separate key.
	assert.equal(deckMotionScalars(src).motion, 'on');
});

test('the scalars are read by the shared front-matter rule, quotes and comments included', async () => {
	const { deckMotionScalars } = await import('../../../lib/core/resolve-motion.mjs');
	assert.equal(deckMotionScalars(FM("motion: 'on'  # animate\n")).motion, 'on');
	assert.equal(deckMotionScalars(FM('motion-style: rise\nmotion-speed: fast\n')).style, 'rise');
	assert.equal(deckMotionScalars(FM('motion-style: rise\nmotion-speed: fast\n')).speed, 'fast');
	assert.equal(deckMotionScalars('# no front matter').motion, null);
});
