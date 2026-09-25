// The Vetrina ↔ Cadenza seam.
//
// Vetrina defines a narration PORT and no implementation; Cadenza turns text into a timed
// caption track and drives nothing. Neither may import the other — both are boundary-gated
// so they can spin off as separate packages — so the join lives here, above both, exactly
// the way Suono and Cadenza already join (`Suono plays and times the voice; Cadenza times
// the highlight; the app wires them`).
//
// WHAT THIS BUYS WITH NO AUDIO AT ALL. A timed track is text arithmetic — syllable counts,
// a boundary-pause ladder, phrase-final lengthening — so a SILENT narrator still delivers
// the two things that matter most:
//   • a real per-line duration, replacing Vetrina's reading-time estimate;
//   • a word clock, which is what makes `Step.at` land a click on the word "Save".
// Sound is the third thing, and it is the only one that needs a voice.

import { type BuildOptions, buildTrack, type CaptionTrack, type EmphasisSpan, makeReader, type Pace } from '@/lib/cadenza';
import type { Stage as AudioStage, Bytes } from '@/lib/suono';
import { createStage as createAudioStage } from '@/lib/suono';
import type { NarratedWord, NarrateOptions, NarrationHandle, Narrator } from '@/lib/vetrina';

export interface CadenzaNarratorOptions {
	/** Cadenza's pace preset. Leave it to match the tour's own `speed` — a caption that is read
	 *  faster than it is narrated is two clocks disagreeing in front of the viewer. */
	pace?: Pace;
	// The four inputs below change a word's timing exactly as they do on a deck, and the narrators
	// used to drop them: they passed `pace` alone, so a tour timed "ARR" as three letters where the
	// deck that registered it as "annual recurring revenue" timed six syllables. A storyboard has no
	// front matter, so the HOST that builds the tour supplies them — from the deck the tour narrates,
	// or from its own registry. Each means what it means to `buildTrack`, and the parity test in
	// cadenza-narrator.test.ts holds one sentence to the same timings through the deck producer and
	// both narrators (2026-09-24-lattice-timing-track.md §8 step 1).
	/** Author acronym registry (term → spoken expansion); the author wins. */
	acronyms?: BuildOptions['acronyms'];
	/** Read-aloud lexicon (token → spoken form); beats the built-in symbol commons. */
	lexicon?: BuildOptions['lexicon'];
	/** Language tag. A non-English line skips the English lexicon and number expansion. */
	lang?: string;
	/** Emphasis spans for a line. A FUNCTION of the line, because a span is a char range into the
	 *  one text it was measured against — a fixed list would land on the wrong words of every other
	 *  line. Return undefined for a line with no emphasis. */
	emphasis?: (text: string) => readonly EmphasisSpan[] | undefined;
	/** Injected for tests. Defaults to `performance.now`. */
	now?: () => number;
	/** Injected for tests. Defaults to `requestAnimationFrame`. */
	raf?: (cb: (t: number) => void) => number;
	/** Injected for tests. Defaults to `cancelAnimationFrame`. */
	cancelRaf?: (h: number) => void;
}

/** Flatten a track's cues into one line-relative word list — the shape Vetrina's port speaks.
 *
 *  Cadenza thinks in cues (one per sentence) because that is the unit a voice measures and
 *  re-anchors. Vetrina thinks in LINES, because a beat's caption is one line however many
 *  sentences it happens to contain. Absolute ms are already absolute across cues, so this is a
 *  flatten, not a re-time. */
export function trackToWords(track: CaptionTrack): NarratedWord[] {
	const out: NarratedWord[] = [];
	for (const cue of track.cues) {
		for (const w of cue.words) {
			out.push({ index: out.length, text: w.display, startMs: w.startMs, endMs: w.endMs });
		}
	}
	return out;
}

/** How many segmented tracks either narrator keeps. A tour is tens of lines; the cap is an
 *  order of magnitude above that, so it never evicts anything a real walkthrough re-reads,
 *  and it turns an unbounded leak into a fixed ceiling for the replay case that does grow. */
const TRACK_CACHE_MAX = 256;

/** One track per distinct line, built with EVERY timing input the host passed — the one place both
 *  narrators turn text into a track, so the two rungs cannot time a line differently.
 *
 *  A tour replays — a kiosk attract loop replays forever — and re-segmenting the same sentence on
 *  every pass is work with a known answer. The cache is BOUNDED, because the workload it is FOR is
 *  the one that breaks it unbounded: any line carrying a counter, a clock or a name is a distinct
 *  string every pass, so the map would grow one segmented track per replay and never shed one.
 *  Insertion-ordered eviction: a tour cycles through its lines, so the oldest key is the furthest
 *  from being needed. */
