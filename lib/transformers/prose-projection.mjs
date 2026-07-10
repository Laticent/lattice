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
	'funnel', 'gantt', 'journey', 'kanban', 'map', 'piechart', 'progress', 'quadrant',
	'radar', 'roadmap', 'state-chart', 'timeline-list', 'word-cloud', 'diagram', 'image', 'video', 'math',
]);

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

/** chart/diagram/imagery/math: re-host the visual as a captioned <figure>. */
function projectMedia(stage, heading) {
	const visual = stage.querySelector(':scope svg, :scope img, :scope .katex-display, :scope figure');
	if (!visual) return null;
	const node = visual.tagName === 'FIGURE' ? visual.innerHTML : visual.outerHTML;
	const cap = heading ? `<figcaption>${esc(heading)}</figcaption>` : '';
	return `<figure class="lp-figure">${node}${cap}</figure>`;
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
		// honest placeholder — a slide NEVER projects to an empty heading.
		let body = null;
		if (component === 'kpi' || component === 'stats') body = projectStats(stage);
		else if (component === 'quote') body = projectQuote(stage);
		else if (MEDIA_COMPONENTS.has(component)) body = projectMedia(stage, headingText);
		if (!body?.trim()) body = projectGeneric(stage, eyebrow);
		if (!body?.trim()) body = projectPlaceholder(component, headingText);
		parts.push(body);
	});
	return { articleHtml: parts.join('\n'), toc };
}

export default { projectDeckToProse };
