// TOUR VOICE — the page's one narrator for the first-run tour, and the start card's sound test.
//
// The tour speaks from clips recorded ahead of time (tours/lines.ts, folder `tour`), played by the
// same `clipNarrator` the lessons use, so a visitor hears one engine and one stage. This module is
// imported lazily (the start card and the tour both `import()` it), which keeps Suono, Cadenza and
// the clip loader out of the Studio's startup bundle.
//
// THE GESTURE. An AudioContext only plays if it was unlocked inside a user gesture, and
// `clipNarrator()` unlocks as it is built. So `prepareTourVoice()` is synchronous and is called from
// the click that starts the tour or the test; the module itself is already loaded by then because
// the card preloads it.
//
// Design record: engineering/decisions/2026-10-20-first-run-onboarding.md.

import { findCueWord } from '../../../lib/vetrina/index.js';
import { cadenzaNarrator } from '../../../lib/vetrina-narration/cadenza-narrator';
import { type ClipNarrator, clipNarrator } from '../lessons/lesson-voice';
import { TOUR_LINES, TOUR_VOICE_DIR } from './lines';

/** How far the voice leans toward the cursor: a lean, never one ear. */
export const TOUR_PAN_STRENGTH = 0.5;

let voice: ClipNarrator | null = null;
let loaded: Promise<void> | null = null;

/** Build the page's tour narrator if it is not built yet, and unlock audio. Call inside a gesture. */
export function prepareTourVoice(): ClipNarrator {
	if (!voice) {
		voice = clipNarrator({ panStrength: TOUR_PAN_STRENGTH });
		addEventListener('pagehide', disposeTourVoice, { once: true });
	} else {
		voice.unlock();
	}
	loaded ??= voice.load(TOUR_VOICE_DIR);
	return voice;
}

/** Resolves once the tour's clip list has been read (never rejects). */
export const tourVoiceReady = (): Promise<void> => (prepareTourVoice(), loaded ?? Promise.resolve());

/** The narrator the tour runs with: the recorded voice, or the silent one (captions and timing only). */
export function tourNarrator(sound: boolean) {
	return sound ? prepareTourVoice() : cadenzaNarrator({ pace: 'moderate' });
}

/** True when the tour's clips loaded, so the test and the tour will be heard. */
export function tourVoiceAvailable(): boolean {
	return !!voice?.has(TOUR_LINES.test);
}

/**
 * The start card's Test button: one sentence, panned hard left and then right, so the visitor
 * hears that sound works AND what the stereo does. The sweep is full strength on purpose (the tour
 * itself only leans), and the tour's strength comes back afterwards.
 */
export async function testTourSound(): Promise<boolean> {
	const n = prepareTourVoice();
	await tourVoiceReady();
	if (!n.has(TOUR_LINES.test)) return false;
	const ac = new AbortController();
	n.setPanStrength(1);
	n.setPan(-1, 0);
	const now = findCueWord(n.plan?.(TOUR_LINES.test), 'now');
	const sweep = setTimeout(() => n.setPan(1, 300), Math.max(0, (now?.startMs ?? 1900) - 150));
	try {
		await n.speak(TOUR_LINES.test, { signal: ac.signal }).done;
	} finally {
		clearTimeout(sweep);
		n.setPan(0, 0);
		n.setPanStrength(TOUR_PAN_STRENGTH);
	}
	return true;
}

export function disposeTourVoice(): void {
	voice?.dispose?.();
	voice = null;
	loaded = null;
}
