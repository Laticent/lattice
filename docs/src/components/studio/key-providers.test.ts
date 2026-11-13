import { describe, expect, it } from 'vitest';
import { guessProvider, KEY_PROVIDER_INFO } from './key-providers';

describe('key-providers — the Gemini key shapes', () => {
	const gemini = KEY_PROVIDER_INFO.gemini.shape;
	it('accepts both shapes Google issues: the classic AIza… and the newer AQ.…', () => {
		// A live `AQ.` key was refused here on 2026-11-08 although Gemini accepted it (3058-p1).
		expect(gemini.test(`AIza${'x'.repeat(35)}`)).toBe(true);
		expect(gemini.test(`AQ.${'Ab3_-'.repeat(10)}`)).toBe(true);
		expect(guessProvider(`AQ.${'a'.repeat(30)}`)).toBe('gemini');
		expect(guessProvider(`AIza${'a'.repeat(30)}`)).toBe('gemini');
	});
	it('still refuses what is not a Gemini key', () => {
		expect(gemini.test('sk-or-v1-abcdefabcdefabcdefabcdef')).toBe(false);
		expect(gemini.test(`AQ${'a'.repeat(30)}`)).toBe(false); // no dot: not the AQ. shape
		expect(gemini.test('AQ.short')).toBe(false);
		expect(gemini.test(`AIza ${'a'.repeat(30)}`)).toBe(false); // whitespace inside
	});
});

describe('key-providers — the other providers', () => {
	it('still tells them apart', () => {
		expect(guessProvider(`sk-or-v1-${'a'.repeat(20)}`)).toBe('openrouter');
		expect(guessProvider(`sk-ant-${'a'.repeat(20)}`)).toBe('anthropic');
		expect(guessProvider(`sk-proj-${'a'.repeat(20)}`)).toBe('openai');
		expect(guessProvider('nothing-known')).toBeNull();
	});
});
