// The deck front-matter keys the engine reads, with a one-line description each.
//
// Its own module so the Studio chat agent (architect-agent.ts) can name every key in
// its prompt without importing the editor's autocomplete. `editor-complete.ts`
// re-exports it, so existing importers are unchanged.
//
// This list was a THIRD hand-maintained enumeration of the deck's front-matter surface,
// alongside the Inspector's rows and deck-config's FIELD_DEFAULTS, and it had drifted
// furthest — it offered 15 keys where the engine reads ~35, so a register with no
// control was also invisible to autocomplete, i.e. unreachable by any route except
// knowing it exists. Filled out from the audit in
// engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2, which is where
// the full catalog + the reader for each key lives.
export const FRONT_MATTER_KEYS: { key: string; info: string }[] = [
	// Identity + structure
	{ key: 'title', info: 'Deck name — used in the switcher, in Share, and as the export filename. Defaults to the cover heading.' },
	{ key: 'theme', info: 'Deck theme (palette) — e.g. indaco, cuoio.' },
	{ key: 'lang', info: 'Document language — overrides the workspace default (e.g. en-US). Drives <html lang> + read-aloud.' },
	{ key: 'ai-lang', info: 'AI-output language — what the AI writes in, if it should differ from the document language. Defaults to lang.' },
	{ key: 'size', info: 'Slide size — hd (16:9), standard, square, 4k, or a portrait format.' },
	{ key: 'split', info: 'How the body divides into slides — headings (default) or rule (--- only).' },
	{ key: 'profile', info: 'Genre the Coach judges STYLE against — general (default), teaching, or mission. Never affects the Craft score.' },
	{ key: 'inline-code', info: 'Inline code pills and marks — rich (default: `{LABEL}` draws a pill, `[x]` a state disc) / literal (every backtick span stays plain text).' },
	{ key: 'glossary', info: 'Auto-glossary — append a reference slide built from the acronyms: definitions. auto / off.' },
	{ key: 'class', info: 'Default _class applied to every slide (a modifier — a component name is ignored).' },
	{ key: 'validate', info: "Inline validation in the editor — on (default) / off. Travels with the deck." },
	// Look
	{ key: 'preset', info: 'A named look that sets the backdrop, alignment and accent registers at once — classic (default) / editorial / brand / minimal. An explicit key (finish:, rule:, …) overrides it.' },
	{ key: 'color-mode', info: 'The mode the deck opens in — light / dark / system / inherited / print.' },
	{ key: 'mode', info: 'Rendering mode — boardroom / sketch / sketch-clean.' },
	{ key: 'finish', info: 'Finish backdrop — e.g. atrium, halo, gallery.' },
	{ key: 'finish-override', info: 'Override the applied finish — a nested map (backdrop: { strength, clearance }, wash, …).' },
	{ key: 'backdrop', info: 'Restrain any finish — a strength (20 / 40 / 60 / 80 / full) and/or a mask (clear / open / spot-tl … spot-br). e.g. `backdrop: 40 clear`.' },
	{ key: 'tag', info: 'Style every card tag — up to one word per axis: color (color / plain / none), size (small / regular / large), placement (corner / foot / notch / band / inline), text (start / center / end). e.g. `tag: plain band center`.' },
	{ key: 'lift', info: 'Card lift — the "Struck" shadow on card surfaces. on / off.' },
	{ key: 'chart-finish', info: 'How every chart spends its color — off (default: as designed) / pigment (full-strength bodies) / etching (a whisper under a doubled edge) / tone (one hue in stepped shades).' },
	{ key: 'venue', info: 'Where the deck is seen — sets the type size for the back row. laptop (default) · huddle (4–6 people) · conference (10–30) · hall (50+).' },
	{ key: 'cards', info: 'Where a card row puts spare height — center / stretch / top / spread. Omit it and the component decides.' },
	{ key: 'corners', info: 'Slide surface corners — square (default) / rounded.' },
	{ key: 'spark', info: 'Inline sparks (`~{12 14 17}`) — frame framed (default) / bare, look pigment (default) / etching / tone, corners square (default) / rounded. Up to one word per axis.' },
	{ key: 'claim', info: 'How much frame the content sits inside — framed (default) / quiet / hero / bleed.' },
	{ key: 'fit', info: 'What the engine may do to make a slide fit — report (change nothing, only flag) / heal (default: split an overfull slide, lose no words) / trim (heal, and also cut text that does not fit). Replaces guards:.' },
	// Chrome
	{ key: 'header', info: 'Running header text on every slide.' },
	{ key: 'footer', info: 'Running footer text on every slide.' },
	{ key: 'paginate', info: 'Page numbers — true / false. Anything but false, skip, hold or empty turns them on.' },
	{ key: 'meta', info: 'The masthead bay\u2019s meta line — a date, a document number, a review stage.' },
	{ key: 'logo', info: 'Deck logo — a path beside the deck or a full URL, drawn into the masthead.' },
	{ key: 'logo-on', info: 'Which slides carry the logo — all (default) / title.' },
	{ key: 'logo-style', info: 'Logo treatment — auto (default) / brand.' },
	{ key: 'logo-scale', info: 'Logo size multiplier — 1 is default, clamped 0.2–3.' },
	{ key: 'logo-x', info: 'Logo center across the slide, 0–100 (%).' },
	{ key: 'logo-y', info: 'Logo center down the slide, 0–100 (%).' },
	// Accent
	{ key: 'spectrum', info: 'Brand bar — on (rainbow, default) / solid / duo / mono / off.' },
	{ key: 'spectrum-edge', info: 'Which edge the brand bar sits on — top (default) / left / right / bottom / off.' },
	{ key: 'spectrum-card', info: 'Card rail style — off (default) / auto / solid / duo / mono / rainbow.' },
	{ key: 'spectrum-card-edge', info: 'Card rail placement — left (default) / top / right / bottom.' },
	{ key: 'spectrum-trim', info: 'Flow the spectrum onto structural accents (table rails, code strips, hr). off (default) / restrained / on.' },
	{ key: 'rule', info: 'Heading underline — auto (default) / full / short / accent / none.' },
	{ key: 'eyebrow', info: 'The mark on the mono-caps kicker — plain (default) / dot / bar / arrow / underline.' },
	{ key: 'headline', info: 'Framing-text alignment — auto (default) / left / center / right.' },
	{ key: 'stamp', info: 'Deck-wide state-badge shape — e.g. tab, notch, seal, pill.' },
	{ key: 'tone', info: 'Deck-wide review-tone shape — rail (default) / edge / glow.' },
	// Motion + speech
	{ key: 'motion', info: 'Chart motion on the live surfaces — on / off. Reaches the preview, Present and the exported player (see player-motion); the PDF stays still.' },
	{ key: 'motion-style', info: 'How a chart moves — build (default) / together / rise.' },
	{ key: 'motion-speed', info: 'How fast the build runs — auto (default) / slow / normal / fast.' },
	{ key: 'player-motion', info: 'off ships still charts in the exported offline player while motion stays on for presenting. Omit it to follow motion.' },
	{ key: 'pace', info: 'Presentation rhythm — how long a self-presenting deck holds on a new slide before speaking: brisk / natural / deliberate.' },
	{ key: 'delivery', info: 'How much the narrated Guide gestures — restrained (default, boardroom) / expressive (sales, talks, teaching) / somber (bad news; no cursor).' },
	{ key: 'lexicon', info: 'Read-aloud pronunciations — a nested map of token → spoken text.' },
	{ key: 'acronyms', info: 'Acronym registry — term → spoken expansion (and an optional glossary definition).' },
	{ key: 'say', info: 'Read-aloud text per slide — a nested map of slide number → what that slide says. A slide\u2019s own <!-- say: --> wins over it.' },
	// Marp-inherited + tooling
	{ key: 'style', info: 'Raw CSS for this deck (a YAML block scalar).' },
	{ key: 'color', info: 'Text color on every slide — any CSS color. Quote a hex value: "#1a1a1a".' },
	{ key: 'backgroundColor', info: 'Slide background color — any CSS color. Quote a hex value: "#ffffff".' },
	{ key: 'backgroundImage', info: 'Slide background image — a CSS value, e.g. url(./bg.png).' },
	{ key: 'backgroundPosition', info: 'Where the background image sits — a CSS value, e.g. center.' },
	{ key: 'backgroundRepeat', info: 'Whether the background image tiles — a CSS value, e.g. no-repeat.' },
	{ key: 'backgroundSize', info: 'Background image size — a CSS value, e.g. cover.' },
	{ key: 'debug', info: 'Layout debug overlay — off / on-hover / on-always (+ verbose). Preview-only, stripped from every export.' },
	// The three RENDER-TARGET keys. They get no Studio CONTROL on purpose — they name the
	// artifact a render should emit, not a property of the deck, and the Studio decides all
	// three at export time (ShareSheet). That decision is recorded in
	// engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2.3, and it is a
	// decision about PANELS, not about this list: the editor is a plain text surface, so a
	// key an author types by hand still owes them a hint and the accepted values. Offering
	// `present` while hiding its two siblings — which is what this list did until now — left
	// `fluid:` reachable only by already knowing it exists. Vocabulary: lib/core/render-target-keys.js.
	{ key: 'present', info: 'Open the exported PDF in presentation mode. On: true / yes / on. Off: false / no / off. CLI and front matter only — the Studio sets it at export.' },
	{ key: 'read', info: 'Emit the .html as the reading article — prose instead of the slide stack. On: true / yes / on. Off: false / no / off. CLI and front matter only — the Studio sets it at export.' },
	{ key: 'fluid', info: 'Emit the .html as the responsive fluid-box viewer — each slide fills the viewport and reflows to portrait on a phone. On: true / yes / on. Off: false / no / off. PDF/PPTX/PNG are unchanged.' },
	{ key: 'player', info: 'Emit the .html as the self-contained offline player (Present · Read Slides · Read Article). On: true / yes / on. Off: false / no / off. Supersedes fluid.' },
];
