// THE CHART-REVEAL MODEL — how a rendered chart's marks and detail payload are read, hit and
// emphasized. One copy for every surface that opens a chart's detail card (HARD RULE #1):
//   - the Studio, Playground and Present, through docs/src/playground/chart-interact.js, which
//     reaches the slide across a same-origin iframe and draws the card in the parent;
//   - the exported HTML player, through ./reveal.mjs, where the slides are in the same document.
// Framework-free and host-free: every function takes the section, chart and coordinates it works
// on, and none of them knows about an iframe, a stage or a popover library.
// engineering/decisions/2026-11-16-cenno-popover-library.md §7; the vocabulary is
// engineering/decisions/2026-06-20-chart-detail-reveal-family.md.

// The chart ROOT the interaction scopes to. Tier-1 roots are the SVG sheet itself (the marks are
// SVG elements). Tier-2 roots are HTML containers (the marks are HTML elements — state-chart nodes
// today): the root is the figure, so its nodes and edge overlay are one scope (the figure must NOT
// contain the inert .chart-details payload, or its <template data-mark> would be miscounted as a
// mark — the kernels emit the payload as a sibling).
// Every entry is the chart's own <svg>, which is what the Anima host mounts as the live clone — so
// the same selector finds the static poster AND the animated copy. The state-chart lists BOTH its
// figure and its `.state-chart-edges` svg: the figure is the static root (and still holds the
// measuring column's marks), while the svg is what gets cloned onto the live stage, so listing only
// the figure would leave the popover unbound during motion.
export const CHART_SVG_SEL =
	'.bar-svg, .bullet-svg, .line-svg, .scatter-svg, .slope-svg, .stacked-bar-svg, .waterfall-svg, .tower-svg, .risk-matrix-svg, .histogram-svg, .ep-curve-svg, .piechart-svg, .funnel-svg, .map-svg, .quadrant-svg, .radar-svg, .hub-spoke-svg, .heatmap-svg, .state-chart-figure, .state-chart-edges, .flowchart-svg, .gantt-svg';
// The same list scoped to the Anima live stage — each selector must be prefixed individually (a bare
// `.scene-live ${CHART_SVG_SEL}` would only scope the FIRST of the comma list). Prefers the clone
// EXPLICITLY over inferring visibility from box size (see chartSvgIn).
export const LIVE_CHART_SVG_SEL = CHART_SVG_SEL.split(',')
	.map((s) => `.scene-live ${s.trim()}`)
	.join(', ');
export const DETAILS_SEL = '.chart-details';
export const TPL_SEL = 'template.chart-detail';
export const MARK_SEL = '[data-mark]';
// A TAP PROXY — text that names one mark (a slope entity's name and values, a funnel stage's label,
// a bar's, stacked bar's, bullet's or waterfall's category and value, a quadrant dot's name, a pie or
// map legend row) carries `data-mark-for="i"`. It is a separate attribute from `data-mark` so the
// proxy never becomes a mark: `chartToScene` strokes every highlighted `[data-mark]` and the Present
// Guide ranks `[data-label]` nodes, and neither should see the labels as marks. Two readers use the
// link: the reveal, which dims a label with its mark and (see `namedMark`) opens its card on a tap,
// and the Present Guide's `focusUnit`.
export const PROXY_SEL = '[data-mark-for]';

/** The data index a mark carries, or -1 for anything that is not a mark. */
export function markIndex(el) {
	if (!el) return -1;
	const v = el.dataset?.mark;
	return v == null ? -1 : Number(v);
}

/**
 * The chart svg to bind to in a section — the visible one when a chart has both a hidden poster and
 * a live animated clone. PREFER the Anima clone EXPLICITLY: it is mounted inside `.scene-live` (the
 * host's live stage), so a direct `.scene-live` query is robust to HOW the poster is hidden. Only if
 * there is no live stage (a static chart) fall back to the "has a box" heuristic — which works ONLY
 * because the Anima host hides the poster with `display:none` → zero box; a future
 * `visibility:hidden`/`opacity:0` would keep a box and fool the heuristic, but NOT the explicit
 * `.scene-live` query (docs/src/lib/chart-anima.ts flags the coupling).
 */
export function chartSvgIn(sec) {
	if (!sec) return null;
	const live = sec.querySelector(LIVE_CHART_SVG_SEL);
	if (live) return live;
	const all = [...sec.querySelectorAll(CHART_SVG_SEL)];
	return all.find((s) => s.getBoundingClientRect().width > 0) || all[0] || null;
}

