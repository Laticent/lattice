/**
 * Unit: every TeX command the editors offer inside math renders through KaTeX.
 *
 * docs/src/playground/tex-commands.js is a curated list (KaTeX's own table has over 1,000 names). This pins it to
 * KaTeX: each entry's template, with its empty arguments filled, must render with `throwOnError`, so completion can
 * never offer a command the math plugin then draws as a red error. `\begin` and `\end` render as one environment.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');

test('every offered TeX command renders in KaTeX', async () => {
	const { TEX_COMMANDS } = await import('../../../docs/src/playground/tex-commands.js');
	assert.ok(TEX_COMMANDS.length > 100, `expected the curated list, got ${TEX_COMMANDS.length}`);
	const broken = [];
	for (const c of TEX_COMMANDS) {
		let tex = c.template.replace(/\{\}/g, '{x}');
		if (c.name === 'begin' || c.name === 'end') tex = '\\begin{matrix} x \\end{matrix}';
		if (c.name === 'left') tex = '\\left( x \\right)';
		if (c.name === 'right') tex = '\\left( x \\right)';
		if (c.name === 'underbrace') tex = '\\underbrace{x}_{y}';
		try {
			katex.renderToString(tex, { throwOnError: true });
		} catch (e) {
			broken.push(`${c.name}: ${e.message}`);
		}
	}
	assert.deepEqual(broken, []);
});

test('no command is listed twice', async () => {
	const { TEX_COMMANDS } = await import('../../../docs/src/playground/tex-commands.js');
	const names = TEX_COMMANDS.map((c) => c.name);
	assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});
