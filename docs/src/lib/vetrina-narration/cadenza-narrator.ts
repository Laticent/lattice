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

import { buildTrack, type CaptionTrack, makeReader, type Pace } from '@/lib/cadenza';
import type { Stage as AudioStage, Bytes } from '@/lib/suono';
import { createStage as createAudioStage } from '@/lib/suono';
import type { NarratedWord, NarrateOptions, NarrationHandle, Narrator } from '@/lib/vetrina';

export interface CadenzaNarratorOptions {
	/** Cadenza's pace preset. Leave it to match the tour's own `speed` — a caption that is read
	 *  faster than it is narrated is two clocks disagreeing in front of the viewer. */
	pace?: Pace;
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

/**
 * A narrator that TIMES a line without speaking it.
 *
 * Silent by design, not by omission: this is the rung every host can run — no key, no network,
 * no `AudioContext`, no user gesture to unlock — and it already carries the word clock. Use it
 * as the default, and add a voice on top only where a voice is actually wanted.
 */
export function cadenzaNarrator(options: CadenzaNarratorOptions = {}): Narrator {
	const pace: Pace = options.pace ?? 'moderate';
	const now = options.now ?? (() => performance.now());
	const raf = options.raf ?? ((cb: (t: number) => void) => requestAnimationFrame(cb));
	const cancelRaf = options.cancelRaf ?? ((h: number) => cancelAnimationFrame(h));

	// One track per distinct line. A tour replays — a kiosk attract loop replays forever — and
	// re-segmenting the same sentence on every pass is work with a known answer.
	const cache = new Map<string, CaptionTrack>();
	const trackFor = (text: string): CaptionTrack => {
		let t = cache.get(text);
		if (!t) {
			t = buildTrack(text, { pace });
			cache.set(text, t);
		}
		return t;
	};

	return {
		voiced: false,
		plan(text: string): NarratedWord[] | null {
			if (!text.trim()) return null;
			return trackToWords(trackFor(text));
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
	 */
	synthesize(text: string, ctx: { signal: AbortSignal; durationMs: number }): Promise<Bytes>;
	/** The Suono stage to play through. Defaults to one this narrator owns. Pass your own when the
	 *  host already has a stage — one `AudioContext` per page is the whole point of Suono. */
	audio?: AudioStage;
	/** Bias the word highlight this far AHEAD of the heard voice. Broadcast lip-sync tolerance is
	 *  asymmetric (ITU-R BT.1359): a highlight LAGGING the voice is noticed at ~45ms while one
	 *  leading it passes to ~125ms, so the error worth avoiding is the lag. Default 40ms, the same
	 *  bias the deck read-along uses. */
	syncLeadMs?: number;
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
	const audio = options.audio ?? createAudioStage();
	// iOS needs the unlock inside the user gesture, and a narrator is built in one (the click that
	// starts the tour). Doing it here rather than at first `speak` is what keeps that true.
	audio.unlock();

	const cache = new Map<string, CaptionTrack>();
	const trackFor = (text: string): CaptionTrack => {
		let t = cache.get(text);
		if (!t) {
			t = buildTrack(text, { pace });
			cache.set(text, t);
		}
		return t;
	};

	return {
		voiced: true,
		plan(text: string): NarratedWord[] | null {
			if (!text.trim()) return null;
			return trackToWords(trackFor(text));
		},
		speak(text: string, opts: NarrateOptions): NarrationHandle {
			const track = trackFor(text);
			if (!track.durationMs) return { done: Promise.resolve(), cancel() {} };
			const words = trackToWords(track);
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
					const bytes = await options.synthesize(text, { signal: ac.signal, durationMs: track.durationMs });
					if (ac.signal.aborted) return;
					const clip = await audio.decode(bytes, `${pace}:${text}`);
					let base: number | null = null;
					const handle = audio.play(clip, {
						signal: ac.signal,
						onStart: ({ onsetMs, durationMs }) => {
							base = onsetMs;
							// THE RE-ANCHOR. One clip per LINE, so cue 0 carries the measurement and Cadenza
							// shifts the tail: the internal rhythm stays the estimate's, the span becomes the
							// voice's. (A line of several sentences is therefore scaled rather than aligned
							// per sentence — a beat's caption is normally one sentence, and per-sentence
							// alignment would need one clip each.)
							reader.align(0, 0, durationMs);
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
	};
}
