const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyPath, NON_RENDER } = require('../../../lib/conformance/changed-paths');
const { selectGalleries } = require('../../../tools/player-contrast-select');

test('classifyPath: one answer for a component file, a theme, prose, a shared sheet and the rest', () => {
	assert.deepEqual(classifyPath('lib/components/inventory/actors/actors.styles.css'), { kind: 'component', name: 'actors' });
	assert.deepEqual(classifyPath('lib/components/inventory/actors/actors.gallery.md'), { kind: 'component', name: 'actors' });
	assert.deepEqual(classifyPath('lib/components/actors/actors.manifest.json'), { kind: 'component', name: 'actors' }, 'flat layout');
	assert.deepEqual(classifyPath('themes/indaco/indaco.css'), { kind: 'theme', name: 'indaco' });
	assert.deepEqual(classifyPath('lib/components/inventory/actors/actors.docs.md'), { kind: 'non-render' }, 'prose cannot change a render');
	assert.deepEqual(classifyPath('engineering/decisions/x.md'), { kind: 'non-render' });
	assert.deepEqual(classifyPath('lib/components/chart/_chart-family/marks.generated.css'), { kind: 'other' }, 'a shared folder is nobody\'s component');
	assert.deepEqual(classifyPath('lib/core/resolve-cards.js'), { kind: 'other' });
});

test('the selector and the render tier read the same classification', () => {
	const galleries = [{ file: 'lib/components/inventory/actors/actors.gallery.md', dir: 'lib/components/inventory/actors/', theme: 'indaco' }];
	assert.deepEqual(selectGalleries(['lib/components/inventory/actors/actors.styles.css'], galleries).files, [galleries[0].file]);
	assert.equal(selectGalleries(['lib/core/resolve-cards.js'], galleries).files.length, 1, 'an unclassified path selects every gallery');
	assert.ok(NON_RENDER.length > 0);
});
