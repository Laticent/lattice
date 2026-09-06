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
 *  sr-only description (a duplicate of the content, not more content to absorb). */
const SKIP_SELECTOR =
	'header, footer, .cell-footer, .masthead-bay, .lat-pagination, aside, script, style, .lattice-notes, .lattice-description';

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

/** Table-shaped components — dense reference a reader scans rather than reads. Mirrors
 *  rehearsal.js's TABLE_COMPS so role derivation agrees across the two surfaces. */
const TABLE_COMPONENTS = new Set([
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
 *   NODE   a labelled box in a diagram — READ. It holds words, so it costs a short read.
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
 * Count a stage's words, split prose from label.
 *
 * Walks TEXT NODES rather than reading `textContent` on the stage. `textContent` concatenates
 * adjacent elements with NO separator — `<p>…three</p><text>alpha</text>` yields
 * "…threealpha", one word where there are two — so a subtract-the-chrome approach silently
 * undercounts every slide whose markup has no whitespace between blocks. Real rendered HTML
 * usually has newlines and usually got away with it; a jsdom fixture does not, and neither
 * does minified markup.
 *
 * A text node is charged unless it sits inside chrome or a fence, and is classified PROSE when
 * a prose ancestor governs it and no `<svg>` does — an svg is a picture even when its markup
 * borrows a prose tag.
 */
function countWords(stage) {
	let proseWords = 0;
	let labelWords = 0;
	if (!stage?.ownerDocument || typeof stage.ownerDocument.createTreeWalker !== 'function') {
		return { proseWords, labelWords };
	}
	const walker = stage.ownerDocument.createTreeWalker(stage, 4 /* NodeFilter.SHOW_TEXT */);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const n = wordCount(node.nodeValue);
		if (!n) continue;
		const el = node.parentElement;
		if (!el || el.closest(SKIP_SELECTOR) || el.closest(SOURCE_SELECTOR)) continue;
		if (el.closest(PROSE_SELECTOR) && !el.closest('svg')) proseWords += n;
		else labelWords += n;
	}
	return { proseWords, labelWords };
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
function stageOf(section) {
	return section.querySelector('.cell-stage') || section;
}

/**
 * Count matching descendants that are NOT inside slide chrome.
 *
 * `closest()` rather than a parent walk: chrome nests (a `.cell-footer` inside a `footer`),
 * and a node is content only when NO ancestor is chrome. jsdom and every browser implement
 * `closest` on Element, which is the whole DOM surface this kernel assumes.
 */
function countContent(root, selector) {
	if (!root || typeof root.querySelectorAll !== 'function') return 0;
	let n = 0;
	for (const el of root.querySelectorAll(selector)) {
		if (!el.closest?.(SKIP_SELECTOR)) n += 1;
	}
	return n;
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
	if (bucket === 'imagery' || bucket === 'chart' || bucket === 'diagram') return 'visual';
	if (lastish) return 'close';
	return 'body';
}

/**
 * MEASURE one rendered slide — the raw counts every cost model scores from.
 *
 * Structural only: node counts and text length, never computed style or geometry. That is
 * what lets the same measurement run under jsdom on the export path and in the browser on
 * the live one, and it is why HARD RULE #20's warning about margins does not bite here —
 * nothing measured is a box height.
 *
 * @param {Element} section  a sanitized `<section data-lattice-slide>` node
 * @param {object} [ctx]     `{ index, total, catalog, bucketOf }`
 * @returns {object} the measurement record
 */
export function measureSlide(section, ctx = {}) {
	const { index = 0, total = 1, catalog = null, bucketOf = null } = ctx;
	const component = componentOf(section);
	const stage = stageOf(section);

	// Visible text, split into PROSE (read left to right at reading speed) and LABELS (scanned
	// wherever the eye lands — chart axis text, diagram node text).
	const { proseWords, labelWords } = countWords(stage);
	const words = proseWords + labelWords;

	// Items on the component's density axis. `li`/`dt`/`tr` cover the item shapes the catalog's
	// axes name; a component declaring its own `domSelector` overrides that with its real one.
	const declared = catalog?.[component] ? catalog[component] : null;
	const items = declared?.domSelector
		? countContent(stage, declared.domSelector)
		: countContent(stage, 'li, dt, tr');

	// Painted marks. An SVG's leaf shapes and its text labels are what a viewer's eye actually
	// lands on; `<g>` groups are containers, not marks, so they are excluded deliberately.
	const svgMarks = countContent(stage, 'svg path, svg rect, svg circle, svg ellipse, svg polygon, svg polyline, svg line, svg text');
	const images = countContent(stage, 'img, image, video, figure');
	const cells = countContent(stage, 'td, th');

	// A diagram's marks: the drawn SVG where a browser has drawn one, else an estimate off the
	// fence source. One measure, both render paths — see `diagramMarksOf`.
	let diagramNodes = 0;
	let diagramEdges = 0;
	if (stage && typeof stage.querySelectorAll === 'function') {
		for (const el of stage.querySelectorAll('code[class*="language-mermaid"], pre.mermaid, .mermaid')) {
			if (el.querySelector?.('svg')) continue; // drawn — svgMarks already has it
			const { nodes, edges } = diagramMarksOf(el.textContent);
			diagramNodes += nodes;
			diagramEdges += edges;
		}
	}

	const text = stage ? String(stage.textContent ?? '') : '';
	const role = roleOf(component, index, total, text, bucketOf);

	return {
		index,
		component,
		role,
		isMedia: MEDIA_COMPONENTS.has(component),
		words,
		proseWords,
		labelWords,
		items,
		svgMarks,
		images,
		cells,
		diagramNodes,
		diagramEdges,
		/** The component's calibrated crowding budget, when it declares one. */
		soft: declared ? declared.soft ?? null : null,
		hard: declared ? declared.hard ?? null : null,
	};
}

/**
 * Estimate a Mermaid diagram's mark count from its SOURCE, for the paths where nothing has
 * drawn it yet.
 *
 * WHY THIS EXISTS AT ALL. The obvious measure — count the `<svg>`'s shapes — only works where a
 * browser has run Mermaid. On the CLI/export path (and in jsdom generally) the slide holds the
 * DSL text and no marks, so a DOM-only model scores every diagram in the tree at ZERO and
 * concludes diagrams need no time. That was the first bake-off run's D column: spread 1.0x, one
 * slide out of thirty-four given a beat. The failure was in the instrument, not in the idea.
 *
 * So the count comes from the source when the SVG is absent: an edge is an arrow operator, a node
 * is a bracketed declaration. Deliberately shallow — it does not parse Mermaid, and it does not
 * need to. Absorption is scored through a sqrt curve, so being out by a node or two moves the beat
 * by tens of milliseconds. Being out by "there is a diagram here at all" moves it by seconds.
 *
 * Every arrow form Mermaid's flowchart/sequence/state/class grammars use to mean an edge:
 * `-->` `---` `-.->` `==>` `->>` `--x` `--o` `<|--` `*--` `o--`. Matching the ARROW rather than
 * the line keeps it grammar-agnostic across diagram types, which is the property that matters —
 * a new Mermaid diagram type still counts its edges.
 */
export function diagramMarksOf(source) {
	const src = String(source ?? '');
	if (!src.trim()) return { nodes: 0, edges: 0 };
	const edges = (src.match(/(-{2,3}>|-{3}|-\.->|={2,}>|->>|--[xo]|<\|--|\*--|o--)/g) || []).length;
	// A node DECLARATION carries a shape bracket: `A[label]`, `B(label)`, `C{label}`, `D[(label)]`.
	// Counting declarations rather than identifier occurrences avoids charging a node once per edge
	// it appears in — a five-node star would otherwise measure as nine.
	const declared = src.match(/\b[A-Za-z_][\w-]*(?=\s*[[({])/g) || [];
	// Grammars that declare no shape — `classDiagram`, `stateDiagram`, `sequenceDiagram` — name
	// their nodes as bare identifiers either side of an edge operator. Taking the identifiers
	// ADJACENT to an arrow catches those without parsing any one grammar; a class diagram scored
	// zero nodes before this, so a three-class diagram priced as two lonely edges.
	const adjacent = src.match(/([A-Za-z_][\w-]*)\s*(?:-{2,3}>|-{3}|-\.->|={2,}>|->>|--[xo]|<\|--|\*--|o--)\s*([A-Za-z_][\w-]*)?/g) || [];
	const names = new Set(declared);
	for (const pair of adjacent) {
		for (const id of pair.match(/[A-Za-z_][\w-]*/g) || []) names.add(id);
	}
	return { nodes: names.size, edges };
}

/** Silent reading time for the slide's PROSE, ms. Labels are not read; they are scanned, and
 *  `scanTimeMs` charges them. See `measureSlide`'s prose/label split for why that matters. */
function readTimeMs(m) {
	const w = m.proseWords === undefined ? m.words : m.proseWords;
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
		(m.svgMarks + m.cells + m.items + (m.labelWords || 0)) * MARK_MS +
		m.diagramNodes * NODE_MS +
		m.diagramEdges * EDGE_MS +
		m.images * IMAGE_MS;
	if (raw <= SCAN_KNEE_MS) return raw;
	// Above the knee the viewer samples: every further doubling of raw cost buys one more knee's
	// worth of looking, not another full multiple. `log` and not `sqrt` because the curve has to
	// stay LINEAR below the knee — that is the range the first run got wrong.
	return SCAN_KNEE_MS * (1 + Math.log(raw / SCAN_KNEE_MS));
}

/**
 * The five competing cost models. Each takes a measurement and returns the slide's total
 * absorption cost in ms — the number `spend()` divides into an arrive beat and an exit hold.
 */
export const ABSORPTION_MODELS = {
	/** A — reading time only. The shape both existing `readMs` twins use, applied slide-wide.
	 *  Blind to visuals by construction: a wordless diagram costs 0, which is the failure this
	 *  model is in the bake-off to demonstrate rather than to hide. */
	textTime: {
		id: 'textTime',
		label: 'A · text time',
		cost: (m) => readTimeMs(m),
	},

	/** B — how FULL the slide is against its own component's calibrated budget. A slide at its
	 *  `soft` limit is as crowded as that layout is meant to get, so cost scales with the fill
	 *  ratio rather than with a raw count that means something different per component. Falls
	 *  back to reading time for the 32 components declaring no density block. */
	densityFill: {
		id: 'densityFill',
		label: 'B · density fill',
		cost: (m) => {
			if (!m.soft) return readTimeMs(m);
			const marks = m.items || m.svgMarks || m.cells || m.diagramNodes + m.diagramEdges;
			return (marks / m.soft) * 3200;
		},
	},

	/** C — rehearsal.js's own weight, lifted onto the clock unchanged: role multiplier times a
	 *  word-density term. This is the repo's existing content-weight model, so it is the one
	 *  candidate that costs nothing new to justify. Still blind to a wordless visual. */
	roleWeighted: {
		id: 'roleWeighted',
		label: 'C · role-weighted',
		cost: (m) => Math.max(0.4, (0.6 + m.words / 45) * (ROLE_MULT[m.role] || 1)) * 1600,
	},

	/** D — what is painted, ignoring words. The only model that can see a diagram, and the
	 *  mirror of A's blindness: a dense prose slide with no marks costs nothing. */
	visualCost: {
		id: 'visualCost',
		label: 'D · visual cost',
		cost: (m) => scanTimeMs(m),
	},

	/** E — a slide costs the SLOWER of its two channels, scaled by its job. `max` and not a sum
	 *  because reading and looking are not sequential: a viewer scanning a chart's labels is
	 *  doing both at once, and summing double-charges every slide that has words AND marks. */
	hybrid: {
		id: 'hybrid',
		label: 'E · hybrid',
		cost: (m) => Math.max(readTimeMs(m), scanTimeMs(m)) * (ROLE_MULT[m.role] || 1),
	},
};

/**
 * Turn one absorption cost into the two beats a player spends — the SHARED spend rule, so
 * the bake-off compares cost functions and nothing else.
 *
 * `arriveShare` is the fraction of the cost paid up front, before the voice starts. It is not
 * 1: holding a slide's whole cost in silence before speaking would feel like a stall, and the
 * voice itself buys absorption time while it runs. The remainder is settled at the END as a
 * RESIDUAL against what narration actually took — which is what makes a wordy slide cost
 * nothing extra and a silent diagram cost nearly all of it.
 *
 * A MEDIA component's exit is not discounted by narration the way a prose slide's is: its
 * narration deliberately skips the visual (prose-projection.mjs), so the voice never bought
 * any of the looking. `mediaNarrationCredit` is the fraction of narration time that counts
 * against a media slide's cost — small, and separately tunable from the prose path.
 *
 * @param {number} costMs        the model's absorption cost
 * @param {object} opts          `{ narrationMs, isMedia, arriveShare, mediaNarrationCredit, floorMs }`
 * @returns {{ arriveMs: number, exitMs: number, costMs: number }}
 */
export function spend(costMs, opts = {}) {
	const {
		narrationMs = 0,
		isMedia = false,
		arriveShare = 0.35,
		mediaNarrationCredit = 0.25,
		floorMs = 0,
	} = opts;

	const cost = Number.isFinite(costMs) && costMs > 0 ? costMs : 0;
	// The arrive beat never drops below the caller's floor — that floor is the existing flat
	// `slideBeatMs`, so no slide gets a SHORTER arrival than it has today. This model can only
	// add breathing room, which is what makes it safe to land behind the existing pace presets.
	const arriveMs = clampBeat(Math.max(floorMs, cost * arriveShare));

	// What the voice already bought. A prose slide's narration is ABOUT the thing on screen, so
	// it pays down the whole remaining cost; a media slide's narration is not, so it pays little.
	const credit = Math.max(0, narrationMs) * (isMedia ? mediaNarrationCredit : 1);
	const residual = cost - arriveMs - credit;
	const exitMs = residual > MIN_BEAT_MS ? clampBeat(residual) : 0;

	return { arriveMs, exitMs, costMs: Math.round(cost) };
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
		const beats = spend(cost, { ...spendOpts, narrationMs: narrationFor(m), isMedia: m.isMedia });
		return { ...m, model: modelId, ...beats };
	});
}

export default { measureSlide, diagramMarksOf, roleOf, spend, scoreDeck, ABSORPTION_MODELS, MEDIA_COMPONENTS, ROLE_MULT };
