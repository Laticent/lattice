const test = require('node:test');
const assert = require('node:assert/strict');

// The `greeting:` / `closing:` registers (lib/core/resolve-bookends.mjs) and the clock that picks
// the greeting (engineering/decisions/2026-09-27-narration-bookends.md §3–§4).

let m;
test.before(async () => {
	m = await import('../../../lib/core/resolve-bookends.mjs');
});

const deck = (fm) => `---\n${fm}\n---\n\n# Slide\n`;

test('greetingPeriod: morning from 04:00, afternoon from 12:00, evening from 17:00 — and never night', () => {
	const want = (h) => (h >= 4 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : 'evening');
	for (let h = 0; h < 24; h++) assert.equal(m.greetingPeriod(h), want(h), `${h}:00`);
	assert.equal(m.greetingPeriod(3), 'evening', '3 a.m. is still "good evening": "good night" is a farewell');
	assert.equal(m.greetingPeriod(Number.NaN), 'neutral', 'a clock that cannot be read never guesses');
	assert.equal(m.greetingPeriod(undefined), 'neutral');
	assert.equal(m.greetingPeriod(28), 'morning', 'wraps past 24');
});

test('resolveBookends: absent, off and on', () => {
	assert.deepEqual(m.resolveBookends(deck('title: T')), { greeting: null, closing: null }, 'off when absent');
	assert.deepEqual(m.resolveBookends('# no front matter\ngreeting: true'), { greeting: null, closing: null }, 'only front matter counts');
	for (const off of ['false', 'off', 'no', 'none', 'False', '', '# todo']) {
		assert.equal(m.resolveBookends(deck(`greeting: ${off}`)).greeting, null, `greeting: ${off}`);
	}
	for (const on of ['true', 'yes', 'on', 'TRUE', 'true  # always']) {
		assert.deepEqual(m.resolveBookends(deck(`greeting: ${on}\nclosing: ${on}`)), { greeting: { template: '{greeting}.' }, closing: { text: 'Thank you.' } }, on);
	}
});

test('resolveBookends: custom text, quoted, escaped and commented', () => {
	const r = m.resolveBookends(deck('greeting: "{greeting}, and welcome to the Q3 review."\nclosing: Thank you. Questions are welcome.'));
	assert.equal(r.greeting.template, '{greeting}, and welcome to the Q3 review.');
	assert.equal(r.closing.text, 'Thank you. Questions are welcome.');
	assert.equal(m.resolveBookends(deck('closing: "true"')).closing.text, 'true', 'a QUOTED "true" is text the author typed');
	assert.equal(m.resolveBookends(deck('closing: "Say \\"cheers\\""')).closing.text, 'Say "cheers"', 'YAML escapes unfold');
	assert.equal(m.resolveBookends(deck('closing: "It\'s been a pleasure."')).closing.text, "It's been a pleasure.", 'an apostrophe rides in double quotes');
	assert.equal(m.resolveBookends(deck('closing: Thanks  # keep it short')).closing.text, 'Thanks', 'a trailing comment is not spoken');
	assert.equal(m.resolveBookends(deck('pptx:\n  greeting: true')).greeting, null, 'a nested key is not this register');
});

test('greetingText expands every {greeting} and leaves any other placeholder as written', () => {
	assert.equal(m.greetingText('{greeting}.', 'morning'), 'Good morning.');
	assert.equal(m.greetingText('{greeting}! {greeting}!', 'evening'), 'Good evening! Good evening!');
	assert.equal(m.greetingText('{greeting}, {audience}.', 'neutral'), 'Hello, {audience}.');
	assert.deepEqual(m.greetingVariants('{greeting}.'), { morning: 'Good morning.', afternoon: 'Good afternoon.', evening: 'Good evening.', neutral: 'Hello.' });
});

test('front-matter-scalar-parity: resolve-bookends.mjs mirrors the shared scalar rule', () => {
	// The mirror exists for the ESM/Rollup reason in the module's header, so this is its sync gate
	// (SANCTIONED_FM_SCALAR_READERS in tools/check-ownership.js names it).
	const { frontMatterScalar } = require('../../../lib/core/front-matter-key');
	const SHAPES = ['Hello there', 'Hello  # note', 'Hello\t# tabbed', "'Hello'", '"Hello"', 'Hello.', '#hash', 'a#b', '"unterminated', '', '   '];
	for (const shape of SHAPES) {
		assert.equal(m.bookendLine(deck(`closing: ${shape}`), 'closing')?.value ?? '', frontMatterScalar(shape), `closing: ${JSON.stringify(shape)}`);
	}
});

test('lint: findBookendIssues flags a hard-coded time of day, a stray placeholder and a non-English salutation', () => {
	const { findBookendIssues } = require('../../../lib/authoring/lint-core');
	const rules = (fm) => findBookendIssues(deck(fm)).map((f) => f.rule);
	assert.deepEqual(rules('greeting: Good morning, everyone.'), ['greeting-hardcoded-period']);
	assert.deepEqual(rules('greeting: "{greeting}, and good evening to our guests."'), ['greeting-hardcoded-period']);
	assert.deepEqual(rules('greeting: "{greeting}, {audience}."'), ['unknown-bookend-placeholder']);
	assert.deepEqual(rules('closing: "Thanks, {name}."'), ['unknown-bookend-placeholder'], 'the closing expands nothing');
	assert.deepEqual(rules('greeting: true\nlang: fr'), ['greeting-not-english'], '`true` speaks "{greeting}." too');
	assert.deepEqual(rules('greeting: "Bonjour."\nlang: fr'), [], 'custom text in the deck language is fine');
	assert.deepEqual(rules('greeting: true\nlang: en-GB\nclosing: true'), []);
	assert.deepEqual(rules('greeting: false\nclosing: off'), []);
	assert.deepEqual(rules('greeting: "{greeting}, and welcome."\nclosing: Good night and thank you.'), [], 'a closing may say good night');
});

test('lint-parse-parity: lint-core reads greeting:/closing: exactly as the resolver does', () => {
	// lint-core.js is CommonJS and cannot import the ESM resolver, so it carries a copy
	// (`readBookendKeys`). This is the seam that keeps the two from drifting.
	const { readBookendKeys } = require('../../../lib/authoring/lint-core');
	const SHAPES = ['true', 'TRUE', 'yes', 'on', 'false', 'off', 'no', 'none', '', '# todo', 'true  # c', '"true"', "'off'", 'Hello there', 'Hello  # note', '"{greeting}, all."', '"Say \\"hi\\""', '"a\\\\b"', "'single'", '"unterminated', '#hash', 'a#b', '"  padded  "'];
	for (const shape of SHAPES) {
		for (const key of ['greeting', 'closing']) {
			const src = deck(`${key}: ${shape}`);
			assert.deepEqual(readBookendKeys(src), m.resolveBookends(src), `${key}: ${JSON.stringify(shape)}`);
		}
	}
	assert.deepEqual(readBookendKeys('﻿---\r\ngreeting: true\r\n---\r\n# S'), m.resolveBookends('﻿---\r\ngreeting: true\r\n---\r\n# S'), 'BOM and CRLF');
});
