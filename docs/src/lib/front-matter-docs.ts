// What the front-matter REFERENCE page says about each key, beyond what the Studio's key
// list already carries. The key list (FRONT_MATTER_KEYS in
// components/studio/editor-complete.ts) owns the one-line description; the lint vocab and
// STATIC_VALUES own the accepted values; this table owns the rest: which Settings section
// the key lives in, its default, the per-slide form, and where it takes effect.
//
// front-matter-docs.test.ts fails when a key is in FRONT_MATTER_KEYS but not here, or here
// but not there, so a new register cannot ship undocumented and a removed one cannot linger.
//
// Sourced from the 2026-09-24 inventory against the readers (lib/core/resolve-*.js,
// lib/engine/slides.js, lattice-emulator.js) and the Settings panel (StudioShell.tsx).

export type FrontMatterGroup = 'general' | 'look' | 'chrome' | 'accent' | 'motion' | 'speech' | 'export' | 'raw' | 'developer';

export type FrontMatterDoc = {
	group: FrontMatterGroup;
	/** The value in force when the key is absent. */
	default: string;
	/** Settings → Deck → <section> → <label>, when the Studio has a control. */
	studio?: string;
	/** The per-slide spelling, when one exists. */
	slide?: string;
	/** Where the key takes effect, when it is narrower than "every render". */
	scope?: string;
	/** Free-form accepted values, for keys with no fixed vocabulary. */
	values?: string;
};

// Ordered as the Studio's Settings → Deck panel orders them (deckSections in StudioShell.tsx).
export const GROUPS: { id: FrontMatterGroup; title: string; blurb: string }[] = [
	{ id: 'look', title: 'Look', blurb: 'Theme, canvas, size and the overall hand of the deck.' },
	{ id: 'chrome', title: 'Chrome', blurb: 'The furniture on every slide: running header and footer, page numbers, logo.' },
	{ id: 'general', title: 'General', blurb: 'What the deck is called, what language it is in, and how its source is read.' },
	{ id: 'accent', title: 'Accent', blurb: 'The small decorations: brand bar, heading rule, kicker mark, stamps.' },
	{ id: 'motion', title: 'Motion', blurb: 'How charts move on live surfaces. A PDF is always still.' },
	{ id: 'speech', title: 'Speech', blurb: 'How the deck is read aloud.' },
	{ id: 'export', title: 'Export targets', blurb: 'What the command-line render produces. The Studio decides these in Share instead.' },
	{ id: 'raw', title: 'Raw styling', blurb: 'Marp-compatible CSS escape hatches. They bypass the theme, so reach for them last.' },
	{ id: 'developer', title: 'Developer', blurb: 'Tools for building and checking a deck. None of them changes an export.' },
];

