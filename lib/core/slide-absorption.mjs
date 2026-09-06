/**
 * lib/core/slide-absorption.mjs
 *
 * How long a slide needs to be LOOKED AT — the missing content-weight input to the
 * narration clock.
 *
 * WHAT IS BROKEN WITHOUT THIS. Cadenza's pause ladder (docs/src/lib/cadenza/cadence.ts)
 * is entirely STRUCTURAL: a word's cost is its syllables, a pause is a punctuation
 * glyph, a paragraph is a blank line, and the two deepest rungs — `SLIDE_PAUSE_MS` and
 * `SECTION_PAUSE_MS` — are FLAT CONSTANTS keyed on boundary depth alone. So a hero
 * `big-number` and a footnote both get 1400 ms on arrival, and a `diagram` gets the
 * SHORTEST narration on the slide with the MOST to look at (the prose projection skips
 * a media component's visual by design — prose-projection.mjs `MEDIA_COMPONENTS`), then
 * advances the instant the voice stops. That is the "slides don't breathe" complaint.
 *
 * WHY THIS IS NOT A SEMANTICS PROBLEM. Absorption is a QUANTITY question — how much is
 * on the slide — and it is answered by counting the rendered DOM. It needs no embedding
 * model, no POS tagger, and no LLM. (The separate EMPHASIS question — which words matter —
 * is where salience scoring earns its place, and it is not this module's job.)
 *
 * THE SPEND RULE IS SHARED; ONLY THE COST FUNCTION COMPETES. Every model here answers one
 * question — "how many milliseconds of looking does this slide owe?" — and `spend()` turns
 * that single number into the two beats a player can actually use:
 *
 *   arrive  a beat on the NEW slide, already rendered, BEFORE the voice starts. The eyes
 *           arrive before the ears are ready; every practitioner agrees on that ordering.
 *   exit    the RESIDUAL after narration ends: what the eye still owes minus the time the
 *           voice already bought. Narration that ran long over a simple slide owes nothing;
 *           a diagram with one sentence of narration owes most of its cost.
 *
 * The residual is the whole idea. An ADDITIVE pause would drag every talkative slide and
 * still starve every silent diagram — which is exactly today's failure with the sign
 * flipped. Treating absorption as a BUDGET the narration already draws down makes a wordy
 * slide cost nothing extra and a wordless diagram cost everything.
 *
 * FIVE COMPETING COST MODELS (the bake-off; `tools/absorption-bakeoff.js` scores them over
 * real decks and `engineering/decisions/2026-09-06-slide-absorption-bakeoff.md` records the
 * comparison). Each is pure, deterministic and dependency-free:
 *
 *   A textTime     on-slide reading time. The shape both existing `readMs` twins already use.
 *   B densityFill  rendered item count against the component's own calibrated `soft`/`hard`
 *                  budget (lib/runtime/axis-dom-catalog.generated.js, 29 components).
 *   C roleWeighted rehearsal.js's ROLE_MULT lifted onto the clock — the repo's existing
 *                  content-weight model, which today only coaches a human.
 *   D visualCost   what is actually PAINTED: svg marks, table cells, list items, figures.
 *                  The only model that can see a diagram at all.
 *   E hybrid       max(read, look) x role — a slide costs the slower of its two channels,
 *                  scaled by the job it is doing.
 *
 * PURE + DOM-INJECTED, mirroring prose-projection.mjs: it reads already-sanitized slide
 * `<section>` nodes passed in by the caller and imports nothing external, so the same kernel
 * serves the Node/jsdom export path and the browser player (HARD RULE #1). ESM for the same
 * three-toolchain reason prose-projection.mjs is (rollup/docs, esbuild/emulator, node --test).
 *
 * NOT A DECIDER OF WHAT TO SAY, and not a decider of what MATTERS. It reports a cost in
 * milliseconds; the player decides how to spend it.
 */

/** Chrome that is never content: the same skip set the prose projection uses, plus the
 *  every ACCESSIBLE-DUPLICATE channel: text that exists for a screen reader and is never painted.
 *  There are four, and each was found the same way — by a measurement coming back absurd:
 *    · `.lattice-description`  the slide's sr-only WCAG 1.1.1 alternative.
 *    · `.katex-mathml`         KaTeX's MathML twin of the formula beside it.
 *    · `svg title` / `svg desc`  the SVG spelling of the same idea — a tooltip and an accessible
 *      name, never painted. A world basemap carries ONE `<title>` per country: `examples/map.md`
 *      slide 3 measured 257 words of which 17 are visible, and every `map` slide in the tree pinned
 *      both beats at the ceiling. 144 slides carried this.
 *    · `[data-lattice-berth]`  the engine's overflow/illegible/fixme tabs — chrome, `aria-hidden`.
 *  Plus `[hidden]`, the one hidden-ness signal a STRUCTURAL measure can see.
 *
 *  `[aria-hidden="true"]` is deliberately NOT here, and the distinction is load-bearing: it means
 *  "do not announce", not "do not paint". The runtime wraps every DRAWN Mermaid diagram in
 *  `<div class="mermaid" aria-hidden="true">` — correctly, because the source `<pre>` beside it
 *  carries the accessible text — so skipping on that attribute would have excluded the actual
 *  rendered diagram from the measurement, on the live surface, in the name of accuracy.
 *
 *  CSS-driven `display: none` remains invisible to a structural measure — see `measureSlide`'s
 *  `isHidden` hook for the surface that can see it. */
const SKIP_SELECTOR =
	'header, footer, .cell-footer, .masthead-bay, .lat-pagination, aside, script, style, .lattice-notes, ' +
	'.lattice-description, .katex-mathml, svg title, svg desc, [data-lattice-berth], [hidden]';

/** A fenced block is SOURCE, not readable slide text — and on the Node/export path a mermaid
 *  diagram is exactly that: `<pre><code class="language-mermaid">` holding its own DSL, because
 *  Mermaid renders in a browser and nothing has drawn it yet. Counting that source as words made
 *  every diagram slide look like a 40-word prose slide in the first bake-off run. Excluded from
 *  the word count, and measured instead as a DIAGRAM (see `diagramMarksOf`).
 *
 *  `pre` ONLY, never a bare `code`: INLINE code is read at slide speed like any other word, and
 *  it is a real content slot — the eyebrow's own selector is `p > code` across the catalog. An
 *  earlier draft excluded both and silently deleted every eyebrow from the word count (a closing
 *  slide measured 4 words where it has 15). Fenced source is the target; inline code is content. */
const SOURCE_SELECTOR = 'pre';

