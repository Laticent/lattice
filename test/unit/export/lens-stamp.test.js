/**
 * The contract for the article stamp — `data-lp-i`, the attribute a reader view uses to
 * hide the prose of a slide it does not show (lib/export/player-core.mjs).
 *
 * THIS IS THE HALF A BROWSER CANNOT SHOW CHEAPLY. `test/integration/export/lens-carrier.test.js`
 * drives the real cascade and would fail if the stamps were wrong — but it fails as
 * "slide 5 was visible", which is a symptom several bugs share. This pins the OWNERSHIP
 * rule directly, and specifically the direction: `projectDeckToProse` emits a slide's body
 * AFTER its heading and the optional kicker BEFORE it, so an element belongs to the last
 * heading at or before it, EXCEPT a kicker, which belongs to the heading it introduces.
 * The first cut walked backwards instead and filed every slide's body under the NEXT
 * slide — well-formed markup, and wrong for all but the last slide.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { buildArticle } = require('../../../lib/export/player-core.mjs');

/** A deck DOM of `n` slides, each with an eyebrow — the `.masthead-lede > p` the engine
 *  renders an eyebrow as, and what `projectDeckToProse` turns into the `.lp-kicker` this
 *  suite is about. Written as the ENGINE emits it, not as a plausible-looking shape: an
 *  invented `<p class="eyebrow">` produced no kicker at all and the assertion that was
 *  supposed to catch the ownership bug silently had nothing to check. */
function deckDom(n) {
	const sections = Array.from({ length: n }, (_, i) =>
		`<section data-lattice-slide="${i + 1}" id="${i + 1}" class="content">` +
		`<div class="cell-masthead"><div class="masthead-lede"><p><code>Kicker ${i}</code></p></div>` +
		`<h2>Heading ${i}</h2></div><div class="cell-stage"><p>Body ${i}.</p></div></section>`,
	).join('');
	return new JSDOM(`<!DOCTYPE html><html><body>${sections}</body></html>`).window.document;
}

/** Every top-level article element as [tagOrClass, owner]. */
function stamps(article) {
	const host = new JSDOM(`<div>${article}</div>`).window.document.body.firstChild;
	return [...host.children].map((el) => [el.className || el.tagName.toLowerCase(), el.getAttribute('data-lp-i')]);
}

test('every top-level article element is owned by the slide it came from', async () => {
	const { article } = await buildArticle(deckDom(3), true);
	const owned = stamps(article);
	assert.ok(owned.length >= 6, 'three slides project at least a heading and a body each');
	assert.ok(owned.every(([, i]) => i !== null), 'NO element is left unstamped — an unstamped one can never be hidden');
	// Owners only ever advance, and cover every slide.
	const seq = owned.map(([, i]) => Number(i));
	assert.deepEqual([...new Set(seq)], [0, 1, 2]);
	assert.deepEqual(seq, [...seq].sort((a, b) => a - b), 'ownership is monotonic in document order');
});

test('a body belongs to its OWN slide, not the next one', async () => {
	const { article } = await buildArticle(deckDom(3), true);
	const host = new JSDOM(`<div>${article}</div>`).window.document.body.firstChild;
	for (const h of [...host.querySelectorAll('[id^=lp-sec-]')]) {
		const i = /lp-sec-(\d+)/.exec(h.id)[1];
		assert.equal(h.getAttribute('data-lp-i'), i, 'a heading owns itself');
		// The element after a heading is that slide's body — the assertion the backwards
		// walk failed, silently, for every slide but the last.
		const next = h.nextElementSibling;
		if (next && !/^lp-sec-/.test(next.id || '') && !next.classList.contains('lp-kicker')) {
			assert.equal(next.getAttribute('data-lp-i'), i, `the body after lp-sec-${i} belongs to slide ${i}`);
		}
	}
});

test('a kicker belongs to the heading BELOW it, not the slide above', async () => {
	const { article } = await buildArticle(deckDom(3), true);
	const host = new JSDOM(`<div>${article}</div>`).window.document.body.firstChild;
	const kickers = [...host.querySelectorAll('.lp-kicker')];
	assert.ok(kickers.length >= 2, 'the fixture projects kickers');
	for (const k of kickers) {
		const heading = k.nextElementSibling;
		if (heading && /^lp-sec-\d+$/.test(heading.id || '')) {
			assert.equal(k.getAttribute('data-lp-i'), heading.getAttribute('data-lp-i'),
				'a kicker stranded on the previous slide shows above a hidden section');
		}
	}
});

test('the table of contents carries the same index, so it can be filtered too', async () => {
	const { toc } = await buildArticle(deckDom(3), true);
	assert.deepEqual([...toc.matchAll(/data-lp-i="(\d+)"/g)].map((m) => m[1]), ['0', '1', '2']);
});

test('without the flag, nothing is stamped — every other deck’s player is untouched', async () => {
	const { article, toc } = await buildArticle(deckDom(3));
	assert.ok(!article.includes('data-lp-i'), 'no stamps in the article');
	assert.ok(!toc.includes('data-lp-i'), 'and none in the table of contents');
});
