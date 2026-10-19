import { describe, expect, it } from 'vitest';
import { MAX_BLOCKS, wireOf } from './wireframe';

describe('wireOf', () => {
	it('reads the title, the component class and the body shape', () => {
		const w = wireOf('<!-- _class: bar -->\n\n`Eyebrow`\n\n## One **index** took the query under budget.\n\nMilliseconds per query.\n\n- Before `840`\n- After `190`\n');
		expect(w.title).toBe('One index took the query under budget.');
		expect(w.kind).toBe('bar');
		expect(w.blocks).toEqual(['text', 'list']);
	});

	it('merges a run of the same block and names each kind', () => {
		const w = wireOf('# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![x](y.png)\n\n> quote\n\n```js\nconst a = 1;\n```\n');
		expect(w.blocks).toEqual(['table', 'image', 'quote', 'code']);
	});

	it('does not read a heading or a list inside a fenced block', () => {
		const w = wireOf('# Real\n\n```md\n# Not a title\n- not a list\n```\n');
		expect(w.title).toBe('Real');
		expect(w.blocks).toEqual(['code']);
	});

	it('takes only the first heading as the title, and a later one as text', () => {
		const w = wireOf('# First\n\n## Second\n');
		expect(w.title).toBe('First');
		expect(w.blocks).toEqual(['text']);
	});

	it('caps the block list and survives an empty slide', () => {
		const many = Array.from({ length: 12 }, (_, i) => (i % 2 ? 'text' : '- item')).join('\n\n');
		expect(wireOf(many).blocks.length).toBe(MAX_BLOCKS);
		expect(wireOf('')).toEqual({ title: '', kind: '', blocks: [] });
	});

	it('returns the same object for the same text', () => {
		expect(wireOf('# Same\n')).toBe(wireOf('# Same\n'));
	});
});