/** Components whose meaning IS a rendered visual. Kept identical to prose-projection.mjs's
 *  `MEDIA_COMPONENTS` on purpose: that list is exactly the set whose narration SKIPS the
 *  visual, so it is exactly the set whose absorption cost the narration cannot pay for.
 *  `slide-absorption.test.js` pins the two lists equal — they must not drift. */
export const MEDIA_COMPONENTS = new Set([
	'funnel', 'journey', 'map', 'piechart', 'quadrant',
	'radar', 'state-chart', 'word-cloud', 'diagram', 'image', 'video', 'math',
]);

/**
 * Components a viewer LOOKS at — the population the bake-off's discriminating metric needs.
 *
 * This is NOT `MEDIA_COMPONENTS`, and conflating the two put the wrong slides in the wrong column.
 * `MEDIA_COMPONENTS` answers "whose narration skips the visual" — a projection question, and the
 * reason a media slide's narration earns little absorption credit. "Which slides are visual" is a
 * different question, and seven components answer yes to it while sitting outside that list:
 * `gantt`, `kanban`, `matrix-grid`, `progress`, `roadmap`, `timeline-list` and `scene` are pure
 * HTML/CSS layouts, so their narration does NOT skip them — but a roadmap is still something you
 * look at, and scoring it in the prose column meant the metric that picked a winner did not cover
 * the population the complaint names.
 *
 * Reusing the list looked like reuse (HARD RULE #15) and was not: same set, different question.
 */
export const VISUAL_COMPONENTS = new Set([
	'funnel', 'journey', 'map', 'piechart', 'quadrant', 'radar', 'state-chart', 'word-cloud',
	'diagram', 'image', 'video', 'math',
	'gantt', 'kanban', 'matrix-grid', 'progress', 'roadmap', 'timeline-list', 'scene',
]);

/** Buckets whose members are visual by construction, for a component the set above has not met. */
export const VISUAL_BUCKETS = new Set(['chart', 'diagram', 'imagery', 'math']);

/** Table-shaped components — dense reference a reader scans rather than reads. Mirrors
 *  rehearsal.js's TABLE_COMPS so role derivation agrees across the two surfaces. */
export const TABLE_COMPONENTS = new Set([
	'matrix-2x2', 'compare-table', 'list-tabular', 'obligation-matrix', 'verdict-grid', 'glossary',
]);

/** Per-slide ROLE — what the slide is DOING. The vocabulary and the multipliers below are
 *  rehearsal.js's (docs/src/components/studio/present/rehearsal.js:47), which is the model
 *  this repo already trusts for per-slide weight; it just never reached the clock. */
export const ROLE_MULT = {
	open: 1.12, section: 0.5, data: 1.28, visual: 1.16, quote: 1.12,
	table: 1.22, decision: 1.45, close: 0.92, body: 1,
};

/** Reading speed for SILENT on-slide reading, words/minute. Deliberately NOT Cadenza's
 *  PACE_WPM (120/150/175): those are SPEAKING rates, and silent reading of short display
 *  text runs far faster — ~250 wpm is the standard adult figure for prose, and slide text
 *  is shorter and larger than prose. This is the one constant this module owns; every other
 *  number it uses is read from a manifest or from the DOM. */
export const SILENT_READ_WPM = 250;

/**
 * Per-kind visual cost, ms. Charging every painted thing the SAME price is what broke the
 * first bake-off run: a five-node flowchart with four edges priced at 0.7 s — under the
 * existing 1.4 s floor — so the one model that can see a diagram gave every diagram in the
 * tree nothing. The marks were counted correctly; they were valued wrongly.
 *
 * The kinds differ because the EYE does different work on them:
 *   MARK   a bar, a slice, a cell, a bullet — SCANNED. ~120 ms is a fixation plus saccade,
 *          and a viewer samples these rather than visiting each one.
 *   NODE   a labeled box in a diagram — READ. It holds words, so it costs a short read.
 *   EDGE   a relation — TRACED. The most expensive element on a slide per unit of ink, and
 *          the one a mark-counting model misses entirely: a diagram's meaning is its edges,
 *          which is why "count the shapes" underprices a flowchart and overprices a table.
 *   IMAGE  a photo or an opaque figure — a block whose internal complexity the DOM cannot
 *          see, so it is charged as one substantial look rather than guessed at.
 */
export const MARK_MS = 120;
export const NODE_MS = 400;
export const EDGE_MS = 500;
export const IMAGE_MS = 1500;

/**
 * Where diminishing returns start, ms. Below the knee a viewer really does visit everything;
 * above it they sample, so cost grows logarithmically rather than linearly — a 60-cell table
 * is not five times the work of a 12-cell one. A knee rather than a blanket `sqrt` because the
 * sqrt was wrong precisely at the SMALL end, where most slides live.
 */
export const SCAN_KNEE_MS = 4000;

/** The floor and ceiling on any single beat. The floor keeps a beat perceptible (below
 *  ~200 ms reads as a stutter, not a pause); the ceiling stops one pathological slide from
 *  stalling a delivery. Both are spend-rule properties, so every model shares them. */
export const MIN_BEAT_MS = 200;
export const MAX_BEAT_MS = 9000;

/** Text set as PROSE — read in order, at reading speed. Everything else visible on a slide is
 *  a label. The distinction is load-bearing: pricing a chart's scattered labels as prose gave a
 *  51-label quadrant 13.8 s of silence in the first bake-off run, which is worse than the flat
 *  beat it replaced. */
const PROSE_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, figcaption';


/**
 * The slide's items on the density axis — the SAME rule `domItemElements` applies
 * (`lib/core/collections.js`): the direct `li` children of the FIRST list, never every `li` at any
 * depth.
 *
 * That distinction IS the measurement. HARD RULE #5 makes a card a NESTED list (`- Title` /
 * `  - body`), so a depth-blind `li` count reads every card twice: 46 of 60 catalog-backed slides
 * differed from the canonical count, almost always by exactly 2x. Model B divides by the
 * component's calibrated `soft` budget, and that budget was calibrated over the canonical count —
 * so the hardcoded selector made B's bake-off row a test of the wrong quantity.
 *
 * A SYNC-GATED MIRROR, not an import, for the reason `resolve-pace.mjs` mirrors the cadence
 * kernel's presets: `collections.js` is CommonJS, and Rollup will not resolve named exports off a
 * CJS file outside its root, so requiring it here fails `astro build` while passing vitest and
 * `node --test`. `slide-absorption.test.js` pins the two against each other.
 */
