// Vetrina — NARRATION: the port, not the engine.
//
// Vetrina does not know how to time text, and it must not learn. Cadenza already does —
// syllable-grounded word timings from text alone, and a hybrid re-anchor onto a real
// voice's measured onsets — and Vetrina's boundary gate bars importing it (the libraries
// are separately spin-off-able; that gate IS the contract). So narration arrives the way
// audio arrives in Suono: as something the HOST wires in.
//
// This file is the whole seam. It is types plus one no-op and touches no DOM. Its one import is
// `@laticent/ltt`, the timing-track format: a plan IS the format's CaptionTrack, and a word cue is
// the same `{cue, word, match}` an LTT action records (LTT step 4). The Cadenza-backed implementation lives outside the library, in
// docs/src/lib/vetrina-narration/.
//
// WHAT A NARRATOR BUYS, BEYOND SOUND. Three things, and only the first needs audio:
//   1. a voice;
//   2. a REAL duration for each line, replacing the reading-time estimate in ./pacing —
//      this works with no audio at all, because a timed track is text arithmetic;
//   3. a word CLOCK, which is what lets an action land on the word that names it
//      (`Step.at`) — also silent. A caption that says "click Save" while the cursor
//      clicks Save on the word "Save" is the difference between a tour and a recital.

import { type CaptionTrack, normalizeMatch } from '@laticent/ltt';

/** One word of a narrated line, as the narrator reports it while speaking (`onWord`). */
export interface NarratedWord {
	/** Position of the word within the line, 0-based. */
	index: number;
	/** The word as DISPLAYED (which is not always the word as spoken — "$4.2M" is one
	 *  displayed token and five spoken ones). */
	text: string;
	/** When this word starts, in ms from the start of the line. */
	startMs: number;
	/** When it ends, in ms from the start of the line. */
	endMs: number;
}

export interface NarrateOptions {
	/** Aborting the run cancels the line. A narrator MUST resolve or reject `done` on abort;
	 *  never leave the beat hanging. */
	signal: AbortSignal;
	/** Word-level progress for a karaoke caption. Called with the active word, or `null`
	 *  between words / at the end. Optional — a narrator that cannot report words omits it. */
	onWord?(word: NarratedWord | null): void;
}

export interface NarrationHandle {
	/** Resolves when the line is finished — the voice stopped, or the timed track elapsed.
	 *  This is what a beat awaits instead of a reading-time estimate. */
	readonly done: Promise<void>;
	/** Stop this line now. Idempotent. */
	cancel(): void;
}

export interface Narrator {
	/** True when this narrator produces AUDIBLE speech.
	 *
	 *  It drives one real decision, not a label: whether the caption steps aside while the
	 *  cursor performs. Silent, the caption and the action compete for the same eye, so the
	 *  caption gets out of the way. Voiced, the ear is carrying the words and the eye is
	 *  free — and hiding a subtitle mid-sentence is a straight a11y regression for a viewer
	 *  who is reading it BECAUSE they cannot hear it. Same rule, opposite outcome, decided
	 *  by this flag. */
	readonly voiced: boolean;
	/** Begin narrating one line. */
	speak(text: string, opts: NarrateOptions): NarrationHandle;
	/** OPTIONAL: the word timeline for `text`, computed AHEAD of speaking it — the LTT core's
	 *  CaptionTrack, one cue per sentence, times in ms from the start of the line.
	 *
	 *  This is what makes a word-cued action land on the beat rather than after it. Knowing
	 *  that "Save" starts at 1,240 ms lets the cursor leave early enough to ARRIVE there —
	 *  a presenter's hand is already moving before they say the word. A narrator that cannot
	 *  see its own future returns null, and the cue degrades to "narrate, then act". */
	plan?(text: string): CaptionTrack | null;
	/** OPTIONAL: release whatever this narrator owns — an `AudioContext`, a decoded-clip
	 *  cache, a worker.
	 *
	 *  THE HOST CALLS THIS, never `run()`. A narrator is passed IN, so the run does not own
	 *  it and must not close it: one narrator across many runs is the shape that keeps a
	 *  single `AudioContext` for the page, which is the whole point of one. `run()` tearing
	 *  it down at the end of the first tour would break exactly the correct usage.
	 *
	 *  It exists because a narrator built PER RUN otherwise leaks: measured at 8 live
	 *  `AudioContext`s after 8 runs of the prototype, none closed. Chromium caps hardware
	 *  contexts per document, and the constructor throws when the cap is hit — which, from
	 *  inside a click handler that has already disabled its own button, is a page that
	 *  cannot be restarted. Idempotent; a disposed narrator must not be reused. */
	dispose?(): void;
}

/** A word a `Step.at` cue named, located in a plan: the `{cue, word, match}` an LTT action records,
 *  plus the word's own times, which a beat aligns the cursor to. */
export interface CueWord {
	/** Index of the cue (sentence) in the plan. */
	cue: number;
	/** Index of the word in that cue. */
	word: number;
	/** The word the author named, normalized the way `validateLtt` compares it (`normalizeMatch`). */
	match: string;
	/** The word as displayed. */
	text: string;
	/** When the word starts, in ms from the start of the line. */
	startMs: number;
	/** When it ends, in ms from the start of the line. */
	endMs: number;
}

/** Find the word a `Step.at` cue names, in a plan.
 *
 *  Matching is case-insensitive and ignores surrounding punctuation, so `.at('Save')` finds
 *  it in "Now click Save." — an author naming a word should not have to know how the
 *  segmenter split it. The FIRST match wins: a cue is a pointer to a moment, and the moment
 *  is the first time the line says the thing.
 *
 *  Pure, so it is unit-testable without a narrator. */
export function findCueWord(plan: CaptionTrack | null | undefined, word: string): CueWord | null {
	if (!plan || !word) return null;
	const match = normalizeCueWord(word);
	if (!match) return null;
	for (let c = 0; c < plan.cues.length; c++) {
		const words = plan.cues[c].words;
		for (let w = 0; w < words.length; w++) {
			if (normalizeCueWord(words[w].display) === match) return { cue: c, word: w, match, text: words[w].display, startMs: words[w].startMs, endMs: words[w].endMs };
		}
	}
	return null;
}

/** Strip the punctuation a segmenter leaves attached, and case-fold. It IS `@laticent/ltt`'s
 *  `normalizeMatch`, the rule an action's `match` is written with and `validateLtt` checks, so
 *  "the same word" means one thing on both sides of the format. It was a copy until LTT step 4
 *  opened Vetrina's gate to the package; the name stays because it is exported API. */
export const normalizeCueWord: (s: string) => string = normalizeMatch;

/** A narrator that says nothing and knows nothing — the shape of "no narration".
 *
 *  It exists so the storyboard has one code path instead of two: a beat always asks the
 *  narrator, and this one always answers "I have no opinion", which sends the beat back to
 *  the reading-time estimate in ./pacing. */
export const SILENT_NARRATOR: Narrator = {
	voiced: false,
	speak() {
		return { done: Promise.resolve(), cancel() {} };
	},
	plan() {
		return null;
	},
};
