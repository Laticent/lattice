// LESSON LINES — every sentence a lesson says, in one table.
//
// Lessons speak through clips recorded ahead of time (tools/record-lesson-voice.mjs), so the set of
// lines has to be knowable without running a lesson: a branch the recorder never took would be a
// line with no clip. Lessons therefore say ONLY what is written here, and `lesson-voice.test.ts` fails
// on a `say:` or `missing:` written inline in a track. Reword a line here and its clip goes stale:
// the narrator plays the silent caption for it, and the same test fails until it is re-recorded.
//
// Pure data, no imports: the recorder reads this file straight from Node.
// Design record: engineering/decisions/2026-10-05-studio-lessons.md §Voice.

/** Lines any lesson may say. Recorded once, under `shared/`, not once per lesson. */
export const SHARED_LINES = {
	/** Said when the user waited out a turn and the lesson does the step itself. */
	takeover: 'No rush — I’ll do this one for you.',
} as const;

/** Each lesson's own lines, keyed by lesson id and then by a name the track's code uses. */
export const LESSON_LINES = {
	'new-deck': {
		click: 'Your decks live under the deck name at the top left. Click it.',
		choose: 'Choose New deck.',
		missing: 'I’ll start a new deck for you.',
		done: 'A blank deck, saved as you type. Your other decks are in that same menu.',
	},
	'write-slide': {
		hidden: 'Your text is hidden right now. Choose Write at the top, then open this lesson again.',
		plain: 'A deck is plain text. You write on the left, and the slides appear on the right.',
		dashes: 'A line of three dashes starts a new slide. A line that starts with # is the slide’s heading.',
		turn: 'Your turn: click at the end of your text, type three dashes, then a # heading.',
		keepTyping: 'Keep typing. The preview follows every keystroke.',
		made: 'That is the slide those lines made. Change any word and the slide follows.',
	},
	'add-slide': {
		click: 'To add a ready-made slide (a chart, a big number, a comparison), click Add slide.',
		missing: 'I’ll open the slide gallery for you.',
		notReady: 'The slide gallery isn’t ready yet. Try this lesson again in a moment.',
		cards: 'Each card is one kind of slide. Type in the search box to find one by name.',
		pick: 'Pick a card. Blank is the simplest place to start.',
		placed: 'The new slide goes after the one you were on, with sample text ready to replace.',
	},
	'change-theme': {
		what: 'A theme sets the colors and type for the whole deck. Your words and layouts stay as they are.',
		click: 'Click the palette icon to see every theme.',
		missing: 'On this screen, themes are in the menu at the top right. I’ll switch one for you.',
		pick: 'Pick a theme and watch the slides.',
		done: 'Same slides, new look. Search “theme” to change it again.',
	},
	present: {
		click: 'Present plays your deck full screen. Click Present.',
		missing: 'I’ll start the presentation for you.',
		keys: 'Use the arrow keys, or click, to move through the slides. Press Esc to stop.',
	},
	'export-pdf': {
		share: 'Everything you can send someone is under Share. Click Share.',
		shareMissing: 'I’ll open Share for you.',
		pdf: 'Click PDF.',
		pdfMissing: 'I’ll open the PDF options for you.',
		download: 'Choose whether comments come along as sticky notes, then click Download PDF.',
		next: 'Next time, search “pdf” and pick Export as PDF to come straight here.',
	},
} as const satisfies Record<string, Record<string, string>>;

export type LessonId = keyof typeof LESSON_LINES;

/** The folder a lesson's clips live in under `/lesson-voice/`; shared lines live in `shared/`. */
export const SHARED_VOICE_DIR = 'shared';
