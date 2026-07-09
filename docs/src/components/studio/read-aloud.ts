import * as React from 'react';
import { type Active, buildTrack, type CaptionTrack, makeReader, type Reader } from '@/lib/cadenza';

// Studio read-aloud — the REAL synchronized read-along, WORD by word.
//
// Same engine as the /cadenza demo (the reference implementation):
//   buildTrack(text)  → a word-timed CaptionTrack (each word: a display + spoken form)
//   makeReader(track) → a pure clock→word cursor (emits the active {cueIndex, wordIndex})
//   a requestAnimationFrame loop ticks the reader against a clock:
//     • 'audio' — a quality voice (OpenRouter / Kokoro) is speaking: ride its OWN WebAudio
//       clock (audioTimeMs − outputLatency), and each sentence's MEASURED onset re-anchors
//       that cue's words via reader.align() — so the highlight tracks the real voice.
//     • 'silent' — no blob clock (browser voice / no key): a plain wall-clock estimate off
//       Cadenza's built-in word timings, so the read-along always runs.
//
// Spoken audio rides the production voice ladder (voice-model.js); we never use raw
// speechSynthesis (the per-device lottery banned in production; see
// engineering/decisions/2026-06-14-read-aloud-kokoro.md). This replaced an older
// sentence-block estimate that ignored the audio entirely (drifted + coarse).

// The OpenRouter key the architect/voice ladder share (lattice-db-* namespace).
const OR_KEY_LS = 'lattice-db-or-key';

/**
 * Strip a slide's Markdown down to the readable prose a narrator would speak:
 * drop the `<!-- _class -->` directive, fenced code, background-image lines and
 * the inline syntax (`#`, `-`, `>`, `*`, backticks, links), keeping the words.
 * Pure — safe in SSR and tests.
 */