function itemElements(root) {
	if (!root || typeof root.querySelector !== 'function') return 0;
	const stage = root.querySelector?.('.cell-stage') || root;
	// Rooted at the STAGE even though everything else measures the whole slide: the density budget
	// this count is scored against was calibrated over the stage's collection, and a masthead or
	// coda list is not on the component's density axis.
	const list = stage.querySelector(':scope > ul, :scope > ol, :scope > * > ul, :scope > * > ol');
	if (!list || closestWithin(list, SKIP_SELECTOR, root)) return 0;
	let n = 0;
	for (const el of list.children) if (el.tagName === 'LI') n += 1;
	return n;
}

/** Words in a string, whitespace-delimited. */
function wordCount(text) {
	const t = String(text ?? '').trim();
	return t ? t.split(/\s+/).length : 0;
}

/** The component name — the FIRST token of the authoritative `data-class`, falling back to
 *  `class`. Same derivation as prose-projection.mjs's `componentOf` (author writes the
 *  component first by engine convention), so both read the same identity off one slide. */
function componentOf(section) {
	const dc = section.getAttribute('data-class') || section.getAttribute('class') || '';
	return dc.split(/\s+/).filter(Boolean)[0] || '';
}

/** The content stage, or the whole section when a component has no `.cell-stage`. */
/**
 * The slide's CONTENT ROOT — the whole `<section>`, not `.cell-stage`.
 *
 * This is the correction that invalidated the first bake-off. `.cell-stage` holds the body, but the
 * engine puts the HEADLINE in a sibling `.cell-masthead > .masthead-lede > h2` and a harvested key
 * insight in a sibling `.cell-coda`. Both are painted; neither is in the stage. Rooting the
 * measurement at the stage dropped them on **1065 of 1602 slides**, and left **141 slides measuring
 * ZERO words while showing visible prose** — including whole diagram decks whose entire text is a
 * headline plus a coda.
 *
 * The original `stageOf` was copied from `prose-projection.mjs:71`, where it is correct because the
 * projection reads the heading SEPARATELY (`headingOf`, `eyebrowOf`) and uses the stage only for the
 * body. Copying one of three collaborating functions took the part and left the contract.
 *
 * Chrome is excluded by `SKIP_SELECTOR` instead, which is what that selector is for.
 */
function contentRootOf(section) {
	return section;
}


/**
 * Derive the slide's ROLE from its component, its position, and what it holds.
 *
 * Mirrors rehearsal.js's `roleOf` — same order, same vocabulary — with the bucket lookup
 * INJECTED rather than imported, because this kernel may not read the filesystem. A caller
 * with no catalog still gets a role; it just falls back to the density heuristic for the
 * components whose role is a bucket property (chart/diagram/imagery → visual).
 *
 * @param {string} component  component name off `data-class`
 * @param {number} index      slide index
 * @param {number} total      slide count
 * @param {string} text       the slide's visible text (for the closing-phrase probe)
 * @param {(name: string) => string|null} [bucketOf]  component → bucket, when the caller has it
 */
export function roleOf(component, index, total, text, bucketOf) {
	if (index === 0) return 'open';
	const lastish = index === total - 1;
	if (component === 'closing' || /\b(thank you|questions|q&a|in summary)\b/i.test(String(text ?? ''))) return 'close';
	if (component === 'divider') return 'section';
	if (component === 'decision') return 'decision';
	if (component === 'big-number' || component === 'kpi' || component === 'stats') return 'data';
	if (component === 'quote') return 'quote';
	if (component === 'image') return 'visual';
	if (TABLE_COMPONENTS.has(component)) return 'table';
	const bucket = bucketOf && component ? bucketOf(component) : null;
	if (bucket === 'evidence') return 'data';
	// MIRRORS rehearsal.js:120 exactly — `imagery`, `chart`, `diagram`, and deliberately NOT
	// `math`. A first attempt "fixed" the mismatch with `VISUAL_BUCKETS` here and silently broke
	// the mirror, which is the drift the pins exist to catch and which no test caught.
	//
	// The mismatch it was reaching for is real but is NOT a bug: `isVisual` and `role` answer
	// different questions, the same way `MEDIA_COMPONENTS` and `VISUAL_COMPONENTS` do.
	// `isVisual` asks "does a viewer LOOK at this" — a rendered formula, yes. `role` asks "what
	// JOB is this slide doing", and a theorem slide's job is exposition, which is why rehearsal
	// weights it as body. A math slide being visual and weighted as prose is coherent.
	if (bucket === 'imagery' || bucket === 'chart' || bucket === 'diagram') return 'visual';
	if (lastish) return 'close';
	return 'body';
}

/**
 * MEASURE one rendered slide — the raw counts every cost model scores from.
 *
 * ONE PASS over the slide's elements, not a dozen `querySelectorAll` sweeps plus a `closest()` per
 * text node. That shape was 148x slower than the prose projection over the SAME DOM (11.4 s against
 * 77 ms on a 38 KB deck) because `closest()` walks the whole ancestor chain against 11 compound
 * selectors, once per node — quadratic in depth. Here a single walk carries a `skipDepth` counter,
 * so chrome is recognized when it is ENTERED and everything under it is free.
 *
 * `isHidden` is the one hook a structural measure needs from its caller. Nothing here reads computed
 * style — that is what lets the same kernel run under jsdom on the export path — but CSS-driven
 * `display: none` is therefore INVISIBLE to it, and the tree really does hide painted-looking content
 * that way (a `journey.heatmap` counts 30 svg marks of which 30 are hidden variant layers). A browser
 * caller should pass `isHidden: (el) => getComputedStyle(el).display === 'none' || …`; a Node caller
 * passes nothing and gets the structural approximation, which catches `[hidden]` and
 * `[aria-hidden="true"]` and nothing else. Stated rather than papered over.
 *
 * @param {Element} section  a sanitized `<section data-lattice-slide>` node
 * @param {object} [ctx]     `{ index, total, catalog, bucketOf, isHidden }`
 * @returns {object} the measurement record
 */
