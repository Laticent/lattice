/**
 * A component's manifest `spectrum` answer (lib/core/component-spectrum.js): none, a pinned style, or the default.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { applyComponentSpectrum } = require('../../../lib/core/component-spectrum');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const catalog = { quiet: false, loud: 'solid', rainbow: 'on' };

describe('applyComponentSpectrum', () => {
	test('a component with no entry keeps its class list untouched (same array)', () => {
		const cur = ['kpi', 'spectrum-edge-left', 'spectrum-solid'];
		assert.equal(applyComponentSpectrum(cur, catalog), cur);
	});

	test('spectrum: false drops the author\'s spectrum classes and turns the bar off', () => {
		const out = applyComponentSpectrum(['quiet', 'spectrum-edge-left', 'spectrum-duo', 'dark'], catalog);
		assert.deepEqual(out, ['quiet', 'dark', 'spectrum-off', 'spectrum-edge-off']);
	});

	test('a style name pins the style and leaves the placement to the author', () => {
		const out = applyComponentSpectrum(['loud', 'spectrum-edge-left', 'spectrum-mono'], catalog);
		assert.deepEqual(out, ['loud', 'spectrum-edge-left', 'spectrum-solid']);
	});

	test('"on" pins the rainbow: it removes an author style and adds no token', () => {
		assert.deepEqual(applyComponentSpectrum(['rainbow', 'spectrum-off'], catalog), ['rainbow']);
	});

	test('it never removes a component name, and running twice changes nothing', () => {
		for (const name of ['quiet', 'loud', 'rainbow']) {
			const once = applyComponentSpectrum([name, 'spectrum-edge-bottom'], catalog);
			assert.ok(once.includes(name), name);
			assert.deepEqual(applyComponentSpectrum(once, catalog), once, `${name} idempotent`);
		}
	});
});

describe('the field reaches both render paths and the contract', () => {
	test('schema, generator, engine plugin list, Marp ledger and runtime all carry it', () => {
		assert.match(read('lib/components/manifest.schema.json'), /"spectrum": \{/);
		assert.match(read('tools/build-stage-catalog.js'), /spectrum-catalog\.generated\.js/);
		assert.match(read('lib/engine/index.js'), /componentSpectrum,/);
		assert.match(read('lib/core/marp-fidelity.js'), /plugin: 'componentSpectrum'/);
		assert.match(read('lib/runtime/index.js'), /applyComponentSpectrum\(cur\)/);
	});

	test('the shipped catalog only names real components with a valid answer', () => {
		const cat = require('../../../lib/core/spectrum-catalog.generated.js');
		const { loadAll } = require('../../../lib/components');
		const names = new Set(loadAll().map((m) => m.name));
		for (const [name, answer] of Object.entries(cat)) {
			assert.ok(names.has(name), name);
			assert.ok(answer === false || ['on', 'solid', 'duo', 'mono'].includes(answer), name);
		}
	});
});
