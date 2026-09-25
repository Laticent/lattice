const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { OUT, engineSources, engineHashModule, timingEngineHash } = require('../../../tools/lib/timing-engine-hash.js');

// `inputs.engine` is how an LTT reader tells an estimate built by an older engine from one built by
// this one (engineering/ltt.md §Staleness). A stale constant would stamp new files with the old
// engine's hash, and every reader would trust an estimate it should rebuild.
test('the committed engine hash matches the Cadenza and ltt sources', () => {
	assert.equal(
		fs.readFileSync(OUT, 'utf8'),
		engineHashModule(),
		'docs/src/lib/cadenza/engine-hash.ts is stale — run `npm run engine-hash:build` and commit it',
	);
});

test('the hash covers what computes an estimate, and nothing that only reads one', () => {
	const files = engineSources();
	for (const f of ['track.ts', 'cadence.ts', 'normalize.ts', 'segment.ts', 'lexicon.ts', 'symbols.ts']) {
		assert.ok(files.includes(`docs/src/lib/cadenza/${f}`), `${f} computes the estimate`);
	}
	for (const f of ['docs/src/lib/cadenza/cursor.ts', 'docs/src/lib/cadenza/vtt.ts', 'docs/src/lib/cadenza/engine-hash.ts', 'docs/src/lib/ltt/validate.ts']) {
		assert.ok(!files.includes(f), `${f} does not change an estimate`);
	}
	assert.ok(!files.some((f) => f.endsWith('.test.ts')));
	assert.match(timingEngineHash(), /^sha256:[0-9a-f]{64}$/);
});
