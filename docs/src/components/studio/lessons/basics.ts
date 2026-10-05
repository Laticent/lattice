// BASICS — the first six lessons: the things everyone needs on day one.
//
// Loaded on demand: the Studio bundle carries only `catalog.ts`; this file arrives through
// `import()` the first time someone opens a lesson. Each lesson runs on the deck the user has open
// and ends by naming the search words that bring it back. Kit and rules: ./lesson-kit.ts. Every line
// a lesson says lives in ./lines.ts, because each one has a recorded clip.

import { type LessonBuild, SEL, settle, tell, visible, yourTurn } from './lesson-kit';
import { LESSON_LINES } from './lines';

/** The slide "Write a slide" adds when it does the step for the user. */
const SAMPLE_SLIDE = '# Your next idea\n\n- One point per line\n- Keep each slide to one message';

/** The palette "Change the theme" switches to: carbone when the deck is not already wearing it,
 *  because a graphite deck is unmistakably different from every light default. */
function contrastPalette(current: string, palettes: readonly string[]): string {
	if (current !== 'carbone' && palettes.includes('carbone')) return 'carbone';
	return palettes.find((p) => p !== current) ?? current;
}

const N = LESSON_LINES['new-deck'];
const W = LESSON_LINES['write-slide'];
const A = LESSON_LINES['add-slide'];
const T = LESSON_LINES['change-theme'];
const P = LESSON_LINES.present;
const E = LESSON_LINES['export-pdf'];

const presentDialog = (): boolean => document.querySelector('[role="dialog"][aria-label="Present"]') != null;

const newDeck: LessonBuild = () => async (ctx) => {
	const who = await yourTurn(ctx, {
		say: N.click,
		target: SEL.deckSwitcher,
		perform: (a) => a.run('new-deck'),
		missing: N.missing,
	});
	if (who === 'user' && (await settle(ctx, () => visible(SEL.newDeck)() != null))) {
		await yourTurn(ctx, { say: N.choose, target: SEL.newDeck, perform: (a) => a.press(SEL.newDeck), missing: N.missing });
	}
	await tell(ctx, { say: N.done, point: SEL.editor });
};

const writeSlide: LessonBuild = () => async (ctx) => {
	// The editor is hidden (inert) at the Read stop and when its pane is collapsed. Writing is the
	// whole lesson, so it says how to get the editor back rather than adding a slide unasked.
	if (visible(SEL.editor)() == null) {
		await tell(ctx, { say: W.hidden });
		return;
	}
	await tell(ctx, { say: W.plain, point: SEL.editor });
	await tell(ctx, { say: W.dashes, point: SEL.editor });
	const who = await yourTurn(ctx, {
		say: W.turn,
		target: SEL.editor,
		perform: (a) => a.appendSlide(SAMPLE_SLIDE),
	});
	if (who === 'user') {
		await tell(ctx, { say: W.keepTyping });
		return;
	}
	await tell(ctx, { say: W.made, point: SEL.preview, circle: SEL.preview });
};

const addSlide: LessonBuild = () => async (ctx) => {
	const who = await yourTurn(ctx, {
		say: A.click,
		target: SEL.addSlide,
		perform: (a) => a.run('insert'),
		missing: A.missing,
	});
	if (who === 'nobody') return;
	if (!(await settle(ctx, () => visible(SEL.pickerBlank)() != null))) {
		await tell(ctx, { say: A.notReady });
		return;
	}
	await tell(ctx, { say: A.cards });
	await yourTurn(ctx, { say: A.pick, target: SEL.pickerBlank, perform: (a) => a.press(SEL.pickerBlank) });
	await tell(ctx, { say: A.placed, circle: SEL.preview });
};

const changeTheme: LessonBuild = (env) => async (ctx) => {
	const next = contrastPalette(env.palette, env.palettes);
	const item = `[data-palette="${next}"]`;
	await tell(ctx, { say: T.what });
	const who = await yourTurn(ctx, {
		say: T.click,
		target: SEL.theme,
		perform: (a) => a.setPalette(next),
		missing: T.missing,
	});
	if (who === 'user' && (await settle(ctx, () => visible(item)() != null))) {
		await yourTurn(ctx, {
			say: T.pick,
			target: item,
			perform: (a) => (visible(item)() ? a.press(item) : a.setPalette(next)),
		});
	}
	await tell(ctx, { say: T.done, circle: SEL.preview });
};

const present: LessonBuild = () => async (ctx) => {
	await yourTurn(ctx, {
		say: P.click,
		target: SEL.present,
		perform: (a) => a.run('present'),
		missing: P.missing,
	});
	await settle(ctx, presentDialog);
	await tell(ctx, { say: P.keys });
};

const exportPdf: LessonBuild = () => async (ctx) => {
	await yourTurn(ctx, {
		say: E.share,
		target: SEL.share,
		perform: (a) => a.run('share'),
		missing: E.shareMissing,
	});
	if (!(await settle(ctx, () => visible(SEL.sharePdf)() != null))) return;
	await yourTurn(ctx, { say: E.pdf, target: SEL.sharePdf, perform: (a) => a.press(SEL.sharePdf), missing: E.pdfMissing });
	if (!(await settle(ctx, () => visible(SEL.pdfDownload)() != null))) return;
	// No `perform`: downloading a file is the one step a lesson never takes for the user.
	await yourTurn(ctx, { say: E.download, target: SEL.pdfDownload });
	await tell(ctx, { say: E.next });
};

export const BASICS = {
	'new-deck': newDeck,
	'write-slide': writeSlide,
	'add-slide': addSlide,
	'change-theme': changeTheme,
	present,
	'export-pdf': exportPdf,
} as const satisfies Record<string, LessonBuild>;
