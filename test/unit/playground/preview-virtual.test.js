/**
 * Unit: preview-virtual.js — the pure, DOM-free kernel behind the Drawing
 * Board's incremental preview.
 *
 * Proves slide splitting from marp's flat `<section>` output and the per-slide
 * diff (which slides changed + whether the count changed) — the two pieces the
 * patch path uses to replace only the <section> nodes whose HTML changed.
 *
 * DOM-free module → tested directly, no iframe / browser. The iframe controller
 * that consumes it lives in drawing-board.astro and is verified interactively.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
	return import('../../../docs/src/playground/preview-virtual.js');
}

describe('splitSections', () => {
	// It used to pair each `<section …>` with the next literal `</section>`. A close tag quoted in
	// an HTML comment ended the slide there, and the truncated string was what the preview patched
	// in. It walks the engine's own `splitSections` now (HARD RULE #1).
	test('a </section> quoted in a comment, or a nested section, does not cut the slide short', async () => {
		const { splitSections } = await load();
		const one = '<section id="1"><p>a</p><!-- </section> --><p>b</p></section>';
		const nested = '<section id="2"><section class="x">in</section><p>after</p></section>';
		assert.deepEqual(splitSections(`${one}\n${nested}<section id="3">c</section>`), [one, nested, '<section id="3">c</section>']);
	});

	// Found by the independent checker on the first cut: a section that never closes (an author
	// half-way through typing `<section class="x">`) sent everything from it to the walker's
	// trailing gap, the split returned no piece for it, and `patchSections` emptied the preview.
	// A browser runs the open section to the end of the document, so the split does too.
	test('a section that never closes runs to the end of the document, as in the DOM', async () => {
		const { splitSections } = await load();
		const tail = '<section id="2">A <section class="x"> typing</section><section id="3">c</section>';
		assert.deepEqual(splitSections(`<section id="1">a</section>${tail}`), ['<section id="1">a</section>', tail]);
		assert.deepEqual(splitSections('<section/><p>x</p>'), ['<section/><p>x</p>']);
	});

	test('splits a flat <section> sequence and ignores trailing wrapper/script', async () => {
		const { splitSections } = await load();
		const html =
			'<div class="lattice">' +
			'<section id="1"><h1>One</h1></section>\n' +
			'<section id="2" class="cards-grid"><h2>Two</h2></section>\n' +
			'<section id="3"><h2>Three</h2></section>' +
			'<script>/* marp polyfill */</script></div>';
		const secs = splitSections(html);
		assert.equal(secs.length, 3);
		assert.match(secs[0], /^<section id="1">/);
		assert.match(secs[0], /<\/section>$/);
		assert.ok(secs[1].includes('class="cards-grid"'));
		assert.ok(!secs[2].includes('<script>'), 'trailing script is not captured');
	});

	test('empty / missing input → empty array', async () => {
		const { splitSections } = await load();
		assert.deepEqual(splitSections(''), []);
		assert.deepEqual(splitSections(null), []);
		assert.deepEqual(splitSections('<div>no slides</div>'), []);
	});

	test('round-trips slide count for many slides', async () => {
		const { splitSections } = await load();
		let html = '<div class="lattice">';
		for (let i = 0; i < 250; i++) html += `<section id="${i + 1}"><h2>S${i}</h2></section>\n`;
		html += '</div>';
		assert.equal(splitSections(html).length, 250);
	});
});

describe('diffSections', () => {
	test('reports only the changed indices, no count change', async () => {
		const { diffSections } = await load();
		const prev = ['<section>a</section>', '<section>b</section>', '<section>c</section>'];
		const next = ['<section>a</section>', '<section>B!</section>', '<section>c</section>'];
		const d = diffSections(prev, next);
		assert.deepEqual(d.changed, [1]);
		assert.equal(d.countChanged, false);
		assert.equal(d.count, 3);
	});

	test('an inserted slide is a count change and shifts everything after it', async () => {
		const { diffSections } = await load();
		const prev = ['<section>a</section>', '<section>b</section>'];
		const next = ['<section>a</section>', '<section>NEW</section>', '<section>b</section>'];
		const d = diffSections(prev, next);
		assert.equal(d.countChanged, true);
		assert.equal(d.count, 3);
		assert.deepEqual(d.changed, [1, 2]); // index 1 differs, index 2 is new vs undefined
	});

	test('identical renders → nothing changed', async () => {
		const { diffSections } = await load();
		const a = ['<section>x</section>', '<section>y</section>'];
		const d = diffSections(a, a.slice());
		assert.deepEqual(d.changed, []);
		assert.equal(d.countChanged, false);
	});

	test('null prev (first render) → every slide is new', async () => {
		const { diffSections } = await load();
		const d = diffSections(null, ['<section>a</section>', '<section>b</section>']);
		assert.deepEqual(d.changed, [0, 1]);
		assert.equal(d.countChanged, true);
	});
});
