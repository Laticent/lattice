import { describe, expect, it } from 'vitest';
import { tokenize } from './chat-highlight';

describe('tokenize', () => {
	it('covers the whole string (concat of token text === input)', () => {
		const code = '# Title\n- **bold**\n`x`';
		expect(tokenize(code, 'markdown').map((t) => t.text).join('')).toBe(code);
	});
	it('highlights js keywords and strings without throwing', () => {
		const toks = tokenize('const a = "hi";', 'js');
		expect(toks.map((t) => t.text).join('')).toBe('const a = "hi";');
		expect(toks.some((t) => t.cls?.includes('tok-keyword'))).toBe(true);
	});
	it('unknown language → one plain token', () => {
		expect(tokenize('whatever', 'brainfuck')).toEqual([{ text: 'whatever', cls: null }]);
	});
	it('never throws on empty', () => {
		expect(tokenize('', 'js')).toEqual([{ text: '', cls: null }]);
	});
});
