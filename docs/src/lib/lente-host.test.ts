// @vitest-environment node
// Lente as Lattice runs it: a slide's lens tag is the `lens` field of its `@meta` record (docs/src/lib/lente-host.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { applyTag, lens, parseLensRegistry, parseSlideTags, setLensTagCarrier, taggedLensIds } from './lente-host';

afterAll(() => setLensTagCarrier(null));

describe('the record carrier', () => {
	it('reads a record tag, quoted or bare, include and exclude', () => {
		const t = parseSlideTags('<!-- @meta{layout=kpi, lens="brief +ask -evidence"} -->\n\n# X');
		expect([...t.include].sort()).toEqual(['ask', 'brief']);
		expect([...t.exclude]).toEqual(['evidence']);
		expect([...parseSlideTags('<!-- @meta{lens=brief} -->\n# X').include]).toEqual(['brief']);
	});

	it('writes the tag into the slide record, and clears it', () => {
		const tagged = applyTag('<!-- @meta{layout=kpi} -->\n\n# X', 'brief', true, 'none');
		expect(tagged).toBe('<!-- @meta{layout=kpi, lens=brief} -->\n\n# X');
		expect(applyTag(tagged, 'brief', false, 'none')).toBe('<!-- @meta{layout=kpi} -->\n\n# X');
		expect(applyTag('# Y', 'evidence', false, 'all')).toBe('<!-- @meta{lens="-evidence"} -->\n\n# Y');
	});

	it('reads an old `_lens` comment until the cut, and moves it into a record when the tag changes', () => {
		expect([...parseSlideTags('<!-- _lens: brief -->\n# X').include]).toEqual(['brief']);
		const moved = applyTag('<!-- _lens: brief -->\n\n# X', 'ask', true, 'none');
		expect(moved).not.toContain('_lens');
		expect([...parseSlideTags(moved).include].sort()).toEqual(['ask', 'brief']);
	});

	it('ignores a tag shown in a code fence', () => {
		expect(taggedLensIds(['## A\n\n```md\n<!-- @meta{lens=brief} -->\n```\n']).size).toBe(0);
	});

	it('projects the demo page deck as its comment says', () => {
		const reg = parseLensRegistry('lenses:\n  brief: { label: "Bottom line", base: none }\n  evidence: { label: "The evidence", base: all }');
		const slides = [
			'<!-- @meta{class=anchor, lens="brief story -evidence"} -->\n# Recommendation',
			'<!-- @meta{class=statement, lens=brief} -->\n## The bottom line',
			'<!-- @meta{class=evidence} -->\n## Cost breakdown',
		];
		expect(lens(slides).registry(reg).pick('brief').pairs().map((p) => p.index)).toEqual([0, 1]);
		expect(lens(slides).registry(reg).pick('evidence').pairs().map((p) => p.index)).toEqual([1, 2]);
	});
});

describe('every Lattice surface reads Lente through the host', () => {
	it('no file outside the library imports the bare package', () => {
		const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
		const bare: string[] = [];
		const walk = (dir: string) => {
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				const p = path.join(dir, e.name);
				if (e.isDirectory()) {
					if (p !== path.join(SRC, 'lib', 'lente') && e.name !== 'node_modules') walk(p);
				} else if (/\.(tsx?|astro|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== 'lente-host.ts') {
					// A type-only import reads no tag, so it may name the package directly.
					const text = fs.readFileSync(p, 'utf8').replace(/import type [^;]+;/g, '');
					if (/from ['"]@\/lib\/lente['"]/.test(text)) bare.push(path.relative(SRC, p));
				}
			}
		};
		walk(SRC);
		expect(bare).toEqual([]);
	});
});
