import { describe, expect, it } from 'vitest';
import { cachedSampleUrl, KOKORO_MODEL_ID, noRosterHint, OTHER, resolveVoice, voiceResetOnModelChange, voicesForModel } from './tts-voice-catalog';

// Pure logic behind the model-specific voice dropdown — tested directly rather
// than by driving the Radix Select through jsdom (no interaction risk either way).
// Lives alongside tts-voice-catalog.ts (the module under test), not TtsSettings.tsx
// (the UI that consumes it) — see the asset-caching section of
// engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md.

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

	// Every model curated after the initial two families — each roster's source is
	// cited in TtsSettings.tsx's own comments (an OpenRouter page fetch or a primary-
	// source doc/README, never a guess).
	it('resolves Grok Voice TTS to its documented 5-voice roster', () => {
		expect(voicesForModel('x-ai/grok-voice-tts-1.0').map((v) => v.id)).toEqual(['Eve', 'Ara', 'Rex', 'Sal', 'Leo']);
	});

	it('resolves a Gemini TTS model (any version) to the Gemini voice set', () => {
		const voices = voicesForModel('google/gemini-3.1-flash-tts-preview').map((v) => v.id);
		expect(voices).toContain('Puck');
		expect(voices).toContain('Kore');
	});

	it('resolves Orpheus to its documented English preset voices', () => {
		expect(voicesForModel('canopylabs/orpheus-3b-0.1-ft').map((v) => v.id)).toContain('tara');
	});

	it('deliberately does NOT curate Zonos or CSM-1B — see noRosterHint', () => {
		// Both models genuinely lack a named-voice concept (clone/speaker-slot based),
		// not merely "unrecognized" — curating a fake roster for them would be worse
		// than admitting we don't have one.
		expect(voicesForModel('zyphra/zonos-v0.1-transformer')).toEqual([]);
		expect(voicesForModel('zyphra/zonos-v0.1-hybrid')).toEqual([]);
		expect(voicesForModel('sesame/csm-1b')).toEqual([]);
	});
});

describe('noRosterHint — explains WHY a model has no curated voice picker, when we know', () => {
	it('gives a specific reason for voice-cloning models (Zonos)', () => {
		expect(noRosterHint('zyphra/zonos-v0.1-transformer')).toMatch(/clones a voice from a reference/i);
	});

	it('gives a specific reason for speaker-slot models (CSM-1B)', () => {
		expect(noRosterHint('sesame/csm-1b')).toMatch(/numeric speaker slot/i);
	});

	it('returns undefined for a model with simply no verified roster — the generic fallback message covers it', () => {
		expect(noRosterHint('microsoft/mai-voice-2')).toBeUndefined();
		expect(noRosterHint('mistralai/voxtral-mini-tts-2603')).toBeUndefined();
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

// Red-team/independent-checker finding: switching to a model with an UNRECOGNIZED
// roster used to blank the visible free-text voice field without persisting the
// clear — a UI/storage desync where the old value silently reappeared on reload.
// voiceResetOnModelChange is the extracted decision the fix relies on: it must
// return null (no reset at all) for an unrecognized model, not an empty string.
describe('voiceResetOnModelChange — the model-switch voice-reset decision (regression: #846 follow-up)', () => {
	it('resets to the new roster\'s default when the current voice is not on it', () => {
		expect(voiceResetOnModelChange('openai/tts-1', 'af_heart')).toBe('alloy');
	});

	it('does not reset when the current voice IS already on the new roster', () => {
		expect(voiceResetOnModelChange('hexgrad/kokoro-82m', 'af_bella')).toBeNull();
	});

	it('does NOT reset for an unrecognized model — free text is valid for any model, nothing to reset FROM/TO', () => {
		expect(voiceResetOnModelChange('some-vendor/unknown-tts', 'af_heart')).toBeNull();
		expect(voiceResetOnModelChange('some-vendor/unknown-tts', 'my_custom_voice_id')).toBeNull();
	});
});

// The local-first sample cache: a curated voice on a requiresAsset engine, at the
// default speed, resolves to the pre-generated file's URL — anything else (free
// text, an uncurated model, a non-default speed) must fall through to the live
// path (null), never a guessed/broken URL.
describe('cachedSampleUrl — the pre-generated sample path, or null when nothing is cached', () => {
	it('resolves a curated cloud voice (Grok) via its model id', () => {
		expect(cachedSampleUrl('x-ai/grok-voice-tts-1.0', 'Eve', 1)).toBe('/voice-samples/grok/Eve.mp3');
	});

	it('resolves a curated cloud voice (Gemini) via its model id, with the wav extension its audioFormat declares', () => {
		expect(cachedSampleUrl('google/gemini-3.1-flash-tts-preview', 'Puck', 1)).toBe('/voice-samples/gemini/Puck.wav');
	});

	it('resolves a curated cloud voice (Orpheus) via its model id', () => {
		expect(cachedSampleUrl('canopylabs/orpheus-3b-0.1-ft', 'tara', 1)).toBe('/voice-samples/orpheus/tara.mp3');
	});

	it('returns null for Kokoro — on-device and free, never asset-cached', () => {
		expect(cachedSampleUrl(KOKORO_MODEL_ID, 'af_heart', 1)).toBeNull();
	});

	it('returns null for a non-default speed — only 1x is pre-generated', () => {
		expect(cachedSampleUrl('x-ai/grok-voice-tts-1.0', 'Eve', 1.25)).toBeNull();
	});

	it('returns null for free-text/uncurated voice ids', () => {
		expect(cachedSampleUrl('x-ai/grok-voice-tts-1.0', 'my_custom_voice', 1)).toBeNull();
	});

	it('returns null for an unrecognized model', () => {
		expect(cachedSampleUrl('some-vendor/unknown-tts', 'af_heart', 1)).toBeNull();
	});

	it('returns null for an engine with no live model behind it yet (requiresAsset: false)', () => {
		expect(cachedSampleUrl('openai/tts-1-hd', 'alloy', 1)).toBeNull();
	});

	it('returns null with no voice id', () => {
		expect(cachedSampleUrl('x-ai/grok-voice-tts-1.0', '', 1)).toBeNull();
	});
});