export function measureSlide(section, ctx = {}) {
	const { index = 0, total = 1, catalog = null, bucketOf = null, isHidden = null } = ctx;
	// The only unguarded entry point in the module was this one: a null/text-node/fragment argument
	// threw on `getAttribute`, and in a per-slide player loop one un-rendered slide takes down the
	// clock. Every helper below already guarded its own input.
	if (!section || typeof section.getAttribute !== 'function' || typeof section.querySelectorAll !== 'function') {
		return emptyMeasure(index);
	}

	const component = componentOf(section);
	const root = contentRootOf(section);
	const declared = catalog?.[component] ? catalog[component] : null;

	const m = walkSlide(root, isHidden);

	// Items on the component's density axis: the component's own declared selector when it has one,
	// else the canonical first-list rule (see `itemElements`).
	const items = declared?.domSelector ? countVisible(root, declared.domSelector, isHidden) : itemElements(root);

	// A diagram's marks: the drawn SVG where a browser has drawn one, else an estimate off the fence
	// source. See `mermaidSources` for why "has it been drawn?" is not the obvious question.
	let diagramNodes = 0;
	let diagramEdges = 0;
	for (const el of mermaidSources(root)) {
		const { nodes, edges } = diagramMarksOf(el.textContent);
		diagramNodes += nodes;
		diagramEdges += edges;
	}

	const role = roleOf(component, index, total, m.proseText, bucketOf);

	return {
		index,
		component,
		role,
		isMedia: MEDIA_COMPONENTS.has(component),
		isVisual: VISUAL_COMPONENTS.has(component) || (bucketOf ? VISUAL_BUCKETS.has(bucketOf(component)) : false),
		words: m.proseWords + m.labelWords,
		proseWords: m.proseWords,
		labelWords: m.labelWords,
		items,
		svgMarks: m.svgMarks,
		images: m.images,
		cells: m.cells,
		diagramNodes,
		diagramEdges,
		soft: declared ? (declared.soft ?? null) : null,
		hard: declared ? (declared.hard ?? null) : null,
	};
}

/** The zero measure — every field a model reads, at zero. Returned for an unusable argument. */
function emptyMeasure(index) {
	return {
		index, component: '', role: 'body', isMedia: false, isVisual: false,
		words: 0, proseWords: 0, labelWords: 0, items: 0, svgMarks: 0, images: 0, cells: 0,
		diagramNodes: 0, diagramEdges: 0, soft: null, hard: null,
	};
}

/**
 * The single walk: words split prose/label, and every mark set, in one traversal.
 *
 * Three counting rules are worth their lines, because each was a measured defect:
 *
 * KATEX. A rendered formula sets EVERY GLYPH in its own `<span class="mord">`, so a TreeWalker
 * charges `f : [ a , b ] -> R` as eight words at reading speed. `examples/cat-ink-tier.md` slide 1
 * measured 200 prose words where 123 are text — and both its beats pinned at the ceiling, 18 s of
 * silence, which is the exact symptom skipping `.katex-mathml` was supposed to have closed. A whole
 * `.katex` subtree is therefore ONE token: a formula is a thing you look at, not a sentence.
 *
 * TABLE CELLS. A `<td>`'s text is not a label word, because the `<td>` itself is already charged as
 * a cell. Counting both billed a 2x2 table as 2 rows + 4 cells + 4 words.
 *
 * UNIFORM MARK SETS. `examples/map.md` renders a world basemap as 175 identically-classed
 * `<path class="map-region">`. That is ONE picture a viewer takes in as a shape, not 175 looks — the
 * §7.1 error (marks counted right, valued wrong) in its largest instance. A run of marks sharing one
 * class is charged as `UNIFORM_MARK_CAP` looks plus the excess at a steep discount.
 */
function walkSlide(root, isHidden) {
	let proseWords = 0;
	let labelWords = 0;
	let svgMarks = 0;
	let images = 0;
	let cells = 0;
	const prose = [];
	const markClasses = new Map(); // class signature -> count, for the uniform-set discount

	const doc = root.ownerDocument;
	if (!doc || typeof doc.createTreeWalker !== 'function') {
		return { proseWords, labelWords, svgMarks, images, cells, proseText: '' };
	}

	// SHOW_ELEMENT | SHOW_TEXT — one walk sees both, so an element's skip state is known by the time
	// its text arrives.
	const walker = doc.createTreeWalker(root, 1 | 4);
	// Depth bookkeeping: `skipRoot` is the element whose subtree is chrome/duplicate/hidden; we are
	// inside it until the walk leaves. `contains` is the cheap, correct "am I still under it" test.
	let skipRoot = null;
	let katexRoot = null;
	let proseRoot = null;

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (skipRoot && !skipRoot.contains(node)) skipRoot = null;
		if (katexRoot && !katexRoot.contains(node)) katexRoot = null;
		if (proseRoot && !proseRoot.contains(node)) proseRoot = null;

		if (node.nodeType === 1) {
			if (skipRoot) continue;
			if (matches(node, SKIP_SELECTOR) || isHidden?.(node)) {
				skipRoot = node;
				continue;
			}
			// A FENCE is source, not readable slide text — and an un-rendered mermaid fence is the
			// diagram itself, measured separately by `diagramMarksOf`. `pre` only, never a bare
			// `code`: inline code is read at slide speed and is a real content slot (the eyebrow's
			// own selector is `p > code` across the catalog).
			if (matches(node, SOURCE_SELECTOR)) {
				skipRoot = node;
				continue;
			}
			// A formula is one look. Enter it once; everything inside is already accounted for.
			if (!katexRoot && matches(node, '.katex')) {
				katexRoot = node;
				labelWords += 1;
				continue;
			}
			if (katexRoot) continue;
			if (!proseRoot && matches(node, PROSE_SELECTOR) && !closestWithin(node, 'svg', root)) proseRoot = node;

			const tag = node.tagName;
			if (tag === 'TD' || tag === 'TH') cells += 1;
			else if (tag === 'IMG' || tag === 'VIDEO' || isPaintedBackground(node)) images += 1;
			else if (SVG_MARK_TAGS.has(tag) && closestWithin(node, 'svg', root)) {
				svgMarks += 1;
				const sig = String(node.getAttribute?.('class') || '');
				if (sig) markClasses.set(sig, (markClasses.get(sig) || 0) + 1);
			}
			continue;
		}

		// Text
		if (skipRoot || katexRoot) continue;
		const n = wordCount(node.nodeValue);
		if (!n) continue;
		const el = node.parentElement;
		if (!el) continue;
		// A cell's text is already paid for by the cell itself.
		if (el.tagName === 'TD' || el.tagName === 'TH' || closestWithin(el, 'td, th', root)) continue;
		if (proseRoot) {
			proseWords += n;
			prose.push(node.nodeValue.trim());
		} else labelWords += n;
	}

	// Collapse each uniform mark run to a bounded number of looks.
	for (const count of markClasses.values()) {
		if (count > UNIFORM_MARK_CAP) svgMarks -= count - UNIFORM_MARK_CAP - Math.round((count - UNIFORM_MARK_CAP) / 12);
	}

	return { proseWords, labelWords, svgMarks: Math.max(0, svgMarks), images, cells, proseText: prose.join(' ') };
}

