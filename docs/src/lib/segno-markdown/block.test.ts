import { describe, expect, it } from 'vitest';
import { BlockParser, type BlockState, F_HIDDEN, KIND, STRIDE, T_AUX, T_FLAGS, T_KIND, T_L0, T_L1, T_LEVEL } from './index.js';

// The package's own suite: tape shape, host rules, bounds. Parity with markdown-it itself is held at the
// repo root (test/unit/core/deck-model.test.js), where markdown-it is a dependency; this package has none.

const parser = new BlockParser();

/** The tape as `type level l0-l1` lines, for readable expectations. */
function shape(src: string, p = parser): string[] {
	const t = p.parse(src);
	const out: string[] = [];
	for (let i = 0; i < t.length; i++) {
		const a = i * STRIDE;
		const map = t.tape[a + T_L0] >= 0 ? ` ${t.tape[a + T_L0]}-${t.tape[a + T_L1]}` : '';
		out.push(`${t.kinds[t.tape[a + T_KIND]]} ${t.tape[a + T_LEVEL]}${map}${t.tape[a + T_FLAGS] & F_HIDDEN ? ' hidden' : ''}`);
	}
	return out;
}

describe('the block pass', () => {
	it('writes markdown-it token order, levels and maps', () => {
		expect(shape('# One\n\n---\n\n- a\n- b\n')).toEqual([
			'heading_open 0 0-1',
			'inline 1 0-1',
			'heading_close 0',
			'hr 0 2-3',
			'bullet_list_open 0 4-6',
			'list_item_open 1 4-5',
			'paragraph_open 2 4-5 hidden',
			'inline 3 4-5',
			'paragraph_close 2 hidden',
			'list_item_close 1',
			'list_item_open 1 5-6',
			'paragraph_open 2 5-6 hidden',
			'inline 3 5-6',
			'paragraph_close 2 hidden',
			'list_item_close 1',
			'bullet_list_close 0',
		]);
	});

	it('reads a setext underline as a heading and a fenced `---` as code, never as breaks', () => {
		expect(shape('Title\n---\n').filter((s) => s.startsWith('hr'))).toEqual([]);
		expect(shape('```\n---\n```\n')).toEqual(['fence 0 0-3']);
		expect(shape('Title\n\n***\n')).toContain('hr 0 2-3');
	});

	it('keeps a reference definition out of the tape, as markdown-it does', () => {
		expect(shape('[a]: /url\n\n---\n')).toEqual(['hr 0 2-3']);
		// An empty label is not a definition: the line is a paragraph, and `---` under it a heading.
		expect(shape('[ ]: /url\n---\n')[0]).toBe('heading_open 0 0-2');
	});

	it('refuses a dangerous destination unless an entity hook says otherwise', () => {
		expect(shape('[a]: javascript:x\n')[0]).toBe('paragraph_open 0 0-1');
		expect(shape('[a]: &#106;avascript:x\n')[0]).toBe('paragraph_open 0 0-1');
		const lenient = new BlockParser({ linkOk: () => true });
		expect(shape('[a]: java&colon;x\n', lenient)).toEqual([]);
	});

	it('records per-kind facts in the aux slot', () => {
		const t = parser.parse('## Two\n\n3. x\n\n````js\n````\n');
		const at = (k: number) => {
			for (let i = 0; i < t.length; i++) if (t.tape[i * STRIDE + T_KIND] === k) return t.tape[i * STRIDE + T_AUX];
			return -1;
		};
		expect(at(KIND.heading_open)).toBe(2);
		expect(at(KIND.ordered_list_open)).toBe(3);
		expect(at(KIND.fence)).toBe(4);
	});

	it('drops a last line of only spaces with no newline, as markdown-it does', () => {
		expect(parser.parse('a\n   ').lines).toBe(1);
		expect(parser.parse('a\n   \n').lines).toBe(2);
		expect(parser.parse('   ').lines).toBe(0);
	});

	it('honors the nesting cap of the commonmark preset', () => {
		const deep = shape(`${'>'.repeat(30)} x\n`);
		expect(deep.filter((s) => s.startsWith('blockquote_open')).length).toBe(20);
	});
});

