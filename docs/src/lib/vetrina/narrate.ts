// Vetrina — NARRATION: the port, not the engine.
//
// Vetrina does not know how to time text, and it must not learn. Cadenza already does —
// syllable-grounded word timings from text alone, and a hybrid re-anchor onto a real
// voice's measured onsets — and Vetrina's boundary gate bars importing it (the libraries
// are separately spin-off-able; that gate IS the contract). So narration arrives the way
// audio arrives in Suono: as something the HOST wires in.
//
// This file is the whole seam. It is types plus one no-op, imports nothing, and touches
// no DOM. The Cadenza-backed implementation lives outside the library, in
// docs/src/lib/vetrina-narration/.
//
// WHAT A NARRATOR BUYS, BEYOND SOUND. Three things, and only the first needs audio:
//   1. a voice;
//   2. a REAL duration for each line, replacing the reading-time estimate in ./pacing —
//      this works with no audio at all, because a timed track is text arithmetic;
//   3. a word CLOCK, which is what lets an action land on the word that names it
//      (`Step.at`) — also silent. A caption that says "click Save" while the cursor
//      clicks Save on the word "Save" is the difference between a tour and a recital.

/** One word of a narrated line, as the narrator reports it. */
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
	/** OPTIONAL: the word timeline for `text`, computed AHEAD of speaking it.
	 *
	 *  This is what makes a word-cued action land on the beat rather than after it. Knowing
	 *  that "Save" starts at 1,240 ms lets the cursor leave early enough to ARRIVE there —
	 *  a presenter's hand is already moving before they say the word. A narrator that cannot
	 *  see its own future returns null, and the cue degrades to "narrate, then act". */
	plan?(text: string): NarratedWord[] | null;
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

/** Find the word a `Step.at` cue names, in a plan.
 *
 *  Matching is case-insensitive and ignores surrounding punctuation, so `.at('Save')` finds
 *  it in "Now click Save." — an author naming a word should not have to know how the
 *  segmenter split it. The FIRST match wins: a cue is a pointer to a moment, and the moment
 *  is the first time the line says the thing.
 *
 *  Pure, so it is unit-testable without a narrator. */
export function findCueWord(plan: NarratedWord[] | null | undefined, word: string): NarratedWord | null {
	if (!plan || !word) return null;
	const needle = normalizeCueWord(word);
	if (!needle) return null;
	for (const w of plan) {
		if (normalizeCueWord(w.text) === needle) return w;
	}
	return null;
}

/** Strip the punctuation a segmenter leaves attached, and case-fold. Kept next to
 *  `findCueWord` because the two must agree on what "the same word" means. */
function normalizeCueWord(s: string): string {
	return s
		.toLowerCase()
		.replace(/^[^\p{L}\p{N}]+/u, '')
		.replace(/[^\p{L}\p{N}]+$/u, '');
}

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
