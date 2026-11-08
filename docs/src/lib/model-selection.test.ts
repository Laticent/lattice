import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSelectionForTests, CHAT_SELECTION_KEY, chatModelFor, fillUnset, isSet, normalizeStoredVoice, readChatSelection, readImageSelection, readVoiceSelection, selectChat, selectImage, selectionEventKind, selectVoice, VOICE_SELECTION_KEY } from './model-selection.js';

// The model spine's store: one chat record and one voice record, read synchronously, migrated
// once from the legacy keys (engineering/decisions/2026-11-07-studio-model-spine.md).

beforeEach(() => {
	localStorage.clear();
	__resetSelectionForTests();
});

describe('chat selection', () => {
	it('is Not set when nothing is stored and no key exists (main answered nothing either)', () => {
		expect(readChatSelection()).toEqual({ v: 1, source: 'none', provider: '', model: '', last: {} });
		expect(isSet(readChatSelection())).toBe(false);
	});

	// §4.1: the migration reproduces what main ran, row by row.
	it('migration: an OpenRouter key and no pick is set to OpenRouter\'s default, as main ran', () => {
		localStorage.setItem('lattice-db-or-key', 'v1:sealed');
		expect(readChatSelection()).toMatchObject({ source: 'cloud', provider: 'openrouter', model: '' });
	});

	it('migration: a legacy provider whose key is gone stays that provider (reads needs its connection)', () => {
		localStorage.setItem('lattice-db-provider', 'gemini');
		expect(readChatSelection()).toMatchObject({ source: 'cloud', provider: 'gemini' });
	});

	it('migration: a direct key with no provider pick is Not set (main ran OpenRouter, which had no key)', () => {
		localStorage.setItem('lattice-db-gemini-key', 'v1:sealed');
		expect(isSet(readChatSelection())).toBe(false);
	});

	it('migrates the legacy provider and per-provider model keys once, then removes them', () => {
		localStorage.setItem('lattice-db-provider', 'gemini');
		localStorage.setItem('lattice-db-or-model', 'openai/gpt-6');
		localStorage.setItem('lattice-db-gemini-model', 'gemini-3.8-flash');
		localStorage.setItem('lattice-db-anthropic-model', 'claude-sonnet-5-5');
		expect(readChatSelection()).toEqual({
			v: 1,
			source: 'cloud',
			provider: 'gemini',
			model: 'gemini-3.8-flash',
			last: { openrouter: 'openai/gpt-6', gemini: 'gemini-3.8-flash', anthropic: 'claude-sonnet-5-5' },
		});
		for (const k of ['lattice-db-provider', 'lattice-db-or-model', 'lattice-db-gemini-model', 'lattice-db-anthropic-model']) expect(localStorage.getItem(k)).toBeNull();
		// Idempotent: a legacy key written later (an old tab) does not re-run the migration.
		localStorage.setItem('lattice-db-provider', 'openai');
		expect(readChatSelection().provider).toBe('gemini');
	});

	it('a selection survives a reload (it is only storage)', () => {
		selectChat({ provider: 'prompt-api' });
		const raw = localStorage.getItem(CHAT_SELECTION_KEY);
		expect(JSON.parse(raw ?? '{}')).toMatchObject({ source: 'device', provider: 'prompt-api' });
		expect(readChatSelection()).toMatchObject({ source: 'device', provider: 'prompt-api' });
	});

	it('remembers the last pick per provider and restores it on switching back', () => {
		selectChat({ provider: 'anthropic', model: 'claude-opus-5' });
		selectChat({ provider: 'webllm' });
		expect(chatModelFor('anthropic')).toBe('claude-opus-5');
		expect(selectChat({ provider: 'anthropic' }).model).toBe('claude-opus-5');
	});

	it('remembers the model it switches AWAY from, even when the record held no memory of it', () => {
		localStorage.setItem(CHAT_SELECTION_KEY, JSON.stringify({ v: 1, source: 'cloud', provider: 'openrouter', model: 'test/model', last: {} }));
		selectChat({ provider: 'prompt-api' });
		expect(selectChat({ provider: 'openrouter' }).model).toBe('test/model');
	});

	it('rejects a corrupt or future record rather than guessing', () => {
		localStorage.setItem(CHAT_SELECTION_KEY, JSON.stringify({ v: 2, provider: 'gemini' }));
		expect(isSet(readChatSelection())).toBe(false);
		localStorage.setItem(CHAT_SELECTION_KEY, '{nope');
		expect(isSet(readChatSelection())).toBe(false);
	});

	it('never re-migrates or overwrites a record it cannot read (a newer tab\'s v2)', () => {
		const future = JSON.stringify({ v: 2, source: 'cloud', provider: 'mistral', model: 'm' });
		localStorage.setItem(CHAT_SELECTION_KEY, future);
		localStorage.setItem(VOICE_SELECTION_KEY, future);
		localStorage.setItem('lattice-db-provider', 'gemini');
		expect(isSet(readChatSelection())).toBe(false);
		expect(isSet(readVoiceSelection())).toBe(false);
		expect(localStorage.getItem(CHAT_SELECTION_KEY)).toBe(future);
		expect(localStorage.getItem(VOICE_SELECTION_KEY)).toBe(future);
		expect(localStorage.getItem('lattice-db-provider')).toBe('gemini');
	});

	it('a pick made while storage is full takes effect on this page', () => {
		selectChat({ provider: 'openrouter', model: 'vendor/old' });
		const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		try {
			selectChat({ provider: 'anthropic', model: 'claude-opus-5' });
			expect(readChatSelection()).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5' });
		} finally {
			set.mockRestore();
		}
		// Once storage accepts writes again, the next pick is stored and read back as usual.
		selectChat({ provider: 'gemini', model: 'gemini-3.8-flash' });
		expect(JSON.parse(localStorage.getItem(CHAT_SELECTION_KEY) ?? '{}')).toMatchObject({ provider: 'gemini' });
		expect(readChatSelection().provider).toBe('gemini');
	});

	it('announces db-model-changed on select', () => {
		const spy = vi.fn();
		window.addEventListener('db-model-changed', spy);
		selectChat({ provider: 'openrouter', model: 'x/y' });
		window.removeEventListener('db-model-changed', spy);
		expect(spy).toHaveBeenCalledTimes(1);
	});
});

