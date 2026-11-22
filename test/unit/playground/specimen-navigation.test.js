/**
 * Unit: the specimen's "open in the Playground" navigation (docs/src/playground/specimen.js).
 *
 * It used to navigate to `data.playgroundUrl`, read from the `#specimen-data` JSON island, which is
 * DOM text: CodeQL's js/xss-through-dom followed it into `window.location.href` (#1958 §2, §7). The
 * route is fixed, so specimen.js now builds it from the site base, and the island no longer carries
 * it. Pinned at the source: specimen.js imports CodeMirror, which this suite cannot load.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('specimen.js navigates only to a URL it builds itself', () => {
	const src = read('docs/src/playground/specimen.js');
	const navigations = src.match(/location\.href\s*=\s*[^;]+;/g) ?? [];
	assert.deepEqual(navigations, ['location.href = PLAYGROUND_HREF;']);
	assert.match(src, /const PLAYGROUND_HREF = joinBase\(import\.meta\.env\.BASE_URL \|\| '\/', 'playground\/'\);/);
});

test('the specimen-data island carries no navigation target', () => {
	assert.doesNotMatch(read('docs/src/components/Specimen.astro'), /playgroundUrl/);
	assert.doesNotMatch(read('docs/src/playground/specimen.js'), /playgroundUrl/);
});
