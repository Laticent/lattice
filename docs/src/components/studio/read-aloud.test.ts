import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slideToSpeech, useReadAloud } from './read-aloud';

// The spoken-audio rung is irrelevant to the teleprompter timer that drives
// onFinish — stub the voice model so play() doesn't import the real Kokoro worker.
// A configurable stub of the production voice ladder. Default rung 'silent' → the
// estimate clock carries the highlight (no audio path). Tests can flip `voiceState`
// to drive the AUDIO clock + capture `onSentenceTiming` to exercise re-anchoring.
const { unlockSpy, voiceState } = vi.hoisted(() => ({
	unlockSpy: vi.fn(),
	voiceState: { rung: 'silent', audioMs: 0, onTiming: null as null | ((t: { index: number; onsetMs: number; durationMs: number }) => void) },
}));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({
		speak(o: { onSentenceTiming?: (t: { index: number; onsetMs: number; durationMs: number }) => void }) {
			voiceState.onTiming = o.onSentenceTiming ?? null;
		},
		stop() {},
		pause() {},
		resume() {},
		rung: () => voiceState.rung,
		unlock: unlockSpy,
		audioTimeMs: () => voiceState.audioMs,
		outputLatencyMs: () => 0,
	}),
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

// onFinish is the natural-end signal Present's autoplay chains on — it must fire when
// the word cursor walks off the end of the track, and NOT on a manual stop. Fake timers
// drive the requestAnimationFrame loop; rung 'silent' → the estimate clock runs it.
describe('useReadAloud — onFinish (autoplay chain signal)', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('fires once when a slide is read to its natural end', async () => {
		const onFinish = vi.fn();
		const { result } = renderHook(() => useReadAloud('One. Two.', { onFinish }));
		act(() => result.current.play());
		expect(result.current.playing).toBe(true);
		// Walk the RAF clock well past the track's estimated duration.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(12000);
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
			await vi.advanceTimersByTimeAsync(12000);
		});
		expect(onFinish).not.toHaveBeenCalled();
	});

	it('highlights word by word — the active cursor advances through the track', async () => {
		const { result } = renderHook(() => useReadAloud('Alpha bravo charlie. Delta.'));
		act(() => result.current.play());
		expect(result.current.active).toBeNull(); // nothing highlighted at t=0 yet
		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});
		const first = result.current.active;
		expect(first).toEqual({ cueIndex: 0, wordIndex: 0 }); // FIRST word, not the whole sentence
		// Advance and the cursor moves to a LATER word (word-level, not block).
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		const later = result.current.active;
		expect(later && (later.cueIndex > 0 || later.wordIndex > 0)).toBe(true);
	});
});

// The iOS fix: play() must unlock the audio context SYNCHRONOUSLY in the tap, using
// the voice warmed on mount — otherwise iPhone Present mode stays silent (the async
// speak() resumes too late). This guards the call; real audio is a device-only check.
describe('useReadAloud — iOS audio unlock in the play gesture', () => {
	beforeEach(() => unlockSpy.mockClear());

	it('play() unlocks the warmed voice synchronously', async () => {
		const { result } = renderHook(() => useReadAloud('One. Two.'));
		// Flush the mount warm-effect so voiceRef is populated before the tap.
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		act(() => result.current.play());
		expect(unlockSpy).toHaveBeenCalled();
	});
});

// The audio path: with a clocked voice (Kokoro/OpenRouter) the highlight must HOLD at
// the first word until the measured onset arrives, then ride the audio clock — not
// race ahead on the estimate and snap back. Drives the mock's audio clock + onset.
describe('useReadAloud — audio-clock sync', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		voiceState.rung = 'kokoro';
		voiceState.audioMs = 0;
		voiceState.onTiming = null;
	});
	afterEach(() => {
		vi.useRealTimers();
		voiceState.rung = 'silent';
		voiceState.onTiming = null;
	});

	it('holds at word 0 before the first onset (no estimate race), then tracks the onset', async () => {
		const { result } = renderHook(() => useReadAloud('Alpha bravo charlie delta. Echo foxtrot.'));
		await act(async () => {
			await Promise.resolve(); // warm
			await Promise.resolve();
		});
		act(() => result.current.play());
		await act(async () => {
			await Promise.resolve(); // getVoice().then → mode 'audio', speak() captures onTiming
			await Promise.resolve();
		});
		// The audio clock has jumped far, but NO onset yet → elapsed must hold at 0, so the
		// cursor stays on word 0 instead of racing off the end on wall-clock time.
		voiceState.audioMs = 9000;
		await act(async () => {
			await vi.advanceTimersByTimeAsync(3000);
		});
		expect(result.current.active).toEqual({ cueIndex: 0, wordIndex: 0 });
		// Sentence 0's measured onset lands at audio-time 9000 → that becomes t=0.
		act(() => voiceState.onTiming?.({ index: 0, onsetMs: 9000, durationMs: 1600 }));
		voiceState.audioMs = 9000 + 800; // mid sentence 0 (of its re-anchored 1600ms span)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});
		const a = result.current.active;
		expect(a && a.cueIndex === 0 && a.wordIndex > 0).toBe(true); // advanced WITHIN sentence 0, on the audio clock
	});
});
