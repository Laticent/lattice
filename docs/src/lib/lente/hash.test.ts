import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';

describe('sha256Hex — NIST vectors', () => {
	it('hashes the empty string', () => {
		expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
	});
	it('hashes "abc"', () => {
		expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
	it('hashes a multi-block message (896 bits)', () => {
		expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
			'248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
		);
	});
	it('is deterministic and unicode-safe', () => {
		expect(sha256Hex('Revenue up 38% — café ☕')).toBe(sha256Hex('Revenue up 38% — café ☕'));
		expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
	});
	it('encodes an astral pair as 4-byte UTF-8 (matches node:crypto)', () => {
		expect(sha256Hex('😀')).toBe('f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9');
	});
	it('does NOT collide a lone high surrogate with a doubled one (the maker-checker fix)', () => {
		// Before the fix, `\uD800` and `\uD800\uD800` hashed identically (a `++i`-past-NaN bug).
		expect(sha256Hex('\uD800')).not.toBe(sha256Hex('\uD800\uD800'));
		// A lone surrogate is treated as U+FFFD, so it equals the replacement char.
		expect(sha256Hex('\uD800')).toBe(sha256Hex('�'));
	});
});
