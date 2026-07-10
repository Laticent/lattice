import * as React from 'react';
import { type Active, buildTrack, type CaptionTrack, makeReader, type Reader } from '@/lib/cadenza';
import { cachedSampleUrl, KOKORO_MODEL_ID } from './tts-voice-catalog';

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
//   The loop's FIRST tick is deferred until the mode above is actually decided (see
//   play()) — starting it eagerly in 'silent' mode raced the highlight ahead of a
//   clocked voice that hadn't resolved yet, then snapped it back to word 0 once it
//   did; see engineering/decisions/2026-07-09-cadenza-narration-quality.md.
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
// A structural line — heading, list item, blockquote — is its own spoken clause;
// a plain line is a soft-wrapped continuation of one. Only structural lines get an
// auto-terminator (below) — inventing a break mid-paragraph would be wrong.
const STRUCTURAL_LINE = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?)/;
const TERMINATED = /[.!?;:,…]\s*$/;

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
		// Give a structural line a terminator so Cadenza's punctuation-driven pause
		// (cadence.ts's PAUSE_MS) actually falls between clauses — otherwise a list
		// of bullets reads as one run-on sentence with no breath between them.
		out.push(STRUCTURAL_LINE.test(line) && !TERMINATED.test(line) ? `${line}.` : line);
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
	/** Background-prefetch these spoken sentences into the shared audio cache — no playback, best-effort. */
	warm: (sentences: string[]) => void;
	rung: () => string;
	/** iOS audio unlock — MUST run synchronously inside a user gesture (the play tap). */
	unlock: () => void;
	/** The owned WebAudio clock (ms) — the time source the word cursor rides during TTS. */
	audioTimeMs: () => number;
	/** Output latency (ms) — subtracted so the highlight tracks what's HEARD, not the buffer. */
	outputLatencyMs: () => number;
	// The config surface the Workspace TTS settings panel drives (below) — same
	// instance as playback, so a pick there takes effect immediately.
	availability: () => VoiceAvailability;
	orVoice: () => string;
	setOrVoice: (v: string) => void;
	orModel: () => string;
	setOrModel: (m: string) => void;
	kokoroVoice: () => string;
	setKokoroVoice: (v: string) => void;
	speedPref: () => number;
	setSpeed: (n: number) => void;
	kokoroSupported: () => boolean;
	probeKokoroCache: () => Promise<boolean>;
	loadKokoro: (onProgress?: (p: VoiceLoadProgress) => void, signal?: AbortSignal) => Promise<boolean>;
	previewVoice: (o: { rung: 'openrouter' | 'kokoro'; voice?: string; model?: string; speed?: number }) => Promise<{ ok: boolean; error?: string }>;
};

export type VoiceAvailability = {
	rung: string;
	openRouterReady: boolean;
	kokoroReady: boolean;
	kokoroCached: boolean;
	kokoroSupported: boolean;
	webgpu: boolean;
	speechAllowed: boolean;
};

