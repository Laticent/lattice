/**
 * The reader-view hole's hiding rule may not depend on anything a deck can change. #2053.
 *
 * A withheld slide ships as an empty section carrying `lens-hole`, and one CSS rule is what keeps
 * it off the page. If that rule loses, the hole renders as a live empty slide and the artifact
 * discloses the withheld POSITIONS as blank pages — the deck's length and which slides were held
 * back, which is the one thing the projection exists to prevent.
 *
 * WHAT THIS PINS IS THE SELECTOR, NOT A RENDER, and the distinction is the point. The rule used to
 * read `section.form.lens-hole`, which was the cheapest way to out-specify the stage rule it has to
 * beat. `.form` is not intrinsic — `formToggleClass` adds it, and a deck can decline it — so the
 * hiding of a withheld slide rested on a class the deck controls. An integration arm that renders
 * one such deck and checks the page count would pin that deck's behavior; this pins the property,
 * and it does not certify any particular deck configuration as supported.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RULE_FILE = path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.lens-hole.css');

describe('the reader-view hole rule', () => {
	test('hides `lens-hole` without naming any other class', () => {
		// Comments out first: this file's own header explains the rule at length, and the word
		// `lens-hole` in that prose is not a selector.
		const css = fs.readFileSync(RULE_FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
		const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
		const hole = rules.filter((r) => r.sel.includes('lens-hole'));
		assert.equal(hole.length, 1, 'exactly one rule hides the hole');
		assert.match(hole[0].body, /display:\s*none/, 'and it hides it');
		// The selector may name the element and the hole class, and nothing else. A second class —
		// `.form`, a component, a finish — is something a deck can withhold, and then so is the
		// hiding. `:not(...)` counts as naming one too, so the test reads the whole selector.
		const classes = [...hole[0].sel.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
		assert.deepEqual(classes, ['lens-hole'], `the selector names only the hole class, saw: ${hole[0].sel}`);
	});

	test('is bundled, and last, so nothing after it can outrank it', () => {
		const build = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'tools', 'build-css.js'), 'utf8');
		const tail = build.slice(build.indexOf('const TAIL_SOURCES'));
		const list = tail.slice(0, tail.indexOf('];'));
		const sources = [...list.matchAll(/'(lib\/[^']+\.css)'/g)].map((m) => m[1]);
		assert.ok(sources.includes('lib/base/base.lens-hole.css'), 'the rule is in the bundle at all');
		assert.equal(sources[sources.length - 1], 'lib/base/base.lens-hole.css', 'and it is the last source');
	});
});
