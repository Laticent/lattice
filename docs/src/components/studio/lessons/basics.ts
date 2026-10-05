// BASICS — the first six lessons: the things everyone needs on day one.
//
// Loaded on demand: the Studio bundle carries only `catalog.ts`; this file arrives through
// `import()` the first time someone opens a lesson. Each lesson runs on the deck the user has open
// and ends by naming the search words that bring it back. Kit and rules: ./lesson-kit.ts.

import { type LessonBuild, SEL, settle, tell, visible, yourTurn } from './lesson-kit';

/** The slide "Write a slide" adds when it does the step for the user. */
const SAMPLE_SLIDE = '# Your next idea\n\n- One point per line\n- Keep each slide to one message';

/** The palette "Change the theme" switches to: carbone when the deck is not already wearing it,
 *  because a graphite deck is unmistakably different from every light default. */
function contrastPalette(current: string, palettes: readonly string[]): string {
	if (current !== 'carbone' && palettes.includes('carbone')) return 'carbone';
	return palettes.find((p) => p !== current) ?? current;
}

const presentDialog = (): boolean => document.querySelector('[role="dialog"][aria-label="Present"]') != null;

const newDeck: LessonBuild = () => async (ctx) => {
	const who = await yourTurn(ctx, {
		say: 'Your decks live under the deck name at the top left. Click it.',
		target: SEL.deckSwitcher,
		perform: (a) => a.run('new-deck'),
		missing: 'I’ll start a new deck for you.',
	});
	if (who === 'user' && (await settle(ctx, () => visible(SEL.newDeck)() != null))) {
		await yourTurn(ctx, { say: 'Choose New deck.', target: SEL.newDeck, perform: (a) => a.press(SEL.newDeck) });
	}
	await tell(ctx, { say: 'A blank deck, saved as you type. Your other decks are in that same menu.', point: SEL.editor });
};

const writeSlide: LessonBuild = () => async (ctx) => {
	await tell(ctx, { say: 'A deck is plain text. You write on the left, and the slides appear on the right.', point: SEL.editor });
	await tell(ctx, { say: 'A line of three dashes starts a new slide. A line that starts with # is the slide’s heading.', point: SEL.editor });
	const who = await yourTurn(ctx, {
		say: 'Your turn: click at the end of your text, type three dashes, then a # heading.',
		target: SEL.editor,
		perform: (a) => a.appendSlide(SAMPLE_SLIDE),
	});
	if (who === 'user') {
		await tell(ctx, { say: 'Keep typing. The preview follows every keystroke.' });
		return;
	}
	await tell(ctx, { say: 'That is the slide those lines made. Change any word and the slide follows.', point: SEL.preview, circle: SEL.preview });
};

const addSlide: LessonBuild = () => async (ctx) => {
	const who = await yourTurn(ctx, {
		say: 'To add a ready-made slide (a chart, a big number, a comparison), click Add slide.',
		target: SEL.addSlide,
		perform: (a) => a.run('insert'),
		missing: 'I’ll open the slide gallery for you.',
	});
	if (who === 'nobody' || !(await settle(ctx, () => visible(SEL.pickerBlank)() != null))) return;
	await tell(ctx, { say: 'Each card is one kind of slide. Type in the search box to find one by name.' });
	await yourTurn(ctx, { say: 'Pick a card. Blank is the simplest place to start.', target: SEL.pickerBlank, perform: (a) => a.press(SEL.pickerBlank) });
	await tell(ctx, { say: 'The new slide goes after the one you were on, with sample text ready to replace.', circle: SEL.preview });
};

const changeTheme: LessonBuild = (env) => async (ctx) => {
	const next = contrastPalette(env.palette, env.palettes);
	const item = `[data-palette="${next}"]`;
	await tell(ctx, { say: 'A theme sets the colors and type for the whole deck. Your words and layouts stay as they are.' });
	const who = await yourTurn(ctx, {
		say: 'Click the palette icon to see every theme.',
		target: SEL.theme,
		perform: (a) => a.setPalette(next),
		missing: 'On this screen, themes are in the menu at the top right. I’ll switch one for you.',
	});
	if (who === 'user' && (await settle(ctx, () => visible(item)() != null))) {
		await yourTurn(ctx, {
			say: 'Pick a theme and watch the slides.',
			target: item,
			perform: (a) => (visible(item)() ? a.press(item) : a.setPalette(next)),
		});
	}
	await tell(ctx, { say: 'Same slides, new look. Search “theme” to change it again.', circle: SEL.preview });
};

const present: LessonBuild = () => async (ctx) => {
	await yourTurn(ctx, {
		say: 'Present plays your deck full screen. Click Present.',
		target: SEL.present,
		perform: (a) => a.run('present'),
	});
	await settle(ctx, presentDialog);
	await tell(ctx, { say: 'Use the arrow keys, or click, to move through the slides. Press Esc to stop.' });
};

const exportPdf: LessonBuild = () => async (ctx) => {
	await yourTurn(ctx, {
		say: 'Everything you can send someone is under Share. Click Share.',
		target: SEL.share,
		perform: (a) => a.run('share'),
	});
	if (!(await settle(ctx, () => visible(SEL.sharePdf)() != null))) return;
	await yourTurn(ctx, { say: 'Click PDF.', target: SEL.sharePdf, perform: (a) => a.press(SEL.sharePdf) });
	if (!(await settle(ctx, () => visible(SEL.pdfDownload)() != null))) return;
	// No `perform`: downloading a file is the one step a lesson never takes for the user.
	await yourTurn(ctx, { say: 'Choose whether comments come along as sticky notes, then click Download PDF.', target: SEL.pdfDownload });
	await tell(ctx, { say: 'Next time, search “pdf” and pick Export as PDF to come straight here.' });
};

export const BASICS = {
	'new-deck': newDeck,
	'write-slide': writeSlide,
	'add-slide': addSlide,
	'change-theme': changeTheme,
	present,
	'export-pdf': exportPdf,
} as const satisfies Record<string, LessonBuild>;
