// THE GUIDE IN A SENT FILE — the exported HTML player's entry into the shared Guide kernel.
//
// `tools/build-guide-player.js` bundles this file (with `guide-kernel.ts` and what it imports)
// into `lib/export/guide-player.generated.mjs`, and `lib/export/player-core.mjs` inlines that
// bundle into the player's one hashed script when a deck sets `delivery:`. The player's narration
// transport calls the four hooks below; everything they decide — which element a sentence names,
// which moments a slide spends its focus on, the chart walk, the pause's resume, the aside hold,
// the depth and tempo of the recede — is the kernel's, the same code the Studio's Present runs.
//
// What the Studio draws and a sent file does not: the ink and the cursor (expressive's top moment,
// and the ink fallback on an image or a figure). A sent file is watched with the recipient's own
// pointer on it, and the chart hover the Studio turns off while the Guide plays does not exist in
// the player at all.

import { DELIVERY_STYLES } from '@/lib/resolve-delivery';
import { aimTarget, createGuideDirector, findCueTarget, focusUnit, type GuideLook, type SceneRef, type SceneStyle, wordRangeIn } from './guide-kernel';

/** The preset fields the player needs: the focus look, the read-along switch, and each slide's
 *  binding (`guideLook` in lib/export/player-core.mjs), absent when no slide is bound. */
export type PlayerLook = GuideLook & { wordFocus: boolean; refs?: (readonly SceneRef[] | null)[] };

/** One cue of the player's LTT track, as `makeCursor(...).track()` hands it over. */
type TrackCue = { words?: { display?: string }[]; charOffset?: number };
type Track = { cues: TrackCue[] };

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const displayOf = (cue: TrackCue | undefined): string => norm((cue?.words ?? []).map((w) => w.display ?? '').join(' '));

function aimIn(section: Element, text: string): Element | null {
	const block = findCueTarget(section, text);
	return block ? aimTarget(block, text).el : null;
}

export function createPlayerGuide(look: PlayerLook) {
	const director = createGuideDirector();
	// The texts are derived once per track: the transport hands the same track object over for
	// every cue of a slide, and the director re-plans only when that identity changes.
	let lastTrack: Track | null = null;
	let texts: string[] = [];
	let slideNow = -1;
	// The last word lit, so the transport's per-frame clock repaints only when the word moves.
	let lastWord: { el: Element | null; k: number; j: number } = { el: null, k: -1, j: -1 };

	return {
		/** Whether the transport needs to run its word clock for this Guide (read-along is on). */
		words: look.wordFocus,
		/** A sentence starts: `k` of `track`, on `section` (slide `slide`). */
		cue(section: Element | null, slide: number, track: Track | null, k: number): void {
			if (!section || !track) return;
			if (track !== lastTrack) {
				lastTrack = track;
				texts = track.cues.map(displayOf);
			}
			slideNow = slide;
			// A BOUND SENTENCE plays its scene in the delivery's own style, as in the Studio; the ink
			// and the cursor are the Studio's, so the player applies only the focus the style asks for.
			const style: SceneStyle | undefined = (DELIVERY_STYLES as Record<string, { express: SceneStyle } | undefined>)[look.name]?.express;
			const refs = look.refs?.[slide] ?? null;
			const at = track.cues[k]?.charOffset ?? -1;
			if (refs && style !== undefined && at >= 0 && director.scene({ slide, section, refs, at }, look, style)) return;
			const text = texts[k] ?? '';
			const aimOf = (t: string) => aimIn(section, t);
			const aim = text ? aimOf(text) : null;
			const step = director.beat({ slide, track, texts, cue: k, text, aim, aimOf }, look);
			if (step.kind !== 'moment') return;
			// No hand here, so the element the moment names is the aim itself, and it is shown the
			// moment it is focused.
			if (director.land(aim, text, slide, look) === 'focused') director.markShown();
		},
		/** The spoken word moved (the transport's clock). Lights it inside a focused TEXT element. */
		word(track: Track | null, k: number, j: number): void {
			const el = director.aim;
			if (el === lastWord.el && k === lastWord.k && j === lastWord.j) return;
			lastWord = { el, k, j };
			if (!look.wordFocus || !track || !el || !director.marked || el.closest('svg') || k < 0 || j < 0) {
				director.say(null, null);
				return;
			}
			const words = (track.cues[k]?.words ?? []).map((w) => w.display ?? '');
			// A row focus lights every cell, so the words are looked for across the row.
			const scope = focusUnit(el)?.axis === 'row' ? (el.closest('tr') ?? el) : el;
			director.say(el.ownerDocument, wordRangeIn(scope, words, j));
		},
		/**
		 * The viewer paused: the focus lifts. Unlike the Studio's reader, the player's Play restarts
		 * the slide from its first sentence, so no focus is held for a resume — the slide's own
		 * sentences bring theirs back as they are read (checker: a held focus could return on a
		 * sentence that does not name it).
		 */
		pause(): void {
			director.lift();
			lastWord = { el: null, k: -1, j: -1 };
		},
		/** The narration left the slide (it ended, or the viewer moved to a silent slide). */
		idle(): void {
			director.land(null, '', slideNow, look);
			lastWord = { el: null, k: -1, j: -1 };
		},
	};
}

export type PlayerGuide = ReturnType<typeof createPlayerGuide>;