export function slideToSpeech(markdown: string): string {
	const lines = String(markdown || '').split('\n');
	const out: string[] = [];
	let inFence = false;
	for (const raw of lines) {
		const line = raw.trim();
		if (/^```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		if (!line) continue;
		if (/^<!--/.test(line)) continue; // _class / directive comments
		if (/^!\[/.test(line)) continue; // ![bg](…) / images — nothing to say
		if (/^[-=*_]{3,}$/.test(line)) continue; // slide rule / hr
		out.push(line);
	}
	let text = out.join(' ');
	// Inline syntax → words only.
	text = text
		.replace(/`([^`]*)`/g, '$1') // inline code
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links / images → label
		.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // emphasis
		.replace(/^#+\s*/g, '') // stray heading marks
		.replace(/(^|\s)[#>]+\s*/g, '$1') // blockquote / heading markers
		.replace(/(^|\s)[-*+]\s+/g, '$1') // list bullets
		.replace(/(^|\s)\d+\.\s+/g, '$1') // ordered markers
		.replace(/\s+/g, ' ')
		.trim();
	return text;
}

export type ReadAloudState = {
	/** Read-along active (the play button is in its playing state). */
	playing: boolean;
	/** The word-timed track for the current slide — the teleprompter renders its cues/words. */
	track: CaptionTrack;
	/** The word being spoken NOW ({cueIndex, wordIndex}), or null when idle / in a gap. */
	active: Active | null;
	/** Read progress 0..1 (elapsed / duration), for the transport bar. */
	progress: number;
	/** The active voice rung — 'silent' (captions only) | 'openrouter-tts' | 'kokoro' | … */
	rung: string | null;
	play: () => void;
	pause: () => void;
	toggle: () => void;
	stop: () => void;
};

// Lazily-created shared voice model (the ~80 MB Kokoro worker + prefs are heavy;
// build it once, only when the user first plays). Dynamic-imported so the engine
// bundle stays out of the initial island and SSR never touches window.
type VoiceModel = {
	speak: (o: {
		text: string;
		sentences?: string[];
		signal?: AbortSignal;
		onSentenceTiming?: (t: { index: number; onsetMs: number; durationMs: number }) => void;
		onState?: (s: { rung?: string; speaking?: boolean; aborted?: boolean; error?: string }) => void;
	}) => void;
	stop: () => void;
	pause: () => void;
	resume: () => void;
	rung: () => string;
	/** iOS audio unlock — MUST run synchronously inside a user gesture (the play tap). */
	unlock: () => void;
	/** The owned WebAudio clock (ms) — the time source the word cursor rides during TTS. */
	audioTimeMs: () => number;
	/** Output latency (ms) — subtracted so the highlight tracks what's HEARD, not the buffer. */
	outputLatencyMs: () => number;
};
let voicePromise: Promise<VoiceModel | null> | null = null;
function getVoice(): Promise<VoiceModel | null> {
	if (!voicePromise) {
		voicePromise = import('@/playground/voice-model.js')
			.then((m) =>
				m.createVoiceModel({
					getOpenRouterKey: () => {
						try {
							return localStorage.getItem(OR_KEY_LS);
						} catch {
							return null;
						}
					},
				}),
			)
			.catch(() => null);
	}
	return voicePromise;
}

function nowMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : 0;
}

/**
 * Read-aloud controller for one slide's prose. `text` is the readable narration
 * (run the slide through `slideToSpeech`). Returns transport + the live word cursor
 * (`active`) over the slide's `track`. Stops automatically when `text` changes (slide
 * nav) and on unmount. `opts.onFinish` fires ONLY when a slide is read to its natural
 * end (not on a manual stop/pause or a slide change) — the signal Present's autoplay
 * chains on.
 */
export function useReadAloud(text: string, opts?: { onFinish?: () => void }): ReadAloudState {
	// One word-timed track per slide. The voice speaks Cadenza's SPOKEN expansion (so
	// "$4.2M" is said "four point two million dollars"), while the cursor highlights the
	// DISPLAY words — the measured onset re-anchors the right cue, so they stay aligned.
	const track = React.useMemo(() => buildTrack(text), [text]);
	const [playing, setPlaying] = React.useState(false);
	const [active, setActive] = React.useState<Active | null>(null);
	const [progress, setProgress] = React.useState(0);
	const [rung, setRung] = React.useState<string | null>(null);

	// Read the latest onFinish through a ref so it never re-creates the reader effect.
	const onFinishRef = React.useRef(opts?.onFinish);
	onFinishRef.current = opts?.onFinish;

	const readerRef = React.useRef<Reader | null>(null);
	const rafRef = React.useRef(0);
	const playingRef = React.useRef(false);
	const pausedRef = React.useRef(false);
	const ctlRef = React.useRef<AbortController | null>(null);
	const voiceRef = React.useRef<VoiceModel | null>(null);
	const modeRef = React.useRef<'silent' | 'audio'>('silent');
	const audioBaseRef = React.useRef<number | null>(null); // sentence-0 measured onset (audio clock origin)
	const elapsedRef = React.useRef(0);
	const lastTRef = React.useRef(0);

	const cancelRaf = React.useCallback(() => {
		if (rafRef.current) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = 0;
		}
	}, []);

	const stop = React.useCallback(() => {
		cancelRaf();
		playingRef.current = false;
		pausedRef.current = false;
		ctlRef.current?.abort();
		ctlRef.current = null;
		try {
			voiceRef.current?.stop();
		} catch {
			/* best-effort */
		}
		elapsedRef.current = 0;
		audioBaseRef.current = null;
		modeRef.current = 'silent';
		readerRef.current?.reset();
		setActive(null);
		setProgress(0);
		setPlaying(false);
	}, [cancelRaf]);

	// Warm the voice model as soon as the reader mounts (Present opens), so it's ready
	// to `unlock()` SYNCHRONOUSLY on the first play tap. iOS only grants audio when the
	// context resumes inside a user gesture; a voice loaded lazily *after* the tap
	// resumes too late and stays muted.
	React.useEffect(() => {
		let live = true;
		getVoice().then((v) => {
			if (live && v) voiceRef.current = v;
		});
		return () => {
			live = false;
		};
	}, []);

	// (Re)build the reader for each slide's track; tear down any run in flight on slide
	// nav or unmount (the onFinish latch lives in the reader, so a fresh track re-arms it).
	React.useEffect(() => {
		readerRef.current = makeReader({
			track,
			onWord: (a) => setActive(a),
			onEnd: () => {
				// Natural end — stop the voice too (don't let trailing audio play past the
				// highlight), then signal a chaining caller.
				cancelRaf();
				playingRef.current = false;
				ctlRef.current?.abort();
				ctlRef.current = null;
				try {
					voiceRef.current?.stop();
				} catch {
					/* best-effort */
				}
				setPlaying(false);
				setActive(null);
				onFinishRef.current?.();
			},
		});
		return () => {
			// Slide nav (new track) or unmount: tear down the engine AND reset the visible
			// state — otherwise the new slide inherits the old one's playing/active/progress
			// (a ghost teleprompter highlighting a stale word with no audio).
			cancelRaf();
			playingRef.current = false;
			pausedRef.current = false;
			ctlRef.current?.abort();
			ctlRef.current = null;
			try {
				voiceRef.current?.stop();
			} catch {
				/* best-effort */
			}
			readerRef.current = null;
			setPlaying(false);
			setActive(null);
			setProgress(0);
		};
	}, [track, cancelRaf]);

	// One frame: advance the clock (audio or estimate), tick the reader (fires onWord /
	// onEnd), update progress, and re-arm. Reads only refs, so it never goes stale.
	const tick = React.useCallback((now: number) => {
		const reader = readerRef.current;
		if (!reader || !playingRef.current) return;
		if (modeRef.current === 'audio' && voiceRef.current) {
			// Ride the voice's OWN clock (minus output latency), but HOLD at 0 until
			// sentence-0's measured onset arrives (audioBase) — otherwise the highlight
			// races ahead on the estimate and snaps back to word 0 when the onset lands.
			// Mirrors the /cadenza demo exactly.
			const v = voiceRef.current;
			const lat = v.outputLatencyMs ? v.outputLatencyMs() : 0;
			elapsedRef.current = audioBaseRef.current == null ? 0 : Math.max(0, v.audioTimeMs() - audioBaseRef.current - lat);
		} else {
			elapsedRef.current += now - lastTRef.current;
		}
		lastTRef.current = now;
		reader.sync(elapsedRef.current);
		const dur = reader.durationMs();
		setProgress(dur ? Math.min(1, elapsedRef.current / dur) : 0);
		if (playingRef.current) rafRef.current = requestAnimationFrame(tick);
	}, []);

	const startLoop = React.useCallback(() => {
		lastTRef.current = nowMs();
		cancelRaf();
		rafRef.current = requestAnimationFrame(tick);
	}, [tick, cancelRaf]);

	const play = React.useCallback(() => {
		const reader = readerRef.current;
		if (!reader || !track.cues.length) return;
		// iOS audio handshake: resume the context NOW, synchronously in the tap (the
		// warmed voice is ready here), before the async speak() below — which would be
		// muted on iPhone otherwise. Mirrors the /cadenza demo's click handler.
		try {
			voiceRef.current?.unlock();
		} catch {
			/* best-effort */
		}

		// Resume from a paused position rather than restarting.
		if (pausedRef.current) {
			pausedRef.current = false;
			playingRef.current = true;
			setPlaying(true);
			try {
				voiceRef.current?.resume();
			} catch {
				/* best-effort */
			}
			startLoop();
			return;
		}

		const ctl = new AbortController();
		ctlRef.current = ctl;
		elapsedRef.current = 0;
		audioBaseRef.current = null;
		modeRef.current = 'silent'; // the estimate carries the highlight until an onset arrives
		reader.reset();
		playingRef.current = true;
		setPlaying(true);
		startLoop();

		// Spoken audio in parallel once the voice model is ready (best-effort).
		getVoice().then((voice) => {
			if (!voice || ctl.signal.aborted) return;
			voiceRef.current = voice;
			let r: string;
			try {
				r = voice.rung();
			} catch {
				r = 'silent';
			}
			setRung(r);
			// A BLOB voice (measured onsets) drives the audio clock; browser voice stays on
			// the estimate (it speaks in parallel but reports no onsets).
			const clocked = r === 'openrouter-tts' || r === 'kokoro';
			if (clocked) {
				try {
					voice.unlock();
				} catch {
					/* best-effort */
				}
				modeRef.current = 'audio';
				elapsedRef.current = 0; // hold at 0 until sentence-0's onset arrives
				reader.reset();
			}
			if (r && r !== 'silent') {
				const spoken = track.cues.map((c) => c.words.map((w) => w.spoken).join(' '));
				voice.speak({
					// One spoken sentence per cue keeps index i == cue i for re-anchoring.
					text: spoken.join(' '),
					sentences: spoken,
					signal: ctl.signal,
					onSentenceTiming: clocked
						? ({ index, onsetMs, durationMs }) => {
								if (audioBaseRef.current == null) audioBaseRef.current = onsetMs; // cue-0 onset = time 0
								reader.align(index, onsetMs - audioBaseRef.current, durationMs);
							}
						: undefined,
					onState: (s) => {
						if (s?.rung) setRung(s.rung);
						// A clocked voice that produced no audio (synth failed) — fall back to the
						// silent estimate so the highlight never hangs waiting for an onset.
						if (
							modeRef.current === 'audio' &&
							s &&
							s.speaking === false &&
							!s.aborted &&
							playingRef.current &&
							audioBaseRef.current == null
						) {
							modeRef.current = 'silent';
							lastTRef.current = nowMs();
						}
					},
				});
			}
		});
	}, [track, startLoop]);

	const pause = React.useCallback(() => {
		cancelRaf();
		pausedRef.current = true;
		playingRef.current = false;
		setPlaying(false);
		try {
			voiceRef.current?.pause();
		} catch {
			/* best-effort */
		}
	}, [cancelRaf]);

	const toggle = React.useCallback(() => {
		if (playingRef.current) pause();
		else play();
	}, [pause, play]);

	return { playing, track, active, progress, rung, play, pause, toggle, stop };
}
