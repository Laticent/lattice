import { describe, expect, it } from 'vitest';
import { cachedSampleUrl, countryName, engineForModel, featuredVoiceIds, flagEmoji, groupVoices, KOKORO_MODEL_ID, prettyVoiceLabel, resolveVoice, speedSupported, voiceMeta, voiceResetOnModelChange, voicesForModel } from './tts-voice-catalog';

// Pure logic behind the model-specific voice dropdown — tested directly rather
// than by driving the Radix Select through jsdom (no interaction risk either way).
// Lives alongside tts-voice-catalog.ts (the module under test), not TtsSettings.tsx
// (the UI that consumes it) — see the redesign section of
// engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md.
//
// The voice ROSTER is no longer hand-typed here — voicesForModel takes the live
// `voices` array (as OpenRouter's own supported_voices field publishes it) as its
// second argument, so these tests pass in a small stand-in live list per case.

describe('engineForModel — resolves a cloud model id to its cache-metadata slug', () => {
	it('resolves Kokoro (and the unset/empty default) to the Kokoro engine', () => {
		expect(engineForModel('hexgrad/kokoro-82m')).toBe('kokoro');
		expect(engineForModel('')).toBe('kokoro'); // unset -> the connect-time default
		expect(engineForModel('HEXGRAD/KOKORO-82M')).toBe('kokoro'); // case-insensitive
	});

	it('resolves every cataloged engine by its exact live model id', () => {
		expect(engineForModel('x-ai/grok-voice-tts-1.0')).toBe('grok');
		expect(engineForModel('google/gemini-3.1-flash-tts-preview')).toBe('gemini');
		expect(engineForModel('canopylabs/orpheus-3b-0.1-ft')).toBe('orpheus');
		expect(engineForModel('microsoft/mai-voice-2')).toBe('mai-voice-2');
		expect(engineForModel('zyphra/zonos-v0.1-transformer')).toBe('zonos-transformer');
		expect(engineForModel('zyphra/zonos-v0.1-hybrid')).toBe('zonos-hybrid');
		expect(engineForModel('sesame/csm-1b')).toBe('csm');
		expect(engineForModel('mistralai/voxtral-mini-tts-2603')).toBe('voxtral');
	});

	it('returns null for a model this catalog has no cache metadata for — it still works live', () => {
		expect(engineForModel('some-vendor/unknown-tts')).toBeNull();
	});
});

describe('prettyVoiceLabel — derives a display label, never hand-typed', () => {
	it('decodes Kokoro\'s <lang><gender>_<name> convention', () => {
		expect(prettyVoiceLabel('af_heart')).toBe('Heart · US');
		expect(prettyVoiceLabel('bm_george')).toBe('George · UK');
		expect(prettyVoiceLabel('zf_xiaoxiao')).toBe('Xiaoxiao · CN');
		expect(prettyVoiceLabel('jm_kumo')).toBe('Kumo · JP');
	});

	it('decodes the Azure/MAI locale-Name[:Model] convention', () => {
		expect(prettyVoiceLabel('en-US-Harper:MAI-Voice-2')).toBe('Harper · en-US');
		expect(prettyVoiceLabel('es-MX-Valeria:MAI-Voice-2')).toBe('Valeria · es-MX');
	});

	it('falls back to title-cased spacing for a plain or snake_case id', () => {
		expect(prettyVoiceLabel('eve')).toBe('Eve');
		expect(prettyVoiceLabel('american_female')).toBe('American Female');
		expect(prettyVoiceLabel('en_paul_happy')).toBe('En Paul Happy');
		expect(prettyVoiceLabel('conversational_a')).toBe('Conversational A');
	});
});

describe('voicesForModel — the live-sourced roster, +voiceOverride where the live field is incomplete', () => {
	it('maps a live voices array onto {id,label} pairs', () => {
		const voices = voicesForModel('x-ai/grok-voice-tts-1.0', ['eve', 'ara', 'rex']);
		expect(voices).toEqual([
			{ id: 'eve', label: 'Eve' },
			{ id: 'ara', label: 'Ara' },
			{ id: 'rex', label: 'Rex' },
		]);
	});

	it('returns [] when the live catalog has no voices for this model — never a guess', () => {
		expect(voicesForModel('x-ai/grok-voice-tts-1.0', [])).toEqual([]);
		expect(voicesForModel('some-vendor/unknown-tts', [])).toEqual([]);
	});

	it('supplements (never replaces) the live list with voiceOverride on mai-voice-2 — OpenRouter\'s own field is a non-exhaustive sample for this model', () => {
		const voices = voicesForModel('microsoft/mai-voice-2', ['en-US-Harper:MAI-Voice-2']);
		const ids = voices.map((v) => v.id);
		expect(ids).toContain('en-US-Harper:MAI-Voice-2'); // from both the live list AND the override — deduped, not doubled
		expect(ids).toContain('en-US-Ethan:MAI-Voice-2'); // override-only
		expect(ids.filter((id) => id === 'en-US-Harper:MAI-Voice-2')).toHaveLength(1);
	});

	it('does not apply voiceOverride to an unrelated engine', () => {
		expect(voicesForModel('x-ai/grok-voice-tts-1.0', []).some((v) => v.id.includes('MAI-Voice-2'))).toBe(false);
	});
});

