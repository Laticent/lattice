/**
 * lib/transformers/prose-projection.mjs
 *
 * The component-aware PROSE PROJECTION (P4 of the HTML player,
 * engineering/decisions/2026-07-07-html-lattice-player.md §A). Projects the
 * SEMANTIC slide DOM into a flowing Typora-style article — the substance behind
 * Read·Article. A SHARED kernel (HARD RULE #1): the self-contained `.html` export
 * (Node/jsdom) and, later, the app-hosted player (browser) both consume it, so it
 * operates on injected DOM nodes and imports nothing external.
 *
 * The insight from the rendered DOM: every component shares a layout skeleton —
 * `.masthead-lede` (eyebrow `p` + `h2`), `.cell-stage` (the real content), and
 * chrome to skip (`header`/`footer`/`.cell-footer`/`.lat-pagination`/`aside`). So
 * the projection extracts heading + body generically and preserves list/table
 * NESTING (never flattening to textContent — the shell's failure), with
 * component-specific prose forms for the buckets where slide layout ≠ prose (§A2):
 *   - anchor  → the article's h1/h2 heading spine (every slide → a TOC entry: the
 *     granularity fix from §A4, not just dividers).
 *   - evidence (kpi/stats) → a <dl> (value → label), not bullets-of-bullets.
 *   - comparison table / any <table> → re-hosted <table>.
 *   - statement `quote` → <blockquote> + a <cite> attribution.
 *   - chart / diagram / imagery / math → a <figure> re-hosting the SVG/img with the
 *     slide title as <figcaption>.
 *   - everything else → its block content cloned in order (lists keep nesting).
 *
 * ESM (`.mjs`) for the same three-toolchain reason as the sanitizer (rollup/docs,
 * esbuild/emulator, node --test via dynamic import).
 *
 * SECURITY: this READS already-sanitized slide DOM and re-emits its markup. The
 * caller MUST sanitize before projecting (the export does — html-player.js sanitizes
 * each section, then projects). This kernel adds no new sink.
 */

// .lattice-description is the slide's sr-only WCAG 1.1.1 text alternative
// (player-core.mjs's playerCss) — a synonym for the content this projection
// already renders as real, readable prose. Read Article needs the article, not
// its own screen-reader summary duplicated ahead of it.
const SKIP_SELECTOR = 'header, footer, .cell-footer, .masthead-bay, .lat-pagination, aside, script, style, .lattice-notes, .lattice-description';

/**
 * The component name — the FIRST token of the authoritative `data-class` (what the
 * author wrote, component always first by engine convention), falling back to
 * `class`. More robust than denylisting modifiers out of the engine-augmented class.
 */
function componentOf(section) {
	const dc = section.getAttribute('data-class') || section.getAttribute('class') || '';
	return dc.split(/\s+/).filter(Boolean)[0] || '';
}

/**
 * The slide's heading text + level. Full-bleed COVERS (title/closing) are the
 * article's h1 spine; a `divider` is an h2 sub-entry (§A2), and content slides are
 * h2 — so the TOC nests correctly instead of every divider competing as an h1.
 */
function headingOf(section, component) {
	const cover = component === 'title' || component === 'closing';
	const h = section.querySelector('.masthead-lede h1, .masthead-lede h2, .masthead-lede h3, :scope > h1, :scope > h2, :scope > h3, h1, h2');
	const text = h ? h.textContent.trim() : '';
	return { text, level: cover ? 1 : 2 };
}

/** The eyebrow/kicker (small label above the heading), if any. */
function eyebrowOf(section) {
	const lede = section.querySelector('.masthead-lede');
	const p = lede ? lede.querySelector(':scope > p') : null;
	const t = p ? p.textContent.trim() : '';
	return t;
}

/** The content root — `.cell-stage` when present, else the section itself. */
function stageOf(section) {
	return section.querySelector('.cell-stage') || section;
}

// Components whose meaning is a rendered visual (chart / diagram / imagery / math):
// re-host the SVG/img as a captioned <figure>, not a flattened list. (A2c's fuller
// data-table projection for spatial charts — map/quadrant/radar — is a refinement
// where the source data survives to the DOM; a figure+caption is the honest v1.)
const MEDIA_COMPONENTS = new Set([
	'funnel', 'journey', 'map', 'piechart', 'quadrant',
	'radar', 'state-chart', 'word-cloud', 'diagram', 'image', 'video', 'math',
]);