export const FRONT_MATTER_DOCS: Record<string, FrontMatterDoc> = {
	title: { group: 'general', default: 'the first heading', studio: 'General → Deck name', values: 'any text', scope: 'HTML title, Studio switcher, export filename' },
	lang: { group: 'general', default: 'en', studio: 'General → Language', values: 'a language tag, e.g. en-US', scope: 'page language and read-aloud voice' },
	'ai-lang': { group: 'general', default: 'follows lang', studio: 'General → AI writes in', values: 'a language tag', scope: 'Studio only' },
	split: { group: 'general', default: 'headings', studio: 'General → New slide on' },
	'inline-code': { group: 'general', default: 'rich', studio: 'General → Inline pills and marks', slide: '_class: inline-code-literal' },
	glossary: { group: 'general', default: 'off', studio: 'General → Auto-glossary' },
	class: { group: 'general', default: 'none', studio: 'General → Default slide class', slide: '_class:', values: 'modifier classes, space-separated' },
	theme: { group: 'look', default: 'indaco', studio: 'Look → Theme', values: 'a theme name, e.g. indaco, cuoio' },
	'color-mode': { group: 'look', default: 'the theme’s own', studio: 'Look → Color mode', slide: '_class: dark · color-light · color-system · print' },
	size: { group: 'look', default: 'hd', studio: 'Look → Size', values: 'hd (16:9) · 4k · standard (4:3) · square · portrait (4:5) · story · reel (9:16) · mobile' },
	preset: { group: 'look', default: 'classic', studio: 'Look → Preset (also in Basic)', values: 'classic · editorial · brand · minimal — sets finish, headline, spectrum, spectrum-edge, spectrum-card, spectrum-card-edge, spectrum-trim, rule, eyebrow, lift and corners; a key you write wins' },
	mode: { group: 'look', default: 'boardroom', studio: 'Look → Mode', slide: '_class: sketch' },
	finish: { group: 'look', default: 'none', studio: 'Look → Finish', slide: '_class: finish-<name>', values: 'none · atrium · meridian · strata · halo · ledger · nimbus · loom · savile · gallery' },
	backdrop: { group: 'look', default: "the finish's own", studio: 'Look → Backdrop strength · Backdrop mask', slide: '_class: backdrop-<value>', values: 'a strength (20 · 40 · 60 · 80 · full) and/or a mask (clear · open · spot-tl … spot-br), e.g. 40 clear' },
	'finish-override': { group: 'look', default: 'none', values: 'a nested map of finish layers', scope: 'Studio only (written by Fabricate)' },
	lift: { group: 'look', default: 'off', studio: 'Look → Card lift', slide: '_class: lifted · flat' },
	venue: { group: 'look', default: 'laptop', slide: '_class: venue-<value>', values: 'laptop · huddle · conference · hall', scope: 'type size, label size and lint budgets' },
	cards: { group: 'look', default: 'each component decides', studio: 'Look → Frame and fit → Card rows', slide: '_class: cards-<value>' },
	corners: { group: 'look', default: 'square', studio: 'Look → Frame and fit → Corners', slide: '_class: corners-<value>' },
	claim: { group: 'look', default: 'framed', studio: 'Look → Frame and fit → Claim', slide: '_class: claim-<value>' },
	fit: { group: 'look', default: 'heal', studio: 'Look → Frame and fit → Fit', slide: '_class: fit-<value>' },
	header: { group: 'chrome', default: 'none', studio: 'Chrome → Header', slide: '<!-- _header: … -->', values: 'any text' },
	footer: { group: 'chrome', default: 'none', studio: 'Chrome → Footer', slide: '<!-- _footer: … -->', values: 'any text' },
	paginate: { group: 'chrome', default: 'false', studio: 'Chrome → Page numbers', slide: '<!-- _paginate: false -->' },
	meta: { group: 'chrome', default: 'none', studio: 'Chrome → Meta line', values: 'any text; | starts a new line' },
	logo: { group: 'chrome', default: 'none', studio: 'Chrome → Logo', values: 'a path beside the deck, a URL, or lattice' },
	'logo-on': { group: 'chrome', default: 'all', studio: 'Chrome → Logo → Show on' },
	'logo-style': { group: 'chrome', default: 'auto', studio: 'Chrome → Logo → Treatment' },
	'logo-scale': { group: 'chrome', default: '1', studio: 'Chrome → Logo → Size', values: 'a number, clamped to 0.2–3' },
	'logo-x': { group: 'chrome', default: 'the masthead corner', studio: 'Chrome → Logo → Across', values: '0–100; needs logo-y too' },
	'logo-y': { group: 'chrome', default: 'the masthead corner', studio: 'Chrome → Logo → Down', values: '0–100; needs logo-x too' },
	spectrum: { group: 'accent', default: 'on', studio: 'Accent → Brand bar', slide: '_class: spectrum-<value>' },
	'spectrum-edge': { group: 'accent', default: 'top', studio: 'Accent → Bar placement', slide: '_class: spectrum-edge-<value>' },
	'spectrum-card': { group: 'accent', default: 'off', studio: 'Accent → Card rail', slide: '_class: spectrum-card (auto) · spectrum-card-<value>' },
	'spectrum-card-edge': { group: 'accent', default: 'left', studio: 'Accent → Card rail placement', slide: '_class: spectrum-card-edge-<value>' },
	'spectrum-trim': { group: 'accent', default: 'off', studio: 'Accent → Structural trim', slide: '_class: spectrum-trim · spectrum-trim-restrained' },
	rule: { group: 'accent', default: 'auto', studio: 'Accent → Heading rule', slide: '_class: rule-<value>' },
	eyebrow: { group: 'accent', default: 'plain', studio: 'Accent → Eyebrow', slide: '_class: eyebrow-<value>' },
	headline: { group: 'accent', default: 'auto', studio: 'Accent → Headline alignment', slide: '_class: head-<value>' },
	stamp: { group: 'accent', default: 'tab', studio: 'Accent → Badges → Stamp shape', slide: '_class: stamp-<value>' },
	tone: { group: 'accent', default: 'rail', studio: 'Accent → Badges → Tone shape', slide: '_class: tone-<value>' },
	motion: { group: 'motion', default: 'off', studio: 'Motion → Play', slide: '_class: motion-on · motion-off', scope: 'preview, Present and the exported player' },
	'motion-style': { group: 'motion', default: 'build', studio: 'Motion → Style', slide: '_class: motion-<value>' },
	'motion-speed': { group: 'motion', default: 'auto', studio: 'Motion → Speed', slide: '_class: motion-<value>' },
	'player-motion': { group: 'motion', default: 'follows motion', studio: 'Motion → In the exported player', scope: 'exported player only' },
	pace: { group: 'speech', default: 'natural', studio: 'Speech → Pace', scope: 'self-presenting playback' },
	delivery: { group: 'speech', default: 'restrained', scope: 'the Present Guide while narration plays' },
	lexicon: { group: 'speech', default: 'none', studio: 'Speech → Lexicon', values: 'a nested map: word → how to say it', scope: 'read-aloud' },
	acronyms: { group: 'speech', default: 'none', studio: 'Speech → Acronyms', values: 'a nested map: term → expansion, optional definition', scope: 'read-aloud, and glossary: auto' },
	captions: { group: 'speech', default: 'none', slide: '<!-- caption: … -->', values: 'a nested map: slide number → what to say', scope: 'read-aloud' },
	present: { group: 'export', default: 'false', scope: 'command-line export only; yes/on and no/off also work' },
	read: { group: 'export', default: 'false', scope: 'command-line export only; yes/on and no/off also work' },
	fluid: { group: 'export', default: 'false', scope: 'command-line export only; yes/on and no/off also work' },
	player: { group: 'export', default: 'false', scope: 'command-line export only; yes/on and no/off also work' },
	style: { group: 'raw', default: 'none', values: 'CSS, as a YAML block (style: |)', scope: 'command-line render only; the Studio preview and its exports ignore it' },
	color: { group: 'raw', default: 'the theme’s', slide: '<!-- _color: … -->', values: 'a CSS color, quoted: "#1a1a1a"' },
	backgroundColor: { group: 'raw', default: 'the theme’s', slide: '<!-- _backgroundColor: … -->', values: 'a CSS color, quoted' },
	backgroundImage: { group: 'raw', default: 'none', slide: '<!-- _backgroundImage: … -->', values: 'a CSS value, e.g. url(./bg.png)' },
	backgroundPosition: { group: 'raw', default: 'center', slide: '<!-- _backgroundPosition: … -->', values: 'a CSS value' },
	backgroundRepeat: { group: 'raw', default: 'no-repeat', slide: '<!-- _backgroundRepeat: … -->', values: 'a CSS value' },
	backgroundSize: { group: 'raw', default: 'cover', slide: '<!-- _backgroundSize: … -->', values: 'a CSS value' },
	profile: { group: 'developer', default: 'general', values: 'general · teaching · mission', studio: 'Coach → Style judged as', scope: 'Coach only; never the render' },
	validate: { group: 'developer', default: 'on', scope: 'Studio editor only' },
	debug: { group: 'developer', default: 'off', values: 'off · on-hover · on-always, plus verbose', studio: 'General → Developer → Debug overlay', slide: '<!-- _debug: … -->', scope: 'previews only; stripped from every export' },
};