describe('resolveVoice — maps a stored voice id onto a roster, no free-text fallback', () => {
	const voices = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];

	it('a known id resolves to itself', () => {
		expect(resolveVoice(voices, 'b')).toBe('b');
	});

	it('an unknown/stale id resolves to the roster\'s first entry — no free-text preservation', () => {
		expect(resolveVoice(voices, 'custom_voice')).toBe('a');
		expect(resolveVoice(voices, '')).toBe('a');
	});

	it('an empty roster resolves to empty string, never throws', () => {
		expect(resolveVoice([], 'anything')).toBe('');
	});
});

describe('voiceResetOnModelChange — the model-switch voice-reset decision', () => {
	it('resets to the new roster\'s first entry when the current voice is not on it', () => {
		expect(voiceResetOnModelChange([{ id: 'alloy', label: 'Alloy' }], 'af_heart')).toBe('alloy');
	});

	it('does not reset when the current voice IS already on the new roster', () => {
		const voices = [{ id: 'af_bella', label: 'Bella · US' }, { id: 'af_heart', label: 'Heart · US' }];
		expect(voiceResetOnModelChange(voices, 'af_bella')).toBeNull();
	});

	it('does NOT reset for an empty roster — nothing to reset FROM/TO, the UI disables instead', () => {
		expect(voiceResetOnModelChange([], 'af_heart')).toBeNull();
	});
});

// The local-first sample cache: a voice inside the engine's featured `cachedVoices`
// subset, at the default speed, resolves to the pre-generated file's URL —
// anything else (a voice outside the cached subset, an uncataloged model, a
// non-default speed) must fall through to the live path (null).
describe('cachedSampleUrl — the pre-generated sample path, or null when nothing is cached', () => {
	it('resolves a cached voice at default speed to its on-disk path', () => {
		expect(cachedSampleUrl('x-ai/grok-voice-tts-1.0', 'eve', 1)).toBe('/voice-samples/grok/eve.mp3');
	});

	it('resolves a cached Gemini voice with the wav extension its audioFormat declares', () => {
		expect(cachedSampleUrl('google/gemini-3.1-flash-tts-preview', 'Puck', 1)).toBe('/voice-samples/gemini/Puck.wav');
	});

	it('resolves a cached MAI-Voice-2 voice, sanitizing the ":" a Windows filename can\'t hold', () => {
		expect(cachedSampleUrl('microsoft/mai-voice-2', 'en-US-Harper:MAI-Voice-2', 1)).toBe('/voice-samples/mai-voice-2/en-US-Harper_MAI-Voice-2.mp3');
	});

	it('resolves a cached Kokoro voice to its on-disk path (hosted hexgrad/kokoro-82m, full roster cached)', () => {
		expect(cachedSampleUrl(KOKORO_MODEL_ID, 'af_heart', 1)).toBe('/voice-samples/kokoro/af_heart.mp3');
	});

	it('returns null for a Kokoro voice id outside the cached roster', () => {
		expect(cachedSampleUrl(KOKORO_MODEL_ID, 'af_notarealvoice', 1)).toBeNull();
	});

	it('returns null for a live voice outside the cached/featured subset (e.g. zonos\' "random")', () => {
		expect(cachedSampleUrl('zyphra/zonos-v0.1-transformer', 'random', 1)).toBeNull();
	});

	it('returns null for a non-default speed — only 1x is pre-generated', () => {
		expect(cachedSampleUrl('x-ai/grok-voice-tts-1.0', 'eve', 1.25)).toBeNull();
	});

	it('returns null for an uncataloged model', () => {
		expect(cachedSampleUrl('some-vendor/unknown-tts', 'af_heart', 1)).toBeNull();
	});

	it('returns null with no voice id', () => {
		expect(cachedSampleUrl('x-ai/grok-voice-tts-1.0', '', 1)).toBeNull();
	});
});