/**
 * A photo painted as a CSS BACKGROUND rather than an `<img>`.
 *
 * `IMAGE_MS` fired on **zero of 142 slides** before this, because the `image` component renders
 * its photo onto `.lattice-bg` — its own docs say so in as many words ("no `<img>`") — and `scene`
 * uses the same panel. So the archetypal visual component measured a completely empty look
 * channel, and 10 of 41 visual slides were structurally incapable of earning a beat. A constant
 * documented as "a photo… charged as one substantial look" never once described a photo.
 *
 * Matched on the inline style, which is where the engine writes the URL, rather than on the class
 * alone: a `.lattice-bg` panel with no image painted is a container, not a picture.
 */
function isPaintedBackground(el) {
	const style = typeof el.getAttribute === 'function' ? el.getAttribute('style') || '' : '';
	return style.includes('background-image');
}

/** SVG leaf shapes — the marks a viewer's eye lands on. `<g>` is a container; `<text>` is charged as
 *  label words, not as a mark (counting both billed 9 quadrant labels as 25 things to look at). */
const SVG_MARK_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);

/** How many looks a run of identically-classed marks is worth before the discount bites. A basemap's
 *  175 country paths are one picture; a 12-bar chart's bars are twelve. */
export const UNIFORM_MARK_CAP = 12;

/** `Element.matches` with the SVG guard: an SVGElement has `matches`, but `className` is an
 *  SVGAnimatedString, so nothing here may touch `.className` directly. */
function matches(el, selector) {
	return typeof el.matches === 'function' && el.matches(selector);
}

/** `closest`, bounded to the measured subtree so a slide never consults its own page chrome.
 *
 *  EVERY chrome test goes through this. Three of the four counters used a BARE `closest()` while
 *  `walkSlide` was bounded, so the same slide measured two different ways: marking the section
 *  itself `[hidden]` left words counted in full while items, marks and diagrams all dropped to
 *  zero. One rule, one boundary. */
function closestWithin(el, selector, root) {
	const hit = typeof el.closest === 'function' ? el.closest(selector) : null;
	return hit && root.contains(hit) ? hit : null;
}

/** Count elements matching `selector` that are neither chrome nor hidden. */
function countVisible(root, selector, isHidden) {
	let n = 0;
	for (const el of root.querySelectorAll(selector)) {
		if (closestWithin(el, SKIP_SELECTOR, root)) continue;
		if (isHidden?.(el)) continue;
		n += 1;
	}
	return n;
}

/**
 * The Mermaid fences on a slide that still need estimating from SOURCE.
 *
 * "Has a browser drawn this yet?" is not answered by looking INSIDE the element, and that mistake
 * doubled the cost of every diagram on the live surface. `lib/runtime/index.js` does two things the
 * old guard did not model: it inserts the rendered SVG as a SIBLING of the `<pre>`
 * (`insertAdjacentElement('afterend', …)`), never a descendant; and it defangs the source by
 * rewriting `language-mermaid` to `language-mermaid-source`, which still matched a `[class*=]`
 * SUBSTRING selector. So the hidden 0x0 source block was measured as a second whole diagram on top
 * of the SVG that replaced it — +82% cost and +2.97 s of silence on a five-node flowchart, on the
 * exact slide class this model exists to serve.
 *
 * Both are fixed by asking the right questions: match the source class EXACTLY, and look for a drawn
 * twin among the element's SIBLINGS as well as its descendants.
 */
function mermaidSources(root) {
	const out = [];
	for (const el of root.querySelectorAll('code.language-mermaid, pre.mermaid, .mermaid')) {
		if (closestWithin(el, SKIP_SELECTOR, root)) continue;
		if (el.querySelector?.('svg')) continue; // drawn in place
		// Drawn as a sibling by the runtime, or already defanged to `-source` beside its own SVG.
		const host = el.tagName === 'CODE' ? el.parentElement || el : el;
		if (host.nextElementSibling?.querySelector?.('svg') || host.nextElementSibling?.tagName === 'svg') continue;
		// A wrapper and its inner `code` can both match; the innermost owns the diagram.
		if (el.querySelector?.('code.language-mermaid, pre.mermaid, .mermaid')) continue;
		out.push(el);
	}
	return out;
}

/**
 * Every Mermaid link form, as ONE ordered alternation with only BOUNDED quantifiers.
 *
 * Ordered longest-first, because an alternation takes the first alternative that matches at a
 * position: with `-{2,3}>` ahead of `-{2,3}>>`, an `-->>` sequence message counts as a plain arrow
 * with a stray `>` left over.
 *
 * BOUNDED on purpose. An earlier draft used `={2,}>`, whose open quantifier backtracks quadratically
 * on a run of `=` with no `>` — the input is a markdown fence, i.e. author-controlled text from a
 * shared deck. That is the exact ReDoS shape the house pattern already bans (`edgeTrim`,
 * docs/src/lib/cadenza/normalize.ts). Every quantifier here has an upper bound, so the scan is
 * linear; 200k `=` scans in ~4 ms.
 */
const EDGE_OP =
	/<\|\.\.|\.\.\|>|<\|--|--\|>|-\.{1,3}->|<-{2,3}>|-{2,3}>>|={2,3}>|-{2,3}>|-{2,3}[xo)]|={2,3}[xo]|\*--|o--|--\*|--o|->>|-\)|-\.-|={2,3}|-{2,3}/g;

/** A leading Mermaid YAML frontmatter block, which is CONFIG, not diagram. Its two delimiters are
 *  literally `---`, which the link alternation reads as two plain edges. */
const MERMAID_FRONTMATTER = /^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/;

/** Grammars whose structure is a LIST OF ROWS rather than a graph of links. Eleven of these scored
 *  `{nodes:0, edges:0}` — no absorption at all, on a component whose narration deliberately skips
 *  the visual — because the edge alternation only sees arrow-shaped operators and these have none.
 *  Fifteen shipped fences were affected, including every chart in `examples/xychart-narration.md`. */
const ROW_GRAMMARS =
	/^\s*(xychart(-beta)?|gitGraph|kanban|journey|timeline|sankey(-beta)?|packet(-beta)?|treemap(-beta)?|ishikawa(-beta)?|treeView(-beta)?|requirementDiagram|quadrantChart|gantt|pie|mindmap|block(-beta)?|architecture(-beta)?)\b/i;

/** Lines that declare an AXIS. In `xychart-beta`, `-->` is the axis RANGE operator (`x-axis "Trial"
 *  1 --> 5`), not a link — so an xychart's "absorption cost" was a count of how many axes declare a
 *  numeric range. Dropped before the edge scan. */
