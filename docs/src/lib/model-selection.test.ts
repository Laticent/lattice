import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_SELECTION_KEY, chatModelFor, normalizeStoredVoice, readChatSelection, readVoiceSelection, selectChat, selectionEventKind, selectVoice, VOICE_SELECTION_KEY } from './model-selection.js';

// The model spine's store: one chat record and one voice record, read synchronously, migrated
// once from the legacy keys (engineering/decisions/2026-11-07-studio-model-spine.md).

beforeEach(() => localStorage.clear());

describe('chat selection', () => {
	it('defaults to OpenRouter with its curated default when nothing is stored', () => {
		expect(readChatSelection()).toEqual({ v: 1, source: 'cloud', provider: 'openrouter', model: '', last: {} });
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

	it('rejects a corrupt or future record rather than guessing', () => {
		localStorage.setItem(CHAT_SELECTION_KEY, JSON.stringify({ v: 2, provider: 'gemini' }));
		expect(readChatSelection().provider).toBe('openrouter');
		localStorage.setItem(CHAT_SELECTION_KEY, '{nope');
		expect(readChatSelection().provider).toBe('openrouter');
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
