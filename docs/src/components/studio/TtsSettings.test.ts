import { describe, expect, it } from 'vitest';
import { OTHER, resolveVoice, voicesForModel } from './TtsSettings';

// Pure logic behind the model-specific voice dropdown — tested directly rather
// than by driving the Radix Select through jsdom (no interaction risk either way).

describe('voicesForModel — a curated roster per cloud model, never a guess', () => {
	it('resolves Kokoro (and the unset/empty default) to the Kokoro roster', () => {
		expect(voicesForModel('hexgrad/kokoro-82m').map((v) => v.id)).toContain('af_heart');
		expect(voicesForModel('').length).toBeGreaterThan(0); // unset → the connect-time default, Kokoro
		expect(voicesForModel('HEXGRAD/KOKORO-82M').length).toBeGreaterThan(0); // case-insensitive
	});

	it('resolves an OpenAI-family model to the OpenAI roster', () => {
		const voices = voicesForModel('openai/tts-1-hd').map((v) => v.id);
		expect(voices).toContain('alloy');
		expect(voices).not.toContain('af_heart'); // never mixes rosters
	});

	it('returns [] for an unrecognized model — never a fabricated roster', () => {
		expect(voicesForModel('some-vendor/unknown-tts')).toEqual([]);
	});
});

describe('resolveVoice — maps a stored voice id onto a roster (or the free-text escape hatch)', () => {
	const voices = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];

	it('a known id resolves to itself, with no free-text leftover', () => {
		expect(resolveVoice(voices, 'b')).toEqual({ select: 'b', other: '' });
	});

	it('an empty/unset value seeds the roster\'s first entry', () => {
		expect(resolveVoice(voices, '')).toEqual({ select: 'a', other: '' });
	});

	it('an unknown id resolves to OTHER, preserving it as free text', () => {
		expect(resolveVoice(voices, 'custom_voice')).toEqual({ select: OTHER, other: 'custom_voice' });
	});

	it('an unknown id against an empty roster still resolves to OTHER (never throws)', () => {
		expect(resolveVoice([], 'custom_voice')).toEqual({ select: OTHER, other: 'custom_voice' });
	});
});