describe('voice selection', () => {
	it('migrates a stored cloud voice model as the cloud selection, keeping the Kokoro voice in last', () => {
		localStorage.setItem('lattice-studio-voice-or-model', 'x-ai/grok-tts');
		localStorage.setItem('lattice-studio-voice-or', 'eve');
		localStorage.setItem('lattice-studio-voice-kokoro', 'bf_emma');
		localStorage.setItem('lattice-studio-voice-rung', 'auto');
		expect(readVoiceSelection()).toEqual({
			v: 1,
			source: 'cloud',
			provider: 'openrouter',
			model: 'x-ai/grok-tts',
			voice: 'eve',
			last: { openrouter: { model: 'x-ai/grok-tts', voice: 'eve' }, kokoro: { model: '', voice: 'bf_emma' } },
		});
		for (const k of ['lattice-studio-voice-or-model', 'lattice-studio-voice-or', 'lattice-studio-voice-kokoro', 'lattice-studio-voice-rung']) expect(localStorage.getItem(k)).toBeNull();
	});

	it('migrates the dead kokoro rung as an on-device selection', () => {
		localStorage.setItem('lattice-studio-voice-rung', 'kokoro');
		localStorage.setItem('lattice-studio-voice-kokoro', 'am_adam');
		expect(readVoiceSelection()).toMatchObject({ source: 'device', provider: 'kokoro', voice: 'am_adam' });
	});

	it('is independent of the chat selection', () => {
		selectVoice({ provider: 'kokoro', voice: 'af_heart' });
		selectChat({ provider: 'anthropic' });
		selectChat({ provider: 'webllm' });
		expect(readVoiceSelection()).toMatchObject({ provider: 'kokoro', voice: 'af_heart' });
		expect(localStorage.getItem(VOICE_SELECTION_KEY)).toContain('kokoro');
	});

	it('a new model drops the previous model’s voice unless a voice is named', () => {
		selectVoice({ provider: 'openrouter', model: 'a/tts', voice: 'v1' });
		expect(selectVoice({ provider: 'openrouter', model: 'b/tts' }).voice).toBe('');
		expect(selectVoice({ provider: 'openrouter', model: 'c/tts', voice: 'v9' }).voice).toBe('v9');
	});
});

describe('voice migration reproduces main\'s ladder (§4.1)', () => {
	const coarse = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('coarse') }));
	afterEach(() => vi.unstubAllGlobals());
	it('no pick, on a desktop that can run Kokoro: Kokoro on this device, key or not (free, as main)', () => {
		coarse(false);
		localStorage.setItem('lattice-db-or-key', 'v1:sealed');
		expect(readVoiceSelection()).toMatchObject({ source: 'device', provider: 'kokoro' });
	});
	it('no pick, on a phone, an OpenRouter key: OpenRouter\'s default voice', () => {
		coarse(true);
		localStorage.setItem('lattice-db-or-key', 'v1:sealed');
		expect(readVoiceSelection()).toMatchObject({ source: 'cloud', provider: 'openrouter', model: '' });
	});
	it('no pick, on a phone, no key: Not set', () => {
		coarse(true);
		expect(isSet(readVoiceSelection())).toBe(false);
	});
	it('a stored OpenRouter voice pick stays, even on a desktop', () => {
		coarse(false);
		localStorage.setItem('lattice-studio-voice-or-model', 'hexgrad/kokoro-82m');
		expect(readVoiceSelection()).toMatchObject({ provider: 'openrouter', model: 'hexgrad/kokoro-82m' });
	});
});

