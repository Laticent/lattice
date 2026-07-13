import * as React from 'react';
import { type Active, buildTrack, type CaptionTrack, makeReader, type Reader, rateScale } from '@/lib/cadenza';
import { loadCalibration, recordObservation, voiceKeyOf } from '@/playground/readaloud-calibration';
import { cachedSampleUrl, KOKORO_MODEL_ID, speedSupported } from './tts-voice-catalog';

// slideToSpeech is the shared base narration flattener — one source of truth in
// lib/core/slide-speech.js (HARD RULE #1), bundled to the browser via
// read-along-core (#902 Gap 1). Re-exported here so this module's long-standing
// `import { slideToSpeech } from './read-aloud'` consumers keep working while the
// LOGIC lives once, in the same kernel the CLI/export narrates from.
export { slideToSpeech } from '@/playground/read-along-core.generated.js';

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

// How far (ms) to bias the word-highlight AHEAD of the heard voice — a lagging highlight is
// the more noticeable sync error (asymmetric lip-sync tolerance; see the pace-model doc §5).
const SYNC_LEAD_MS = 40;

/**
 * One captured audio-timing event, for the on-device read-aloud diagnostics
 * (gated behind `?readaloud-debug=1` in Present). Purely observational — the
 * regression this exists to pin ("skips words / races") can only be verified on
 * a real iOS device, so we surface the numbers the desync would show up in.
 */
export type ReadAloudDebugEvent = {
	/** 'read' — a fresh play() started (a slide boundary in an autoplay trace);
	 *  'attempt' — voice reached this sentence; 'timing' — its measured onset landed. */
	kind: 'read' | 'attempt' | 'timing';
	/** The sentence index the VOICE reports (its position in the filtered spoken array). */
	index: number;
	/** 'read' events only: the slide label + its spoken/cue counts, delimiting a slide in the trace. */
	label?: string;
	spokenCount?: number;
	cueCount?: number;
	/** 'read' events only: the model/voice that synthesized this slide (`model · voice`) — so a
	 *  multi-model trace self-labels which voice produced each slide's behavior. */
	voice?: string;
	/** Measured audio onset (ms, WebAudio clock) — 'timing' events only. */
	onsetMs?: number;
	/** Onset relative to sentence-0's onset (the reader's time origin) — 'timing' events only. */
	relOnsetMs?: number;
	/** Measured clip duration (ms) — 'timing' events only. */
	durationMs?: number;
	/** AudioContext state at capture ('none' | 'suspended' | 'running'). */
	ctxState: string;
	/** Wall-clock ms since play() started, for spotting stalls between events. */
	sincePlayMs: number;
};

