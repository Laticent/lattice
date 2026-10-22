import { beforeEach, describe, expect, it } from 'vitest';
import { fingerprint as fingerprintOf, savedCaret } from './playground-focus';

const KEY = 'lattice-docs-pg-caret';

describe('the remembered caret', () => {
	beforeEach(() => localStorage.clear());

	it('comes back for the same text and for nothing else', () => {
		const text = '# One\n\n---\n\n# Two\n';
		localStorage.setItem(KEY, JSON.stringify({ h: fingerprintOf(text), head: 12 }));
		expect(savedCaret(text)).toBe(12);
		expect(savedCaret(`${text}x`)).toBeNull();
	});

	it('ignores a caret outside the text, a bad record and an empty store', () => {
		const text = 'abc';
		expect(savedCaret(text)).toBeNull();
		localStorage.setItem(KEY, 'not json');
		expect(savedCaret(text)).toBeNull();
		localStorage.setItem(KEY, JSON.stringify({ h: fingerprintOf(text), head: 99 }));
		expect(savedCaret(text)).toBeNull();
	});
});