function trackCache(options: CadenzaNarratorOptions): { trackFor: (text: string) => CaptionTrack; clear: () => void } {
	const pace: Pace = options.pace ?? 'moderate';
	const { acronyms, lexicon, lang, emphasis } = options;
	const cache = new Map<string, CaptionTrack>();
	const trackFor = (text: string): CaptionTrack => {
		let t = cache.get(text);
		if (!t) {
			t = buildTrack(text, { pace, acronyms, lexicon, lang, emphasis: emphasis?.(text) });
			if (cache.size >= TRACK_CACHE_MAX) cache.delete(cache.keys().next().value as string);
			cache.set(text, t);
		}
		return t;
	};
	return { trackFor, clear: () => cache.clear() };
}

/**
 * A narrator that TIMES a line without speaking it.
 *
 * Silent by design, not by omission: this is the rung every host can run — no key, no network,
 * no `AudioContext`, no user gesture to unlock — and it already carries the word clock. Use it
 * as the default, and add a voice on top only where a voice is actually wanted.
 */
export function cadenzaNarrator(options: CadenzaNarratorOptions = {}): Narrator {
	const now = options.now ?? (() => performance.now());
	const raf = options.raf ?? ((cb: (t: number) => void) => requestAnimationFrame(cb));
	const cancelRaf = options.cancelRaf ?? ((h: number) => cancelAnimationFrame(h));
	const { trackFor, clear: clearTracks } = trackCache(options);

	return {
		voiced: false,
		plan(text: string): CaptionTrack | null {
			if (!text.trim()) return null;
			// A copy: the track is cached, and a caller that re-times its plan (the tour recorder
			// shifts cues onto recorded times) must not re-time the next caller's.
			return structuredClone(trackFor(text));
		},
		speak(text: string, opts: NarrateOptions): NarrationHandle {
			const track = trackFor(text);
			if (!track.durationMs) return { done: Promise.resolve(), cancel() {} };

			const words = trackToWords(track);
			// Cadenza's reader emits {cueIndex, wordIndex}; the port speaks in flat indices, so the
			// offsets are precomputed rather than searched per frame.
			const cueBase: number[] = [];
			let n = 0;
			for (const cue of track.cues) {
				cueBase.push(n);
				n += cue.words.length;
			}

			let handle = 0;
			let finished = false;
			let settle: (() => void) | null = null;
			let fail: ((e: unknown) => void) | null = null;

			const stop = (): void => {
				if (handle) cancelRaf(handle);
				handle = 0;
				opts.signal.removeEventListener('abort', onAbort);
			};
			const finish = (): void => {
				if (finished) return;
				finished = true;
				stop();
				opts.onWord?.(null);
				settle?.();
			};
			// A cancelled line RESOLVES rather than rejecting. The run's own abort plumbing is what
			// tears a taken-over tour down; a narrator that also rejected would surface a second,
			// redundant AbortError from whichever beat happened to be mid-sentence.
			function onAbort(): void {
				if (finished) return;
				finished = true;
				stop();
				opts.onWord?.(null);
				settle?.();
			}

			const reader = makeReader({
				track,
				onWord: (active) => {
					if (finished) return;
					opts.onWord?.(active ? (words[cueBase[active.cueIndex] + active.wordIndex] ?? null) : null);
				},
				onEnd: finish,
			});

			const t0 = now();
			const frame = (): void => {
				if (finished) return;
				const elapsed = now() - t0;
				reader.sync(elapsed);
				// `onEnd` fires the frame the clock passes the timeline, but a backgrounded tab stops
				// getting frames — so the duration is also checked directly, and the LAST frame after
				// a tab comes back finishes the line instead of replaying it.
				if (elapsed >= reader.durationMs()) {
					finish();
					return;
				}
				handle = raf(frame);
			};

			const done = new Promise<void>((resolve, reject) => {
				settle = resolve;
				fail = reject;
			});
			void fail; // reserved: a voiced narrator surfaces synthesis failures here.

			if (opts.signal.aborted) {
				finished = true;
				return { done: Promise.resolve(), cancel() {} };
			}
			opts.signal.addEventListener('abort', onAbort, { once: true });
			handle = raf(frame);

			return { done, cancel: onAbort };
		},
		dispose(): void {
			// Nothing here owns a device — only the track cache. Present so a host can dispose any
			// narrator without asking which rung it got.
			clearTracks();
		},
	};
}

