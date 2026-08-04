const test = require('node:test');
const assert = require('node:assert/strict');

const { JSDOM } = require('jsdom');
const { buildEnvelope, parseEnvelope } = require('../../../lib/core/lattice-doc');
const { frontMatterBlock, readBakedFrontMatter } = require('../../../lib/core/deck-front-matter');
let frontMatterPace;
test.before(async () => {
	({ frontMatterPace } = await import('../../../lib/core/resolve-pace.mjs'));
});

// A deck's declared pace has to SURVIVE LEAVING THE MACHINE (#1399). That is the entire
// argument for making it a front-matter register rather than a workspace preference, so it is
// worth pinning at the two boundaries an artifact crosses — even now, while no shipped export
// surface can actually speak (that is #1393). A pace silently dropped on the way out would be
// the same defect in a new place.

const SOURCE = ['---', 'theme: cuoio', 'pace: deliberate', 'lang: en-GB', '---', '', '# Q4 Board Update', '', 'Growth held.'].join('\n');

test('the declared pace survives the .lattice envelope round-trip, byte-exact', () => {
	const html = buildEnvelope({ source: SOURCE, title: 'Q4 Board Update' });
	const back = parseEnvelope(html);
	assert.equal(back.source, SOURCE, 'the envelope carries the source verbatim');
	assert.equal(frontMatterPace(back.source), 'deliberate', 'and the pace is still readable out the other side');
});

test('the declared pace survives the baked front-matter data block', () => {
	// The other carrier: the export bakes the YAML into the document as an
	// `application/lattice-front-matter` block, which is what a re-opened artifact reads.
	const baked = frontMatterBlock(SOURCE);
	// `readBakedFrontMatter` reads a real Document (it walks the block element), so give it one.
	const back = readBakedFrontMatter(new JSDOM(`<section>${baked}</section>`).window.document);
	assert.match(back, /pace:\s*deliberate/, 'the baked block still carries the register');
	assert.equal(frontMatterPace(`---\n${back}\n---\n`), 'deliberate');
});

test('a deck that declares no pace bakes none — absence round-trips as absence', () => {
	const plain = ['---', 'theme: cuoio', '---', '', '# Q4'].join('\n');
	const back = parseEnvelope(buildEnvelope({ source: plain, title: 'Q4' }));
	assert.equal(frontMatterPace(back.source), null, 'nothing is invented on the way out');
});
