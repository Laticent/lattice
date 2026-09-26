const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// A deck segment's hash covers its emphasis spans, as the tour recorder's already does (LTT step 4,
// engineering/ltt.md §Staleness). Without them an emphasis-only edit left the hash unchanged, so the
// first isStale caller on a deck would have called a re-weighted slide fresh.

async function build(slides) {
	const { deckLtt } = await import('../../../lib/core/ltt-deck.mjs');
	const { ENGINE_HASH } = await import('@laticent/cadenza');
	return deckLtt({
		id: 't',
		slides,
		slideCount: slides.length,
		isSection: () => false,
		beats: { slide: 1400, section: 2200 },
		inputs: { pace: 'moderate' },
		voice: null,
		engine: ENGINE_HASH,
		sha256Hex: async (s) => createHash('sha256').update(s).digest('hex'),
		now: 0,
	});
}

test('emphasis is hashed with the slide text; a deck without it keeps its hashes', async () => {
	const { buildTrack } = await import('@laticent/cadenza');
	const { segmentHashInput } = await import('@laticent/ltt');
	const { ENGINE_HASH } = await import('@laticent/cadenza');
	const a = 'Revenue grew nine percent. Margins held.';
	const b = 'The outlook is steady.';
	const spans = [{ start: 0, end: 7, weight: 1.5 }];
	const slide = (text, emphasis) => ({ text, track: buildTrack(text, emphasis ? { emphasis } : {}), ...(emphasis ? { emphasis } : {}) });

	const plain = await build([slide(a), slide(b)]);
	// Byte-identical to the hash before this change: text and inputs only.
	const inputs = { engine: ENGINE_HASH, pace: 'moderate' };
	assert.equal(plain.segments[0].hash, `sha256:${createHash('sha256').update(segmentHashInput(a, inputs)).digest('hex')}`);
	const empty = await build([{ ...slide(a), emphasis: [] }, slide(b)]);
	assert.equal(empty.segments[0].hash, plain.segments[0].hash, 'no spans hashes as no emphasis');

	const weighted = await build([slide(a, spans), slide(b)]);
	const reweighted = await build([slide(a, [{ ...spans[0], weight: 2 }]), slide(b)]);
	assert.notEqual(weighted.segments[0].hash, plain.segments[0].hash, 'adding emphasis moves the slide hash');
	assert.notEqual(reweighted.segments[0].hash, weighted.segments[0].hash, 're-weighting one span moves it');
	assert.equal(reweighted.segments[1].hash, weighted.segments[1].hash, 'and only that slide moves');
	assert.equal(weighted.segments[1].hash, plain.segments[1].hash);
});

test('the exported player carries the spans through to its LTT hash', async () => {
	const { buildTrack } = await import('@laticent/cadenza');
	const { unpack } = await import('@laticent/ltt');
	const { buildPlayerHtml } = require('../../../lib/export/html-player.js');
	const docHtml = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><section data-lattice-slide="1" id="1" class="content"><h1>One</h1></section></body></html>';
	const text = 'Revenue grew nine percent. Margins held.';
	const hash = async (emphasis) => {
		const { html } = await buildPlayerHtml({ docHtml, source: '# One', title: 'T', now: 0, narration: { slides: [{ text, track: buildTrack(text, emphasis ? { emphasis } : {}), ...(emphasis ? { emphasis } : {}) }] } });
		return unpack(JSON.parse(/data-lp-ltt="">([\s\S]*?)<\/script>/.exec(html)[1])).segments[0].hash;
	};
	const none = await hash();
	assert.notEqual(await hash([{ start: 0, end: 7, weight: 1.5 }]), none);
	assert.equal(await hash([]), none);
});
