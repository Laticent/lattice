/**
 * Unit: lib/core/mermaid-fences.js — the one pattern that says "this is a Mermaid fence".
 *
 * The module exists because two paths used to carry their own copy of the same regex and
 * only one of them was ever going to get widened. The arms below are in two halves:
 *
 *   1. TILDES ARE FENCES TOO. markdown-it emits `class="language-mermaid"` for `~~~mermaid`
 *      exactly as it does for ```` ```mermaid ````, so the live preview has always rendered
 *      one — but `preprocessMermaid` substituted only the backtick form, and a tilde fence
 *      therefore reached the exported PDF as raw source. This is the gap the note's §7
 *      logged and this module closes.
 *   2. NO LOOSER THAN THE REGEX IT REPLACES. The widening has to be tildes and nothing else,
 *      because every other relaxation is an export-bytes change nobody asked for. The
 *      backtick arms below are the old behavior, asserted so a later "tidy-up" of the
 *      pattern cannot quietly broaden what the CLI substitutes.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { matchMermaidFences, firstMermaidFenceBody, mermaidFenceRe } = require('../../../lib/core/mermaid-fences');

const BODY = 'flowchart LR\n  A --> B\n';

describe('mermaid-fences', () => {
	test('matches both fence characters, identically', () => {
		const back = matchMermaidFences('# T\n\n```mermaid\n' + BODY + '```\n');
		const tilde = matchMermaidFences('# T\n\n~~~mermaid\n' + BODY + '~~~\n');
		assert.equal(back.length, 1);
		assert.equal(tilde.length, 1);
		assert.equal(back[0].body, BODY);
		assert.equal(tilde[0].body, BODY);
		assert.equal(back[0].marker, '```');
		assert.equal(tilde[0].marker, '~~~');
	});

	test('the offsets span the WHOLE fence, so a substitution replaces the source', () => {
		const src = 'lead\n\n~~~mermaid\n' + BODY + '~~~\ntail\n';
		const [m] = matchMermaidFences(src);
		assert.equal(src.slice(m.start, m.end), '~~~mermaid\n' + BODY + '~~~');
		// What the emulator writes back: everything outside the span survives untouched.
		assert.equal(src.slice(0, m.start) + '<svg/>' + src.slice(m.end), 'lead\n\n<svg/>\ntail\n');
	});

	test('a fence closes on its OWN character, never the other one', () => {
		// A tilde line inside a backtick fence is content. Closing on it would cut the
		// diagram in half and hand mmdc a truncated definition.
		const src = '```mermaid\nflowchart LR\n  A["~~~"] --> B\n```\n';
		const [m] = matchMermaidFences(src);
		assert.equal(m.body, 'flowchart LR\n  A["~~~"] --> B\n');
	});

	test('several fences come back in document order', () => {
		const src = '```mermaid\none\n```\n\n---\n\n~~~mermaid\ntwo\n~~~\n';
		const found = matchMermaidFences(src);
		assert.deepEqual(found.map((f) => f.body), ['one\n', 'two\n']);
		assert.ok(found[0].start < found[1].start);
	});

	test('firstMermaidFenceBody reads the first fence, or null', () => {
		assert.equal(firstMermaidFenceBody('~~~mermaid\n' + BODY + '~~~'), BODY);
		assert.equal(firstMermaidFenceBody('# no diagram here'), null);
		// An untagged fence is not a Mermaid fence.
		assert.equal(firstMermaidFenceBody('```\n' + BODY + '```'), null);
		// Nor is another language's.
		assert.equal(firstMermaidFenceBody('```js\nconst a = 1;\n```'), null);
	});

	test('the matcher is fresh per call — a /g regex carries lastIndex', () => {
		const a = mermaidFenceRe();
		const b = mermaidFenceRe();
		assert.notEqual(a, b);
		a.exec('```mermaid\nx\n```');
		assert.ok(a.lastIndex > 0);
		assert.equal(b.lastIndex, 0);
	});

	test('no looser than the regex it replaces', () => {
		// The info string must be followed IMMEDIATELY by a newline. Tolerating a trailing
		// space would change which existing decks substitute — an export-bytes change.
		assert.equal(matchMermaidFences('```mermaid \n' + BODY + '```').length, 0);
		// And the tag has to be the whole info string.
		assert.equal(matchMermaidFences('```mermaidish\n' + BODY + '```').length, 0);
	});
});
