import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOICE_SELECTION_KEY } from '@/lib/model-selection.js';
import { VoiceModelSection } from './AiModelSections';

// The Voice model card says so when the chosen voice is one measured to misread a word by its place in the
// sentence (lib/voice-caveats.ts, #3319), and says nothing for a voice that measured clean. No network: the
// availability probe is mocked, and the card reads the stored selection, as it does in the Studio.
vi.mock('./read-aloud', async (orig) => ({ ...(await orig<object>()), voiceAvailability: vi.fn(async () => null) }));

const choose = (provider: string, model: string) =>
	localStorage.setItem(VOICE_SELECTION_KEY, JSON.stringify({ v: 1, source: 'cloud', provider, model, voice: '', last: { [provider]: { model, voice: '' } } }));

afterEach(() => localStorage.clear());

describe('VoiceModelSection: a measured voice caveat', () => {
	it('shows the note under the card when Gemini Flash-Lite is the voice', () => {
		choose('gemini', 'gemini-3.8-flash-lite-tts');
		render(<VoiceModelSection />);
		expect(screen.getByRole('note')).toHaveTextContent(/depending on where it falls in a sentence/);
	});
	it('shows no note for a voice that read the same word right every time', () => {
		choose('openrouter', 'google/gemini-3.1-flash-tts-preview');
		render(<VoiceModelSection />);
		expect(screen.queryByRole('note')).toBeNull();
	});
});