/** The chart root that contains `el`, if any. */
export function chartOf(el) {
	return el?.closest?.(CHART_SVG_SEL) || null;
}

// Marks are the addressable data elements INSIDE the chart (pie wedges, funnel bands, map regions,
// quadrant dots, radar axis labels). Scoping to the chart excludes the inert <template> payloads
// (they live in a sibling .chart-details div) and legend swatches (no data-mark).
export const markEls = (svg) => (svg ? [...svg.querySelectorAll(MARK_SEL)] : []);
export const marksFor = (svg, i) => markEls(svg).filter((m) => markIndex(m) === i);
// Distinct mark indices present (a map group shares one index across regions), so number keys and
// range checks count data points, not DOM nodes.
export const markCount = (svg) => new Set(markEls(svg).map(markIndex).filter((n) => n >= 0)).size;

/**
 * Whether mark index i can open. By the marks THEMSELVES, not a count: indices can have gaps (a bar
 * whose value is not a number draws no rect, so marks run 0, 2), and a count of 2 locked mark 2 —
 * and its name, since the name became a tap target — out of ever opening. `fallbackN` (the template
 * count) covers a chart whose marks do not query.
 */
export function revealable(svg, i, fallbackN = 0) {
	return i >= 0 && (marksFor(svg, i).length > 0 || (!markCount(svg) && i < fallbackN));
}

/**
 * A mark whose own text IS its label (the radar's axis labels). True for a <text> node with no
 * element children AND for one whose only children are the <tspan> lines a wrapped label emits.
 */
export function isTextMark(el) {
	if (!el.textContent?.trim()) return false;
	const kids = el.children ? [...el.children] : [];
	return kids.every((k) => k.tagName?.toLowerCase() === 'tspan');
}

/** The visible text of a node whose lines may be split across <tspan>s, joined with a space. */
export function tspanText(el) {
	const spans = el.querySelectorAll?.('tspan') || [];
	return (spans.length ? [...spans].map((s) => s.textContent.trim()).join(' ') : el.textContent).trim();
}

function textOf(sec, sel, i) {
	const n = sec?.querySelectorAll(sel)[i];
	return n ? tspanText(n) : '';
}

/**
 * Title / value / color for mark i, from whichever source the kind provides:
 *   label — the mark's data-label (funnel/map/quadrant) · its own text node (radar axis label) ·
 *           the legend row (a pie has no text on a wedge).
 *   value — data-value · the legend value column (pie).
 *   dot   — the legend swatch's computed fill (pie/map gradients are URL refs) · else the mark's
 *           own computed fill · null when there is no real color (the dot is hidden).
 */