describe('host block rules', () => {
	// A rule shaped like math's `$$`: it claims lines from an opener to a closer.
	const dollars = (state: BlockState, start: number, end: number, silent: boolean): boolean => {
		const at = state.bMarks[start] + state.tShift[start];
		if (state.src.slice(at, at + 2) !== '$$') return false;
		let line = start + 1;
		while (line < end && !state.src.slice(state.bMarks[line], state.eMarks[line]).includes('$$')) line++;
		if (line >= end) return false;
		if (silent) return true;
		const tok = state.push('math_block', 'div', 0);
		tok.map = [start, line + 1];
		tok.content = 'tex';
		state.line = line + 1;
		return true;
	};

	it('installs before `fence` and runs through the facade fields', () => {
		const p = new BlockParser({ rules: [{ name: 'math_block', rule: dollars, triggers: '$' }] });
		expect(p.ruleNames.slice(0, 4)).toEqual(['table', 'code', 'math_block', 'fence']);
		const t = p.parse('$$\n---\n$$\n');
		expect(t.kinds[t.tape[T_KIND]]).toBe('math_block');
		expect([t.tape[T_L0], t.tape[T_L1]]).toEqual([0, 3]);
		expect(t.side.get(0)?.content).toBe('tex');
	});

	it('tries a rule only on the characters it declares', () => {
		let calls = 0;
		const counting = (s: BlockState, a: number, b: number, silent: boolean) => {
			calls++;
			return dollars(s, a, b, silent);
		};
		new BlockParser({ rules: [{ name: 'math_block', rule: counting, triggers: '$' }] }).parse('a\n\nb\n\n$$\nx\n$$\n');
		expect(calls).toBe(1);
		calls = 0;
		new BlockParser({ rules: [{ name: 'math_block', rule: counting }] }).parse('a\n\nb\n\n$$\nx\n$$\n');
		expect(calls).toBe(3);
	});

	it('tries a rule with a trigger above ASCII on lines that open with it', () => {
		const section = (state: BlockState, start: number, _end: number, silent: boolean) => {
			if (state.src.charAt(state.bMarks[start] + state.tShift[start]) !== '§') return false;
			if (silent) return true;
			state.push('sect', 'div', 0).map = [start, start + 1];
			state.line = start + 1;
			return true;
		};
		const t = new BlockParser({ rules: [{ name: 'sect', rule: section, triggers: '§' }] }).parse('§ a\n');
		expect(t.kinds[t.tape[T_KIND]]).toBe('sect');
	});

	it('refuses an anchor that does not exist', () => {
		expect(() => new BlockParser({ rules: [{ name: 'x', rule: dollars, before: 'nope' }] })).toThrow(/no block rule "nope"/);
	});
});

describe('bounds: every rule grows about 10x for 10x input', () => {
	const HOSTILE: Record<string, (n: number) => string> = {
		'unclosed fences': (n) => '```\n'.repeat(n),
		'unclosed comments': (n) => '<!--\n\n'.repeat(n),
		'quote lines': (n) => '> > > x\n'.repeat(n),
		'nested lists': (n) => Array.from({ length: n }, (_, i) => `${' '.repeat(2 * (i % 40))}- x`).join('\n'),
		'reference brackets': (n) => '[a\n'.repeat(n),
		'reference titles': (n) => '[a]: /u "t\n'.repeat(n),
		'table rows': (n) => `| a | b |\n|---|---|\n${'| x |\n'.repeat(n)}`,
		'pipes, no delimiter row': (n) => 'a | b\n'.repeat(n),
		'setext candidates': (n) => `${'a\n'.repeat(n)}---\n`,
		'lazy continuation': (n) => `> a\n${'b\n'.repeat(n)}`,
		'loose list items': (n) => '- a\n\n'.repeat(n),
		'unclosed html blocks': (n) => '<div>\nx\n'.repeat(n),
		'slide breaks': (n) => 'a\n\n---\n\n'.repeat(n),
	};
	const best = (src: string) => {
		let t = Number.POSITIVE_INFINITY;
		for (let k = 0; k < 5; k++) {
			const a = performance.now();
			parser.parse(src);
			t = Math.min(t, performance.now() - a);
		}
		return t;
	};
	for (const [name, make] of Object.entries(HOSTILE)) {
		it(name, () => {
			best(make(2000)); // warm the JIT
			const small = best(make(4000));
			const large = best(make(40000));
			// Linear is ~10x; quadratic would be ~100x. 30 leaves room for a noisy runner.
			expect(large / Math.max(small, 0.05)).toBeLessThan(30);
		});
	}
});