// FLOW-HEIGHT charts — table / bar / card / track layouts (roadmap, progress, kanban,
// gantt, timeline-list) that are pure HTML+CSS (no SVG) and reflow at any width: their
// only sizing units are `cqi` (inline), never `cqh`/`cqb`. A raw re-host of their inner
// table/list drops the `section.<comp>`-scoped CSS (state pills collapse, lanes vanish)
// and the bare table overflows a narrow column. Re-hosting the WHOLE `.chart-body` into a
// width-container figure (`container-type: inline-size`, `height: auto` — .lp-chart in
// player-core) re-establishes the `cqi` context, and each component's CSS is broadened
// `section.<comp>` → `:is(section.<comp>, figure.<comp>)` so the layout paints in the
// figure exactly as on the slide. Height is content-driven (no aspect lock, unlike the
// SPATIAL-BOUNDED word cloud). The figure carries `chart-frame` + the authored class list
// so `--chart-cat-*` tokens and variant modifiers resolve.
const FLOW_CHART_COMPONENTS = new Set(['roadmap', 'progress', 'kanban', 'gantt', 'timeline-list']);

/**
 * evidence (kpi / stats): `ol/ul > li > strong + ul(label lines)` → a <dl> of
 * value → label. Returns null if the stage isn't shaped like a stat list.
 */
function projectStats(stage) {
	const list = stage.querySelector(':scope > ol, :scope > ul') || stage.querySelector('ol, ul');
	if (!list) return null;
	const items = [...list.children].filter((li) => li.tagName === 'LI' && li.querySelector(':scope > strong'));
	if (items.length < 2) return null;
	// Keep any subhead / intro prose in the stage that precedes the stat list.
	const pre = [...stage.querySelectorAll('h3, h4, p')]
		.filter((el) => !el.closest(SKIP_SELECTOR) && !list.contains(el) && list.compareDocumentPosition(el) & 0x02 && el.textContent.trim())
		.map((el) => el.outerHTML)
		.join('\n');
	const rows = items.map((li) => {
		const value = li.querySelector(':scope > strong').textContent.trim();
		// Labels keep inline markup (`<code>` pills, `<em>`) — innerHTML of already-
		// sanitized nodes, not textContent.
		const labels = [...li.querySelectorAll(':scope > ul > li')].map((x) => x.innerHTML.trim()).filter(Boolean);
		const label = labels.length ? labels.join(' — ') : esc(li.textContent.replace(value, '').trim());
		return `<dt>${esc(value)}</dt><dd>${label}</dd>`;
	});
	return `${pre}<dl class="lp-stats">${rows.join('')}</dl>`;
}

// Chart components whose SELF-CONTAINED data SVG re-hosts cleanly into a prose figure,
// but whose colours resolve through custom properties scoped to `section.chart-frame`
// (the `--chart-cat-*` spectrum etc.). Re-hosting the SVG into a bare <figure> strips
// that ancestor, so `color-mix(var(--chart-cat-N-hue) …)` collapses to an undefined var
// → the fill falls to its black initial value. The figure carries `chart-frame` back
// (see the `figure.chart-frame` selectors in chart-family.css + each component's CSS) so
// the tokens resolve. Diagram / image / video / math don't ride the chart spectrum, so
// they stay bare. SPATIAL charts (below) don't re-host cleanly and are NOT listed here.
const CHART_TOKEN_COMPONENTS = new Set(['funnel', 'map', 'piechart', 'quadrant', 'radar']);

// SPATIAL-BOUNDED charts — an absolutely-positioned / `cqi`-sized layout (the spiral word
// cloud) that can't re-host as a BARE svg (it overflows/overlaps with no container context)
// but DOES render cleanly when its whole `.chart-body` is re-hosted into a bounded box that
// re-establishes the definite `container-type: size` the `cqi`/`%` layout needs (see
// projectSpatial + `.lp-spatial` in player-core, and the `figure`-scoped component CSS). The
// figure carries `chart-frame` + the component class so colours resolve.
const SPATIAL_BOUNDED_COMPONENTS = new Set(['word-cloud']);

// SPATIAL-PLACEHOLDER charts — a node-and-edge / affect-contour layout that a STATIC re-host
// can't reconstruct, so each keeps the honest "best seen in Present / Read·Slides" placeholder:
//   - state-chart: its EDGES are drawn at runtime by JS measuring the laid-out nodes and baked
//     to the SLIDE's pixel geometry at export; re-hosting at another size reflows the `cqi`
//     nodes but leaves the baked edges pointing at old coordinates (orphan arrows). Fixing it
//     needs the runtime to re-measure in the article box — a player-JS change.
//   - journey: its affect-contour fill is height-relative and doesn't translate from the
//     slide's bounded cell-stage to an article box without ballooning/clipping — needs
//     per-component proportional sizing. (Both tracked follow-ups.)
const SPATIAL_PLACEHOLDER_COMPONENTS = new Set(['journey', 'state-chart']);

