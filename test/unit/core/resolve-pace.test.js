const test = require('node:test');
const assert = require('node:assert/strict');

let PACE_NAMES, DEFAULT_PACE, isKnownPace, frontMatterPace, resolvePaceName;
test.before(async () => {
	// ESM from a CommonJS test — see the module's own header for why it is ESM.
	({ PACE_NAMES, DEFAULT_PACE, isKnownPace, frontMatterPace, resolvePaceName } = await import('../../../lib/core/resolve-pace.mjs'));
});

// The deck front-matter `pace:` register (#1399). The beat itself shipped in #1352 as a
// workspace preference, which made the rhythm a property of the machine doing the playing —
// so an author's directorial choice was lost the moment the deck left their machine. These
// pin where the value comes from, which is the whole change.

test('frontMatterPace reads a declared pace from the leading block', () => {
	assert.equal(frontMatterPace('---\ntheme: cuoio\npace: deliberate\n---\n\n# Q4'), 'deliberate');
	assert.equal(frontMatterPace('---\npace: brisk\n---\n'), 'brisk');
	assert.equal(frontMatterPace('---\npace: "natural"\n---\n'), 'natural');
	assert.equal(frontMatterPace('---\nPACE:  Deliberate  \n---\n'), null, 'the key itself is case-sensitive, like every other register');
	assert.equal(frontMatterPace('---\npace:  DELIBERATE  \n---\n'), 'deliberate', 'the VALUE is not');
});

test('an absent, unknown or unfenced pace reads as null', () => {
	assert.equal(frontMatterPace('---\ntheme: cuoio\n---\n'), null);
	assert.equal(frontMatterPace('---\npace: slowly\n---\n'), null, 'a typo must not silently coerce to the default');
	assert.equal(frontMatterPace(''), null);
	assert.equal(frontMatterPace(null), null);
	// No fence means no front matter: the word appearing in prose is not a declaration.
	assert.equal(frontMatterPace('# A talk about pace: deliberate delivery'), null);
});

test('CRLF and a BOM do not hide the register', () => {
	assert.equal(frontMatterPace('---\r\npace: brisk\r\n---\r\n'), 'brisk');
	assert.equal(frontMatterPace('﻿---\npace: brisk\n---\n'), 'brisk');
});

test('resolution order: deck beats the workspace preset, which beats the default', () => {
	// The acceptance criterion in its own words: a deck declaring `deliberate` presents at
	// that pace on a machine whose stored preference is `brisk`.
	assert.equal(resolvePaceName('deliberate', 'brisk'), 'deliberate');
	// A deck that declares nothing takes the viewer's preset — which is what makes the preset
	// a DEFAULT rather than an override.
	assert.equal(resolvePaceName(null, 'brisk'), 'brisk');
	// And with neither, the shipped default.
	assert.equal(resolvePaceName(null, null), DEFAULT_PACE);
	assert.equal(resolvePaceName(undefined, undefined), 'natural');
	// Garbage on either side falls through rather than throwing or sticking.
	assert.equal(resolvePaceName('slowly', 'brisk'), 'brisk');
	assert.equal(resolvePaceName('slowly', 'faster'), DEFAULT_PACE);
});

test('isKnownPace is the shared predicate the linter and the resolver agree on', () => {
	for (const n of PACE_NAMES) assert.ok(isKnownPace(n), `${n} is a registered pace`);
	assert.ok(isKnownPace('  Natural  '));
	assert.ok(!isKnownPace('moderate'), 'the word-rate axis is a DIFFERENT vocabulary — see the pace-names test');
	assert.ok(!isKnownPace(''));
	assert.ok(!isKnownPace(null));
	assert.ok(!isKnownPace(2200));
});
