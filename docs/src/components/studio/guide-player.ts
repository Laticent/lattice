import { DELIVERY_STYLES } from '@/lib/resolve-delivery';
import { createStage, type Stage } from '@/lib/vetrina/index.js';
import { createGuideConductor, type GuideDelivery, guideStageTheme } from './guide-conductor';
import { cueDisplayText, guideAimInRoot, guideCueInRoot, POINTER_BOX, type SceneRef, type SceneStyle, sceneCue } from './present-guide';

// THE GUIDE, FOR THE EXPORTED PLAYER — the entry `tools/build-guide-player.js` bundles into
// `lib/export/guide-player-bundle.generated.mjs`, which `player-core.mjs` inlines into a narrated
// export, unless the author switched the Guide off (engineering/decisions/2026-09-27-guide-in-the-exported-player.md).
//
// It adds no rule of its own. The resolver (`present-guide.ts`), the per-sentence conductor
// (`guide-conductor.ts`) and the hand and its ink (Vetrina's stage) are the modules Present runs;
// this file only says where the player's shown slide is and builds the stage the way Present's
// Stage window does. The player's transport calls `beat` when a sentence starts, when narration
// pauses, and when the slide changes; the conductor answers.

/** The slide's caption track as the player's LTT cursor hands it over. */
type Track = { cues: { words: { display?: string }[]; charOffset?: number }[] } | null;

export type PlayerGuide = {
	/** A sentence started (`cue` ≥ 0), the slide changed with nothing said yet (`cue` -1), or
	 *  narration paused or resumed (`playing`). */
	beat(slide: number, cue: number, track: Track, playing: boolean): void;
	/** Word `k` of cue `cue` is being said, for the read-along inside the focused element. */
	word(track: Track, cue: number, k: number, captionsOn: boolean): void;
	/** Take the hand and the focus down (the viewer switched the Guide off, or left Present). */
	reset(): void;
};

/** The delivery, its motion, and each slide's binding (`guideLook` in lib/export/player-core.mjs),
 *  absent when no slide is bound. */
type Preset = GuideDelivery & { motion: 'full' | 'legible'; refs?: (readonly SceneRef[] | null)[] };

function create(delivery: Preset, shown: () => Element | null): PlayerGuide {
	let stage: Stage | null = null;
	// Built on first use, so a viewer who never presses Play never gets a layer in the page.
	const ensure = (): Stage => {
		if (stage) return stage;
		// The theme Present's stage uses, from the one definition both read.
		stage = createStage({ root: document.body, onExit: () => {}, theme: guideStageTheme(delivery.motion) });
		// BORN HIDDEN: Vetrina spawns its cursor mid-screen, which is the middle of the slide.
		stage.setCursorVisible(false);
		return stage;
	};
	const conductor = createGuideConductor({
		stage: () => stage,
		aim: (t, p) => guideAimInRoot(shown(), t, p),
		// The shown section carries the player's fit transform, so its own client rect is the
		// painted slide: it is both the root to search and the frame to clamp the rest inside.
		cue: (t, p) => {
			const sec = shown();
			return sec ? guideCueInRoot(sec, sec, t, p) : null;
		},
		clearance: POINTER_BOX / 2 + 5,
		// A BOUND SENTENCE plays its scene, as in Present: the shown section is its root, and it is the
		// document here, so no frame to cross.
		section: () => shown(),
		sceneCue: (section, els, kind, strength) => sceneCue(null, section, els, kind, strength),
	});
	const style = (DELIVERY_STYLES as Record<string, { express: SceneStyle } | undefined>)[delivery.name]?.express;
	return {
		beat(slide, cue, track, playing) {
			ensure();
			const texts = track ? track.cues.map(cueDisplayText) : [];
			const refs = delivery.refs?.[slide] ?? null;
			const at = track && cue >= 0 ? (track.cues[cue]?.charOffset ?? -1) : -1;
			const scene = refs && style ? { refs, at, style } : null;
			conductor.beat({ slide, cue, texts, track, delivering: playing, delivery, scene });
		},
		word(track, cue, k, captionsOn) {
			const words = track && cue >= 0 ? (track.cues[cue]?.words.map((w) => w.display ?? '') ?? []) : null;
			conductor.readAlong(words, k, delivery, captionsOn);
		},
		reset() {
			conductor.reset();
			stage?.setCursorVisible(false);
		},
	};
}

(window as unknown as { __lpGuide: { create: typeof create } }).__lpGuide = { create };