/** chart/diagram/imagery/math: re-host the visual as a captioned <figure>. */
function projectMedia(stage, heading, component) {
	const visual = stage.querySelector(':scope svg, :scope img, :scope .katex-display, :scope figure');
	if (!visual) return null;
	const node = visual.tagName === 'FIGURE' ? visual.innerHTML : visual.outerHTML;
	const cap = heading ? `<figcaption>${esc(heading)}</figcaption>` : '';
	// Restore the chart token scope (see CHART_TOKEN_COMPONENTS) so the re-hosted SVG's
	// custom-property colours resolve outside `section.chart-frame`. Charts / diagram (mermaid,
	// now coloured in-figure via the `:is(section, figure)` guard in mermaid.css) / math / images
	// all break out via the breakout grid in player-core.
	const cls = CHART_TOKEN_COMPONENTS.has(component) ? 'lp-figure chart-frame' : 'lp-figure';
	return `<figure class="${cls}">${node}${cap}</figure>`;
}

/**
 * SPATIAL-BOUNDED chart (word-cloud): re-host the WHOLE `.chart-body` (not the bare svg) into a
 * bounded `.lp-spatial` figure. That figure is a definite box (`container-type:size` +
 * `aspect-ratio`, styled in player-core), which re-establishes the `cqi`/`%` layout context the
 * component needs — the same box the slide's `.cell-stage` gave it. `chart-frame` + the component
 * class restore the colour scope (the component CSS is `figure`-broadened). Returns null if the
 * stage has no `.chart-body` (defensive — a word-cloud always has one); the caller then falls
 * through to the generic clone and, failing that, the honest placeholder.
 *
 * Known gap: a word-cloud slide the author explicitly marked `.dark` gets a vivid-ink palette
 * override (`section.dark.word-cloud`) that a plain-selector broadening can't carry to the
 * figure; the re-host falls back to the (still legible) pastel inks. Niche; a real fix keys on
 * the article's own dark mechanism (`data-lp-scheme=dark`) rather than a `.dark` selector. Tracked.
 */
function projectSpatial(stage, heading, component) {
	const bodyEl = stage.querySelector(':scope .chart-body') || stage.querySelector('.chart-body');
	if (!bodyEl) return null;
	const cap = heading ? `<figcaption>${esc(heading)}</figcaption>` : '';
	// `component` is a CSS class token (SPATIAL_BOUNDED_COMPONENTS, e.g. "word-cloud"), but it
	// derives from a slide `class`/`data-class` attribute, so whitelist it to `[a-z0-9-]` before
	// it enters the `class="…"` attribute — `esc()` escapes <&> but NOT `"`, so a stray quote could
	// otherwise break out of the attribute (CodeQL: incomplete HTML attribute sanitization).
	const cls = String(component).replace(/[^a-z0-9-]/gi, '');
	return `<figure class="lp-figure lp-spatial chart-frame ${cls}">${bodyEl.outerHTML}${cap}</figure>`;
}

// The author's per-slide COLOR-SCHEME modifiers. Read·Article owns its own scheme
// (`data-lp-scheme` + `light-dark()` tokens), so a slide the author hard-marked `.dark`
// must NOT drag a dark-tuned chart treatment (e.g. kanban's `.tinted.dark`) into a LIGHT
// article — the re-host should follow the article. These are dropped from the carried
// class list; every other modifier (chart variants like `status`/`swimlane`/`tinted`) is kept.
const SCHEME_MODIFIERS = new Set(['dark', 'light']);

/**
 * The slide's authored class tokens, each whitelisted to `[a-z0-9-]` before entering the
 * figure's `class="…"` attribute (same reason as projectSpatial — `esc()` doesn't escape
 * the double-quote, CodeQL). Carries the component AND its variant modifiers (e.g. roadmap
 * `status`, `swimlane`) so the broadened `:is(section.<comp>, figure.<comp>).<mod>` variant
 * CSS resolves in the re-host, but drops the color-scheme modifiers (see SCHEME_MODIFIERS)
 * so the article's own scheme wins. Reads `data-class` (what the author wrote) then `class`.
 */