const AXIS_LINE = /^\s*(x-axis|y-axis|axis|dateFormat|axisFormat|tickInterval|excludes|todayMarker|title)\b/i;

/** A line that is only dashes/spaces: a markdown thematic break that survived into the fence body,
 *  or a second frontmatter fence. `---` is a legal Mermaid open link BETWEEN two nodes, so the test
 *  is whether anything else shares the line — not whether the glyphs appear. */
const RULE_LINE = /^\s*-{3,}\s*$/;

/**
 * Strip everything that is TEXT rather than STRUCTURE, so the edge scan cannot read a label.
 *
 * A node label can contain an arrow — `A["step --> step"] --> B` is one edge, and counting the one
 * inside the quotes made it two. Quoted strings go first, then bracketed label bodies, then
 * comments. `%%` is stripped from ANYWHERE on a line, not just the start: Mermaid allows a trailing
 * comment, and `A-->B %% note --> more --> yet` scored three edges.
 */
function stripDiagramText(src) {
	return (
		src
			// COMMENTS FIRST. A `%%{init: {'theme':'forest'}}%%` directive is full of quotes and
			// braces; stripping quotes ahead of it pairs a directive's apostrophe with the next
			// one on the line and deletes the arrow between them.
			// A `%%{init: …}%%` DIRECTIVE first, as its own form: it is full of quotes and braces, so
			// it must not be parsed as a label, and it must not be left for the line-comment rule.
			.replace(/%%\{[^\n]*?\}%%/g, '')
			.replace(/"[^"\n]*"/g, '""') // quoted labels
			// NO SINGLE-QUOTE PASS. Mermaid has no single-quoted label form that needs one, and a
			// possessive apostrophe in an ordinary label made the regex pair it with the NEXT
			// label's apostrophe and delete everything between — including the link:
			// `A[Bob's data] --> B[Alice's report]` measured 1 edge where it has 2, and a chained
			// single-line diagram lost half its edges. Introduced by the fix pass that added it.
			.replace(/\[[^\][\n]*\]/g, '[]') // bracketed label bodies (shape brackets survive)
			.replace(/\{[^{}\n]*\}/g, '{}')
			// LINE COMMENTS LAST, so a `%%` inside a label (`A[50%% done]`) is already gone and
			// cannot delete the rest of its line — including that line's link.
			.replace(/%%.*$/gm, '')
	);
}

/**
 * Estimate a Mermaid diagram's node and edge counts from its SOURCE, for the paths where nothing
 * has drawn it yet.
 *
 * WHY THIS EXISTS AT ALL. The obvious measure — count the `<svg>`'s shapes — only works where a
 * browser has run Mermaid. On the CLI/export path (and in jsdom generally) the slide holds the DSL
 * text and no marks, so a DOM-only visual model scores every diagram in the tree at ZERO.
 *
 * NODES ARE DERIVED FROM EDGES, NOT PARSED AS IDENTIFIERS. Reading the identifiers either side of an
 * arrow is the obvious approach and it is a trap: an unspaced link (`Server--xClient`, which shipped
 * decks use) has no whitespace to split on, so the operator's characters fuse into the name — a
 * three-participant sequence diagram yielded the "nodes" `Server--`, `xClient` and `Worker--`, not
 * one of them real. A connected diagram with E edges has between E and E+1 nodes, so `edges + 1`
 * bounds it with no identifier parsing at all and cannot invent a name.
 *
 * A ROW GRAMMAR HAS NO EDGES AND IS NOT EMPTY. `xychart`, `gitGraph`, `timeline`, `sankey` and the
 * rest carry their content as statement rows; for those the count is the rows themselves. The result
 * feeds a knee curve, so being out by one moves the beat by tens of milliseconds — being out by
 * "there is a diagram here at all" moves it by seconds, and that was the real error.
 */