export type VoiceLoadProgress = { progress: number; text?: string; status?: string };
export type OrVoiceModel = { id: string; name: string; promptPerM: number | null; completionPerM: number | null; voices: string[] };
let voicePromise: Promise<VoiceModel | null> | null = null;
function getVoice(): Promise<VoiceModel | null> {
	if (!voicePromise) {
		voicePromise = import('@/playground/voice-model.js')
			.then((m) =>
				m.createVoiceModel({
					// Studio-scoped voice prefs — a separate namespace from the Drawing
					// Board's (2026-07-09-studio-cloud-ondevice-config-split.md), so a
					// voice/speed pick in one surface never silently changes the other.
					keyPrefix: 'studio',
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
 * Background-prefetch `text`'s spoken-sentence audio into the shared voice
 * cache — no playback, no state, best-effort. Present's autoplay calls this
 * with the UPCOMING slide's narration as soon as the CURRENT slide starts
 * reading, so the next slide's audio is already cached (or in flight) by the
 * time onFinish chains to it — closing the one gap the within-slide
 * concurrency scheduler never reached (it only overlaps sentences of the
 * SAME slide that's already playing). Splits into the exact same spoken-word
 * sentence strings play() uses (buildTrack's cue.words[].spoken, not a plain
 * splitSentences(text)) so the cache key this populates is the SAME one
 * speak() will look up later — a mismatch here would silently defeat the
 * whole prefetch (every warmed entry a cache miss). No-ops before the voice
 * model has loaded (a warm-ahead nicety, never worth blocking or racing the
 * caller for).
 */
export function warmNarration(text: string): void {
	if (!text) return;
	const track = buildTrack(text);
	if (!track.cues.length) return;
	const sentences = track.cues.map((c) => c.words.map((w) => w.spoken).join(' '));
	// getVoice() is the SAME memoized singleton play() uses — this never spins up
	// a second instance, and it's a no-op microtask once a reader has already
	// warmed it on mount (the common case: Present's autoplay only calls this
	// after a reader is already mounted and playing).
	getVoice().then((v) => v?.warm?.(sentences));
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
	// True once the current play() session's mode (audio vs. estimate) has been
	// decided and the loop has run its arming logic at least once — see play()'s
	// getVoice().then() below. Lets pause()/resume() tell "the loop is already
	// correctly armed, just restart it" apart from "a play() is still arming" —
	// without it, a pause+resume during the arming window (a real voice load takes
	// real wall-clock time) restarted the loop in the stale default mode, then the
	// still-pending arming callback landed later and reset it — the exact
	// race-then-rewind this file exists to fix, just reachable via pause/resume
	// instead of a cold play(). See
	// engineering/decisions/2026-07-09-cadenza-narration-quality.md §3.3.
	const armedRef = React.useRef(false);
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
		armedRef.current = false;
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
				armedRef.current = false;
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
			armedRef.current = false;
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
			// Only start the loop here if it was already armed (mode decided) before
			// the pause. A pause tapped WHILE the original play() was still arming
			// (voice load in flight) leaves armedRef false — in that case the still-
			// pending getVoice().then() callback below is what starts the loop, once
			// it sees pausedRef is false again; starting it here too would race the
			// loop in the stale default mode against that callback's later mode
			// decision — the exact bug this file exists to fix.
			if (armedRef.current) startLoop();
			return;
		}

		const ctl = new AbortController();
		ctlRef.current = ctl;
		elapsedRef.current = 0;
		audioBaseRef.current = null;
		modeRef.current = 'silent'; // the default mode; overridden below once the rung is known
		armedRef.current = false;
		reader.reset();
		playingRef.current = true;
		setPlaying(true);
		// The RAF loop's FIRST tick is deferred to getVoice().then() below, once the
		// mode (audio vs. estimate) is actually decided — starting it here, in
		// 'silent' mode, before knowing whether a clocked voice would attach made the
		// highlight visibly race ahead on the estimate and then snap back to word 0
		// when a clocked voice's onset landed (see
		// engineering/decisions/2026-07-09-cadenza-narration-quality.md §2/§3.3). The
		// existing "hold at 0 until the real onset arrives" behavior in tick() is
		// unrelated and unchanged — that gap was never the bug.

		// Spoken audio in parallel once the voice model is ready (best-effort).
		getVoice().then((voice) => {
			if (ctl.signal.aborted) return;
			if (!voice) {
				// Voice model failed to load — the silent estimate still runs the
				// read-along (the header's "always runs" floor), it just never got a
				// chance to start until now. armedRef is set regardless of whether we
				// start the loop immediately — a pause tapped during this wait means
				// resume(), not this callback, starts it (see the pausedRef check above).
				armedRef.current = true;
				if (!pausedRef.current) startLoop();
				return;
			}
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
			// The mode is decided — arm. If a pause() landed while we were waiting on
			// the voice, don't start the loop out from under it; resume() will, and it
			// will do so already in the right mode since armedRef is now true (see the
			// pausedRef check in play()'s resume branch above).
			armedRef.current = true;
			if (!pausedRef.current) startLoop();
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

// ── TTS settings bridge (the Workspace AI-tab TTS section) ──────────────────
// Thin wrappers over the SAME shared voice-model instance useReadAloud plays
// through (getVoice()'s singleton) — a pick here takes effect on the next
// speak() with no separate instance/download. Mirrors architect.ts's bridge-
// function style (listStudioModels/setStudioModel/summonWebLLM/…) so the
// Workspace components never touch a raw model object directly.

/** Live voice status — which rung is active, what's ready/cached/supported. */
export async function voiceAvailability(): Promise<VoiceAvailability> {
	const v = await getVoice();
	return (
		v?.availability() ?? {
			rung: 'silent', openRouterReady: false, kokoroReady: false, kokoroCached: false, kokoroSupported: false, webgpu: false, speechAllowed: false,
		}
	);
}

/** The OpenRouter TTS-capable model catalog — id/name/pricing/live-published
 *  `voices` roster per model — or [] when unavailable. `voices` is the single
 *  source of truth every voice dropdown derives from (tts-voice-catalog.ts). */
export async function listTtsModels(): Promise<OrVoiceModel[]> {
	try {
		const m = await import('@/playground/voice-model.js');
		return await m.listOpenRouterVoiceModels();
	} catch {
		return [];
	}
}

export async function ttsOrVoice(): Promise<string> { return (await getVoice())?.orVoice() ?? ''; }
export async function setTtsOrVoice(v: string): Promise<void> { (await getVoice())?.setOrVoice(v); }
export async function ttsOrModel(): Promise<string> { return (await getVoice())?.orModel() ?? ''; }
export async function setTtsOrModel(id: string): Promise<void> { (await getVoice())?.setOrModel(id); }
export async function ttsKokoroVoice(): Promise<string> { return (await getVoice())?.kokoroVoice() ?? ''; }
export async function setTtsKokoroVoice(v: string): Promise<void> { (await getVoice())?.setKokoroVoice(v); }
export async function ttsSpeed(): Promise<number> { return (await getVoice())?.speedPref() ?? 1; }
export async function setTtsSpeed(n: number): Promise<void> { (await getVoice())?.setSpeed(n); }

/** Summon the on-device Kokoro model (the deliberate ~80 MB download). Never throws. */
export async function loadTtsKokoro(onProgress?: (p: VoiceLoadProgress) => void, signal?: AbortSignal): Promise<boolean> {
	const v = await getVoice();
	if (!v) return false;
	try {
		return await v.loadKokoro(onProgress, signal);
	} catch {
		return false;
	}
}

// A pre-generated, committed sample plays as a plain <audio> element — same-origin,
// no network latency, no live API cost, and it keeps working even if the live
// model is later pulled from OpenRouter's catalog. Bounded to 10s (generous for a
// few-second clip) so a genuinely broken/missing file still resolves rather than
// hanging the "Playing…" button — the same never-leave-the-UI-stuck principle as
// the live path's synth-phase timeout.
function playLocalSample(url: string): Promise<{ ok: boolean; error?: string }> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (res: { ok: boolean; error?: string }) => {
			if (settled) return;
			settled = true;
			resolve(res);
		};
		try {
			const audio = new Audio(url);
			audio.onended = () => finish({ ok: true });
			audio.onerror = () => finish({ ok: false, error: 'cached sample failed to load' });
			audio.play().catch((e) => finish({ ok: false, error: String((e as Error)?.message || e) }));
			setTimeout(() => finish({ ok: false, error: 'cached sample timed out (10s)' }), 10_000);
		} catch (e) {
			finish({ ok: false, error: String((e as Error)?.message || e) });
		}
	});
}

/** Play a short sample with an explicit rung + voice + speed (bypasses the auto
 *  ladder). `model` is optional but needed for the cache lookup on the cloud rung
 *  (the on-device rung is always Kokoro, no ambiguity) — a curated voice at the
 *  default speed plays a committed local sample first, no live call at all; an
 *  uncurated voice or a non-default speed falls back to the live path as before. */
export async function previewTtsVoice(o: { rung: 'openrouter' | 'kokoro'; voice?: string; model?: string; speed?: number }): Promise<{ ok: boolean; error?: string }> {
	const cached = o.voice ? cachedSampleUrl(o.rung === 'kokoro' ? KOKORO_MODEL_ID : o.model || '', o.voice, o.speed ?? 1) : null;
	if (cached) {
		const res = await playLocalSample(cached);
		if (res.ok) return res;
		// A cached file existing but failing to play (network hiccup fetching the
		// static asset, decode error) is rare — fall back to live rather than surface
		// a confusing error for a voice that's SUPPOSED to just work.
	}
	const v = await getVoice();
	if (!v) return { ok: false, error: 'voice unavailable' };
	return v.previewVoice(o);
}

/** Stop any in-flight preview — called on TTS settings unmount so a sample started
 *  just before the Workspace sheet closes doesn't keep playing (mirrors
 *  useReadAloud's own unmount cleanup, above). Never throws. */
export async function stopTtsPreview(): Promise<void> {
	const v = await getVoice();
	try {
		v?.stop();
	} catch {
		/* best-effort */
	}
}
