// The `/vetrina` page's two `scene()` beats, and the recording of one of them.
//
// They live here rather than inline in docs/src/pages/vetrina.astro so that a test can hash the
// storyboard the page actually runs: `staleStretches` compares a recording against the steps as they
// stand now (LTT step 4), and a copy of the steps in a test would compare the recording against the
// copy. The page imports these builders; page-scenes.test.ts imports the same ones.
//
// THE RECORDING. `deictic.ltt.json` is one run of `deicticScene`, recorded on the page by its Record
// control (Chromium, 1440×900, full motion, the Cadenza narrator at `moderate`). The page's Replay
// control, and `/vetrina?replay`, play it back through `replayNarrator`: every line is planned from
// the recording, so each stroke lands on its word where it was recorded (the recording's `actions`),
// and the cursor's lead is still asked of the live stage. Re-record it when page-scenes.test.ts
// reports a stale stretch.

import { scene } from '../vetrina';

/** The four deictic strokes, chosen by the shape of the thing named, each landing on the word that
 *  names it (`at`): the hand arrives as the narration says "rule", "boundary", "swept", "tapped". */
export const deicticScene = () =>
	scene()
		.say('A hand names a thing by its shape. A line gets a rule under it.')
		.at('rule')
		.point('#vt-list .note:first-child')
		.gesture('underline', '#vt-list .note:first-child')
		.hold(700)
		.say('A block that draws no boundary of its own gets one.')
		.at('boundary')
		.gesture('bracket', '#vt-list')
		.hold(700)
		.say('A phrase inside a longer line gets its words swept.')
		.at('swept')
		.gesture('wash', '#vt-list .note:last-child')
		.hold(700)
		.say('And a thing small enough to be a point gets tapped.')
		.at('tapped')
		.gesture('tap', '#vt-count')
		.hold(800);

/** A teaching beat: say the words, wait while they are read, then act. `publish` is the page's own. */
export const teachScene = () =>
	scene<{ publish(): void }>()
		.say('A teaching beat says the words first, and waits while you read them.')
		.read()
		.hold(500)
		.say('Then it does the thing.')
		.point('#vt-finish')
		.read()
		.act((a) => a.publish())
		.gesture('check', '#vt-finish')
		.hold(900);

/** The recording's id and the timing inputs it was made with, besides the engine hash, which the
 *  recording itself carries. */
export const DEICTIC_RECORDING_ID = 'vetrina-deictic';
export const RECORDING_PACE = 'moderate' as const;
