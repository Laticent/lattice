import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrack } from '@/lib/cadenza';
import { loadCalibration, recordObservation, resetCalibration } from '@/playground/readaloud-calibration';
import { previewTtsVoice, slideToSpeech, useReadAloud } from './read-aloud';

// The audio backend is now a Suono stage + sequence (not voice.speak). Two stubs:
//   • the voice model — SYNTHESIZES bytes (synthOne, fed to the sequence's produce, never invoked
//     here) and exposes the label/pref getters play() reads. Default rung 'silent' → the wall-clock
//     estimate carries the highlight, no clocked audio path.
//   • the Suono stage — spies its unlock (the iOS gesture handshake), exposes a controllable
//     clockMs(), and has sequence() CAPTURE the onItemStart/onState callbacks so a test can drive a
//     measured onset (the re-anchor + calibration fold) and returns inert transport spies.
const { unlockSpy, previewVoiceSpy, voiceState, stageCtl } = vi.hoisted(() => ({
	unlockSpy: vi.fn(),
	// Typed with its real parameter (not `async () => ...`, a zero-arg
	// signature) so `previewVoiceSpy.mock.calls[0][0]` below has a real
	// element type — a bare `vi.fn(async () => ...)` infers `mock.calls` as
	// `[][]`, and indexing a length-0 tuple is a `tsc --noEmit` error the
	// esbuild-transformed `vitest run` never catches (caught live in CI).
	previewVoiceSpy: vi.fn(async (_o: { rung: 'openrouter' | 'kokoro'; voice?: string; model?: string; speed?: number }) => ({ ok: true })),
	voiceState: { rung: 'silent' as string },
	stageCtl: {
		clockMs: 0,
		state: 'running' as 'none' | 'suspended' | 'running',
		onItemStart: null as null | ((e: { index: number; onsetMs: number; durationMs: number }) => void),
		onState: null as null | ((e: { playing: boolean; index: number; error?: string; aborted?: boolean }) => void),
		play: vi.fn(),
		pause: vi.fn(),
		resume: vi.fn(),
		stop: vi.fn(),
	},
}));
vi.mock('@/lib/suono', () => ({
	createStage: () => ({
		unlock: unlockSpy,
		clockMs: () => stageCtl.clockMs,
		state: () => stageCtl.state,
		latencyMs: () => 0,
		suspend() {},
		resume() {},
		stopAll() {},
		dispose() {},
		decode: async () => ({ durationMs: 0, buffer: {} }),
		play: () => ({ stop() {}, done: Promise.resolve({ ok: true }) }),
		sequence: (o: {
			onItemStart?: (e: { index: number; onsetMs: number; durationMs: number }) => void;
			onState?: (e: { playing: boolean; index: number; error?: string; aborted?: boolean }) => void;
		}) => {
			stageCtl.onItemStart = o.onItemStart ?? null;
			stageCtl.onState = o.onState ?? null;
			return {
				play: stageCtl.play,
				pause: stageCtl.pause,
				resume: stageCtl.resume,
				stop: stageCtl.stop,
				playing: () => true,
				warm() {},
			};
		},
	}),
}));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({
		synthOne: async () => ({ rung: voiceState.rung, bytes: null, key: 'test-key' }),
		speakThis: () => {},
		warm: () => {},
		stop() {},
		pause() {},
		resume() {},
		rung: () => voiceState.rung,
		unlock: () => {},
		orModel: () => 'test/model',
		orVoice: () => 'test-voice',
		// Empty kokoro voice → the resolved calibration key is voiceKeyOf('kokoro · ?') === 'kokoro'
		// (the label's non-alphanumerics collapse away), which the calibration tests below assert on.
		kokoroVoice: () => '',
		speedPref: () => 1,
		previewVoice: previewVoiceSpy,
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

	it('punctuates list items and headings so they read as separate clauses', () => {
		const out = slideToSpeech('## Revenue grew\n\n- First stage\n- Second stage\n- Third stage');
		// Each structural line gets its own terminator — Cadenza's PAUSE_MS then
		// falls between them instead of one breathless run-on.
		expect(out).toBe('Revenue grew. First stage. Second stage. Third stage.');
	});

	it('does not double-punctuate a line that already ends in punctuation', () => {
		const out = slideToSpeech('## Where the flow drops off.\n\n- Grew 12%.\n- Flat, unchanged.');
		expect(out).toBe('Where the flow drops off. Grew 12%. Flat, unchanged.');
	});

	it('leaves plain paragraph continuations alone (no invented mid-sentence break)', () => {
		const out = slideToSpeech('We shipped the feature\nahead of schedule and under budget.');
		expect(out).toBe('We shipped the feature ahead of schedule and under budget.');
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

// The iOS fix: play() must unlock the Suono stage's audio context SYNCHRONOUSLY in the
// tap — otherwise iPhone Present mode stays silent (the async sequence resumes too late).
// This guards the call (unlockSpy is the stage's unlock); real audio is a device-only check.
describe('useReadAloud — iOS audio unlock in the play gesture', () => {
	beforeEach(() => unlockSpy.mockClear());

	it('play() unlocks the stage synchronously', async () => {
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
		stageCtl.clockMs = 0;
		stageCtl.onItemStart = null;
		stageCtl.onState = null;
	});
	afterEach(() => {
		vi.useRealTimers();
		voiceState.rung = 'silent';
		stageCtl.onItemStart = null;
		stageCtl.onState = null;
	});

	it('holds at word 0 before the first onset (no estimate race), then tracks the onset', async () => {
		const { result } = renderHook(() => useReadAloud('Alpha bravo charlie delta. Echo foxtrot.'));
		await act(async () => {
			await Promise.resolve(); // warm
			await Promise.resolve();
		});
		act(() => result.current.play());
		await act(async () => {
			await Promise.resolve(); // getVoice().then → mode 'audio', stage.sequence() captures onItemStart
			await Promise.resolve();
		});
		// The audio clock has jumped far, but NO onset yet → elapsed must hold at 0, so the
		// cursor stays on word 0 instead of racing off the end on wall-clock time.
		stageCtl.clockMs = 9000;
		await act(async () => {
			await vi.advanceTimersByTimeAsync(3000);
		});
		expect(result.current.active).toEqual({ cueIndex: 0, wordIndex: 0 });
		// Sentence 0's measured onset lands at audio-time 9000 → that becomes t=0.
		act(() => stageCtl.onItemStart?.({ index: 0, onsetMs: 9000, durationMs: 1600 }));
		stageCtl.clockMs = 9000 + 800; // mid sentence 0 (of its re-anchored 1600ms span)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});
		const a = result.current.active;
		expect(a && a.cueIndex === 0 && a.wordIndex > 0).toBe(true); // advanced WITHIN sentence 0, on the audio clock
	});

	// Per-voice pace calibration (2026-07-12-per-voice-pace-calibration.md) — slice 1 is
	// MEASURE-ONLY: collect samples, but never let the fitted k rescale the played track yet.
	it('records a calibration sample on each measured onset (the collection tap)', async () => {
		resetCalibration();
		const { result } = renderHook(() => useReadAloud('Alpha bravo charlie delta. Echo foxtrot.'));
		await act(async () => {
			await Promise.resolve(); // warm
			await Promise.resolve();
		});
		act(() => result.current.play());
		await act(async () => {
			await Promise.resolve(); // getVoice().then → resolves the 'kokoro' voice key, captures onItemStart
			await Promise.resolve();
		});
		expect(loadCalibration('kokoro').n).toBe(0); // nothing recorded before the first onset
		act(() => stageCtl.onItemStart?.({ index: 0, onsetMs: 1000, durationMs: 1600 }));
		act(() => stageCtl.onItemStart?.({ index: 1, onsetMs: 3000, durationMs: 1600 }));
		expect(loadCalibration('kokoro').n).toBe(2); // one clean sample per measured onset
	});

	it('measure-only: an existing per-voice calibration does NOT rescale the played track', async () => {
		resetCalibration();
		// Seed a strong calibration for the voice this test resolves to ('kokoro'): k would be
		// 1.5× if it were ever applied to the estimate.
		for (let i = 0; i < 10; i++) recordObservation('kokoro', 100, 150, 1);
		const text = 'Alpha bravo charlie delta. Echo foxtrot.';
		const baseline = buildTrack(text); // the unscaled (rateScale 1) prediction
		const { result } = renderHook(() => useReadAloud(text));
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		// The track the reader plays matches the UNSCALED baseline, not 1.5× — proving the
		// fitted k never reaches buildTrack in this slice (the guard the apply-slice must keep).
		const played = result.current.track.cues[0];
		const base = baseline.cues[0];
		expect(played.endMs - played.startMs).toBe(base.endMs - base.startMs);
	});
});

// play() defers its FIRST tick to getVoice().then() (see
// engineering/decisions/2026-07-09-cadenza-narration-quality.md §3.3) so the highlight
// loop never runs a frame before the mode is known. That moved the "always runs" floor
// out of play()'s synchronous body — this guards the fallback that keeps it true when
// the voice model fails to load entirely. Uses its own module instance (resetModules)
// because `read-aloud.ts`'s voice-model promise is a file-wide singleton the earlier
// tests in this file have already resolved.
describe('useReadAloud — resilience when the voice model fails to load', () => {
	afterEach(async () => {
		vi.doUnmock('@/playground/voice-model.js');
		vi.resetModules();
	});

	it('still runs the estimate-driven read-along instead of hanging silently', async () => {
		vi.resetModules();
		vi.doMock('@/playground/voice-model.js', () => ({
			createVoiceModel: () => {
				throw new Error('voice model unavailable');
			},
		}));
		const { useReadAloud: useReadAloudFresh } = await import('./read-aloud');
		vi.useFakeTimers();
		try {
			const onFinish = vi.fn();
			const { result } = renderHook(() => useReadAloudFresh('One. Two.', { onFinish }));
			act(() => result.current.play());
			expect(result.current.playing).toBe(true);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(12000);
			});
			expect(onFinish).toHaveBeenCalledTimes(1);
			expect(result.current.playing).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
});

// A maker-checker finding: pausing DURING the arming window (voice load still in
// flight) and resuming before it resolves must not restart the loop on the stale
// default mode — that reproduces the exact race-then-rewind this file exists to
// fix, just reached via pause/resume instead of a fresh play(). armedRef gates
// this: the loop only starts once the mode is actually decided, whichever of
// resume() or the pending getVoice().then() callback gets there second.
describe('useReadAloud — pause/resume during the voice-arming window', () => {
	afterEach(async () => {
		vi.doUnmock('@/playground/voice-model.js');
		vi.resetModules();
	});

	it('resuming before the voice resolves does not race the loop into a stale mode', async () => {
		vi.resetModules();
		let resolveVoice: () => void = () => {};
		const gate = new Promise<void>((res) => {
			resolveVoice = () => res();
		});
		vi.doMock('@/playground/voice-model.js', () => ({
			createVoiceModel: () =>
				gate.then(() => ({
					speak() {},
					stop() {},
					pause() {},
					resume() {},
					rung: () => 'kokoro',
					unlock() {},
					audioTimeMs: () => 0,
					outputLatencyMs: () => 0,
				})),
		}));
		const { useReadAloud: useReadAloudFresh } = await import('./read-aloud');
		vi.useFakeTimers();
		try {
			const { result } = renderHook(() => useReadAloudFresh('Alpha bravo charlie. Delta echo.'));
			act(() => result.current.play()); // cold start — arming begins, voice still pending
			act(() => result.current.pause()); // paused while still arming
			act(() => result.current.play()); // resumed — still before the voice resolves
			// Not yet armed (the voice hasn't resolved): the loop must not be running
			// on the stale default mode, so nothing has advanced.
			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});
			expect(result.current.active).toBeNull();
			// The voice resolves now — arming completes. Since we're not paused, the
			// pending callback starts the loop itself, already in 'audio' mode.
			resolveVoice();
			await act(async () => {
				await Promise.resolve();
				await Promise.resolve();
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});
			// Held at word 0 (audio mode, no onset yet) — never raced ahead on the
			// estimate first.
			expect(result.current.active).toEqual({ cueIndex: 0, wordIndex: 0 });
		} finally {
			vi.useRealTimers();
		}
	});
});

// Munger-inversion finding (2026-07-11, see the decision doc's TTS follow-up):
// `speed` is a single cross-model preference — unlike voice, it's never reset
// when the active model changes (TtsSettings.tsx's pickOrModel only resets
// voice). Before this fix, Playing a model whose `speed` param is verified to
// do nothing (speedSupported — tts-voice-catalog.ts) with a stale non-1 speed
// left over from a DIFFERENT, speed-supporting model silently forced a live,
// billed OpenRouter call: cachedSampleUrl only serves the free, committed local
// sample at speed === 1. previewTtsVoice now clamps to 1 for a non-speed-
// supporting model before either the cache lookup or the live fallback.
describe('previewTtsVoice — clamps a stale cross-model speed for a model that cannot use it', () => {
	beforeEach(() => previewVoiceSpy.mockClear());

	it('clamps to speed 1 before the live fallback when the model does not support speed', async () => {
		// Gemini is speedSupport:false; 'Callirrhoe' is a real live voice OUTSIDE
		// its cachedVoices subset, so cachedSampleUrl deterministically misses and
		// this always reaches the live fallback — no jsdom Audio-element ambiguity.
		await previewTtsVoice({ rung: 'openrouter', model: 'google/gemini-3.1-flash-tts-preview', voice: 'Callirrhoe', speed: 1.3 });
		expect(previewVoiceSpy).toHaveBeenCalledTimes(1);
		expect(previewVoiceSpy.mock.calls[0][0]).toMatchObject({ speed: 1 });
	});

	it('passes a real speed through unchanged for a model that DOES support it', async () => {
		// Kokoro is speedSupport:true and requiresAsset:false (never cached), so
		// this also deterministically reaches the live fallback.
		await previewTtsVoice({ rung: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1.3 });
		expect(previewVoiceSpy).toHaveBeenCalledTimes(1);
		expect(previewVoiceSpy.mock.calls[0][0]).toMatchObject({ speed: 1.3 });
	});

	it('defaults an omitted speed to 1 regardless of speed support', async () => {
		await previewTtsVoice({ rung: 'openrouter', model: 'google/gemini-3.1-flash-tts-preview', voice: 'Callirrhoe' });
		expect(previewVoiceSpy.mock.calls[0][0]).toMatchObject({ speed: 1 });
	});
});
