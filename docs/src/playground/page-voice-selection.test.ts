// pageVoiceSelection: a library page reads the STORED voice selection and never writes it
// (followups 3079-p3-library-pages-on-the-voice-spine). The checker on PR #3105 found that reading
// through readVoiceSelection() ran the one-time migration, which WROTE a Kokoro selection on any
// desktop and made the page's own default unreachable; these tests pin the fix.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_SELECTION_KEY } from '../lib/model-selection.js';
import { pageVoiceSelection } from './page-voice-selection.js';

const DESKTOP = (q: string) => ({ matches: /pointer:\s*fine|hover:\s*hover/.test(q), media: q, addEventListener() {}, removeEventListener() {} });

describe('pageVoiceSelection', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.stubGlobal('matchMedia', DESKTOP);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('a fresh desktop browser gets the page default, and storage stays empty (no migration, no write)', () => {
		const sel = pageVoiceSelection({ whenUnset: () => ({ source: 'device', provider: 'browser' }) });
		expect(sel.read()).toMatchObject({ provider: 'browser' });
		expect(localStorage.getItem(VOICE_SELECTION_KEY)).toBeNull();
		expect(localStorage.length).toBe(0);
	});

	it('a stored selection wins over the page default', () => {
		localStorage.setItem(VOICE_SELECTION_KEY, JSON.stringify({ v: 1, source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash-lite-tts', voice: 'kore', last: {} }));
		const sel = pageVoiceSelection({ whenUnset: () => ({ source: 'device', provider: 'browser' }) });
		expect(sel.read()).toMatchObject({ provider: 'gemini', voice: 'kore' });
	});

	it('select() is page-scoped: it changes what this page reads and never writes the stored selection', () => {
		const stored = JSON.stringify({ v: 1, source: 'cloud', provider: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_bella', last: {} });
		localStorage.setItem(VOICE_SELECTION_KEY, stored);
		const sel = pageVoiceSelection();
		sel.select({ voice: 'bm_george' });
		expect(sel.read()).toMatchObject({ provider: 'openrouter', voice: 'bm_george' });
		expect(localStorage.getItem(VOICE_SELECTION_KEY)).toBe(stored);
	});

	it('an override is set aside while the stored selection names another provider', () => {
		localStorage.setItem(VOICE_SELECTION_KEY, JSON.stringify({ v: 1, source: 'cloud', provider: 'openrouter', model: '', voice: 'af_bella', last: {} }));
		const sel = pageVoiceSelection();
		sel.select({ voice: 'bm_george' });
		localStorage.setItem(VOICE_SELECTION_KEY, JSON.stringify({ v: 1, source: 'cloud', provider: 'gemini', model: '', voice: 'kore', last: {} }));
		expect(sel.read()).toMatchObject({ provider: 'gemini', voice: 'kore' });
	});
});
