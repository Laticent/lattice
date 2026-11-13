/**
 * Unit: mermaid-arrows.js — the arrow families behind the playground editor's Mermaid highlighter.
 *
 * The four families were single regexes until #1958 §7 split them (see mermaid-arrows.js). Each row
 * is [text, ER, flowchart, sequence, class]: the length the OLD single regex of that family matched
 * at the start of the text, 0 for none. The rows were generated from the old regexes, and the split
 * forms agreed with them on all 8,108,730 strings of length 1 to 6 over `<>ox=-.|*(){}a`.
 *
 * Import-free module, so it is tested here with no CodeMirror (a docs-only dep), like slide-context.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ROWS = [
	['-->', 0, 3, 3, 3],
	['--->', 0, 4, 0, 2],
	['<-->', 0, 4, 3, 3],
	['o--o', 0, 4, 0, 3],
	['x--x', 0, 4, 3, 0],
	['==>', 0, 3, 0, 0],
	['-.->', 0, 4, 0, 0],
	['-..-', 0, 4, 0, 0],
	['---', 0, 3, 0, 2],
	['===', 0, 3, 0, 0],
	['->>', 0, 0, 3, 0],
	['-->>', 0, 3, 4, 3],
	['-x', 0, 0, 2, 0],
	['--)', 0, 0, 3, 2],
	['<<-', 0, 0, 3, 0],
	['<<--', 0, 0, 4, 0],
	['x-', 0, 0, 2, 0],
	['(--', 0, 0, 3, 0],
	['<--', 0, 3, 3, 3],
	['<|--', 0, 0, 0, 4],
	['*--', 0, 0, 0, 3],
	['--*', 0, 0, 0, 3],
	['o--', 0, 3, 0, 3],
	['--o', 0, 3, 0, 3],
	['..', 0, 0, 0, 2],
	['..|>', 0, 0, 0, 4],
	['--|>', 0, 0, 0, 4],
	['--', 0, 0, 0, 2],
	['|o--o|', 6, 0, 0, 0],
	['}|..|{', 6, 0, 0, 0],
	['<!--', 0, 0, 0, 0],
	['--!>', 0, 0, 0, 2],
	['a-->', 0, 0, 0, 0],
	['<=>', 0, 0, 0, 0],
	['-.', 0, 0, 0, 0],
	['.-', 0, 0, 0, 0],
	['<-', 0, 0, 2, 0],
	['<---', 0, 4, 0, 3],
];

test('each arrow family matches the length its old single regex matched', async () => {
	const { ARROW_FAMILIES } = await import('../../../docs/src/playground/mermaid-arrows.js');
	assert.equal(ARROW_FAMILIES.length, 4);
	for (const [text, ...want] of ROWS) {
		assert.deepEqual(
			ARROW_FAMILIES.map((family) => family(text)),
			want,
			text,
		);
	}
});
