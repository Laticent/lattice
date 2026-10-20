/**
 * lib/core/deck-settings.prose.js — the WORDS for each row of lib/core/deck-settings.js: the
 * one-line description, the Studio location, the per-slide form, where it takes effect and the
 * free-form value text. The editor's key list and hover, the reference page, the JSON Schema and the
 * conformance checklist print these.
 *
 * Split from the table on purpose, and only for weight: lint-core needs the table's keys, kinds and
 * value sources but none of this prose, and lint-core ships in the Studio's lazy lint chunk, whose
 * route budget (docs/route-budget.json, `studio lintCoreGz`) the prose pushed past its ceiling.
 * Each key's FACTS still live in exactly one place, the table; this file holds only its words, and
 * `withProse` joins the two. test/unit/conformance/static.test.js fails on a row without prose,
 * or prose without a row.
 *
 * A leaf, like the table: no `require`.
 */

/** key → { info, studio?, slide?, scope?, valuesText? } */
const DECK_SETTING_PROSE = Object.freeze({
  title: { info: 'Deck name — used in the switcher, in Share, and as the export filename. Defaults to the cover heading.', studio: 'General → Deck name', scope: 'HTML title, Studio switcher, export filename', valuesText: 'any text' },
  theme: { info: 'Deck theme (palette) — e.g. indaco, cuoio.', studio: 'Look → Theme', valuesText: 'a theme name, e.g. indaco, cuoio' },
  lang: { info: 'Document language — overrides the workspace default (e.g. en-US). Drives <html lang> + read-aloud.', studio: 'General → Language', scope: 'page language and read-aloud voice', valuesText: 'a language tag, e.g. en-US' },
  'ai-lang': { info: 'AI-output language — what the AI writes in, if it should differ from the document language. Defaults to lang.', studio: 'General → AI writes in', scope: 'Studio only', valuesText: 'a language tag' },
  size: { info: 'Slide size — hd (16:9), standard, square, 4k, or a portrait format.', studio: 'Look → Size', valuesText: 'hd (16:9) · 4k · standard (4:3) · square · portrait (4:5) · story · reel (9:16) · mobile' },
  split: { info: 'How the body divides into slides — headings (default) or rule (--- only).', studio: 'General → New slide on' },
  profile: { info: 'Genre the Coach judges STYLE against — general (default), teaching, or mission. Never affects the Craft score.', studio: 'Coach → Style judged as', scope: 'Coach only; never the render', valuesText: 'general · teaching · mission' },
  'inline-code': { info: 'Inline code pills and marks — rich (default: `{LABEL}` draws a pill, `[x]` a state disc) / literal (every backtick span stays plain text).', studio: 'General → Inline pills and marks', slide: '_class: inline-code-literal' },
  glossary: { info: 'Auto-glossary — append a reference slide built from the acronyms: definitions. auto / off.', studio: 'General → Auto-glossary' },
  class: { info: 'Default _class applied to every slide (a modifier — a component name is ignored).', studio: 'General → Default slide class', slide: '_class:', valuesText: 'modifier classes, space-separated' },
  validate: { info: 'Inline validation in the editor — on (default) / off. Travels with the deck.', scope: 'Studio editor only' },
  preset: { info: 'A named look that sets the backdrop, alignment and accent registers at once — classic (default) / editorial / brand / minimal. An explicit key (finish:, rule:, …) overrides it.', studio: 'Look → Preset (also in Basic)', valuesText: 'classic · editorial · brand · minimal — sets finish, headline, spectrum, spectrum-edge, spectrum-card, spectrum-card-edge, spectrum-trim, rule, eyebrow, lift and corners; a key you write wins' },
  'color-mode': { info: 'The mode the deck opens in — light / dark / system / inherited / print.', studio: 'Look → Color mode', slide: '_class: dark · color-light · color-system · print' },
  mode: { info: 'Rendering mode — boardroom / sketch / sketch-clean.', studio: 'Look → Mode', slide: '_class: sketch' },
  finish: { info: 'Finish backdrop — e.g. atrium, halo, gallery.', studio: 'Look → Finish', slide: '_class: finish-<name>', valuesText: 'none · atrium · meridian · strata · halo · ledger · nimbus · loom · savile · gallery' },
  'finish-override': { info: 'Override the applied finish — a nested map (backdrop: { strength, clearance }, wash, …).', scope: 'Studio only (written by Fabricate)', valuesText: 'a nested map of finish layers' },
  backdrop: { info: 'Restrain any finish — a strength (20 / 40 / 60 / 80 / full) and/or a mask (clear / open / spot-tl … spot-br). e.g. `backdrop: 40 clear`.', studio: 'Look → Backdrop strength · Backdrop mask', slide: '_class: backdrop-<value>', valuesText: 'a strength (20 · 40 · 60 · 80 · full) and/or a mask (clear · open · spot-tl … spot-br), e.g. 40 clear' },
  tag: { info: 'Style every card tag — up to one word per axis: color (color / plain / none), size (small / regular / large), placement (corner / foot / notch / band / inline), text (start / center / end). e.g. `tag: plain band center`.', studio: 'Look → Card tags (Tag color · size · placement · text)', slide: '_class: tag-<value>', valuesText: 'up to one word per axis: color (color · plain · none), size (small · regular · large), placement (corner · foot · notch · band · inline), text (start · center · end), e.g. plain band center' },
  'logo-style': { info: 'Style the logo on one line, up to one word per axis: placement (top-left / top-center / top-right / bottom-left / bottom-center / bottom-right — the header, footer or page number in that band hides), color (auto / accent / ink / muted / canvas / inverse / brand / accent-ink / accent-canvas / ink-canvas), size (sm / md / lg), scope (all / title). e.g. `logo-style: bottom-center accent-ink`. `_class: no-logo` hides it on one slide.', studio: 'Chrome → Logo' },
  'image-card': { info: 'Style the text card on every image slide that floats its words over the photo (spotlight, statement) — up to one word per axis: placement (top-left / top / top-right / center / bottom-left / bottom / bottom-right), backing (solid / soft / sheer / clear), ink (light / dark), size (sm / md / lg), density (regular / compact). e.g. `image-card: top-right soft sm`.', studio: 'Image (Placement · Backing · Ink · Size · Density)', slide: '_class: at-<corner> · card-<backing> · ink-<value> · card-<size> · compact · card-regular', scope: 'image slides only', valuesText: 'up to one word per axis: placement (top-left · top · top-right · center · bottom-left · bottom · bottom-right), backing (solid · soft · sheer · clear), ink (light · dark), size (sm · md · lg), density (regular · compact), e.g. top-right soft sm' },
  lift: { info: 'Card lift — the "Struck" shadow on card surfaces. on / off.', studio: 'Look → Card lift', slide: '_class: lifted · flat' },
  'chart-finish': { info: 'How every chart spends its color — off (default: as designed) / pigment (full-strength bodies) / etching (a whisper under a doubled edge) / tone (one hue in stepped shades).', studio: 'Look → Chart finish', slide: '_class: chart-finish-<value> · chart-finish-off', scope: 'every chart\'s marks and key', valuesText: 'off · pigment · etching · tone' },
  venue: { info: 'Where the deck is seen — sets the type size for the back row. laptop (default) · huddle (4–6 people) · conference (10–30) · hall (50+).', studio: 'Look → Venue', slide: '_class: venue-<value>', scope: 'type size, label size and lint budgets', valuesText: 'laptop · huddle · conference · hall' },
  cards: { info: 'Where a card row puts spare height — center / stretch / top / spread. Omit it and the component decides.', studio: 'Look → Frame and fit → Card rows', slide: '_class: cards-<value>' },
  corners: { info: 'Slide surface corners — square (default) / rounded.', studio: 'Look → Frame and fit → Corners', slide: '_class: corners-<value>' },
  claim: { info: 'How much frame the content sits inside — framed (default) / quiet / hero / bleed.', studio: 'Look → Frame and fit → Claim', slide: '_class: claim-<value>' },
  fit: { info: 'What the engine may do to make a slide fit — report (change nothing, only flag) / heal (default: split an overfull slide, lose no words) / trim (heal, and also cut text that does not fit). Replaces guards:.', studio: 'Look → Frame and fit → Fit', slide: '_class: fit-<value>' },
  header: { info: 'Running header text on every slide.', studio: 'Chrome → Header', slide: '<!-- _header: … -->', valuesText: 'any text' },
  footer: { info: 'Running footer text on every slide.', studio: 'Chrome → Footer', slide: '<!-- _footer: … -->', valuesText: 'any text' },
  paginate: { info: 'Page numbers — true / false. Anything but false, skip, hold or empty turns them on.', studio: 'Chrome → Page numbers', slide: '<!-- _paginate: false -->' },
  meta: { info: 'The masthead bay’s meta line — a date, a document number, a review stage.', studio: 'Chrome → Meta line', valuesText: 'any text; | starts a new line' },
  logo: { info: 'Deck logo — a path beside the deck or a full URL, drawn into the masthead.', studio: 'Chrome → Logo', valuesText: 'a path beside the deck, a URL, or lattice' },
  spectrum: { info: 'Brand bar — on (rainbow, default) / solid / duo / mono / off.', studio: 'Accent → Brand bar', slide: '_class: spectrum-<value>' },
  'spectrum-edge': { info: 'Which edge the brand bar sits on — top (default) / left / right / bottom / off.', studio: 'Accent → Bar placement', slide: '_class: spectrum-edge-<value>' },
  'spectrum-card': { info: 'Card rail style — off (default) / auto / solid / duo / mono / rainbow.', studio: 'Accent → Card rail', slide: '_class: spectrum-card (auto) · spectrum-card-<value>' },
  'spectrum-card-edge': { info: 'Card rail placement — left (default) / top / right / bottom.', studio: 'Accent → Card rail placement', slide: '_class: spectrum-card-edge-<value>' },
  'spectrum-trim': { info: 'Flow the spectrum onto structural accents (table rails, code strips, hr). off (default) / restrained / on.', studio: 'Accent → Structural trim', slide: '_class: spectrum-trim · spectrum-trim-restrained' },
  rule: { info: 'Heading underline — auto (default) / full / short / accent / none.', studio: 'Accent → Heading rule', slide: '_class: rule-<value>' },
  eyebrow: { info: 'The mark on the mono-caps kicker — plain (default) / dot / bar / arrow / underline.', studio: 'Accent → Eyebrow', slide: '_class: eyebrow-<value>' },
  headline: { info: 'Framing-text alignment — auto (default) / left / center / right.', studio: 'Accent → Headline alignment', slide: '_class: head-<value>' },
  stamp: { info: 'Deck-wide state-badge shape — e.g. tab, notch, seal, pill.', studio: 'Accent → Badges → Stamp shape', slide: '_class: stamp-<value>' },
  tone: { info: 'Deck-wide review-tone shape — rail (default) / edge / glow.', studio: 'Accent → Badges → Tone shape', slide: '_class: tone-<value>' },
  motion: { info: 'Chart motion on the live surfaces — on / off. Reaches the preview, Present and the exported player (see player-motion); the PDF stays still.', studio: 'Motion → Play', slide: '_class: motion-on · motion-off', scope: 'preview, Present and the exported player' },
  'motion-style': { info: 'How a chart moves — build (default) / together / rise.', studio: 'Motion → Style', slide: '_class: motion-<value>' },
  'motion-speed': { info: 'How fast the build runs — auto (default) / slow / normal / fast.', studio: 'Motion → Speed', slide: '_class: motion-<value>' },
  'player-motion': { info: 'off ships still charts in the exported offline player while motion stays on for presenting. Omit it to follow motion.', studio: 'Motion → In the exported player', scope: 'exported player only' },
  pace: { info: 'Presentation rhythm — how long a self-presenting deck holds on a new slide before speaking: brisk / natural / deliberate.', studio: 'Speech → Pace', scope: 'self-presenting playback' },
  delivery: { info: 'How much the narrated Guide gestures — restrained (default, boardroom) / expressive (sales, talks, teaching) / somber (bad news; no cursor).', scope: 'the Present Guide while narration plays' },
  lexicon: { info: 'Read-aloud pronunciations — a nested map of token → spoken text.', studio: 'Speech → Lexicon', scope: 'read-aloud', valuesText: 'a nested map: word → how to say it' },
  acronyms: { info: 'Acronym registry — term → spoken expansion (and an optional glossary definition).', studio: 'Speech → Acronyms', scope: 'read-aloud, and glossary: auto', valuesText: 'a nested map: term → expansion, optional definition' },
  say: { info: 'Read-aloud text per slide — a nested map of slide number → what that slide says. A slide’s own <!-- say: --> wins over it.', slide: '<!-- say: … -->', scope: 'read-aloud', valuesText: 'a nested map: slide number → what that slide says' },
  style: { info: 'Raw CSS for this deck (a YAML block scalar).', scope: 'command-line render only; the Studio preview and its exports ignore it', valuesText: 'CSS, as a YAML block (style: |)' },
  color: { info: 'Text color on every slide — any CSS color. Quote a hex value: "#1a1a1a".', slide: '<!-- _color: … -->', valuesText: 'a CSS color, quoted: "#1a1a1a"' },
  backgroundColor: { info: 'Slide background color — any CSS color. Quote a hex value: "#ffffff".', slide: '<!-- _backgroundColor: … -->', valuesText: 'a CSS color, quoted' },
  backgroundImage: { info: 'Slide background image — a CSS value, e.g. url(./bg.png).', slide: '<!-- _backgroundImage: … -->', valuesText: 'a CSS value, e.g. url(./bg.png)' },
  backgroundPosition: { info: 'Where the background image sits — a CSS value, e.g. center.', slide: '<!-- _backgroundPosition: … -->', valuesText: 'a CSS value' },
  backgroundRepeat: { info: 'Whether the background image tiles — a CSS value, e.g. no-repeat.', slide: '<!-- _backgroundRepeat: … -->', valuesText: 'a CSS value' },
  backgroundSize: { info: 'Background image size — a CSS value, e.g. cover.', slide: '<!-- _backgroundSize: … -->', valuesText: 'a CSS value' },
  debug: { info: 'Layout debug overlay — off / on-hover / on-always (+ verbose). Preview-only, stripped from every export.', studio: 'General → Developer → Debug overlay', slide: '<!-- _debug: … -->', scope: 'previews only; stripped from every export', valuesText: 'off · on-hover · on-always, plus verbose' },
  present: { info: 'Open the exported PDF in presentation mode. On: true / yes / on. Off: false / no / off. CLI and front matter only — the Studio sets it at export.', scope: 'command-line export only; yes/on and no/off also work' },
  read: { info: 'Emit the .html as the reading article — prose instead of the slide stack. On: true / yes / on. Off: false / no / off. CLI and front matter only — the Studio sets it at export.', scope: 'command-line export only; yes/on and no/off also work' },
  fluid: { info: 'Emit the .html as the responsive fluid-box viewer — each slide fills the viewport and reflows to portrait on a phone. On: true / yes / on. Off: false / no / off. PDF/PPTX/PNG are unchanged.', scope: 'command-line export only; yes/on and no/off also work' },
  player: { info: 'Emit the .html as the self-contained offline player (Present · Read Slides · Read Article). On: true / yes / on. Off: false / no / off. Supersedes fluid.', scope: 'command-line export only; yes/on and no/off also work' },
  plugins: { info: 'Plugins the deck needs loaded — a list of plugin names. It only adds: a renderer that loads more by default still does.', valuesText: 'a list of plugin names, e.g. [icons, avatars]' },
  greeting: { info: 'What a narrated deck says first — your own words, true for the stock greeting, or off.', scope: 'narrated playback', valuesText: 'text, true for the stock line, or off' },
  closing: { info: 'What a narrated deck says last — your own words, true for the stock closing, or off.', scope: 'narrated playback', valuesText: 'text, true for the stock line, or off' },
  code: { info: 'Default options for every code block — e.g. numbers, wrap. A fence\'s own record wins.', scope: 'every code fence', valuesText: 'code-record options, e.g. numbers, wrap' },
  build: { info: 'Marpit-style directive applied to every slide when set in front matter; normally a per-slide comment.' },
  focus: { info: 'Marpit-style directive applied to every slide when set in front matter; normally a per-slide comment.' },
  focusStyle: { info: 'Marpit-style directive applied to every slide when set in front matter; normally a per-slide comment.' },
  track: { info: 'Marpit-style directive applied to every slide when set in front matter; normally a per-slide comment.' },
  lenses: { info: 'Reader lenses the deck declares — a nested map.' },
  'lens-default': { info: 'The lens a reader opens in.' },
  'lens-defaults': { info: 'off turns the built-in lenses off.' },
  marp: { info: 'Marp\'s on-switch for its VS Code preview. Lattice accepts and ignores it.' },
  headingDivider: { info: 'Marpit\'s heading divider. Lattice splits at headings with split: instead.' },
  math: { info: 'Marp Core\'s math engine choice. Lattice ignores it.' },
  description: { info: 'Marp CLI metadata. Lattice ignores it.' },
  author: { info: 'Marp CLI metadata. Lattice ignores it.' },
  keywords: { info: 'Marp CLI metadata. Lattice ignores it.' },
  url: { info: 'Marp CLI metadata. Lattice ignores it.' },
  transition: { info: 'Marp\'s slide transition (bespoke HTML). Lattice ignores it.' },
  image: { info: 'Marp CLI metadata. Lattice ignores it.' },
  guards: { info: 'Renamed to fit:.' },
  'logo-on': { info: 'Retired; write the `title` word on logo-style:.' },
  'logo-scale': { info: 'Retired; write sm / md / lg on logo-style:.' },
  'logo-x': { info: 'Retired; write a placement word on logo-style:.' },
  'logo-y': { info: 'Retired; write a placement word on logo-style:.' },
  autosplit: { info: 'Retired; fit: decides.' },
  captions: { info: 'Retired; captions are an export setting.' },
  form: { info: 'Retired with the composition model.' },
  'overflow-marker': { info: 'Now an export setting.' },
});

/**
 * Rows with their prose joined in. A row that already carries `info` (a plugin register, whose
 * words `withPluginRegisters` writes from its axes) keeps it.
 *
 * @template T
 * @param {ReadonlyArray<T & { key: string }>} rows
 * @returns {ReadonlyArray<T & { info: string, studio?: string, slide?: string, scope?: string, valuesText?: string }>}
 */
function withProse(rows) {
  return Object.freeze(rows.map((r) => Object.freeze({ ...(DECK_SETTING_PROSE[r.key] || {}), ...r })));
}

module.exports = { DECK_SETTING_PROSE, withProse };