/** A live snapshot of the reader clock vs the audio clock, refreshed each frame in debug mode. */
export type ReadAloudDebugLive = {
	mode: 'silent' | 'audio';
	rung: string | null;
	/** The active model/voice (`model · voice`) this read is synthesizing through. */
	voice: string;
	ctxState: string;
	/** The reader clock (ms) driving the highlight this frame. */
	elapsedMs: number;
	/** Raw WebAudio clock (ms), before subtracting the base + latency. */
	audioClockMs: number;
	/** Active highlight position this frame. */
	activeCue: number;
	activeWord: number;
	/** #spoken sentences handed to the voice vs #cues in the track — a mismatch is the desync tell. */
	spokenCount: number;
	cueCount: number;
	/** The last cue index whose measured audio onset landed (−1 before any). */
	lastTimedCue: number;
	/** How many cues the highlight is AHEAD of the last-spoken sentence — the rush, quantified. */
	aheadCues: number;
	/** Peak `aheadCues` seen this read — the worst the highlight raced past the voice. */
	peakAhead: number;
	/** The active voice's calibration key (per-voice pace fit), '' before a clocked voice resolves. */
	calVoiceKey: string;
	/** Fitted per-voice rate scalar `k` (1.0 until enough clean samples) — see calibrate.ts. */
	calK: number;
	/** Clean calibration samples observed for this voice so far. */
	calN: number;
};

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
	/** Captured audio-timing events this read (debug mode only; empty otherwise). */
	debugEvents: ReadAloudDebugEvent[];
	/** Live clock snapshot (debug mode only; null otherwise). */
	debugLive: ReadAloudDebugLive | null;
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
		/** Fired as the voice reaches each sentence (in playback order), before its audio plays. */
		onSentence?: (sentence: string) => void;
		onSentenceTiming?: (t: { index: number; onsetMs: number; durationMs: number }) => void;
		onState?: (s: { rung?: string; speaking?: boolean; aborted?: boolean; error?: string }) => void;
	}) => void;
	stop: () => void;
	pause: () => void;
	resume: () => void;
	/** Background-prefetch these spoken sentences into the shared audio cache — no playback, best-effort. `signal` stops any FURTHER requests once aborted (already-started ones finish; see voice-model.js). */
	warm: (sentences: string[], opts?: { signal?: AbortSignal }) => void;
	rung: () => string;
	/** iOS audio unlock — MUST run synchronously inside a user gesture (the play tap). */
	unlock: () => void;
	/** The owned WebAudio clock (ms) — the time source the word cursor rides during TTS. */
	audioTimeMs: () => number;
	/** The AudioContext lifecycle state ('none' | 'suspended' | 'running') — diagnostics only. */
	audioState: () => string;
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
 * caller for). `signal`, if given, stops any FURTHER prefetch requests once
 * aborted (a request already in flight finishes on its own) — pass one tied
 * to the caller's own lifetime (e.g. an effect's cleanup) so an abandoned
 * warm (autoplay turned off, the slide advanced again, Present closed)
 * doesn't keep working through the rest of the slide's sentences.
 */
export function warmNarration(
	text: string,
	signal?: AbortSignal,
	acronyms?: ReadonlyMap<string, string>,
	lang?: string,
	symbols?: ReadonlyMap<string, string>,
): void {
	if (!text) return;
	// MUST pass the same `acronyms`, `lang` AND `symbols` play() will use, or the warmed spoken
	// sentences won't match the ones synthesized on playback — every prefetch a cache miss.
	const track = buildTrack(text, { acronyms, lang, symbols });
	if (!track.cues.length) return;
	const sentences = track.cues.map((c) => c.words.map((w) => w.spoken).join(' '));
	// getVoice() is the SAME memoized singleton play() uses — this never spins up
	// a second instance, and it's a no-op microtask once a reader has already
	// warmed it on mount (the common case: Present's autoplay only calls this
	// after a reader is already mounted and playing).
	getVoice().then((v) => v?.warm?.(sentences, { signal }));
}

/**
 * Read-aloud controller for one slide's prose. `text` is the readable narration
 * (run the slide through `slideToSpeech`). Returns transport + the live word cursor
 * (`active`) over the slide's `track`. Stops automatically when `text` changes (slide
 * nav) and on unmount. `opts.onFinish` fires ONLY when a slide is read to its natural
 * end (not on a manual stop/pause or a slide change) — the signal Present's autoplay
 * chains on.
 */