export function infoFor(sec, svg, i) {
	const el = marksFor(svg, i)[0] || null;
	let label = '';
	let value = '';
	if (el && el.dataset.label != null) {
		label = el.dataset.label;
		value = el.dataset.value || '';
	} else if (el && isTextMark(el)) {
		// A radar axis label IS the text node, split across <tspan> lines when it wraps; reading it
		// as "no child elements" would fail every wrapped label and fall through to a SERIES name.
		label = tspanText(el);
	} else {
		label = textOf(sec, '.chart-key-label', i);
		value = textOf(sec, '.chart-key-value', i);
	}
	const swatch = sec?.querySelectorAll('.chart-key-swatch')[i];
	// Reject the SVG `fill` INITIAL (black) an HTML box computes to, transparents, and a paint-server
	// reference (`url("#cart-fill-…")` on every gradient-filled bar, band and wedge): as a CSS
	// background it paints nothing, so the card showed an EMPTY dot that still took its space.
	// Rejecting it falls through to the mark's stroke, which is its real outline color.
	const usable = (c) => (c && c !== 'none' && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)' && !c.startsWith('url(') ? c : null);
	let dot = null;
	try {
		if (swatch) {
			dot = usable((swatch.ownerDocument?.defaultView || globalThis).getComputedStyle(swatch).fill) || 'currentColor';
		} else if (el) {
			const cs = (el.ownerDocument?.defaultView || globalThis).getComputedStyle(el);
			dot =
				typeof el.getBBox === 'function'
					? // SVG mark — fill (or stroke) IS the wedge color.
						usable(cs.fill) || usable(cs.stroke) || 'currentColor'
					: // HTML mark (gantt bar, state node): `fill` is the SVG initial (black) on an HTML box.
						// These paint their status as the left ACCENT BORDER; read that resolved color, but
						// only when a left border exists. No accent → null → the dot is hidden.
						cs.borderLeftStyle !== 'none' && Number.parseFloat(cs.borderLeftWidth) > 0
						? usable(cs.borderLeftColor)
						: null;
		}
	} catch {
		/* cross-doc / detached */
	}
	return { label, value, dot };
}

/**
 * The authored detail for mark i: the template's OWN `<li>` children, in order. The first is the
 * description (rich Markdown, which may hold a list of its own — so this never takes nested `li`s);
 * the rest are the meta line. lib/plugins/chart-family/shared/mark-detail.js writes the payload.
 * A mark with no body and no meta is LEAN: it gets a compact value chip, not the full card
 * (engineering/decisions/2026-06-21-chart-reveal-lean-tooltip.md).
 */
export function detailFor(detailsEl, i) {
	const tpl = detailsEl?.querySelector(`${TPL_SEL}[data-mark="${i}"]`) || null;
	const items = tpl ? [...tpl.content.children].filter((n) => n.tagName === 'LI') : [];
	const body = items[0] || null;
	const meta = items.slice(1);
	return { body, meta, lean: !body && !meta.length };
}

/**
 * The mark a piece of TEXT names, or -1 — a tap proxy (`data-mark-for`, see PROXY_SEL). A pie or
 * map LEGEND row is one too: the legend kernel stamps it only when the chart says which mark the row
 * names, so a legend of SERIES (line, stacked-bar, radar) stays inert.
 * The label must name ONE card: no mark at n would open an empty card; marks at n that name
 * different things (a stacked bar's segments) would open the first one's card. Either way the label
 * still recedes with its bar; it just stops being a tap target. A map region split over several
 * paths shares one name, so it stays a target.
 */
export function namedMark(t, svg) {
	if (!t || !svg?.contains(t)) return -1;
	const px = t.closest?.(PROXY_SEL);
	if (!px) return -1;
	const n = Number(px.getAttribute('data-mark-for'));
	if (!Number.isInteger(n) || n < 0) return -1;
	const marks = marksFor(svg, n);
	if (!marks.length) return -1;
	const names = new Set(marks.map((m) => m.dataset?.label).filter((l) => l != null));
	return names.size <= 1 ? n : -1;
}

/**
 * NEAR-MISS hit-testing: the THIN-MARK problem. `elementFromPoint` only finds a mark when the pointer
 * is ON its painted geometry. A slope chart's marks are its LINES, about 1.5 slide px wide: on a phone
 * the slide is scaled to roughly a third, so the stroke is under one screen pixel and a finger
 * practically never lands on it. So when a point misses every mark, take the nearest mark whose
 * OUTLINE is within `reach` (in the svg document's CSS px — the caller converts from screen px). The
 * distance is measured to points sampled along each mark's outline, not to its box: a slope line's
 * box is the whole diagonal and overlaps its neighbors', so the box would pick the wrong line at a
 * crossing. A mark the pointer is actually ON still wins outright (the caller tries that first).
 */
export function nearestMark(svg, x, y, reach) {
	if (!svg || !(reach > 0)) return -1;
	let best = -1;
	let bestD = reach;
	for (const m of svg.querySelectorAll(MARK_SEL)) {
		if (typeof m.getTotalLength !== 'function') continue;
		let ctm;
		let L;
		try {
			ctm = m.getScreenCTM();
			L = m.getTotalLength();
		} catch {
			continue;
		}
		if (!ctm || !(L > 0)) continue;
		// One sample every ~3 document px along the outline, bounded both ways.
		const n = Math.max(12, Math.min(240, Math.ceil((L * Math.hypot(ctm.a, ctm.b)) / 3)));
		for (let k = 0; k <= n; k++) {
			const p = m.getPointAtLength((L * k) / n);
			const px = ctm.a * p.x + ctm.c * p.y + ctm.e;
			const py = ctm.b * p.x + ctm.d * p.y + ctm.f;
			const dd = Math.hypot(px - x, py - y);
			if (dd < bestD) {
				bestD = dd;
				best = markIndex(m);
			}
		}
	}
	return best;
}

/**
 * The mark under a point, by the three rules in order: the mark the target is (or is inside), the
 * mark a text label names, the nearest mark within reach. `x`/`y`/`reach` are in the svg document's
 * CSS px. Returns -1 when the point is not on, at, or near a mark of `svg`.
 */
export function markAt(svg, target, x, y, reach) {
	const hit = markIndex(target?.closest?.(MARK_SEL));
	if (hit >= 0 && svg?.contains(target)) return hit;
	const named = namedMark(target, svg);
	return named >= 0 ? named : nearestMark(svg, x, y, reach);
}

/**
 * HOLD ZONE: the open mark's CURRENT box (after its lift) grown by `pad` (document px). A pointer
 * that slips off the mark into empty chart — the gap between two bars, the hairline between a
 * stepped-out wedge and the hub, the rim of a grown dot — keeps the card instead of closing it and
 * re-opening it a frame later. Landing on a DIFFERENT mark still switches at once (the caller tests
 * marks first), so the zone only ever decides "keep or close", never "which".
 */
export function inHoldZone(svg, i, x, y, pad) {
	if (i < 0) return false;
	return marksFor(svg, i).some((m) => {
		let r;
		try {
			r = m.getBoundingClientRect();
		} catch {
			return false;
		}
		return r.width > 0 && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
	});
}

/** A section's own scale: rendered width over layout width (1 when unscaled). */
export function sectionScale(sec) {
	try {
		return sec?.offsetWidth ? sec.getBoundingClientRect().width / sec.offsetWidth : 1;
	} catch {
		return 1;
	}
}

// ── EMPHASIS: dim the rest, lift the one — and never move the data ──────────────────────────────
//
// Depth comes from ELEVATION, not rotation: the active mark casts a soft two-layer shadow (a tight
// contact shadow plus a wide ambient one), so it reads as lifted toward the viewer while its
// geometry stays exactly where the data puts it. (A `perspective() rotateX()` tilt and a push away
// from the mean of mark centers were tried and removed: the tilt keystoned bars into trapezoids and
// skewed every label, and the push moved the value and moved the mark out from under the cursor.)
// On top of that, each GEOMETRY gets the one extra move it can carry without lying — keyed off the
// `data-anima-role` every chart kernel already stamps:
//   sector (pie wedge)        → steps out along its own bisector from the true disc center, by 3% of
//                               the radius. An exploded slice is the pie's native emphasis, and it
//                               keeps the slice's angle, which is the value.
//   point  (scatter/quadrant) → grows about its own center by a fixed ~3 slide px of radius. The
//                               center (the value) never moves.
//   everything else           → elevation only.
// A text mark (the radar's axis labels) and an HTML mark (the state-chart's measuring <li>) take the
// dim and the class only — a shadow on type blurs it.
// A MATRIX chart (the heatmap) takes the dim and the class but NO lift: a shadow or a grow on one
// tile spills over the neighbors it shares an edge with, and a matrix locates a value by the
// intersection of two labels. Its emphasis is the dim: every other tile drops to 0.45.
// An ANIMATED chart's live svg is the Anima clone, whose marks carry the renderer's baked
// final-frame transform/opacity; the dim/lift would OVERWRITE those and shift the settled chart, so
// for an anima chart the reveal touches no mark at all.
//
// Sizes are authored in SLIDE px (a 1280-wide slide) and converted to the svg's own user units, so a
// lift looks the same on a pie drawn in a 400-unit viewBox and a map drawn in a 1000-unit one.
export const DIM = '0.45';
const EASE = 'cubic-bezier(.2,.7,.3,1)';
const SECTOR_OUT = 0.03;
const POINT_GROW = 3;
const POINT_MAX = 1.5;

export const isAnimaChart = (svg) => !!svg?.closest?.('.scene-live');
export const isMatrixChart = (svg) => !!svg?.classList?.contains('heatmap-svg');

// User units per slide px for mark `w`. getScreenCTM maps user units → document px, which includes
// the section's own fit-scale; dividing that back out leaves slide px.
function unitsPerSlidePx(w) {
	try {
		const a = w.getScreenCTM?.()?.a;
		return a ? sectionScale(w.closest?.('section')) / a : 1;
	} catch {
		return 1;
	}
}

function liftShadow(w) {
	const u = unitsPerSlidePx(w);
	const n = (v) => (v * u).toFixed(2);
	return `drop-shadow(0 ${n(1)}px ${n(1.5)}px rgba(0,0,0,.18)) drop-shadow(0 ${n(6)}px ${n(10)}px rgba(0,0,0,.16))`;
}

// A pie wedge's outward step: the circular mean of the directions from the disc center to points
// sampled along the wedge's outline, skipping the hub. The disc center is the middle of the union of
// every wedge's box, which is exact for a whole pie.
function sectorStep(w, all) {
	try {
		let x0 = Number.POSITIVE_INFINITY;
		let y0 = Number.POSITIVE_INFINITY;
		let x1 = Number.NEGATIVE_INFINITY;
		let y1 = Number.NEGATIVE_INFINITY;
		for (const o of all) {
			const b = o.getBBox();
			x0 = Math.min(x0, b.x);
			y0 = Math.min(y0, b.y);
			x1 = Math.max(x1, b.x + b.width);
			y1 = Math.max(y1, b.y + b.height);
		}
		const cx = (x0 + x1) / 2;
		const cy = (y0 + y1) / 2;
		const R = Math.max(x1 - x0, y1 - y0) / 2;
		const L = w.getTotalLength();
		let sx = 0;
		let sy = 0;
		for (let k = 0; k < 48; k++) {
			const p = w.getPointAtLength((L * k) / 48);
			const dx = p.x - cx;
			const dy = p.y - cy;
			const d = Math.hypot(dx, dy);
			if (d > R * 0.2) {
				sx += dx / d;
				sy += dy / d;
			}
		}
		const len = Math.hypot(sx, sy);
		if (!R || len < 1e-3) return ''; // a lone full-circle slice has no "out"
		const out = R * SECTOR_OUT;
		return `translate(${((sx / len) * out).toFixed(2)}px, ${((sy / len) * out).toFixed(2)}px)`;
	} catch {
		return '';
	}
}

function pointGrow(w) {
	try {
		const r = w.r?.baseVal?.value;
		if (!r) return '';
		const rPx = r / unitsPerSlidePx(w);
		return `scale(${Math.min(POINT_MAX, 1 + POINT_GROW / rPx).toFixed(3)})`;
	} catch {
		return '';
	}
}

function emphasisFor(svg, w, marks, lift) {
	if (typeof w.getBBox !== 'function' || isMatrixChart(svg)) return { transform: '', filter: '' };
	if (w.tagName?.toLowerCase() === 'text') return { transform: '', filter: '' };
	const filter = liftShadow(w);
	// A mark with its own `transform` attribute would lose it to a CSS transform (the property
	// replaces the attribute), so such a mark keeps its shadow and skips the geometric move.
	if (!lift || w.hasAttribute('transform')) return { transform: '', filter };
	const role = w.dataset?.animaRole;
	if (role === 'sector') return { transform: sectorStep(w, marks.filter((o) => o.dataset?.animaRole === 'sector')), filter };
	if (role === 'point') return { transform: pointGrow(w), filter };
	return { transform: '', filter };
}

/**
 * Emphasize mark i of `svg`: every other mark (and every other mark's label) dims, mark i lifts.
 * `lift` is the geometric half (a slice steps out, a dot grows); `reduced` turns transitions off.
 */
export function emphasize(svg, i, { lift = true, reduced = false } = {}) {
	if (!svg || isAnimaChart(svg)) return;
	const marks = markEls(svg);
	const tr = reduced ? 'none' : `transform .24s ${EASE}, opacity .2s ease, filter .24s ${EASE}`;
	for (const w of marks) {
		const active = markIndex(w) === i;
		const { transform, filter } = active ? emphasisFor(svg, w, marks, lift && !reduced) : { transform: '', filter: '' };
		w.style.transition = tr;
		w.style.opacity = active ? '1' : DIM;
		// A point grows about its OWN center. Set on every point, active or not, and never reset: a
		// dot shrinking back must ease about its own center too, not jump to the svg origin.
		if (w.dataset?.animaRole === 'point') {
			w.style.transformBox = 'fill-box';
			w.style.transformOrigin = 'center';
		}
		w.style.transform = transform;
		w.style.filter = filter;
		// CSS emphasis hook — lets a chart style its active mark (the gantt bar's ink edge).
		w.classList?.toggle('chart-mark-active', active);
	}
	// The proxies dim with their marks, so the open entry's own name and values stay at full strength.
	for (const p of svg.querySelectorAll(PROXY_SEL)) {
		p.style.transition = reduced ? 'none' : 'opacity .2s ease';
		p.style.opacity = Number(p.getAttribute('data-mark-for')) === i ? '' : DIM;
	}
}

/**
 * Put every mark back. The transition stays on, so the exit eases out the way the entry eased in.
 * A no-op on an anima chart, whose inline styles are the renderer's baked frame.
 */
export function unemphasize(svg) {
	if (!svg || isAnimaChart(svg)) return;
	for (const w of markEls(svg)) {
		w.style.opacity = '';
		w.style.transform = '';
		w.style.filter = '';
		w.classList?.remove('chart-mark-active');
	}
	for (const p of svg.querySelectorAll(PROXY_SEL)) p.style.opacity = '';
}
