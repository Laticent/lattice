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
	// BUILDING — the slides people reach for after the first one.
	'add-chart': {
		what: 'A chart is a ready-made slide. You add it from the slide gallery.',
		click: 'Click Add slide.',
		missing: 'I’ll open the slide gallery for you.',
		search: 'Typing in the search box narrows the gallery. I’ll type chart.',
		pick: 'Pick the bar chart.',
		edit: 'The numbers are plain text in your slide. Change one and the bars follow.',
	},
	'add-table': {
		what: 'A table slide lays out rows and columns for you, with the house style already applied.',
		click: 'Click Add slide.',
		missing: 'I’ll open the slide gallery for you.',
		search: 'I’ll type table in the search box.',
		pick: 'Pick the table.',
		edit: 'Each row is a line of text, with a bar between the cells. Add a line to add a row.',
	},
	'add-comparison': {
		what: 'A comparison puts two options side by side and marks the one you recommend.',
		click: 'Click Add slide.',
		missing: 'I’ll open the slide gallery for you.',
		search: 'I’ll type compare in the search box.',
		pick: 'Pick split compare.',
		edit: 'The second option gets the highlight. Put your recommendation there.',
	},
	'add-image': {
		what: 'An image slide shows one picture, sized to the slide.',
		click: 'Click Add slide.',
		missing: 'I’ll open the slide gallery for you.',
		search: 'I’ll type image in the search box.',
		pick: 'Pick image.',
		edit: 'Replace the sample link with the address of your own picture.',
	},
	'speaker-notes': {
		what: 'Speaker notes are for you. Present shows them to you, and the audience never sees them.',
		click: 'Notes live in Slide settings. Click it.',
		missing: 'I’ll open this slide’s settings for you.',
		tab: 'Choose the Notes tab.',
		write: 'Write what you want to remember here. It saves with the deck.',
		noTab: 'This slide’s notes are in the Notes tab of Slide settings.',
	},
	// POLISH — checking and changing a deck that already has its words.
	coach: {
		what: 'Coach reads your whole deck and lists what could be better, most important first.',
		click: 'Click Coach.',
		missing: 'I’ll open Coach for you.',
		list: 'These scores sum up the deck. Each finding below names its slide; click one to jump there.',
		next: 'Search “fix” to learn how Coach can fix some of these for you.',
	},
	'fix-all': {
		what: 'Some problems have one sure fix, like a slide with no heading. Fix all applies every one of them.',
		nothing: 'This is Fix all. Your deck has nothing Coach can fix on its own right now, which is a good sign.',
		click: 'Click Fix all.',
		missing: 'Fix all sits in the bar above your text, and in the menu on a phone. Open your text to use it.',
		undo: 'Each fix is in your text, and Undo takes it back.',
	},
	reshape: {
		what: 'Reshape gives a slide a different layout and keeps every word.',
		unavailable: 'This slide has no other layouts. Go to a slide from the gallery, like a chart, and ask again.',
		phone: 'Reshape is in the bar above your text on a wider screen.',
		click: 'Click Reshape.',
		pick: 'Each tile is the same content in another layout. Pick one.',
		done: 'Same words, new shape. Pick again to go back.',
	},
	'light-dark': {
		what: 'Light or dark changes the Studio and your slides with it, unless a deck sets its own.',
		click: 'Click the light and dark switch.',
		missing: 'On this screen the switch is in the menu. I’ll flip it for you.',
		done: 'Only the colors changed. Press it again to switch back.',
	},
	// SHARING — handing the finished deck to someone who does not use Lattice.
	'share-html': {
		what: 'A webpage is one file that plays your deck in any browser, even offline. Nobody needs Lattice to open it.',
		share: 'It lives under Share. Click Share.',
		shareMissing: 'I’ll open Share for you.',
		html: 'Click Webpage.',
		htmlMissing: 'I’ll open the webpage options for you.',
		download: 'Choose light or dark, and whether your speaker notes come along, then click Download webpage.',
		next: 'Send that file like any other. Whoever opens it can page through the slides or press Present.',
	},
	'share-pptx': {
		what: 'Lattice can save your deck as a PowerPoint file, one slide per page.',
		share: 'It lives under Share. Click Share.',
		shareMissing: 'I’ll open Share for you.',
		pptx: 'Click PowerPoint.',
		pptxMissing: 'I’ll open the PowerPoint options for you.',
		download: 'Re-openable in Lattice lets you edit this deck here again later. Then click Download PowerPoint.',
		next: 'Each slide arrives as a picture, so make changes here and export again.',
	},
} as const satisfies Record<string, Record<string, string>>;

export type LessonId = keyof typeof LESSON_LINES;

/** The folder a lesson's clips live in under `/lesson-voice/`; shared lines live in `shared/`. */
export const SHARED_VOICE_DIR = 'shared';