// ── The voiced rung ─────────────────────────────────────────────────────────

export interface VoicedNarratorOptions extends CadenzaNarratorOptions {
	/**
	 * Produce the audio for one line. THE CALLER OWNS THE VOICE — this module fetches nothing,
	 * holds no key and knows no model, exactly as Suono does not.
	 *
	 * That boundary is why the voiced rung can live here at all: HARD RULE #24 keeps our
	 * OpenRouter key off the docs site, and the Playground speaks on the USER's own key. A host
	 * with a key passes its TTS through; a host without one passes anything that is audio.
	 * `durationMs` is the estimate's length, for a producer that wants to match it.
	 *
	 * It receives the RAW line. When the host passes `acronyms` or `lexicon`, the estimate times
	 * their expansions, so a voice that does not apply the same expansions will not follow the
	 * word timing inside the line (the measured clip still corrects the line's total length).
	 * Hand your TTS the same registry, or expand the text before you speak it.
	 */
	synthesize(text: string, ctx: { signal: AbortSignal; durationMs: number }): Promise<Bytes>;
	/** The Suono stage to play through. Defaults to one this narrator owns. Pass your own when the
	 *  host already has a stage — one `AudioContext` per page is the whole point of Suono. */
	audio?: AudioStage;
	/** Give up on `synthesize` after this long and let the beat continue silently. A hung voice
	 *  otherwise leaves the line's `done` pending forever and the beat blocks on it. Suono's own
	 *  sequencer carries the same guard (`produceTimeoutMs`, 20s); this is the per-line equivalent
	 *  for the one-clip path. Default 20000. */
	synthesizeTimeoutMs?: number;
	/** Bias the word highlight this far AHEAD of the heard voice. Broadcast lip-sync tolerance is
	 *  asymmetric (ITU-R BT.1359): a highlight LAGGING the voice is noticed at ~45ms while one
	 *  leading it passes to ~125ms, so the error worth avoiding is the lag. Default 40ms, the same
	 *  bias the deck read-along uses. */
	syncLeadMs?: number;
}

/** Race a promise against a deadline, resolving to the loser's absence rather than throwing at
 *  the call site — a hung voice must degrade to silence, not hang the beat. */
async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
	let timer = 0;
	try {
		return await Promise.race([
			p,
			new Promise<never>((_, reject) => {
				timer = window.setTimeout(() => {
					onTimeout?.();
					reject(new Error(`vetrina: synthesize() did not answer within ${ms}ms`));
				}, ms);
			}),
		]);
	} finally {
		if (timer) window.clearTimeout(timer);
	}
}

/**
 * A narrator that SPEAKS, riding the real audio clock.
 *
 * Two things change against the silent rung, and the second is the one that matters to the
 * caption: the word highlight is driven by Suono's WebAudio clock and re-anchored to the clip's
 * MEASURED onset and duration (Cadenza's hybrid align — the estimate is the baseline, the
 * measurement refines it), and `voiced` is true, which tells the stage to KEEP the caption up
 * while the cursor performs. Silent, the caption and the action compete for one pair of eyes;
 * voiced, the ear has the words and blanking a subtitle mid-sentence would take them from the
 * viewer reading it because they cannot hear it.
 */
