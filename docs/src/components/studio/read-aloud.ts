import * as React from 'react';
import { splitSentences } from '@/lib/cadenza';

// Studio read-aloud — the REAL synchronized read-along.
//
// Two layers, both real, neither faked:
//   1. A teleprompter that highlights the current sentence as it is read. This
//      ALWAYS works, with zero backend — it is the guaranteed deliverable.
//   2. Spoken audio via the production voice ladder (voice-model.js): the user's
//      connected OpenRouter voice → in-browser Kokoro → silent floor. We never
//      use raw speechSynthesis (the per-device lottery banned in production; see
//      engineering/decisions/2026-06-14-read-aloud-kokoro.md).
//
// The teleprompter is driven by a single estimated-cadence timer (≈155 wpm) so
// the highlight never races a second driver. When a real audio rung is present
// the spoken track plays in parallel; the estimate tracks natural TTS pace
// closely enough for a read-along, and the captions are exact regardless.

// The OpenRouter key the architect/voice ladder share (lattice-db-* namespace).
const OR_KEY_LS = 'lattice-db-or-key';

/** Reading speed for the caption cadence — boardroom-narration pace. */
const WORDS_PER_MINUTE = 155;
/** Floor so a one-word line still dwells long enough to read. */
const MIN_SENTENCE_MS = 1100;

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

/** ms to read a sentence at the narration cadence (floored). */
function estimateMs(sentence: string): number {
	const words = sentence.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(MIN_SENTENCE_MS, Math.round((words / WORDS_PER_MINUTE) * 60000));
}

export type ReadAloudState = {
	/** Read-along active (the play button is in its playing state). */
	playing: boolean;
	/** Index of the currently-highlighted sentence, or -1 when idle. */
	index: number;
	/** The sentences of the current slide, for the teleprompter. */
	sentences: string[];
	/** The active voice rung — 'silent' (captions only) | 'openrouter' | 'kokoro' | … */
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
	speak: (o: { text: string; signal?: AbortSignal; onState?: (s: { rung?: string; speaking?: boolean }) => void }) => void;
	stop: () => void;
	pause: () => void;
	resume: () => void;
	rung: () => string;
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

/**
 * Read-aloud controller for one slide's prose. `text` is the readable narration
 * (run the slide through `slideToSpeech`). Returns transport + the live
 * teleprompter index. Stops automatically when `text` changes (slide nav) and on
 * unmount. `opts.onFinish` fires ONLY when a slide is read to its natural end (not
 * on a manual stop/pause or a slide change) — the hook Present's autoplay chains on.
 */
export function useReadAloud(text: string, opts?: { onFinish?: () => void }): ReadAloudState {
	const sentences = React.useMemo(() => splitSentences(text), [text]);
	const [playing, setPlaying] = React.useState(false);
	const [index, setIndex] = React.useState(-1);
	const [rung, setRung] = React.useState<string | null>(null);
	// Read the latest onFinish through a ref so it never re-creates `advance`.
	const onFinishRef = React.useRef(opts?.onFinish);
	onFinishRef.current = opts?.onFinish;

	const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const ctlRef = React.useRef<AbortController | null>(null);
	const pausedRef = React.useRef(false);
	const idxRef = React.useRef(-1);
	const voiceRef = React.useRef<VoiceModel | null>(null);

	const clearTimer = React.useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const stop = React.useCallback(() => {
		clearTimer();
		pausedRef.current = false;
		ctlRef.current?.abort();
		ctlRef.current = null;
		try {
			voiceRef.current?.stop();
		} catch {
			/* best-effort */
		}
		idxRef.current = -1;
		setIndex(-1);
		setPlaying(false);
	}, [clearTimer]);

	// The single highlight driver: an estimated-cadence walk over the sentences.
	const advance = React.useCallback(
		(j: number, ctl: AbortController) => {
			if (ctl.signal.aborted) return;
			if (j >= sentences.length) {
				stop();
				// Natural end (the read walked off the last sentence) — let a chaining
				// caller advance. Fired after stop() so state is idle when it runs.
				onFinishRef.current?.();
				return;
			}
			idxRef.current = j;
			setIndex(j);
			timerRef.current = setTimeout(() => advance(j + 1, ctl), estimateMs(sentences[j]));
		},
		[sentences, stop],
	);

	const play = React.useCallback(() => {
		if (!sentences.length) return;
		// Resume from a paused position rather than restarting.
		if (pausedRef.current) {
			pausedRef.current = false;
			setPlaying(true);
			try {
				voiceRef.current?.resume();
			} catch {
				/* best-effort */
			}
			const ctl = ctlRef.current;
			if (ctl) advance(Math.max(0, idxRef.current), ctl);
			return;
		}
		const ctl = new AbortController();
		ctlRef.current = ctl;
		setPlaying(true);
		advance(0, ctl);
		// Spoken audio in parallel (best-effort) once the voice model is ready.
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
			if (r && r !== 'silent') {
				voice.speak({ text: sentences.join(' '), signal: ctl.signal, onState: (s) => s?.rung && setRung(s.rung) });
			}
		});
	}, [sentences, advance]);

	const pause = React.useCallback(() => {
		clearTimer();
		pausedRef.current = true;
		setPlaying(false);
		try {
			voiceRef.current?.pause();
		} catch {
			/* best-effort */
		}
	}, [clearTimer]);

	const toggle = React.useCallback(() => {
		if (playing) pause();
		else play();
	}, [playing, pause, play]);

	// Stop when the slide (text) changes, and on unmount.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run on slide text change; `stop` is stable.
	React.useEffect(() => stop, [text, stop]);

	return { playing, index, sentences, rung, play, pause, toggle, stop };
}
