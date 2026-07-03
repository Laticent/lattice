import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slideToSpeech, useReadAloud } from './read-aloud';

// The spoken-audio rung is irrelevant to the teleprompter timer that drives
// onFinish — stub the voice model so play() doesn't import the real Kokoro worker.
vi.mock('@/components/studio/present/voice-model.js', () => ({
	createVoiceModel: () => ({ speak() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent' }),
}));

// slideToSpeech is the narration extractor — it turns a slide's Markdown into the
// readable prose the teleprompter highlights and the voice ladder speaks. Pure;
// no engine, no DOM.
describe('slideToSpeech — Markdown → readable narration', () => {
	it('drops the _class directive, keeps the prose', () => {
		const out = slideToSpeech('<!-- _class: kpi -->\n\n## Revenue is up\n\nWe grew 40% this quarter.');
		expect(out).toContain('Revenue is up');
		expect(out).toContain('We grew 40% this quarter.');
		expect(out).not.toContain('_class');
		expect(out).not.toContain('##');
	});

	it('strips list markers, emphasis and inline code', () => {
		const out = slideToSpeech('- **Bold** point\n- a `code` token\n- plain item');
		expect(out).toContain('Bold point');
		expect(out).toContain('a code token');
		expect(out).not.toMatch(/[*`]/);
		expect(out).not.toMatch(/(^|\s)-\s/);
	});

	it('keeps the link label, drops the URL', () => {
		const out = slideToSpeech('See [the report](https://example.com/x) for detail.');
		expect(out).toContain('the report');
		expect(out).not.toContain('http');
	});

	it('skips fenced code blocks and background images entirely', () => {
		const out = slideToSpeech('Intro line.\n\n```js\nconst x = 1;\n```\n\n![bg](photo.jpg)\n\nClosing line.');
		expect(out).toContain('Intro line.');
		expect(out).toContain('Closing line.');
		expect(out).not.toContain('const x');
		expect(out).not.toContain('photo.jpg');
	});

	it('returns empty string for image-only / empty slides', () => {
		expect(slideToSpeech('![bg](a.svg)')).toBe('');
		expect(slideToSpeech('')).toBe('');
		expect(slideToSpeech('<!-- _class: cover -->')).toBe('');
	});
});

// onFinish is the natural-end signal Present's autoplay chains on — it must fire
// when the read walks off the last sentence, and NOT on a manual stop.
describe('useReadAloud — onFinish (autoplay chain signal)', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('fires once when a slide is read to its natural end', async () => {
		const onFinish = vi.fn();
		const { result } = renderHook(() => useReadAloud('One. Two.', { onFinish }));
		act(() => result.current.play());
		expect(result.current.playing).toBe(true);
		// Each sentence holds at least MIN_SENTENCE_MS (1100); walk well past both.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(8000);
		});
		expect(onFinish).toHaveBeenCalledTimes(1);
		expect(result.current.playing).toBe(false);
	});

	it('does NOT fire on a manual stop mid-read', async () => {
		const onFinish = vi.fn();
		const { result } = renderHook(() => useReadAloud('One. Two. Three.', { onFinish }));
		act(() => result.current.play());
		act(() => result.current.stop());
		await act(async () => {
			await vi.advanceTimersByTimeAsync(8000);
		});
		expect(onFinish).not.toHaveBeenCalled();
	});
});
