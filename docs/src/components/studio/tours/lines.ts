// TOUR LINES — every sentence the first-run tour says, in one table.
//
// The tour speaks through clips recorded ahead of time (tools/record-lesson-voice.mjs, folder
// `tour`), so the set of lines has to be knowable without running it. The tour says ONLY what is
// written here; reword a line and its clip goes stale until it is re-recorded (the narrator plays
// the silent caption for a line it cannot find, so a stale clip is never played).
//
// Pure data, no imports: the recorder reads this file straight from Node.
// Design record: engineering/decisions/2026-10-20-first-run-onboarding.md.


/** The voice every tour and every lesson is recorded in: the Gemini voice the owner picked from the
 *  featured roster (2026-10-20). One voice across the whole Studio, so a visitor never hears two. */
export const TOUR_VOICE = { engine: 'gemini', model: 'google/gemini-3.1-flash-tts-preview', voice: 'Schedar' } as const;

/** The folder under docs/public/lesson-voice/ the tour's clips live in. */

export const TOUR_VOICE_DIR = 'tour';

export const TOUR_LINES = {
	/** Said by the start card's Test button, panned left, then right. */
	test: 'This is how the tour will sound. Left, and now right.',
	hello: 'Welcome to Lattice. I’ll show you around. It takes about two minutes, and you can take over at any moment.',
	write: 'This is where you write. Plain text, nothing else. A line of three dashes starts a new slide, and a line that starts with a hash is a heading.',
	preview: 'And here is the result. Every slide draws itself as you type. No export, no waiting.',
	rail: 'Every slide in your deck lives in this strip. Click one to jump straight to it.',
	add: 'Add brings you a ready-made slide. A chart, a big number, a side-by-side comparison. Pick one, and the sample text is yours to replace.',
	compose: 'Prefer not to see the markup? Compose is a visual editor for the same deck. Switch between the two whenever you like.',
	fixAll: 'Some problems have one sure fix, like a slide with no heading. Fix all applies every one of them. Undo takes them back.',
	reshape: 'Reshape shows the slide you wrote in a different layout. Same words, a new arrangement.',
	theme: 'A theme sets the colors and type for the whole deck. Your words stay exactly where they are.',
	mode: 'And light or dark is one click.',
	posture: 'Read shows only the slides. Write is what you see now. Craft opens every panel, including the coach and the assistant.',
	search: 'Press command K, or click here, to search everything. Every command, every slide, every lesson.',
	present: 'When you’re ready, Present plays the deck full screen.',
	share: 'Everything you can send someone lives under Share, including a PDF.',
	close: 'That is the whole shape of it. You write, Lattice designs, and you present. Would you like to go further?',
} as const;

/** The Playground's tour: same voice, its own folder, so a line added to one never stales the other. */

export const PLAYGROUND_VOICE_DIR = 'playground-tour';

export const PLAYGROUND_LINES = {
	hello: 'Welcome to the Playground. Every Lattice component lives here, one deck at a time, with a live editor one tap away.',
	mode: 'This switch flips between Explore, which draws the deck, and Edit, which opens its Markdown. Same deck, two views.',
	pick: 'Pick any component here. Search by name, and its whole deck loads: the title, every variant, and a stress test.',
	walk: 'Step through with the arrow keys. When a deck ends, it flows into the next component, so the catalog reads as one long story.',
	step: 'The Step menu jumps to any slide in the deck.',
	edit: 'In Edit you see the plain Markdown, with autocomplete for component names. Change a word, flip back, and the slide follows.',
	galleries: 'Galleries load complete decks: showcase decks, one deck for each family, and every example.',
	setup: 'Deck settings hold the dials that apply to the whole deck: finish, size, and page numbers.',
	palette: 'And the palette recolors everything. Layouts never name a color, so the same Markdown looks right in every theme, light or dark.',
	close: 'That is the Playground. Explore the catalog, grab any deck, and make it yours. The Tour button replays this any time.',
} as const;

/** Read tour: the quiet view. */
export const READ_VOICE_DIR = 'tour-read';
export const READ_LINES = {
	intro: 'This is Read. Just the slides, full size, the way your audience will see them.',
	strip: 'The strip along the bottom lists every slide by its title. Click one to jump straight to it.',
	theme: 'The theme and light or dark controls work here too, so you can see the deck in any look without touching it.',
	article: 'Read as an article turns the deck into a page, with an outline on the left. It reads top to bottom, like a document.',
	back: 'Back to the deck returns you to the slides.',
	edit: 'And Edit this slide takes you to Write, right where you were. Nothing in Read changes your deck.',
	actions: 'Present and Share are one click away from here, too.',
	close: 'That is Read. It is the quiet way to look at your work. Want to see the full workshop?',
} as const;

