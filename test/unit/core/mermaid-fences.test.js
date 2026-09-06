/**
 * Unit: lib/core/mermaid-fences.js — the one thing that says "this is a Mermaid fence".
 *
 * The module exists because two paths carried their own copy of the same regex and only one
 * of them was ever going to get widened. The arms are in three groups:
 *
 *   1. TILDES ARE FENCES TOO. markdown-it emits `class="language-mermaid"` for `~~~mermaid`
 *      exactly as for ```` ```mermaid ````, so the live preview has always rendered one —
 *      but the CLI substituted only the backtick form, and a tilde fence therefore reached
 *      the exported PDF as raw source.
 *   2. THE TWO WARTS THE OBVIOUS WIDENING WOULD HAVE SHIPPED, both driven on the real CLI by
 *      an independent checker before they landed. `/(```|~~~)mermaid\n([\s\S]*?)\1/` closes
 *      on exactly three characters and does not know whether it is already inside a fence.
 *      Invisible while only backticks were recognized; reachable the moment tildes are.
 *   3. WHAT MUST NOT MOVE. Every relaxation beyond tildes is an export-bytes change, so the
 *      shape of the opener is pinned here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { matchMermaidFences, firstMermaidFenceBody } = require('../../../lib/core/mermaid-fences');

const BODY = 'flowchart LR\n  A --> B\n';

describe('mermaid-fences', () => {
	test('matches both fence characters, identically', () => {
		const back = matchMermaidFences(`# T\n\n\`\`\`mermaid\n${BODY}\`\`\`\n`);
		const tilde = matchMermaidFences(`# T\n\n~~~mermaid\n${BODY}~~~\n`);
		assert.equal(back.length, 1);
		assert.equal(tilde.length, 1);
		assert.equal(back[0].body, BODY);
		assert.equal(tilde[0].body, BODY);
		assert.equal(back[0].marker, '```');
		assert.equal(tilde[0].marker, '~~~');
	});

	test('the offsets span the WHOLE fence, so a substitution replaces the source', () => {
		const src = `lead\n\n~~~mermaid\n${BODY}~~~\ntail\n`;
		const [m] = matchMermaidFences(src);
		assert.equal(src.slice(m.start, m.end), `~~~mermaid\n${BODY}~~~`);
		// What the emulator writes back: everything outside the span survives untouched.
		assert.equal(src.slice(0, m.start) + '<svg/>' + src.slice(m.end), 'lead\n\n<svg/>\ntail\n');
	});

	test('several fences come back in document order', () => {
		const src = '```mermaid\none\n```\n\n---\n\n~~~mermaid\ntwo\n~~~\n';
		const found = matchMermaidFences(src);
		assert.deepEqual(found.map((f) => f.body), ['one\n', 'two\n']);
		assert.ok(found[0].start < found[1].start);
	});

	test('firstMermaidFenceBody reads the first fence, or null', () => {
		assert.equal(firstMermaidFenceBody(`~~~mermaid\n${BODY}~~~`), BODY);
		assert.equal(firstMermaidFenceBody('# no diagram here'), null);
		// An untagged fence is not a Mermaid fence, and neither is another language's.
		assert.equal(firstMermaidFenceBody(`\`\`\`\n${BODY}\`\`\``), null);
		assert.equal(firstMermaidFenceBody('```js\nconst a = 1;\n```'), null);
	});

	// ── group 2: the warts, each driven on the real CLI before it could ship ─────────────

	// CommonMark lets the CLOSING run be longer than the opener, and markdown-it accepts it —
	// so the preview drew a clean diagram while a regex closing on exactly three characters
	// left the fourth behind. Driven end-to-end: `Rendering 2 mermaid diagrams … done`, and
	// the exported slide read `[SVG] ~`. A literal tilde, printed next to the picture.
	test('a closing run LONGER than the opener still closes the fence', () => {
		for (const [open, close] of [['~~~', '~~~~'], ['```', '````'], ['~~~~', '~~~~~']]) {
			const [m] = matchMermaidFences(`${open}mermaid\n${BODY}${close}\n`);
			assert.ok(m, `${open} … ${close} did not close`);
			assert.equal(m.body, BODY);
			// The span covers the whole closing run — a leftover character IS the defect.
			assert.equal(m.end, `${open}mermaid\n${BODY}${close}`.length);
		}
	});

	test('a shorter closing run does NOT close a longer fence', () => {
		// `~~~~` opened, `~~~` is content per CommonMark. Closing here would hand mmdc a
		// truncated definition and leave the rest of the deck inside a fence nobody opened.
		assert.equal(matchMermaidFences(`~~~~mermaid\n${BODY}~~~\n`).length, 0);
	});

	// A slide that TEACHES a Mermaid fence wraps it in an outer fence. The regex had no outer-
	// fence state, so the example was substituted into a picture: the preview showed the
	// sample, the export showed a diagram. `mermaid-check.ts` carries the same tracker, added
	// after a red-teamer hit this exact shape.
	test('a fence documented INSIDE another fence is a code sample, not a diagram', () => {
		assert.equal(matchMermaidFences('````markdown\n~~~mermaid\n' + BODY + '~~~\n````\n').length, 0);
		assert.equal(matchMermaidFences('~~~~markdown\n```mermaid\n' + BODY + '```\n~~~~\n').length, 0);
		// …and the outer fence does not eat a REAL fence that follows it.
		const after = matchMermaidFences('````markdown\n~~~mermaid\nx\n~~~\n````\n\n```mermaid\n' + BODY + '```\n');
		assert.equal(after.length, 1);
		assert.equal(after[0].body, BODY);
	});

	test('a fence character inside the diagram is content, not a close', () => {
		const src = '```mermaid\nflowchart LR\n  A["~~~"] --> B\n```\n';
		assert.equal(matchMermaidFences(src)[0].body, 'flowchart LR\n  A["~~~"] --> B\n');
	});

	test('an unclosed fence yields nothing rather than swallowing the deck', () => {
		assert.equal(matchMermaidFences(`~~~mermaid\n${BODY}`).length, 0);
		assert.equal(matchMermaidFences(`\`\`\`mermaid\n${BODY}`).length, 0);
	});

	// ── group 3: the opener's shape, which is what decides whether a deck's bytes move ────

	test('only an info string of exactly `mermaid` opens one of ours', () => {
		assert.equal(matchMermaidFences(`\`\`\`mermaidish\n${BODY}\`\`\``).length, 0);
		assert.equal(matchMermaidFences(`\`\`\`mermaid js\n${BODY}\`\`\``).length, 0);
		// Trailing whitespace is not part of the info string — markdown-it renders this as a
		// Mermaid fence, so declining it would put the preview and the export back out of step.
		assert.equal(matchMermaidFences(`\`\`\`mermaid  \n${BODY}\`\`\``).length, 1);
	});

	test('a backtick fence cannot be opened by a line of inline code', () => {
		// CommonMark: a ``` fence's info string may not contain a backtick. Without this, one
		// line of `` `code` `` opens a phantom fence and everything after it disappears.
		assert.equal(matchMermaidFences('```mermaid` and `more`\nx\n```\n').length, 0);
	});

	test('an indented fence is out of scope, as it was before', () => {
		// The same blind spot the regex had. Widening it is a change to what the CLI renders
		// and is deliberately not made here — see the module docblock.
		assert.equal(matchMermaidFences(`  \`\`\`mermaid\n${BODY}  \`\`\`\n`).length, 0);
	});
});