// Live-tested 2026-07-11 (see each engine's `_speedNote` in tts-voice-catalog.json):
// an OpenRouter TTS model's `speed` param passes straight to its own backend, and
// providers differ on whether they implement it — several silently ignore it
// rather than error, so a slider that's always enabled is a control that
// sometimes does nothing with no indication why.
describe('speedSupported — which models\' speed control actually does anything', () => {
	it('is true for the models live-verified to respond to speed (Kokoro, MAI-Voice-2, both Zonos variants)', () => {
		expect(speedSupported('hexgrad/kokoro-82m')).toBe(true);
		expect(speedSupported('')).toBe(true); // unset -> Kokoro, the connect-time default
		expect(speedSupported('microsoft/mai-voice-2')).toBe(true);
		expect(speedSupported('zyphra/zonos-v0.1-transformer')).toBe(true);
		expect(speedSupported('zyphra/zonos-v0.1-hybrid')).toBe(true);
	});

	it('is false for the models live-verified to ignore speed (Grok, Gemini, Orpheus, CSM, Voxtral)', () => {
		expect(speedSupported('x-ai/grok-voice-tts-1.0')).toBe(false);
		expect(speedSupported('google/gemini-3.1-flash-tts-preview')).toBe(false);
		expect(speedSupported('canopylabs/orpheus-3b-0.1-ft')).toBe(false);
		expect(speedSupported('sesame/csm-1b')).toBe(false);
		expect(speedSupported('mistralai/voxtral-mini-tts-2603')).toBe(false);
	});

	it('defaults to false for a model this catalog has no entry for — never optimistically enabled', () => {
		expect(speedSupported('some-vendor/unknown-tts')).toBe(false);
	});
});

// ── Voice picker IA: metadata derivation + grouping (2026-07-13) ───────────────
describe('voiceMeta — id-structure derivation (never a hand table)', () => {
	it('decodes Kokoro <lang><gender>_name into language + gender + bare name', () => {
		expect(voiceMeta(KOKORO_MODEL_ID, 'af_heart')).toEqual({ langKey: 'a', langLabel: 'US English', country: 'US', gender: 'F', name: 'Heart' });
		expect(voiceMeta(KOKORO_MODEL_ID, 'am_adam')).toEqual({ langKey: 'a', langLabel: 'US English', country: 'US', gender: 'M', name: 'Adam' });
		expect(voiceMeta(KOKORO_MODEL_ID, 'bf_emma')).toMatchObject({ langLabel: 'UK English', gender: 'F' });
		expect(voiceMeta(KOKORO_MODEL_ID, 'zm_yunyang')).toMatchObject({ langLabel: 'Chinese', gender: 'M', name: 'Yunyang' });
	});

	it('gives a bare-name engine (Gemini) no language, but gender from the curated map', () => {
		// Gemini ids carry no language; gender comes from Google's official Gender column.
		expect(voiceMeta('google/gemini-3.1-flash-tts-preview', 'Kore')).toEqual({ name: 'Kore', gender: 'F' });
		expect(voiceMeta('google/gemini-3.1-flash-tts-preview', 'Puck')).toEqual({ name: 'Puck', gender: 'M' });
		expect(voiceMeta('google/gemini-3.1-flash-tts-preview', 'Kore').langKey).toBeUndefined();
	});

	it('resolves gender from the curated map for other bare-name engines (Grok, Orpheus)', () => {
		expect(voiceMeta('x-ai/grok-voice-tts-1.0', 'eve').gender).toBe('F');
		expect(voiceMeta('x-ai/grok-voice-tts-1.0', 'rex').gender).toBe('M');
		expect(voiceMeta('canopylabs/orpheus-3b-0.1-ft', 'tara').gender).toBe('F');
		expect(voiceMeta('canopylabs/orpheus-3b-0.1-ft', 'dan').gender).toBe('M');
	});

	it('reads gender straight from the id for Zonos (american_female / british_male)', () => {
		expect(voiceMeta('zyphra/zonos-v0.1-transformer', 'american_female')).toMatchObject({ gender: 'F', country: 'US' });
		expect(voiceMeta('zyphra/zonos-v0.1-hybrid', 'british_male')).toMatchObject({ gender: 'M', country: 'GB' });
	});

	it('resolves a country (for the flag) where the language maps to one — and none for a language-agnostic engine', () => {
		expect(voiceMeta(KOKORO_MODEL_ID, 'bf_emma').country).toBe('GB'); // UK English
		expect(voiceMeta(KOKORO_MODEL_ID, 'jf_alpha').country).toBe('JP');
		expect(voiceMeta('mistralai/voxtral-mini-tts-2603', 'gb_oliver_neutral').country).toBe('GB');
		expect(voiceMeta('microsoft/mai-voice-2', 'es-MX-Valeria:MAI-Voice-2').country).toBe('MX');
		expect(voiceMeta('google/gemini-3.1-flash-tts-preview', 'Kore').country).toBeUndefined(); // multilingual — no flag
	});

	it('shows NO gender for a persona-less voice (CSM) — never a guess', () => {
		expect(voiceMeta('sesame/csm-1b', 'read_speech_a').gender).toBeUndefined();
		expect(voiceMeta('sesame/csm-1b', 'conversational_a').gender).toBeUndefined();
	});

	it('decodes Voxtral <lang>_name(_emotion) into language + descriptive name, no gender', () => {
		expect(voiceMeta('mistralai/voxtral-mini-tts-2603', 'en_paul_happy')).toMatchObject({ langKey: 'en', langLabel: 'US English', name: 'Paul (happy)' });
		expect(voiceMeta('mistralai/voxtral-mini-tts-2603', 'gb_oliver_neutral').gender).toBeUndefined();
	});

	it('decodes an Azure/MAI xx-XX-Name locale into language + region', () => {
		expect(voiceMeta('microsoft/mai-voice-2', 'en-US-Ethan:MAI-Voice-2')).toMatchObject({ langKey: 'en-US', langLabel: 'English · US', name: 'Ethan' });
	});
});