function classTokens(section) {
	const dc = section.getAttribute('data-class') || section.getAttribute('class') || '';
	return dc
		.split(/\s+/)
		.map((t) => t.replace(/[^a-z0-9-]/gi, ''))
		.filter((t) => t && !SCHEME_MODIFIERS.has(t))
		.join(' ');
}

/**
 * FLOW-HEIGHT chart (roadmap / progress / kanban / gantt / timeline-list): re-host the WHOLE
 * `.chart-body` into a `.lp-chart` figure — a WIDTH container (`container-type: inline-size`,
 * `height: auto`, styled in player-core), which re-establishes the `cqi` context the layout
 * needs while letting height flow with the content (these layouts have no `cqh`/`cqb`, so a
 * definite height isn't required — unlike the aspect-locked word cloud). `chart-frame` + the
 * authored class list restore the colour tokens + variant modifiers (each component's CSS is
 * `figure`-broadened). Returns null if the stage has no `.chart-body` (the caller then falls
 * through to the generic clone).
 */
function projectFlow(stage, section, heading) {
	const bodyEl = stage.querySelector(':scope .chart-body') || stage.querySelector('.chart-body');
	if (!bodyEl) return null;
	const cap = heading ? `<figcaption>${esc(heading)}</figcaption>` : '';
	return `<figure class="lp-figure lp-chart chart-frame ${classTokens(section)}">${bodyEl.outerHTML}${cap}</figure>`;
}

/** statement `quote`: blockquote + an attribution line as <cite>. */
function projectQuote(stage) {
	const bq = stage.querySelector(':scope > blockquote, blockquote');
	if (!bq) return null;
	const attrib = [...stage.querySelectorAll(':scope > p')].map((p) => p.textContent.trim()).find((t) => /^[—–-]/.test(t));
	return `${bq.outerHTML}${attrib ? `<cite class="lp-cite">${esc(attrib.replace(/^[—–-]\s*/, ''))}</cite>` : ''}`;
}

/**
 * Generic: collect the stage's TOP-MOST content blocks wherever they live —
 * descending THROUGH layout wrapper divs (`.panel-right`, `.code-cols`, …) so
 * components that nest their body (split-panel, compare-code) aren't projected to
 * an empty heading. `querySelectorAll` (not `:scope >`) reaches nested blocks; the
 * `emitted.contains` dedup keeps only the outermost of each, so list/table NESTING
 * is preserved once (a container precedes its descendants in document order).
 */
function projectGeneric(stage, eyebrow) {
	const blocks = [...stage.querySelectorAll('p, ul, ol, blockquote, pre, table, dl, figure, svg, img, h3, h4')];
	const out = [];
	const emitted = [];
	for (const el of blocks) {
		if (el.closest(SKIP_SELECTOR)) continue;
		if (emitted.some((e) => e.contains(el))) continue;
		const isVisual = /^(svg|img)$/i.test(el.tagName);
		const txt = el.textContent.trim();
		if (!txt && !isVisual) continue;
		// Drop a leading eyebrow paragraph we already lift as the kicker.
		if (el.tagName === 'P' && eyebrow && txt === eyebrow) continue;
		emitted.push(el);
		out.push(isVisual ? `<figure class="lp-figure">${el.outerHTML}</figure>` : el.outerHTML);
	}
	return out.join('\n');
}

/**
 * Honest fallback when a component reduces to NO prose (a pure visual layout with no
 * SVG/img — gantt, kanban): a captioned note pointing to the slide views, never an
 * empty heading. (A prose form for these layouts is later-slice work.)
 */
function projectPlaceholder(component, heading) {
	return `<figure class="lp-figure lp-figure-note"><p class="lp-visual-note">This slide's <code>${esc(component)}</code> is a visual layout — best seen in the <strong>Present</strong> or <strong>Read · Slides</strong> view.</p>${heading ? `<figcaption>${esc(heading)}</figcaption>` : ''}</figure>`;
}