export function diagramMarksOf(source) {
	const src = String(source ?? '');
	if (!src.trim()) return { nodes: 0, edges: 0 };

	const body = src.replace(MERMAID_FRONTMATTER, '');
	const isRowGrammar = ROW_GRAMMARS.test(body);

	// Structure-only lines: labels and comments removed, axis declarations and bare rules dropped.
	const lines = stripDiagramText(body)
		.split(/\r?\n/)
		.filter((l) => l.trim() && !RULE_LINE.test(l) && !AXIS_LINE.test(l));

	const structural = lines.join('\n');
	const edges = (structural.match(EDGE_OP) || []).length;
	// A shape declaration: an identifier immediately followed by an opening shape bracket. NO hyphen
	// in the identifier class — the hyphen is what let a link operator fuse into a node name.
	const declared = new Set(structural.match(/\b[A-Za-z_][A-Za-z0-9_]*(?=[[({])/g) || []);

	if (edges === 0 && isRowGrammar) {
		// Rows minus the type declaration itself; each row is a statement to take in.
		const rows = Math.max(0, lines.length - 1);
		// PLUS the DATA those statements carry. Counting statements alone made an `xychart-beta`
		// measure identically at 4 bars and at 400 — `stripDiagramText` removes `bar [42, 58, 71]`
		// before the count, and that bracketed list IS the chart. A 13-point line and a 2-point bar
		// both scored one row. Data points are read off the ORIGINAL body, and charged at a
		// discount: a viewer takes in a series as a shape, not as N separate readings.
		const points = (body.match(/\[[^\][\n]*\]/g) || []).reduce((n, group) => {
			const items = group.slice(1, -1).split(',').filter((x) => x.trim()).length;
			return n + (items > 1 ? items : 0);
		}, 0);
		return { nodes: rows + Math.round(points / 3), edges: 0 };
	}
	return { nodes: Math.max(declared.size, edges > 0 ? edges + 1 : 0), edges };
}

/** The role multiplier, or 1 for anything unregistered.
 *
 *  `ROLE_MULT[role] || 1` reproduced the very defect the numeric guard was added to close: a role
 *  string landing on `Object.prototype` (`toString`, `constructor`, `valueOf`) returns a truthy
 *  FUNCTION, so `|| 1` never fires and the cost comes back NaN — which `spend`'s finiteness guard
 *  then turns into cost 0, silently giving the slide no absorption instead of failing loudly.
 *  `roleOf` returns a closed vocabulary, but `scoreDeck` and every model's `cost` are exported and
 *  take caller-supplied measures. */
function roleMult(role) {
	return Object.hasOwn(ROLE_MULT, role) ? ROLE_MULT[role] : 1;
}

function num(v) {
	return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Silent reading time for the slide's PROSE, ms. Labels are not read; they are scanned, and
 *  `scanTimeMs` charges them. See `measureSlide`'s prose/label split for why that matters. */
function readTimeMs(m) {
	const w = m.proseWords === undefined ? num(m.words) : num(m.proseWords);
	return (w / SILENT_READ_WPM) * 60000;
}

/**
 * Visual scan time, ms — per-kind cost, linear below the knee and logarithmic above it.
 *
 * Two properties the first draft lacked. It is LINEAR at the small end, where a five-element
 * diagram has to price above the existing 1.4 s floor or the model changes nothing; and it
 * prices EDGES highest, because a diagram's cost is tracing its relations, not counting its
 * boxes. Above `SCAN_KNEE_MS` the viewer samples rather than visits, so growth flattens.
 */
function scanTimeMs(m) {
	const raw =
		(num(m.svgMarks) + num(m.cells) + num(m.items) + num(m.labelWords)) * MARK_MS +
		num(m.diagramNodes) * NODE_MS +
		num(m.diagramEdges) * EDGE_MS +
		num(m.images) * IMAGE_MS;
	if (raw <= SCAN_KNEE_MS) return raw;
	// Above the knee the viewer samples: every further doubling of raw cost buys one more knee's
	// worth of looking, not another full multiple. `log` and not `sqrt` because the curve has to
	// stay LINEAR below the knee — that is the range the first run got wrong.
	return SCAN_KNEE_MS * (1 + Math.log(raw / SCAN_KNEE_MS));
}

/**
 * The competing cost models.
 *
 * Each answers "how many milliseconds of looking does this slide owe?" as `cost`, and — separately —
 * "how much of that is payable BEFORE the voice starts?" as `arriveCost`.
 *
 * THE SPLIT IS THE CORRECTION THAT CHANGED THE ANSWER. The first cut charged the arrival beat as a
 * flat share of the whole cost, which made it a plain additive pause: measured over the corpus,
 * **78% of everything the model added was arrival silence, and 84% of that landed on PROSE slides** —
 * the population the record claimed got "no padding". A slide with 83 prose words took 8.5 s of
 * silence before the voice began reading those same 83 words aloud for 56 s.
 *
 * The fix follows from what the arrival beat is FOR. It buys time to take in what the voice is not
 * about to tell you. Prose is exactly what the voice IS about to tell you, so pre-reading silence
 * buys nothing; a chart or a diagram is not, so it buys everything. Hence `arriveCost` reads the
 * LOOK channel only. The read channel still counts toward `cost`, where it is settled at the exit as
 * a residual against narration that has actually happened.
 */
export const ABSORPTION_MODELS = {
	/** A — reading time only. Blind to visuals by construction: a wordless diagram costs 0, which is
	 *  the failure this model is in the bake-off to demonstrate rather than to hide. */
	textTime: {
		id: 'textTime',
		label: 'A · text time',
		cost: (m) => readTimeMs(m),
		arriveCost: () => 0, // nothing here is unspoken; the voice covers all of it
		channels: (m) => ({ read: readTimeMs(m), look: 0 }),
	},

	/** B — how FULL the slide is against its own component's calibrated budget. Falls back to reading
	 *  time for the 32 components declaring no density block. */
	densityFill: {
		id: 'densityFill',
		label: 'B · density fill',
		cost: (m) => {
			if (!m.soft) return readTimeMs(m);
			const marks = num(m.items) || num(m.svgMarks) || num(m.cells) || num(m.diagramNodes) + num(m.diagramEdges);
			return (marks / m.soft) * 3200;
		},
		arriveCost: (m) => (m.soft ? ABSORPTION_MODELS.densityFill.cost(m) * 0.35 : 0),
	},

	/** C — rehearsal.js's own weight, lifted onto the clock unchanged. Blind to a wordless visual. */
	roleWeighted: {
		id: 'roleWeighted',
		label: 'C · role-weighted',
		cost: (m) => Math.max(0.4, (0.6 + num(m.words) / 45) * roleMult(m.role)) * 1600,
		arriveCost: () => 0,
	},

	/** D — what is painted, ignoring words. The mirror of A's blindness. */
	visualCost: {
		id: 'visualCost',
		label: 'D · visual cost',
		cost: (m) => scanTimeMs(m),
		arriveCost: (m) => scanTimeMs(m) * 0.35,
		channels: (m) => ({ read: 0, look: scanTimeMs(m) }),
	},

	/** E — a slide costs the SLOWER of its two channels, scaled by its job; the arrival beat is paid
	 *  from the LOOK channel only. `max` and not a sum because reading and looking are not
	 *  sequential: a viewer scanning a chart's labels does both at once. */
	hybrid: {
		id: 'hybrid',
		label: 'E · hybrid',
		cost: (m) => Math.max(readTimeMs(m), scanTimeMs(m)) * roleMult(m.role),
		arriveCost: (m) => scanTimeMs(m) * roleMult(m.role) * 0.35,
		// The two channels, kept apart so narration can be credited against the RIGHT one.
		channels: (m) => ({ read: readTimeMs(m) * roleMult(m.role), look: scanTimeMs(m) * roleMult(m.role) }),
	},

	/**
	 * T — the CONTROL, and it is not a joke entry.
	 *
	 * "Give every visual slide a fixed hold." Two lines, no measurement, no kernel. It is here
	 * permanently because a cost model that cannot beat it has not earned its module: on the first
	 * bake-off's own metric the flat rule scored 34/34 media slides to model E's 32/34, at a quarter
	 * of the added silence — and the report had no column that could show it. Any future model is
	 * scored against this row, not against the flat 1400 ms nobody was defending.
	 */
	flatVisual: {
		id: 'flatVisual',
		label: 'T · flat control',
		cost: (m) => (m.isVisual ? 3000 : 0),
		arriveCost: () => 0,
		// The control deliberately does NOT take part in the residual — it does not know what the
		// narration cost, because knowing that is precisely what the measured models are for. Running
		// it through the residual would test a different, weaker rule than the one proposed, and
		// would flatter every model it is meant to hold to account.
		flatExit: (m) => (m.isVisual ? 3000 : 0),
	},
};

/**
 * Turn a slide's absorption cost into the two beats a player spends — the SHARED spend rule, so the
 * bake-off compares cost functions and nothing else.
 *
 * `arriveMs` comes from `arriveCost`, the portion of the cost the voice is NOT about to cover (see
 * `ABSORPTION_MODELS`), never from a blanket share of the whole. `exitMs` is the RESIDUAL: what the
 * eye still owes after the arrival beat and after the narration that actually happened. That is what
 * makes a wordy slide cost nothing extra and a wordless diagram cost nearly all of it.
 *
 * A MEDIA component's narration is credited at `mediaNarrationCredit` rather than in full, because
 * the projection deliberately skips its visual (`prose-projection.mjs` `MEDIA_COMPONENTS`) — the
 * voice never described the picture, so it never bought any looking at it.
 *
 * `paceScale` KEEPS THE AUTHOR'S RHYTHM. `resolve-pace.mjs` argues at length that delivery rhythm is
 * the author's directorial choice and travels with the deck; the first cut quietly voided it, because
 * an arrival beat of `max(floor, cost x share)` stops consulting the floor as soon as the cost term
 * outgrows it — above ~27 prose words `brisk`, `natural` and `deliberate` all played identically.
 * Scaling the model's OWN output by the preset ratio (brisk 0.57x, deliberate 1.57x) makes the
 * register a multiplier on the whole model rather than a floor it outgrows.
 *
 * @param {number} costMs   the model's total absorption cost
 * @param {object} opts     `{ arriveCostMs, narrationMs, isMedia, mediaNarrationCredit, floorMs, paceScale }`
 * @returns {{ arriveMs: number, exitMs: number, costMs: number }}
 */
export function spend(costMs, opts = {}) {
	const {
		arriveCostMs = null,
		narrationMs = 0,
		isMedia = false,
		mediaNarrationCredit = 0.25,
		floorMs = 0,
		paceScale = 1,
		flatExitMs = null,
		channels = null,
	} = opts;

	const scale = Number.isFinite(paceScale) && paceScale > 0 ? paceScale : 1;
	const cost = num(costMs) * scale;
	// Back-compatible: a caller that passes no arrive cost gets the old blanket share, so the
	// function still has one meaning for a measure built by hand.
	const arriveCost = arriveCostMs === null ? cost * 0.35 : num(arriveCostMs) * scale;

	// The floor is honored EXACTLY, even above the ceiling: `clampBeat` applies MIN then MAX, so a
	// floor above MAX_BEAT_MS would come back clamped DOWN and quietly break the invariant this
	// function advertises. The floor is the caller's, so the ceiling is advisory against the MODEL's
	// output, not against a deliberate caller-set beat — stated because the two read as symmetric.
	const floor = num(floorMs) * scale;
	const arriveMs = Math.max(floor, clampBeat(Math.max(floor, arriveCost)));

	// What the voice already bought. A prose slide's narration is ABOUT the thing on screen, so it
	// pays down the whole remaining cost; a media slide's narration is not, so it pays little.
	// A model may declare a FLAT exit that skips the residual entirely — the two-line control does,
	// because not knowing the narration time is the whole point of it.
	if (flatExitMs !== null) {
		const flat = num(flatExitMs) * scale;
		return { arriveMs, exitMs: flat > MIN_BEAT_MS ? clampBeat(flat) : 0, costMs: Math.round(cost) };
	}

	// NARRATION IS CREDITED PER CHANNEL, because it buys different things in each.
	//
	// The voice reads the slide's PROSE, so it pays the read channel down in full — on every
	// component, media or not. It does NOT describe the picture (the projection skips a media
	// component's visual by design), so it barely touches the look channel.
	//
	// Blending the two and discounting the whole thing to 25% on a media component is what made a
	// diagram's cost track its CODA rather than its diagram: measured, model E's exit correlated with
	// mark count at 0.12 — its differentiation was noise — because a coda's reading time was being
	// charged at a 75% discount on a slide whose narration reads that very coda aloud. The same flaw
	// gave a `math` slide 18 s of silence around narration that was its own prose.
	const narr = num(narrationMs);
	const ch = channels || { read: cost, look: 0 };
	// The arrival beat is subtracted from BOTH channels, because it is time already spent on the
	// slide — the same seconds were available for reading and for looking. Charging it only against
	// the look channel let total silence exceed the model's own cost by up to 35% (a 6000/6000 slide
	// billed arrive 2100 + exit 6000 = 8100 for a cost of 6000), and it contradicted this function's
	// own docstring, which says the exit is what the eye owes AFTER the arrival beat. The revision
	// before the channel split had this right; the split fixed the media-credit half and broke it.
	const readResidual = num(ch.read) * scale - arriveMs - narr;
	const lookResidual = num(ch.look) * scale - arriveMs - narr * (isMedia ? num(mediaNarrationCredit) : 1);
	// Concurrent, not sequential — the same reason the cost is a `max` and not a sum.
	const residual = Math.max(readResidual, lookResidual);
	const exitMs = residual > MIN_BEAT_MS ? clampBeat(residual) : 0;

	return { arriveMs, exitMs, costMs: Math.round(Math.min(cost, MAX_BEAT_MS * 4)) };
}

/** Hold a beat inside the shared floor/ceiling. A beat of 0 stays 0 — "no beat" is a legitimate
 *  answer and must not be rounded up to the floor. */
function clampBeat(ms) {
	if (!(ms > 0)) return 0;
	return Math.round(Math.min(MAX_BEAT_MS, Math.max(MIN_BEAT_MS, ms)));
}

/**
 * Score a whole deck under one model — the bake-off's unit of comparison.
 *
 * @param {object[]} measures    per-slide measurements from `measureSlide`
 * @param {string} modelId       a key of ABSORPTION_MODELS
 * @param {object} [opts]        passed through to `spend` (per-slide `narrationMs` via `narrationFor`)
 */
export function scoreDeck(measures, modelId, opts = {}) {
	const model = ABSORPTION_MODELS[modelId];
	if (!model) throw new Error(`slide-absorption: unknown model "${modelId}"`);
	const { narrationFor = () => 0, ...spendOpts } = opts;
	return measures.map((m) => {
		const cost = model.cost(m);
		const arriveCostMs = typeof model.arriveCost === 'function' ? model.arriveCost(m) : null;
		const flatExitMs = typeof model.flatExit === 'function' ? model.flatExit(m) : null;
		const channels = typeof model.channels === 'function' ? model.channels(m) : null;
		const beats = spend(cost, { ...spendOpts, arriveCostMs, flatExitMs, channels, narrationMs: narrationFor(m), isMedia: m.isMedia });
		return { ...m, model: modelId, ...beats };
	});
}

export default { measureSlide, diagramMarksOf, roleOf, spend, scoreDeck, ABSORPTION_MODELS, MEDIA_COMPONENTS, TABLE_COMPONENTS, ROLE_MULT };