export function useReadAloud(
	text: string,
	opts?: {
		onFinish?: () => void;
		acronyms?: ReadonlyMap<string, string>;
		symbols?: ReadonlyMap<string, string>;
		lang?: string;
		muted?: boolean;
		debug?: boolean;
		debugLabel?: string;
	},
): ReadAloudState {
	// One word-timed track per slide. The voice speaks Cadenza's SPOKEN expansion (so
	// "$4.2M" is said "four point two million dollars"), while the cursor highlights the
	// DISPLAY words — the measured onset re-anchors the right cue, so they stay aligned.
	// The deck's acronym registry (author pronunciations) rides into every track; the
	// deck's `lang` gates the English say-as so a non-English deck isn't anglicized (#919).
	const acronyms = opts?.acronyms;
	const symbols = opts?.symbols;
	const lang = opts?.lang;
	// Voice muted — captions still run (the silent cadence estimate), no TTS is attached. Read via
	// a ref so play() sees the current value without re-creating the reader (present redesign S3).
	const mutedRef = React.useRef(false);
	mutedRef.current = !!opts?.muted;
	const debug = !!opts?.debug;
	const debugLabel = opts?.debugLabel;
	const debugLabelRef = React.useRef(debugLabel);
	debugLabelRef.current = debugLabel;
	const track = React.useMemo(() => buildTrack(text, { acronyms, lang, symbols }), [text, acronyms, lang, symbols]);
	const [playing, setPlaying] = React.useState(false);
	const [active, setActive] = React.useState<Active | null>(null);
	const [progress, setProgress] = React.useState(0);
	const [rung, setRung] = React.useState<string | null>(null);
	const [debugEvents, setDebugEvents] = React.useState<ReadAloudDebugEvent[]>([]);
	const [debugLive, setDebugLive] = React.useState<ReadAloudDebugLive | null>(null);
	// Read via refs so the tick/play closures never re-create (they're deps-`[]` by
	// design — the RAF loop captures one `tick` for the whole read).
	const debugRef = React.useRef(debug);
	debugRef.current = debug;
	const rungRef = React.useRef<string | null>(rung);
	rungRef.current = rung;
	// Origin for the "sincePlayMs" column — set at each fresh play().
	const playStartRef = React.useRef(0);
	const spokenCountRef = React.useRef(0);
	const cueCountRef = React.useRef(track.cues.length);
	cueCountRef.current = track.cues.length;
	// Rush tracking: the last cue the voice actually started, and the worst the
	// highlight got ahead of it this read.
	const lastTimedCueRef = React.useRef(-1);
	const peakAheadRef = React.useRef(0);
	// The model/voice this read synthesizes through — resolved once per play() (below), so
	// a multi-model device trace self-labels which voice produced each slide's behavior.
	const voiceLabelRef = React.useRef('');
	// Per-voice pace calibration (2026-07-12-per-voice-pace-calibration.md): the storage key for
	// the resolved voice, and its live fitted scalar `k` + sample count for the diagnostics readout.
	// Collection runs whenever a clocked voice reports onsets — independent of the debug overlay.
	const calVoiceKeyRef = React.useRef('');
	const calKRef = React.useRef(1);
	const calNRef = React.useRef(0);

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
		if (debugRef.current) setDebugLive(null);
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
			// SYNC_LEAD_MS biases the highlight slightly AHEAD of the heard word. Broadcast
			// lip-sync tolerance is asymmetric (ITU-R BT.1359 / EBU R37): a visual leading its
			// audio is far more forgivable (~125 ms) than lagging it (~45 ms), so a small lead
			// keeps the reader's eye on-or-ahead of the voice rather than trailing it — the more
			// noticeable error. See 2026-07-12-narration-pace-model.md §5.
			elapsedRef.current = audioBaseRef.current == null ? 0 : Math.max(0, v.audioTimeMs() - audioBaseRef.current - lat + SYNC_LEAD_MS);
		} else {
			elapsedRef.current += now - lastTRef.current;
		}
		lastTRef.current = now;
		const activeNow = reader.sync(elapsedRef.current);
		const dur = reader.durationMs();
		setProgress(dur ? Math.min(1, elapsedRef.current / dur) : 0);
		if (debugRef.current) {
			const v = voiceRef.current;
			const activeCue = activeNow?.cueIndex ?? -1;
			// How far the highlight has raced past the last sentence the voice truly
			// started. In 'audio' mode a positive value means the clock free-ran through
			// a synth/decode gap — the systematic "moves fast / skips" signature.
			const ahead =
				modeRef.current === 'audio' && activeCue >= 0 && lastTimedCueRef.current >= 0
					? Math.max(0, activeCue - lastTimedCueRef.current)
					: 0;
			if (ahead > peakAheadRef.current) peakAheadRef.current = ahead;
			setDebugLive({
				mode: modeRef.current,
				rung: rungRef.current,
				voice: voiceLabelRef.current,
				ctxState: v?.audioState ? v.audioState() : 'none',
				elapsedMs: Math.round(elapsedRef.current),
				audioClockMs: Math.round(v?.audioTimeMs ? v.audioTimeMs() : 0),
				activeCue,
				activeWord: activeNow?.wordIndex ?? -1,
				spokenCount: spokenCountRef.current,
				cueCount: cueCountRef.current,
				lastTimedCue: lastTimedCueRef.current,
				aheadCues: ahead,
				peakAhead: peakAheadRef.current,
				calVoiceKey: calVoiceKeyRef.current,
				calK: calKRef.current,
				calN: calNRef.current,
			});
		}
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
		lastTimedCueRef.current = -1;
		peakAheadRef.current = 0;
		voiceLabelRef.current = '';
		modeRef.current = 'silent'; // the default mode; overridden below once the rung is known
		armedRef.current = false;
		reader.reset();
		playingRef.current = true;
		setPlaying(true);
		if (debugRef.current) {
			// Accumulate across slides so ONE autoplay pass = a full-deck trace (a 'read'
			// marker below delimits each slide); sincePlayMs is per-slide (this reset).
			playStartRef.current = nowMs();
			spokenCountRef.current = 0;
		}
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
			// Voice MUTED — run the silent cadence estimate (captions) and attach NO TTS. Same
			// "always runs" path as a failed voice load, but chosen deliberately by the user. The
			// captions/teleprompter still animate word-by-word off Cadenza's built-in timings.
			if (mutedRef.current) {
				setRung('silent');
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
			// Resolve the concrete model/voice behind the rung — a multi-model device trace
			// self-labels which voice produced each slide, AND it keys per-voice pace calibration
			// (so `k` is fit per model·voice). Resolved unconditionally (not just in debug) so
			// calibration accrues from normal use; best-effort + guarded.
			try {
				voiceLabelRef.current =
					r === 'openrouter-tts'
						? `${voice.orModel?.() || '?'} · ${voice.orVoice?.() || '?'}`
						: r === 'kokoro'
							? `kokoro · ${voice.kokoroVoice?.() || '?'}`
							: r;
			} catch {
				voiceLabelRef.current = r;
			}
			calVoiceKeyRef.current = voiceKeyOf(voiceLabelRef.current);
			// Seed the live readout from what's already stored for this voice (one load).
			try {
				const cal = loadCalibration(calVoiceKeyRef.current);
				calKRef.current = rateScale(cal);
				calNRef.current = cal.n;
			} catch {
				calKRef.current = 1;
				calNRef.current = 0;
			}
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
				spokenCountRef.current = spoken.length;
				const dbg = debugRef.current;
				const pushEvent = (e: ReadAloudDebugEvent) =>
					setDebugEvents((prev) => (prev.length >= 500 ? prev : [...prev, e]));
				if (dbg) {
					// Slide boundary in the accumulated trace, carrying the counts whose
					// mismatch would be the desync tell (spoken sentences vs. track cues).
					pushEvent({
						kind: 'read',
						index: -1,
						label: debugLabelRef.current,
						spokenCount: spoken.length,
						cueCount: track.cues.length,
						voice: voiceLabelRef.current,
						ctxState: voiceRef.current?.audioState ? voiceRef.current.audioState() : 'none',
						sincePlayMs: 0,
					});
				}
				// The voice loop calls onSentence strictly in playback order, so a local
				// counter recovers the attempt index (the callback itself carries only text).
				let attemptSeq = 0;
				voice.speak({
					// One spoken sentence per cue keeps index i == cue i for re-anchoring.
					text: spoken.join(' '),
					sentences: spoken,
					signal: ctl.signal,
					// Debug only: the voice reached this sentence (before its audio plays).
					// A gap between an 'attempt' and its matching 'timing' event = a synth/
					// decode stall the free-running audio clock races through (the "skips
					// / moves fast" tell). Omitted entirely off debug — no runtime cost.
					onSentence: dbg
						? () => {
								const v = voiceRef.current;
								pushEvent({
									kind: 'attempt',
									index: attemptSeq++,
									ctxState: v?.audioState ? v.audioState() : 'none',
									sincePlayMs: Math.round(nowMs() - playStartRef.current),
								});
							}
						: undefined,
					onSentenceTiming: clocked
						? ({ index, onsetMs, durationMs }) => {
								if (audioBaseRef.current == null) audioBaseRef.current = onsetMs; // cue-0 onset = time 0
								// Per-voice pace calibration: fold this sentence's measured clip duration vs the
								// model's PREDICTED cue duration into the voice's fit. Read the estimate BEFORE
								// Per-voice calibration: the raw PREDICTED cue duration comes from the component
								// `track` — the ORIGINAL buildTrack output. It is the never-mutated source (align
								// clones the timeline, cursor.ts), so this is safe regardless of ordering vs the
								// align() call below. Built at rateScale 1 today (calibration is measure-only until
								// a later apply slice), so it is the raw prediction — no k back-out needed.
								const estCue = track.cues[index];
								const estDurMs = estCue ? estCue.endMs - estCue.startMs : 0;
								reader.align(index, onsetMs - audioBaseRef.current, durationMs);
								if (estDurMs > 0 && durationMs > 0 && calVoiceKeyRef.current) {
									try {
										const next = recordObservation(calVoiceKeyRef.current, estDurMs, durationMs);
										calNRef.current = next.n;
										calKRef.current = rateScale(next); // from the returned state — no second load
									} catch {
										/* calibration is best-effort — never break playback */
									}
								}
								if (index > lastTimedCueRef.current) lastTimedCueRef.current = index;
								if (dbg) {
									const v = voiceRef.current;
									pushEvent({
										kind: 'timing',
										index,
										onsetMs: Math.round(onsetMs),
										relOnsetMs: Math.round(onsetMs - (audioBaseRef.current ?? 0)),
										durationMs: Math.round(durationMs),
										ctxState: v?.audioState ? v.audioState() : 'none',
										sincePlayMs: Math.round(nowMs() - playStartRef.current),
									});
								}
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

	// React to a mid-playback Voice MUTE (present redesign S3): `muted` is otherwise only sampled at
	// play() start, so muting mid-speech would leave the deck talking to the end of the slide. Stop the
	// in-flight TTS and fall the loop back to the silent cadence (mirrors the synth-failed fallback);
	// the captions keep animating. Unmuting mid-slide takes effect on the NEXT slide (deliberate — a
	// mid-slide voice restart would snap the highlight back to word 0).
	const mutedProp = !!opts?.muted;
	React.useEffect(() => {
		if (mutedProp && playingRef.current && modeRef.current === 'audio') {
			try {
				voiceRef.current?.stop();
			} catch {
				/* best-effort */
			}
			modeRef.current = 'silent';
			lastTRef.current = nowMs();
		}
	}, [mutedProp]);

	return { playing, track, active, progress, rung, debugEvents, debugLive, play, pause, toggle, stop };
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
 *  uncurated voice or a non-default speed falls back to the live path as before.
 *
 *  `speed` is CLAMPED to 1 when the target model's speed param is verified to do
 *  nothing (speedSupported — tts-voice-catalog.ts). Without this, `speed` is a
 *  single cross-model preference (unlike voice, it's never reset when the model
 *  changes — see TtsSettings.tsx's pickOrModel) — pick 1.3x on Kokoro, then Play
 *  a CACHED voice on Grok/Gemini/Orpheus/CSM/Voxtral, and cachedSampleUrl's own
 *  `speed !== 1` check (it only serves the free static asset at the default
 *  speed) silently forces a live, billed OpenRouter call for a model where that
 *  speed value could never have sounded any different anyway. This PR's own
 *  Speed-section redesign made the leak WORSE: it removed the slider (the one
 *  visible cue a stale non-default speed was even set) for exactly these models
 *  (Munger-inversion finding, 2026-07-11 — see the decision doc). */
export async function previewTtsVoice(o: { rung: 'openrouter' | 'kokoro'; voice?: string; model?: string; speed?: number }): Promise<{ ok: boolean; error?: string }> {
	const model = o.rung === 'kokoro' ? KOKORO_MODEL_ID : o.model || '';
	const speed = speedSupported(model) ? (o.speed ?? 1) : 1;
	const cached = o.voice ? cachedSampleUrl(model, o.voice, speed) : null;
	if (cached) {
		const res = await playLocalSample(cached);
		if (res.ok) return res;
		// A cached file existing but failing to play (network hiccup fetching the
		// static asset, decode error) is rare — fall back to live rather than surface
		// a confusing error for a voice that's SUPPOSED to just work.
	}
	const v = await getVoice();
	if (!v) return { ok: false, error: 'voice unavailable' };
	return v.previewVoice({ ...o, speed });
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
