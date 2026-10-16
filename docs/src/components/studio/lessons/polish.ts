// POLISH — checking and changing a deck that already has its words: Coach, Fix all, Reshape, and
// light or dark.
//
// Loaded on demand, like every track (catalog.ts). These run on whatever deck is open, so each one
// first checks that its control can do something here: Fix all with nothing to fix, or Reshape on a
// slide with one layout, says so and stops instead of pointing at a disabled button.
// Kit and rules: ./lesson-kit.ts; every line lives in ./lines.ts.

import { type LessonBuild, SEL, settle, tell, visible, yourTurn } from './lesson-kit';
import { LESSON_LINES } from './lines';

const C = LESSON_LINES.coach;
const F = LESSON_LINES['fix-all'];
const R = LESSON_LINES.reshape;
const M = LESSON_LINES['light-dark'];

const disabled = (sel: string): boolean => {
	const el = visible(sel)();
	return el instanceof HTMLButtonElement && el.disabled;
};

const coach: LessonBuild = () => async (ctx) => {
	await tell(ctx, { say: C.what });
	// Coach's button is a toggle: asking someone to click it while Coach is open would close it.
	if (visible(SEL.coachRead)() == null) {
		await yourTurn(ctx, { say: C.click, target: SEL.coach, perform: (a) => a.run('coach'), missing: C.missing });
		if (!(await settle(ctx, () => visible(SEL.coachRead)() != null))) return;
	}
	await tell(ctx, { say: C.list, point: SEL.coachRead, circle: SEL.coachRead });
	await tell(ctx, { say: C.next });
};

const fixAll: LessonBuild = (env) => async (ctx) => {
	// The command is in the action list only while there is something to fix; the bar button is
	// there but disabled. Either way, nothing to fix means nothing to show.
	if (!env.can('fix-all')) {
		// Still show where it lives: the bar button is there, waiting (disabled) for something to fix.
		await tell(ctx, { say: F.nothing, point: SEL.fixAll });
		return;
	}
	await tell(ctx, { say: F.what });
	// No `missing` line: Fix all is the largest edit any lesson can make, so the lesson applies it only
	// as the user's own turn or after pointing at the button. Off screen, it says where the button is.
	if (visible(SEL.fixAll)() == null) {
		await tell(ctx, { say: F.missing });
		return;
	}
	await yourTurn(ctx, { say: F.click, target: SEL.fixAll, perform: (a) => a.run('fix-all') });
	await tell(ctx, { say: F.undo, point: SEL.editor });
};

const reshape: LessonBuild = (env) => async (ctx) => {
	await tell(ctx, { say: R.what });
	if (env.mobile) {
		await tell(ctx, { say: R.phone });
		return;
	}
	if (visible(SEL.reshape)() == null || disabled(SEL.reshape)) {
		await tell(ctx, { say: R.unavailable });
		return;
	}
	await yourTurn(ctx, { say: R.click, target: SEL.reshape, perform: (a) => a.press(SEL.reshape) });
	if (!(await settle(ctx, () => visible(SEL.reshapeTile)() != null))) return;
	await yourTurn(ctx, { say: R.pick, target: SEL.reshapeTile, perform: (a) => a.press(SEL.reshapeTile) });
	await tell(ctx, { say: R.done, circle: SEL.preview });
};

const lightDark: LessonBuild = () => async (ctx) => {
	await tell(ctx, { say: M.what });
	await yourTurn(ctx, { say: M.click, target: SEL.mode, perform: (a) => a.run('toggle-mode'), missing: M.missing });
	await tell(ctx, { say: M.done, circle: SEL.preview });
};

export const POLISH = {
	coach,
	'fix-all': fixAll,
	reshape,
	'light-dark': lightDark,
} as const satisfies Record<string, LessonBuild>;
