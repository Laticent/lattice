/**
 * Unit: the `.backdrop` injector walks SLIDES, not open tags (followup 2329-p3).
 *
 * `applyBackdropToHtml` (lib/core/backdrop.js) used to find sections with a global
 * `<section…>` regex. That stamped a wrapper inside an HTML comment that merely QUOTED a
 * finish section, and inside a `<section class="finish">` an author nested in a slide. It
 * now walks top-level sections through `mapSections`, and its DOM twin (`injectBackdrops`
 * in lib/runtime/index.js) skips nested sections the same way. The parity arm below runs
 * the twin's own source in jsdom over the same fixtures, so the two paths cannot drift apart
 * without a red test.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { applyBackdropToHtml } = require('../../../lib/core/backdrop');
const { sectionIsFinish } = require('../../../lib/core/resolve-finish');

const BACKDROP = '<div class="backdrop" aria-hidden="true"><i class="backdrop-mask"></i></div>';
const count = (s) => (s.match(/class="backdrop"/g) || []).length;

const QUOTED = '<!-- an example: <section class="title finish"><h1>x</h1></section> -->';
const NESTED = '<section class="demo finish-atrium"><p>inner</p></section>';

describe('backdrop injector: top-level sections only', () => {
	test('a finish section quoted in an HTML comment keeps the comment byte-identical', () => {
		const doc = `<section class="content finish">${QUOTED}<p>x</p></section>`;
		const out = applyBackdropToHtml(doc);
		assert.ok(out.includes(QUOTED), `the comment was rewritten: ${out}`);
		assert.equal(out, `<section class="content finish">${BACKDROP}${QUOTED}<p>x</p></section>`);
	});

	test('a comment quoting a finish section BETWEEN slides is left alone, and both slides still get one wrapper', () => {
		const doc = `<section class="a finish"><p>1</p></section>${QUOTED}<section class="b finish"><p>2</p></section>`;
		const out = applyBackdropToHtml(doc);
		assert.ok(out.includes(QUOTED), `the comment was rewritten: ${out}`);
		assert.equal(count(out), 2);
	});

	test('a finish section nested inside a slide is not a slide, and gets no wrapper or class', () => {
		const doc = `<section class="content"><p>x</p>${NESTED}</section>`;
		assert.equal(applyBackdropToHtml(doc), doc);
	});

	test('a finish slide with a nested finish section gets exactly one wrapper, as its first child', () => {
		const doc = `<section class="content finish"><p>x</p>${NESTED}</section>`;
		const out = applyBackdropToHtml(doc);
		assert.equal(out, `<section class="content finish">${BACKDROP}<p>x</p>${NESTED}</section>`);
	});
});

// The DOM twin, lifted out of the runtime source rather than re-typed here, so this arm tests
// the function that ships.
function runtimeInjectBackdrops() {
	const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'runtime', 'index.js'), 'utf8');
	const start = src.indexOf('function injectBackdrops()');
	assert.notEqual(start, -1, 'lib/runtime/index.js must still define injectBackdrops');
	let depth = 0;
	let end = src.indexOf('{', start);
	for (; end < src.length; end++) {
		if (src[end] === '{') depth++;
		else if (src[end] === '}' && --depth === 0) break;
	}
	return (document) => new Function('document', 'sectionIsFinish', `${src.slice(start, end + 1)}\ninjectBackdrops();`)(document, sectionIsFinish);
}

describe('backdrop injector: the DOM twin agrees', () => {
	const inject = runtimeInjectBackdrops();
	for (const [name, doc] of [
		['nested finish in a plain slide', `<section class="content"><p>x</p>${NESTED}</section>`],
		['nested finish in a finish slide', `<section class="content finish"><p>x</p>${NESTED}</section>`],
		['a preset-only slide', '<section class="title finish-atrium"><h1>x</h1></section>'],
	]) {
		test(`${name}: the string and DOM paths wrap the same sections`, () => {
			const wrapped = (document) => [...document.querySelectorAll('section')].map((s) => [s.className, !!s.querySelector(':scope > .backdrop')]);
			const fromString = new JSDOM(`<body>${applyBackdropToHtml(doc)}</body>`).window.document;
			const live = new JSDOM(`<body>${doc}</body>`).window.document;
			inject(live);
			assert.deepEqual(wrapped(live), wrapped(fromString));
		});
	}
});

// Deliberate, not an accident: a never-closed `<section>` ends the walk, so nothing after it is
// wrapped (the old regex stamped every finish open tag). That deck is already broken on every
// path — every other `mapSections` pass stops at the same byte, and the DOM nests the later
// slides inside the unclosed one. This arm makes the choice visible; change it only on purpose.
test('an author section left unclosed ends the walk: nothing after it is wrapped, the bytes pass through', () => {
	const doc = '<section class="a finish"><section class="note"><p>1</p></section><section class="b finish"><p>2</p></section>';
	assert.equal(applyBackdropToHtml(doc), doc);
});