describe('featuredVoiceIds — curated top, with cachedVoices fallback', () => {
	it('returns the catalog featuredVoices where declared (Kokoro, Gemini)', () => {
		expect(featuredVoiceIds(KOKORO_MODEL_ID)).toEqual(['af_heart', 'af_bella', 'am_michael', 'am_adam', 'bf_emma', 'bm_george']);
		expect(featuredVoiceIds('google/gemini-3.1-flash-tts-preview')).toContain('Kore');
	});

	it('falls back to cachedVoices when no featuredVoices is declared (Grok)', () => {
		expect(featuredVoiceIds('x-ai/grok-voice-tts-1.0')).toEqual(['eve', 'ara', 'rex', 'sal', 'leo']);
	});

	it('returns [] for an uncataloged model', () => {
		expect(featuredVoiceIds('some-vendor/unknown-tts')).toEqual([]);
	});
});

describe('groupVoices — Featured highlight + language groups (or one flat list)', () => {
	it('groups Kokoro by language, annotates gender, and does NOT repeat featured voices below', () => {
		const roster = voicesForModel(KOKORO_MODEL_ID, ['af_heart', 'af_sky', 'am_adam', 'am_onyx', 'bf_emma', 'bf_alice', 'zf_xiaoxiao']);
		const { featured, groups } = groupVoices(KOKORO_MODEL_ID, roster);
		// Featured are the declared ones that are present in this roster, in declared order.
		expect(featured.map((v) => v.id)).toEqual(['af_heart', 'am_adam', 'bf_emma']);
		expect(featured.find((v) => v.id === 'af_heart')?.gender).toBe('F');
		// Language groups, US English first; featured ids excluded from the groups.
		const allGrouped = groups.flatMap((g) => g.voices.map((v) => v.id));
		expect(allGrouped).not.toContain('af_heart');
		expect(allGrouped).toContain('af_sky');
		expect(groups[0].label).toBe('US English');
		// A group row shows the bare name + carries gender for the badge.
		const usRow = groups[0].voices.find((v) => v.id === 'am_onyx');
		expect(usRow).toMatchObject({ label: 'Onyx', gender: 'M' });
	});

	it('collapses a bare-name engine (Gemini) to a single All voices list — no language groups, but with gender badges', () => {
		const roster = voicesForModel('google/gemini-3.1-flash-tts-preview', ['Zephyr', 'Puck', 'Kore', 'Callirrhoe', 'Sulafat']);
		const { featured, groups } = groupVoices('google/gemini-3.1-flash-tts-preview', roster);
		expect(featured.length).toBeGreaterThan(0);
		expect(groups).toHaveLength(1);
		expect(groups[0].label).toBe('All voices');
		// No language grouping (bare names), but gender now comes from the curated map.
		expect(groups[0].voices.find((v) => v.id === 'Callirrhoe')?.gender).toBe('F');
		expect(groups[0].voices.find((v) => v.id === 'Sulafat')?.gender).toBe('F');
	});
});

describe('flagEmoji / countryName — the row flag', () => {
	it('turns an ISO alpha-2 code into a regional-indicator flag emoji', () => {
		expect(flagEmoji('US')).toBe('🇺🇸');
		expect(flagEmoji('GB')).toBe('🇬🇧');
		expect(flagEmoji('jp')).toBe('🇯🇵'); // case-insensitive
	});
	it('returns empty string for a missing or malformed code (no badge)', () => {
		expect(flagEmoji(undefined)).toBe('');
		expect(flagEmoji('USA')).toBe('');
		expect(flagEmoji('')).toBe('');
	});
	it('names a country for the flag aria-label, falling back to the raw code', () => {
		expect(countryName('BR')).toBe('Brazil');
		expect(countryName('ZZ')).toBe('ZZ');
	});
});
