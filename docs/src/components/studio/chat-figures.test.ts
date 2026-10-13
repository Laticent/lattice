// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { figureLabel, figureSample, isFigureLang, MAX_FIGURE_CHARS } from './chat-figures';

const FM = '---\ntheme: indaco\n---\n\n';

describe('which fences are figures', () => {
	it('knows the plugin fences, the deprecated plot alias and a slide', () => {
		for (const l of ['mermaid', 'math', 'functionplot', 'latticeplot', 'lattice', 'Mermaid']) expect(isFigureLang(l), l).toBe(true);
	});
	it('leaves ordinary code, the edit protocol and prototype keys alone', () => {
		for (const l of ['js', 'json', 'markdown', 'lattice-edit', 'toString', 'constructor', '__proto__', '']) expect(isFigureLang(l), l).toBe(false);
	});
});

describe('figureSample', () => {
	it('puts the deck front matter in front so the figure takes the deck theme', () => {
		expect(figureSample('mermaid', 'flowchart LR\n A-->B', FM)).toMatch(/^---\ntheme: indaco\n---\n\n<!-- _class: diagram -->/);
	});
	it('wraps a mermaid body in a mermaid fence on a diagram slide', () => {
		expect(figureSample('mermaid', 'flowchart LR\n A-->B\n', '')).toBe('<!-- _class: diagram -->\n\n```mermaid\nflowchart LR\n A-->B\n```\n');
	});
	it('wraps math in a display block on the math layout', () => {
		const out = figureSample('math', 'E = mc^2', '') as string;
		expect(out).toContain('$$\nE = mc^2\n$$');
		expect(out).toContain('<!-- _class: math -->');
	});
	it('maps the latticeplot alias onto functionplot', () => {
		expect(figureSample('latticeplot', '{ "data": [{ "fn": "x^2" }] }', '')).toContain('```functionplot\n');
	});
	it('uses a fence longer than any run of backticks inside the body', () => {
		const out = figureSample('mermaid', 'A["a ```b``` c"]', '') as string;
		expect(out).toContain('````mermaid');
		expect(out.trimEnd().endsWith('````')).toBe(true);
	});
	it('shows only the FIRST slide of a lattice fence — a second would be invisible to the tile', () => {
		const out = figureSample('lattice', '<!-- _class: content -->\n## One\n\n---\n\n## Two', FM) as string;
		expect(out).toContain('## One');
		expect(out).not.toContain('## Two');
		expect(out.startsWith(FM)).toBe(true);
	});
	it('refuses an empty figure, an oversized one and a language that is not a figure', () => {
		expect(figureSample('mermaid', '   \n', FM)).toBeNull();
		expect(figureSample('mermaid', 'x'.repeat(MAX_FIGURE_CHARS + 1), FM)).toBeNull();
		expect(figureSample('js', 'const a = 1', FM)).toBeNull();
		expect(figureSample('constructor', 'x', FM)).toBeNull();
	});
});

describe('figureLabel', () => {
	it('names the figure in words', () => {
		expect(['mermaid', 'math', 'functionplot', 'lattice'].map(figureLabel)).toEqual(['Diagram', 'Equation', 'Plot', 'Slide']);
	});
});
