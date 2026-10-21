// TOUR LINES — every sentence the first-run tour says, in one table.
//
// The tour speaks through clips recorded ahead of time (tools/record-lesson-voice.mjs, folder
// `tour`), so the set of lines has to be knowable without running it. The tour says ONLY what is
// written here; reword a line and its clip goes stale until it is re-recorded (the narrator plays
// the silent caption for a line it cannot find, so a stale clip is never played).
//
// Pure data, no imports: the recorder reads this file straight from Node.
// Design record: engineering/decisions/2026-10-20-first-run-onboarding.md.

/** The voice the tour is recorded in. The tour is the first thing a visitor hears, so it uses the
 *  Gemini voice the owner picked from the featured roster (2026-10-20); lessons keep Kokoro. */
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