function esc(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Project an array of slide `<section>` elements into a Typora-style article.
 *
 * @param {Element[]} sections  sanitized `<section data-lattice-slide>` nodes
 * @returns {{ articleHtml: string, toc: Array<{id:string,level:number,text:string}> }}
 */
export function projectDeckToProse(sections) {
	const toc = [];
	const parts = [];
	sections.forEach((section, idx) => {
		const component = componentOf(section);
		const { text: heading, level } = headingOf(section, component);
		const eyebrow = eyebrowOf(section);
		const stage = stageOf(section);
		const id = `lp-sec-${idx}`;
		const headingText = heading || `Slide ${idx + 1}`;
		toc.push({ id, level, text: headingText });

		if (eyebrow && eyebrow !== heading) parts.push(`<p class="lp-kicker">${esc(eyebrow)}</p>`);
		parts.push(`<h${level} id="${id}">${esc(headingText)}</h${level}>`);

		// Component-specific prose form, falling back to the generic clone, then to an
		// honest placeholder — a slide NEVER projects to an empty heading. A SPATIAL chart
		// goes straight to the placeholder: its SVG re-hosts as orphan fragments or an
		// overflowing overlap, and its raw component lists are noise — better an honest
		// "see the slide" pointer than a broken visual.
		let body = null;
		if (SPATIAL_PLACEHOLDER_COMPONENTS.has(component)) body = projectPlaceholder(component, headingText);
		else if (SPATIAL_BOUNDED_COMPONENTS.has(component)) body = projectSpatial(stage, headingText, component);
		else if (FLOW_CHART_COMPONENTS.has(component)) body = projectFlow(stage, section, headingText);
		else if (component === 'kpi' || component === 'stats') body = projectStats(stage);
		else if (component === 'quote') body = projectQuote(stage);
		else if (MEDIA_COMPONENTS.has(component)) body = projectMedia(stage, headingText, component);
		if (!body?.trim()) body = projectGeneric(stage, eyebrow);
		if (!body?.trim()) body = projectPlaceholder(component, headingText);
		parts.push(body);
	});
	return { articleHtml: parts.join('\n'), toc };
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEECH PROJECTION — projectDeckToSpeech (2026-07-11-manifest-speech-contract.md
// §6 Phase 2). A sibling of projectDeckToProse that emits, per slide, the natural
// spoken NARRATION as DISPLAY text (e.g. "Total revenue: $2.4B, up +9%.") — the
// display→spoken token expansion (units, deltas, currency) happens DOWNSTREAM in
// Cadenza's buildTrack (the Phase 1 normalizer), so this kernel imports nothing
// external, exactly like the prose projection.
//
// Two census-driven design points (§13):
//   F-B — key on the FULL class (variant), not just componentOf's first token: a
//         component's spoken shape can flip by variant.
//   F-C — the per-component PRIMITIVE is one of {reorder | inject | skip |
//         verbatim-guard | generic}, selected by class — not a single reorder.
//
// It NEVER reads a chart/diagram/math visual aloud (skip); the full JS narrator
// tail (table-walkers, state-marker class-readers, chart/diagram/video narrators)
// is Phase 3 and is explicitly out of scope here — this projection degrades those
// to heading + any prose, never SVG gibberish.

/** Collapsed, trimmed textContent of a node (the spoken words, markup dropped). */
function speechText(el) {
	return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

/** Add a sentence terminator unless `t` already ends in one. '' stays ''. */
function terminate(t) {
	const s = String(t || '').trim();
	if (!s) return '';
	return /[.!?;:…]$/.test(s) ? s : `${s}.`;
}

/** "A", "A and B", "A, B, and C" — coordinate a peer list for natural intonation. */
function coordinate(items) {
	const xs = items.filter(Boolean);
	if (xs.length <= 1) return xs.join('');
	if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
	return `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`;
}

/** A token that is NOT a metric name — a delta / value / currency / percent lead
 *  ("+9%", "$2.2B", "42%", "−2pp"). Used to keep such a line from being fronted as
 *  the label in a value-lead tile (which would bind the value to the wrong thing). */
function isValueLike(t) {
	return /^[+\-−]?[\d$£€]/.test(String(t || '').trim()) || /%$/.test(String(t || '').trim());
}

/**
 * kpi / stats — REORDER: value-lead `li > strong (value) + ul(labels)` spoken as
 * "name: value" (the motivating example). The metric NAME is the first label line
 * that reads as a name (not a delta/target/number — a review found a delta-first
 * tile like `+9% / Total revenue` was binding the value to "+9%"); the value
 * follows it, and every other label line trails as a secondary clause. A tile whose
 * `strong` isn't value-like (a stray emphasized sentence on a stats slide) is NOT
 * reordered — it reads plainly. Returns null when nothing is a value-lead tile.
 */
function speakStats(stage) {
	const list = stage.querySelector(':scope > ol, :scope > ul') || stage.querySelector('ol, ul');
	if (!list) return null;
	const items = [...list.children].filter((li) => li.tagName === 'LI');
	// A tile is an li carrying a value in `strong` (at ANY depth — some layouts wrap
	// it in a div). Bail only when NO item is a tile (then it isn't a stat list).
	if (!items.some((li) => li.querySelector('strong'))) return null;
	// Preserve any intro/subhead prose BEFORE the list (mirrors projectStats' `pre`),
	// so a stats slide's lead sentence isn't dropped when speakStats short-circuits.
	const pre = [...stage.querySelectorAll('h3, h4, p')]
		.filter((el) => !el.closest(SKIP_SELECTOR) && !list.contains(el) && list.compareDocumentPosition(el) & 0x02 && speechText(el))
		.map((el) => terminate(speechText(el)));
	const sentences = items.map((li) => {
		const strong = li.querySelector('strong');
		if (!strong) return terminate(speechText(li)); // a non-tile li (a footnote) — kept, never dropped
		const value = speechText(strong);
		// Residual inline text on the li (a label typed after the value, or a tail
		// qualifier) — the li's text minus the value and any nested list.
		const clone = li.cloneNode(true);
		for (const n of [...clone.querySelectorAll('strong'), ...clone.querySelectorAll(':scope > ul, :scope > ol')]) n.remove();
		const inline = speechText(clone);
		const nested = [...li.querySelectorAll(':scope > ul > li')].map((x) => speechText(x)).filter(Boolean);
		const labels = [inline, ...nested].filter(Boolean);
		if (!isValueLike(value) || !labels.length) {
			// Not a metric value, or a value with no label — read plainly, no false binding.
			return terminate([value, ...labels].join(', '));
		}
		// Front the first NAME-like label; deltas/targets/pills stay as trailing clauses.
		const nameIdx = labels.findIndex((l) => !isValueLike(l));
		const idx = nameIdx >= 0 ? nameIdx : 0;
		const name = labels[idx];
		const rest = labels.filter((_, i) => i !== idx);
		let s = `${name}: ${value}`;
		if (rest.length) s += `, ${rest.join(', ')}`;
		return terminate(s);
	});
	return [...pre, ...sentences].join(' ');
}

/** statement `quote` — VERBATIM-GUARD: the quote as-is, then "— attribution" as a clause. */
function speakQuote(stage) {
	const bq = stage.querySelector(':scope > blockquote, blockquote');
	if (!bq) return null;
	const quote = terminate(speechText(bq));
	const attrib = [...stage.querySelectorAll(':scope > p')]
		.map((p) => speechText(p))
		.find((t) => /^[—–-]/.test(t));
	return attrib ? `${quote} ${terminate(attrib.replace(/^[—–-]\s*/, ''))}` : quote;
}

/**
 * A `<table>` — a HEADER-BOUND row read ("Row X — Col: value; Col: value"), but
 * ONLY when a real header row exists (a `<thead>` row, or a first row of `<th>`);
 * otherwise there is NO column binding (reading a headerless table's first row as
 * "headers" fabricated column facts — a review finding), so every row is read
 * linearly. The richer per-component table-walkers (roadmap, obligation-matrix,
 * gantt, …) and reading the state-marker CSS classes are Phase 3. Returns '' when
 * the table has no usable rows.
 */
function speakTable(table, wordMap = null) {
	// Own rows/cells only (`:scope`-scoped), so a NESTED table's rows/cells are never
	// pulled into this table's read. jsdom/HTML parsing wraps bare `<tr>` in a tbody.
	const ownRows = (root) => [...root.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr')];
	const allRows = ownRows(table).filter((tr) => tr.querySelector(':scope > th, :scope > td'));
	if (!allRows.length) return '';
	const headerRow = table.querySelector(':scope > thead > tr') || (allRows[0].querySelector(':scope > th') ? allRows[0] : null);
	// A cell's text; a list inside a cell is coordinated ("hire, and train"), not
	// concatenated ("hiretrain"); a stripped state marker becomes its state word
	// ("yes"/"no"/"partial") — a bare-marker cell (obligation-matrix) would else
	// read as empty and lose the whole obligation mapping.
	const cellText = (c) => {
		const inner = c.querySelector(':scope > ul, :scope > ol');
		if (inner) return coordinate([...inner.children].filter((x) => x.tagName === 'LI').map((x) => speechText(x)));
		const txt = speechText(c);
		const sw = stateWordOf(c, wordMap);
		if (sw) return txt ? `${txt}, ${sw}` : sw;
		return txt;
	};
	const headers = headerRow ? [...headerRow.querySelectorAll(':scope > th, :scope > td')].map(cellText) : [];
	const body = headerRow ? allRows.filter((r) => r !== headerRow) : allRows;
	if (!body.length) return '';
	const sentences = body.map((tr) => {
		const cells = [...tr.querySelectorAll(':scope > th, :scope > td')].map(cellText);
		const key = cells[0] || '';
		const rest = cells
			.slice(1)
			.map((v, i) => (headers[i + 1] ? `${headers[i + 1]}: ${v}` : v))
			.filter((s) => s && !/:\s*$/.test(s));
		return terminate(rest.length ? `${key} — ${rest.join('; ')}` : key);
	});
	return sentences.join(' ');
}

// State markers ([x]/[-]/[ ]/[/]) render with the GLYPH STRIPPED, their meaning
// surviving only in a CSS class (plugins.js stateClassesFor) — on the `<li>`
// (checklist), a `.badge` span (verdict-grid/pricing), or a `.state` span in a
// `<td>` (obligation-matrix). Without reading the class, "passes Residency, fails
// SOC 2" narrates as just "Residency. SOC 2." — the whole point silently dropped.
//
// The sem→word map is COMPONENT-KEYED, not global: the SAME palette class means
// different things per component (checklist `[ ]`=todo="to do"; obligation-matrix
// `[ ]`=todo="EXEMPT" — a near-antonym; a review proved a flat map narrated exempt
// as "pending"). Each component's map matches its own register (completion /
// inclusion / obligation). obligation-matrix's `heat` variant only recolors — its
// marker MEANINGS are identical to the default — so it uses the same map (no
// suppression). A component with no map here reads no state (returns '').
const WORD_MAPS = {
	checklist: { pass: 'done', warn: 'partial', skip: 'skipped', todo: 'to do', fail: 'not done' },
	'verdict-grid': { pass: 'yes', warn: 'partial', skip: 'skipped', todo: 'pending', fail: 'no' },
	pricing: { pass: 'included', warn: 'partial', skip: 'not included', todo: 'not included', fail: 'not included' },
	'obligation-matrix': { pass: 'applies', warn: 'partial', skip: 'exempt', todo: 'exempt', fail: 'does not apply' },
};
const STATE_SHAPE_RE = /\bstate-(full|half|empty|slashed|todo)\b/;
const STATE_SEM_RE = /\b(pass|warn|skip|todo|fail)\b/;

/** Resolve the component's state word map (or null → don't read state). */
function stateWordMapFor(component) {
	return WORD_MAPS[component] || null;
}

/** The spoken state word for an element carrying a state-marker class, mapped
 *  through this component's `wordMap`, or '' when it carries none / has no map. */
function stateWordOf(el, wordMap) {
	if (!wordMap || !el || typeof el.className !== 'string') return '';
	// The marker is on the element itself (checklist `<li>`) or a DIRECT-child
	// `.badge`/`.state` span — also one `<p>` wrapper deep, because a LOOSE inner
	// list wraps the item's inline content in `<p>` (verdict-grid/pricing). Never a
	// descendant in a nested sub-item (which would tag a parent with its child's
	// state): a parent card's `:scope > p` holds only its text, never a badge.
	const marked = STATE_SHAPE_RE.test(el.className)
		? el
		: el.querySelector?.(':scope > .badge, :scope > .state, :scope > p > .badge, :scope > p > .state');
	const cls = marked && typeof marked.className === 'string' ? marked.className : '';
	if (!STATE_SHAPE_RE.test(cls)) return '';
	const m = cls.match(STATE_SEM_RE);
	return m ? wordMap[m[1]] : '';
}

/** Render a list's items to an ARRAY of "lead" or "lead: body" strings, recursing
 *  through nesting WITHOUT mashing text: each item's own lead is read from a clone
 *  with its sub-lists removed (so a 3-level list never runs "Design" into
 *  "wireframes"), and a nested list is coordinated (all leaves) or recursed. When
 *  `wordMap` (a component's state map, or null), an item's stripped state marker
 *  is appended ("Encryption: done"). */
function renderListItems(list, wordMap = null) {
	const lis = [...list.children].filter((li) => li.tagName === 'LI');
	return lis.map((li) => {
		const sub = li.querySelector(':scope > ul, :scope > ol');
		const clone = li.cloneNode(true);
		for (const n of [...clone.querySelectorAll(':scope > ul, :scope > ol')]) n.remove();
		const lead = speechText(clone).replace(/[:—–-]\s*$/, '');
		const sw = stateWordOf(li, wordMap);
		if (!sub) {
			if (sw) return lead ? `${lead}: ${sw}` : sw;
			return lead;
		}
		const subLis = [...sub.children].filter((x) => x.tagName === 'LI');
		const allLeaves = subLis.every((x) => !x.querySelector(':scope > ul, :scope > ol'));
		const body = allLeaves
			? coordinate(subLis.map((x) => (stateWordOf(x, wordMap) ? `${speechText(x)}: ${stateWordOf(x, wordMap)}` : speechText(x))))
			: renderListItems(sub, wordMap).join(', ');
		const head = sw ? `${lead} (${sw})` : lead;
		return head ? `${head}: ${body}` : body;
	});
}

/**
 * GENERIC walker — the fallback for every component without a dedicated primitive.
 * Walks the stage's top-most blocks in document order and speaks them naturally:
 * a paragraph as a sentence; a `<dl>` as "term: definition" pairs (wifi/contact
 * ledgers); a nested `- Title` / `  - body` list item as "Title: body" (HARD RULE
 * #5) with sibling coordination; a table via speakTable. Descends through layout
 * wrapper divs but is text-only. Never emits table-pipe or bullet glyphs.
 */
function speakGeneric(stage, eyebrow, wordMap = null) {
	// `figcaption` is included so a media component's caption (its one prose slot,
	// the visual itself being skipped) is still narrated.
	const blocks = [...stage.querySelectorAll('p, ul, ol, dl, blockquote, table, figcaption, h3, h4')];
	const out = [];
	const consumed = [];
	for (const el of blocks) {
		if (el.closest(SKIP_SELECTOR)) continue;
		if (consumed.some((e) => e.contains(el))) continue;
		const txt = speechText(el);
		if (!txt) continue;
		if (el.tagName === 'P' && eyebrow && txt === eyebrow) continue; // lifted as kicker
		consumed.push(el);
		if (el.tagName === 'TABLE') {
			const t = speakTable(el, wordMap);
			if (t) out.push(t);
			continue;
		}
		if (el.tagName === 'DL') {
			// term → definition ("Network: ACME-Guest.") — a dt with no dd reads alone.
			const kids = [...el.children];
			const pairs = [];
			for (let i = 0; i < kids.length; i++) {
				if (kids[i].tagName !== 'DT') continue;
				const dt = speechText(kids[i]);
				const dd = kids[i + 1] && kids[i + 1].tagName === 'DD' ? speechText(kids[i + 1]) : '';
				pairs.push(terminate(dd ? `${dt}: ${dd}` : dt));
			}
			if (pairs.length) out.push(pairs.join(' '));
			continue;
		}
		if (el.tagName === 'UL' || el.tagName === 'OL') {
			out.push(renderListItems(el, wordMap).map(terminate).join(' '));
			continue;
		}
		out.push(terminate(txt));
	}
	return out.join(' ');
}

/**
 * Project each slide `<section>` to its natural spoken narration (DISPLAY text;
 * the downstream buildTrack normalizes tokens to spoken form). Aligned 1:1 with
 * `sections`; a slide with nothing to say projects to ''. The caller pairs this
 * with authored speaker notes (note ?? projected) and feeds buildReadAlong.
 *
 * @param {Element[]} sections  sanitized `<section data-lattice-slide>` nodes
 * @returns {string[]}          per-slide narration, same order/length as sections
 */
export function projectDeckToSpeech(sections) {
	return sections.map((section) => {
		const component = componentOf(section);
		const { text: heading } = headingOf(section, component);
		const eyebrow = eyebrowOf(section);
		const stage = stageOf(section);

		// Lead: eyebrow (context) then heading (frame) — reading order (§13 anchor).
		const lead = [];
		if (eyebrow && eyebrow !== heading) lead.push(terminate(eyebrow));
		if (heading) lead.push(terminate(heading));

		// The component's COMPONENT-KEYED state word map (F-B), or null (read no
		// state). obligation-matrix's `heat` variant only recolors — its marker
		// MEANINGS are identical to the default — so it uses the same map, no special
		// case.
		const wordMap = stateWordMapFor(component);

		// Primitive by class (F-C). A media component SKIPS its visual — heading +
		// eyebrow + any prose caption only, never the SVG.
		let body = '';
		if (component === 'kpi' || component === 'stats') body = speakStats(stage) || speakGeneric(stage, eyebrow, wordMap);
		else if (component === 'quote') body = speakQuote(stage) || speakGeneric(stage, eyebrow, wordMap);
		else if (MEDIA_COMPONENTS.has(component)) body = speakGeneric(stage, eyebrow, wordMap); // prose caption only; visual skipped
		else body = speakGeneric(stage, eyebrow, wordMap);

		return [...lead, body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
	});
}

export default { projectDeckToProse, projectDeckToSpeech };
