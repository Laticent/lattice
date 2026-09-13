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

// ── The voiced rung, and why it is not here ─────────────────────────────────
//
// A voiced narrator is the same object with `voiced: true`, `speak` driving a Suono sequence
// instead of a wall clock, and `reader.align(cueIndex, onsetMs, durationMs)` called from
// `onItemStart` so the word clock rides the real voice rather than the estimate. Every piece
// exists: `docs/src/components/studio/read-aloud.ts` already does exactly this for the deck
// read-along, against the production voice ladder.
//
// It is not in this file because it cannot be: a voice needs synthesized bytes, and HARD RULE
// #24 keeps our OpenRouter key off the docs site entirely — the Playground speaks on the
// USER's own key, obtained by OAuth. So the voiced rung is a Studio-side wiring job with a key
// in hand, not a library default, and shipping a stub here that silently produced no sound
// would be worse than the honest absence.
