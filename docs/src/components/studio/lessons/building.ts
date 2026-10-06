// BUILDING — the slides people reach for after the first one: charts, tables, comparisons, images,
// and the speaker notes behind them.
//
// Loaded on demand, like every track (catalog.ts). The four "add a …" lessons share one shape:
// open the gallery, narrow it by typing, pick the card. The lesson types into the gallery's own
// search box rather than asking the user to, because a keystroke the lesson did not ask for reads as
// "the user took over" and ends it. Kit and rules: ./lesson-kit.ts; every line lives in ./lines.ts.

import { card, type LessonBuild, SEL, settle, tabNamed, tell, visible, yourTurn } from './lesson-kit';
import { LESSON_LINES } from './lines';

type InsertLines = Record<'what' | 'click' | 'missing' | 'search' | 'pick' | 'edit', string>;

/** "How do I add a <kind>?": open the gallery, type the kind, pick its card, say how to edit it. */
function insertLesson(L: InsertLines, query: string, component: string): LessonBuild {
	const pick = card(component);
	return () => async (ctx) => {
		await tell(ctx, { say: L.what });
		const who = await yourTurn(ctx, { say: L.click, target: SEL.addSlide, perform: (a) => a.run('insert'), missing: L.missing });
		if (who === 'nobody') return;
		if (!(await settle(ctx, () => visible(SEL.pickerSearch)() != null))) return;
		await tell(ctx, { say: L.search, point: SEL.pickerSearch, act: (a) => a.type(SEL.pickerSearch, query) });
		if (!(await settle(ctx, () => visible(...pick)() != null))) return;
		await yourTurn(ctx, { say: L.pick, target: pick, perform: (a) => a.press(pick) });
		await tell(ctx, { say: L.edit, point: SEL.editor, circle: SEL.preview });
	};
}

const N = LESSON_LINES['speaker-notes'];
const NOTES_TAB = tabNamed('[aria-label="Slide settings sections"]', 'Notes');

const speakerNotes: LessonBuild = () => async (ctx) => {
	await tell(ctx, { say: N.what });
	const shown = () => NOTES_TAB() != null || visible(SEL.notesField)() != null;
	// Already open (the panel offered this lesson): the Slide settings button is a toggle, so asking
	// for it now would close the panel.
	const who = shown() ? 'lesson' : await yourTurn(ctx, { say: N.click, target: SEL.slideSettings, perform: (a) => a.run('slide-settings'), missing: N.missing });
	let open = await settle(ctx, shown, who === 'user' ? 1500 : 4000);
	// The user's own press opened nothing (a surface where the panel needs the Craft stop): the
	// command steps up for them, so open it that way rather than end on an empty screen.
	if (!open && who === 'user') {
		await tell(ctx, { say: N.missing, act: (a) => a.run('slide-settings') });
		open = await settle(ctx, shown);
	}
	if (!open) {
		await tell(ctx, { say: N.noTab });
		return;
	}
	if (visible(SEL.notesField)() == null) await yourTurn(ctx, { say: N.tab, target: NOTES_TAB, perform: (a) => a.press(NOTES_TAB) });
	if (await settle(ctx, () => visible(SEL.notesField)() != null)) await tell(ctx, { say: N.write, point: SEL.notesField });
};

export const BUILDING = {
	'add-chart': insertLesson(LESSON_LINES['add-chart'], 'chart', 'bar'),
	'add-table': insertLesson(LESSON_LINES['add-table'], 'table', 'table'),
	'add-comparison': insertLesson(LESSON_LINES['add-comparison'], 'compare', 'split-compare'),
	'add-image': insertLesson(LESSON_LINES['add-image'], 'image', 'image'),
	'speaker-notes': speakerNotes,
} as const satisfies Record<string, LessonBuild>;