export function voicedNarrator(options: VoicedNarratorOptions): Narrator {
	const pace: Pace = options.pace ?? 'moderate';
	const lead = options.syncLeadMs ?? 40;
	// WHO OWNS THE CONTEXT decides who may close it. A stage the host passed in is the host's,
	// and disposing it would close an `AudioContext` the rest of the page is still using; one
	// created here is ours, and without a way to release it a narrator built per run leaks —
	// 8 live contexts after 8 runs, measured, against a per-document cap that throws when hit.
	const ownsAudio = options.audio == null;
	const audio = options.audio ?? createAudioStage();
	// iOS needs the unlock inside the user gesture, and a narrator is built in one (the click that
	// starts the tour). Doing it here rather than at first `speak` is what keeps that true.
	audio.unlock();

	const { trackFor, clear: clearTracks } = trackCache(options);

	return {
		voiced: true,
		plan(text: string): CaptionTrack | null {
			if (!text.trim()) return null;
			// A copy: the track is cached, and a caller that re-times its plan (the tour recorder
			// shifts cues onto recorded times) must not re-time the next caller's.
			return structuredClone(trackFor(text));
		},
		speak(text: string, opts: NarrateOptions): NarrationHandle {
			// Guard FIRST, as the silent rung does. Registering the listener and then checking a
			// controller that cannot have fired yet meant an already-aborted run still synthesized,
			// decoded and played — with a real TTS behind `synthesize` that is a billed request and
			// audible speech issued after the tour was torn down.
			if (opts.signal.aborted) return { done: Promise.resolve(), cancel() {} };

			// The cached track is safe to hand over as-is: `makeCursor` deep-copies its input on entry
			// (cadenza/cursor.ts, "so the cursor can re-anchor without mutating the caller's track"),
			// so `align` never reaches this object and a replay cannot inherit a scaled timeline.
			// An earlier version cloned here against that supposed compounding — a `structuredClone`
			// per line guarding a bug that could not happen, with a test that passed either way.
			const track = trackFor(text);
			if (!track.durationMs) return { done: Promise.resolve(), cancel() {} };
			const words = trackToWords(track);
			// The estimate's spans, captured before anything re-anchors them.
			const estimate = { total: track.durationMs, cues: track.cues.map((c) => ({ start: c.startMs, dur: Math.max(1, c.endMs - c.startMs) })) };
			const cueBase: number[] = [];
			let n = 0;
			for (const cue of track.cues) {
				cueBase.push(n);
				n += cue.words.length;
			}

			const ac = new AbortController();
			const abortAll = () => ac.abort();
			opts.signal.addEventListener('abort', abortAll, { once: true });

			let raf = 0;
			let finished = false;
			const reader = makeReader({
				track,
				onWord: (active) => {
					if (finished) return;
					opts.onWord?.(active ? (words[cueBase[active.cueIndex] + active.wordIndex] ?? null) : null);
				},
			});

			const done = (async () => {
				try {
					const bytes = await withTimeout(
						options.synthesize(text, { signal: ac.signal, durationMs: estimate.total }),
						options.synthesizeTimeoutMs ?? 20_000,
						// Abort the REQUEST, not just the wait. Leaving a hung TTS call in flight bills
						// for a clip nothing will ever play — the same waste the already-aborted guard
						// above exists to prevent, arriving through the other door.
						() => ac.abort(),
					);
					if (ac.signal.aborted) return;
					const clip = await audio.decode(bytes, `${pace}:${text}`);
					let base: number | null = null;
					const handle = audio.play(clip, {
						signal: ac.signal,
						onStart: ({ onsetMs, durationMs }) => {
							base = onsetMs;
							// THE RE-ANCHOR. One clip per LINE, so the measurement is the whole line's span and
							// EVERY cue is scaled into it — the internal rhythm stays the estimate's, the total
							// becomes the voice's.
							//
							// Anchoring only cue 0 (which is what this did first) does not scale a
							// multi-sentence line, it breaks it: `align` re-anchors the cue it is given and
							// SHIFTS the rest, so sentence one stretched across the entire clip and every later
							// sentence was pushed past the end of the audio, never to be highlighted. The
							// spans are read from `estimate`, captured before the first align mutated them.
							const k = estimate.total > 0 ? durationMs / estimate.total : 1;
							for (let i = 0; i < estimate.cues.length; i++) {
								reader.align(i, estimate.cues[i].start * k, estimate.cues[i].dur * k);
							}
						},
					});
					const frame = () => {
						if (finished || base == null) {
							if (!finished) raf = requestAnimationFrame(frame);
							return;
						}
						reader.sync(audio.clockMs() - base + lead);
						raf = requestAnimationFrame(frame);
					};
					raf = requestAnimationFrame(frame);
					await handle.done;
				} catch {
					// A voice that fails must not take the tour down: the beat plays on, silently, and the
					// caption is still on screen for the whole reading budget the storyboard holds it for.
				} finally {
					finished = true;
					if (raf) cancelAnimationFrame(raf);
					opts.signal.removeEventListener('abort', abortAll);
					opts.onWord?.(null);
				}
			})();

			return {
				done,
				cancel: () => {
					ac.abort();
				},
			};
		},
		dispose(): void {
			clearTracks();
			// Only what we made. A host that passed its own stage in still has a page using it.
			if (ownsAudio) audio.dispose?.();
		},
	};
}
