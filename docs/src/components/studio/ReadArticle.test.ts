import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { READ_ARTICLE_CSS } from './ReadArticle';

/** `prop:value` pairs of the first rule whose selector ends in `.katex-error`, whitespace-normalized. */
function katexErrorDeclarations(css: string): string[] {
	const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const m = /(?:^|[}\s])[^{}]*\.katex-error\s*\{([^}]*)\}/.exec(noComments);
	if (!m) return [];
	return m[1]
		.split(';')
		.map((d) => d.trim().replace(/\s*:\s*/, ':').replace(/\s+/g, ' '))
		.filter(Boolean);
}

describe('the Read pane styles a failed formula like the math plugin does', () => {
	test('its .katex-error declarations equal lib/plugins/math/math.styles.css', () => {
		const plugin = fs.readFileSync(path.resolve(__dirname, '../../../../lib/plugins/math/math.styles.css'), 'utf8');
		const want = katexErrorDeclarations(plugin);
		expect(want.length).toBeGreaterThan(3);
		expect(katexErrorDeclarations(READ_ARTICLE_CSS)).toEqual(want);
	});
});