/** Craft tour: every panel. */
export const CRAFT_VOICE_DIR = 'tour-craft';
export const CRAFT_LINES = {
	intro: 'This is Craft, the full workshop. Every panel lives in the bar on the left.',
	coach: 'Coach reads your deck and grades it. Structure, writing, contrast and style, with the weakest slide and the top fixes.',
	chat: 'Chat is the assistant. Ask for a change in plain words, and the edit arrives as a diff you can apply or discard. It needs a model, which you connect in Workspace settings.',
	live: 'Live lets you edit this deck together. Share a link, let people in, and up to four of you work in the same deck.',
	library: 'Library holds what you reuse: themes, components, finishes, motions, images, videos and files. You can import a zip to add more.',
	views: 'Views are for particular readers. A reader view is a subset of the deck, and you approve exactly what that reader sees.',
	slide: 'Slide settings change the slide you are on: its canvas, type size, and speaker notes.',
	deck: 'Deck settings change the whole deck at once: theme, preset, color mode, size, venue, page numbers and logo.',
	history: 'Version history keeps snapshots of your deck. One is saved before every assistant edit, and you can save your own.',
	setup: 'And Setup is your workspace: general options, AI models, your data, and the cloud and on-device voices.',
	close: 'That is every panel. Craft is where a deck gets polished. Next, let me show you how to present it.',
} as const;

/** Present tour. */
export const PRESENT_VOICE_DIR = 'tour-present';
export const PRESENT_LINES = {
	intro: 'Present plays your deck full screen. Click Present to begin.',
	move: 'Move with the arrow keys, or swipe. Escape leaves at any time.',
	slides: 'Slides, or the G key, shows every slide so you can jump anywhere.',
	venue: 'Venue sets the size of the room, for this showing only.',
	rehearse: 'Rehearse is a practice run with a talk clock, so you can time yourself before the real thing.',
	screen: 'Fullscreen, or F, hides the browser. Stage sends a clean copy of the deck to your second screen.',
	captions: 'Captions show the narration as text, and Voice speaks it aloud.',
	guide: 'The rail shows the room how far along you are, and Guide points at whatever is being narrated.',
	exit: 'Click the X, or press Escape, and you are back in the Studio.',
	close: 'That is Present. One more thing: how to get your deck out to other people.',
} as const;

/** Share tour. */
export const SHARE_VOICE_DIR = 'tour-share';
export const SHARE_LINES = {
	intro: 'Share is where a deck leaves the building. Everything you can send lives in this one panel.',
	live: 'Collaborate live shares a link. People knock, you let them in, and you edit together.',
	link: 'Present link is a live, themed link that opens straight into Present.',
	pdf: 'PDF gives you one slide per page, and you choose what rides along.',
	office: 'PowerPoint and LibreOffice export either pictures or editable text.',
	images: 'Images gives you one picture per slide, as PNG, JPEG or WebP.',
	print: 'Print deck lets you pick paper and color, preview, then print or save.',
	web: 'Webpage is a single self-contained file. It opens in any browser, even offline.',
	captions: 'Captions makes a read-along file from your slide text, with no audio needed.',
	source: 'Below that is the source: the Markdown itself, a Lattice project file, and a Marp bundle.',
	close: 'That is everything you need. Now go make something. Or let me teach you by doing, in the lessons.',
} as const;

/** First look: the sixty-second build. The strings are the beats' own, so they stay fragments. */
export const FIRST_LOOK_VOICE_DIR = 'tour-first-look';
export const FIRST_LOOK_LINES = {
	open: 'The Studio builds boardroom slides from plain text. Watch.',
	deck: 'Start with a blank deck…',
	named: '…“My First Deck.”',
	title: 'Three lines of Markdown…',
	titled: '…a boardroom title. Instantly.',
	number: 'One number that matters…',
	numbered: 'The whole slide is the metric.',
	values: 'A few values in a list…',
	chart: '…and the engine draws the chart.',
	close: 'That fast. Now go build yours.',
} as const;

/** Every tour's folder and its lines, in one table, so the recorder and the tests walk one list. */
export const TOUR_FOLDERS: Record<string, readonly string[]> = {
	[TOUR_VOICE_DIR]: Object.values(TOUR_LINES),
	[PLAYGROUND_VOICE_DIR]: Object.values(PLAYGROUND_LINES),
	[READ_VOICE_DIR]: Object.values(READ_LINES),
	[CRAFT_VOICE_DIR]: Object.values(CRAFT_LINES),
	[PRESENT_VOICE_DIR]: Object.values(PRESENT_LINES),
	[SHARE_VOICE_DIR]: Object.values(SHARE_LINES),
	[FIRST_LOOK_VOICE_DIR]: Object.values(FIRST_LOOK_LINES),
};