describe('image reader', () => {
	it('is same as chat by default, and migrates a non-default old image model as its own reader on OpenRouter', () => {
		expect(readImageSelection()).toMatchObject({ mode: 'same' });
		localStorage.clear();
		__resetSelectionForTests();
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ imageModel: 'openai/gpt-5' }));
		expect(readImageSelection()).toMatchObject({ mode: 'own', provider: 'openrouter', model: 'openai/gpt-5' });
	});
	it('the old default is same as chat, and selectImage switches between same and own', () => {
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ imageModel: '~anthropic/claude-sonnet-latest' }));
		expect(readImageSelection().mode).toBe('same');
		selectImage({ mode: 'own', provider: 'gemini', model: 'gemini-3.8-flash' });
		expect(readImageSelection()).toMatchObject({ mode: 'own', provider: 'gemini', model: 'gemini-3.8-flash' });
		selectImage({ mode: 'same' });
		expect(readImageSelection()).toMatchObject({ mode: 'same', last: { gemini: 'gemini-3.8-flash' } });
	});
});

describe('fill (rule 1)', () => {
	// On a phone the voice migration leaves voice Not set, so each fill is visible.
	beforeEach(() => vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') })));
	afterEach(() => vi.unstubAllGlobals());
	it('fills only Not-set selections, in the fixed order, and says what it filled', () => {
		const filled = fillUnset({ connected: ['anthropic'], kokoro: false });
		expect(filled).toEqual([{ kind: 'chat', provider: 'anthropic' }]);
		expect(readChatSelection()).toMatchObject({ provider: 'anthropic' });
		expect(isSet(readVoiceSelection())).toBe(false); // Anthropic cannot speak
		// A later OpenRouter connection fills voice (still Not set) and leaves chat alone.
		expect(fillUnset({ connected: ['anthropic', 'openrouter'], kokoro: false })).toEqual([{ kind: 'voice', provider: 'openrouter' }]);
		expect(readChatSelection()).toMatchObject({ provider: 'anthropic' });
	});
	it('fills voice with Kokoro on a desktop before any connection, and never fills on-device chat', () => {
		expect(fillUnset({ connected: [], kokoro: true })).toEqual([{ kind: 'voice', provider: 'kokoro' }]);
		expect(isSet(readChatSelection())).toBe(false);
	});
	it('never touches a set selection, whatever its state', () => {
		selectChat({ provider: 'gemini', model: 'gemini-3.8-flash' });
		expect(fillUnset({ connected: ['openrouter'], kokoro: false })).toEqual([{ kind: 'voice', provider: 'openrouter' }]);
		expect(readChatSelection()).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash' });
	});
});

describe('voice normalization (not a pick)', () => {
	it('rewrites a stale voice id for that provider + model without changing the selected provider', () => {
		selectVoice({ provider: 'openrouter', model: 'x-ai/grok', voice: 'Eve' });
		selectVoice({ provider: 'kokoro', voice: 'af_heart' }); // Kokoro is selected now
		const spy = vi.fn();
		window.addEventListener('db-voice-changed', spy);
		expect(normalizeStoredVoice({ provider: 'openrouter', model: 'x-ai/grok', from: 'Eve', to: 'eve' })).toBe(true);
		window.removeEventListener('db-voice-changed', spy);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(readVoiceSelection()).toMatchObject({ provider: 'kokoro', voice: 'af_heart', last: { openrouter: { model: 'x-ai/grok', voice: 'eve' } } });
	});

	it('changes nothing for another model, or when the id is already right', () => {
		selectVoice({ provider: 'openrouter', model: 'a/tts', voice: 'v1' });
		expect(normalizeStoredVoice({ provider: 'openrouter', model: 'b/tts', from: 'v1', to: 'v2' })).toBe(false);
		expect(normalizeStoredVoice({ provider: 'openrouter', model: 'a/tts', from: 'v1', to: 'v1' })).toBe(false);
		expect(readVoiceSelection().voice).toBe('v1');
	});
});

describe('cross-tab', () => {
	it('classifies storage events', () => {
		expect(selectionEventKind({ key: CHAT_SELECTION_KEY })).toBe('chat');
		expect(selectionEventKind({ key: VOICE_SELECTION_KEY })).toBe('voice');
		expect(selectionEventKind({ key: null })).toBe('both');
		expect(selectionEventKind({ key: 'something-else' })).toBeNull();
	});
});
