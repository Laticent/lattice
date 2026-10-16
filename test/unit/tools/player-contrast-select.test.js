const test = require('node:test');
const assert = require('node:assert/strict');

// Which galleries does a diff send to the player-contrast sweep? The selector's one job is to
// never MISS a gallery a change could move, so most of these arms are about the default: an
// unclassified path selects everything.
const { selectGalleries, readGalleries, NON_RENDER } = require('../../../tools/player-contrast-select.js');

const G = [
	{ file: 'lib/components/chart/bar/bar.gallery.md', dir: 'lib/components/chart/bar/', theme: 'indaco' },
	{ file: 'lib/components/chart/line/line.gallery.md', dir: 'lib/components/chart/line/', theme: 'indaco' },
	{ file: 'lib/components/statement/quote/quote.gallery.md', dir: 'lib/components/statement/quote/', theme: 'cuoio' },
];
const pick = (changed, opts) => selectGalleries(changed, G, opts).files;

test('--full selects every gallery whatever changed', () => {
	assert.equal(pick([], { full: true }).length, 3);
});

test('a change under a component selects that gallery only', () => {
	assert.deepEqual(pick(['lib/components/chart/bar/bar.styles.css']), ['lib/components/chart/bar/bar.gallery.md']);
	assert.deepEqual(pick(['lib/components/chart/bar/bar.styles.css', 'lib/components/chart/line/line.transform.js']).length, 2);
});

test('a theme selects the galleries on it and on its dark or light partner', () => {
	assert.deepEqual(pick(['themes/indaco/indaco.css']).length, 2);
	assert.deepEqual(pick(['themes/indaco-dark/indaco-dark.css']).length, 2, 'the player toggles between the pair, so both are scored');
	assert.deepEqual(pick(['themes/cuoio/cuoio.css']), ['lib/components/statement/quote/quote.gallery.md']);
	assert.deepEqual(pick(['themes/mustard/mustard.css']), [], 'no gallery is on mustard');
});

test('an unclassified path selects EVERY gallery — the default is the safe direction', () => {
	for (const p of ['lib/core/anything.js', 'lib/base/base.treatments.css', 'lattice.js', 'package-lock.json', 'lib/samples/a.png', 'lib/authoring/lint-core.js', 'tools/check-player-contrast.js', 'tools/check-slide-contrast.js', 'tools/player-contrast-select.js', 'lib/components/chart/shared.css']) {
		assert.equal(pick([p]).length, 3, `${p} must select all`);
	}
});

test('paths that cannot change a player select nothing', () => {
	for (const p of ['docs/src/x.astro', 'engineering/workflow.md', 'test/unit/a.test.js', 'changelog.d/a.fixed.md', 'followups.d/a.md', 'examples/a.md', '.github/workflows/ci.yml', 'README.md', 'lib/authoring/README.md', 'lib/components/chart/bar/bar.docs.md', 'tools/check-ownership.js', 'lib/conformance/run.js', 'lib/playground/index.js', 'themes/README.md', 'backlog.d/1.md']) {
		assert.deepEqual(pick([p]), [], `${p} must select nothing`);
	}
});

test('a gallery is a deck, not prose: editing one selects it', () => {
	assert.deepEqual(pick(['lib/components/chart/bar/bar.gallery.md']), ['lib/components/chart/bar/bar.gallery.md']);
});

test('one unclassified path among harmless ones still selects everything', () => {
	assert.equal(pick(['docs/a.md', 'lib/core/x.js', 'changelog.d/a.fixed.md']).length, 3);
});

test('the real tree: 75 galleries, each owned by a directory that exists', () => {
	const real = readGalleries();
	assert.ok(real.length >= 75, `only ${real.length} galleries`);
	for (const g of real) assert.match(g.file, /^lib\/components\/[^/]+\/([^/]+)\/\1\.gallery\.md$/);
	assert.ok(real.every((g) => g.theme), 'every gallery resolves a theme (default indaco)');
	assert.ok(NON_RENDER.length > 0);
});
