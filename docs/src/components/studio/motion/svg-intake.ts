// SVG INTAKE — the doorway a brought drawing passes before it earns a plan.
//
// This is the pure kernel of the Fabricate Motion faculty (design:
// `engineering/decisions/2026-09-06-fabricate-motion-design.md`). It takes the bytes a person
// pasted or dropped and returns three things: the ART we will store, the PARTS they can
// choreograph, and a RECEIPT saying exactly what we did to their drawing on the way.
//
// The receipt is the reason this module exists rather than a three-line sanitize call. Two of the
// commonest real-world exports come through the security boundary looking perfectly healthy and
// painting NOTHING:
//
//   • Illustrator's "Style Elements" option puts every fill in one `<style>` block and references
//     it by class. `<style>` is in `FORBID_TAGS`, so the rules die and the classes survive.
//   • An icon sprite or a Figma component instance is `<symbol>` + `<use>`. DOMPurify deletes
//     `<use>` by its own default; the `<defs>` survive, so a node count still looks right.
//
// Both are pinned in real Chromium by `docs/e2e/svg-paste-guard.spec.ts`. A faculty that sanitized
// silently would hand back a blank stage and the user would blame the faculty, so intake DIFFS what
// it did and names the fix.
//
// ORDER IS LOAD-BEARING, and each step is here for a measured reason:
//
//   1. normalize      — LF + no BOM. A BOM SURVIVES the sanitizer as a text node, so it would ride
//                       into the stored art, the poster, and the author's markdown line.
//   2. harvest hints  — `inkscape:label` and `serif:id` are DESTROYED by the sanitizer, and they are
//                       what Inkscape and Affinity name layers with. Read them off an inert parse
//                       first; they are treated as data (ASCII-filtered, length-capped), never markup.
//   3. expand <use>   — BEFORE the sanitizer deletes it. Inlining a same-document reference is a
//                       lossless rewrite (craft ADR §8.1), and it is what saves every sprite export.
//   4. sanitize       — the security boundary (HARD RULE #22). Everything downstream is on this string.
//   5. strip net-new  — `<image>` (including an OFF-ORIGIN href), `<animateTransform>` and
//                       `<animateMotion>` SURVIVE DOMPurify and are removed later by `svg-paint.ts`'s
//                       STRIP_TAGS. Without this step the stored drawing is not the painted drawing,
//                       and a deck exported to HTML carries a tracker into every recipient's copy.
//   6. namespace ids  — a deck is ONE document. `id="a"`, `id="clip0"`, `id="gradient1"` are what every
//                       exporter writes, so two assets on one deck (or one inserted twice) make every
//                       `url(#a)` in the second resolve to the first. The painter is safe — it scopes
//                       `querySelectorAll('[id]')` to its own parsed clone — but the DECK is not.
//   7. viewBox        — no coordinate box breaks three things at once: `aspectFromSvgTag` picks the
//                       slide composition from it, `svgSize` falls back to a hardcoded 300x150, and
//                       the place-word namer measures against it.
//   8. census + bands — which nodes are addressable, and the shallowest readable cut of the tree.
//   9. name           — the hint cascade, ASCII, deduped.
//
// TWO TRAPS THAT LOOK LIKE STYLE AND ARE NOT:
//
//   • DOMPurify strips the `id` ATTRIBUTE while KEEPING the element for a set of document/form
//     property names — measured: `body, head, title, name, style, length, action, id, children,
//     firstChild, ownerDocument`. Case-sensitive, so `Body` survives. A Figma file whose layers are
//     named Body and Title would choreograph perfectly here and animate nothing in the deck. Our
//     namespace prefix (step 6) makes every id start with `m<hash>-`, so no minted id can ever land
//     in that set. THE PREFIX IS STRUCTURAL, NOT COSMETIC — do not "simplify" it away.
//   • `svg-paint.ts` builds its part map from `svg.querySelectorAll('[id]')`, which CANNOT match the
//     root element, and `mount()` still returns true. So a band or an "as one drawing" address must
//     go through a synthesized wrapper `<g>` — never the root.
//
// Pure and DOM-only: it parses with `DOMParser` (inert — scripts do not run, subresources do not
// load, the same primitive `svg-paint.ts` uses) and never attaches a node to the live document.

import { normalizeSourceText } from '@/lib/normalize-source-text';
import { sanitizeSlideHtml } from '@/lib/sanitize-slide-html.js';

/** Tags anime.js can actually stroke. `drawable.ts` calls `createDrawable(node)`, which stamps
 *  `pathLength="1000"` and writes normalized `stroke-dasharray` on THAT node — so on a `<g>` or
 *  `<text>` the dash values are inherited by children whose real lengths are in user units, and the
 *  group flashes on instead of drawing. It does not throw, so nothing reports it. */
const GEOMETRY_TAGS = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);

/** Containers whose contents never paint on their own. Their ids are still namespaced (step 6);
 *  they are simply not offered as parts, because animating one addresses a node nobody can see. */
const NON_PAINTING_CONTAINERS = new Set(['defs', 'clippath', 'mask', 'marker', 'symbol', 'pattern', 'lineargradient', 'radialgradient', 'filter']);

/** Removed AFTER the sanitizer, because DOMPurify keeps them and `svg-paint.ts` does not.
 *  Keeping the two in step means the stored drawing equals the painted drawing. */
const NET_NEW_STRIPS = new Set(['image', 'animatetransform', 'animatemotion']);

/** Attributes that can carry a `url(#id)` reference we must rewrite when we namespace. */
const REF_ATTRS = ['fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'style'];

/** The measured ceilings (craft ADR §10.1). Across this repo's 82 non-flag SVGs — the kind of asset
 *  someone would actually choreograph — the median is 1.3 KB, p90 2.7 KB, and the largest 28.7 KB.
 *  So the warning sits past the p99 of genuine design assets and the refusal at double the largest. */
export const ART_WARN_BYTES = 24 * 1024;
export const ART_MAX_BYTES = 64 * 1024;

/** Presentation cap AND binning trigger — deliberately the same number, so band count grows with the
 *  drawing instead of flattening it (an earlier draft binned above 12 and capped at 24, which made a
 *  13-part drawing collapse into two bands of 6 — worse than the 12-part drawing beside it). */
export const MAX_ROWS = 24;

/** Bounds on `<use>` expansion — a sprite can reference a sprite. Exceeding either aborts the whole
 *  pass rather than shipping a half-expanded drawing. */
export const USE_DEPTH_CAP = 4;
export const USE_NODE_CAP = 4000;

export type PartTag = string;

export interface IntakePart {
	/** The machine address: the namespaced id. Always resolvable by `svg-paint.ts`'s `[id]` map. */
	pathRef: string;
	/** The human name, shown in the running order. Round-trips through the art's `<title>`. */
	label: string;
	tag: PartTag;
	/** Can carry Draw — an `SVGGeometryElement` tag, never a group or text. */
	drawable: boolean;
	/** Can carry Emphasize — `highlight` paints stroke-width only, so a fill-only shape is inert. */
	strokeable: boolean;
	/** A synthesized band wrapping `childCount` shapes, created only when the cut exceeded MAX_ROWS. */
	band: boolean;
	childCount: number;
}

export interface IntakeReceipt {
	parts: number;
	bands: number;
	artBytes: number;
	rewritten: { usesExpanded: number; idsNamespaced: number; duplicateIds: number; bandsCreated: number; viewBoxStamped: boolean; titlesKept: number };
	removed: { stylesheets: number; images: number; smil: number; unsafe: number; unresolvedUses: number };
	kept: { fixedColors: number };
	/** Non-blocking notes, already phrased for the user. */
	notes: string[];
}

export type IntakeFailure = 'not-svg' | 'no-coordinate-box' | 'nothing-survived' | 'too-big' | 'expansion-aborted';

export type IntakeResult =
	| { ok: true; art: string; parts: IntakePart[]; viewBox: [number, number, number, number]; receipt: IntakeReceipt }
	| { ok: false; failure: IntakeFailure; message: string; receipt: IntakeReceipt };

function emptyReceipt(): IntakeReceipt {
	return {
		parts: 0,
		bands: 0,
		artBytes: 0,
		rewritten: { usesExpanded: 0, idsNamespaced: 0, duplicateIds: 0, bandsCreated: 0, viewBoxStamped: false, titlesKept: 0 },
		removed: { stylesheets: 0, images: 0, smil: 0, unsafe: 0, unresolvedUses: 0 },
		kept: { fixedColors: 0 },
		notes: [],
	};
}

const tag = (el: Element): string => el.tagName.toLowerCase();

/** Parse inertly. `text/html` rather than `image/svg+xml` on purpose: HTML parsing infers the SVG
 *  namespace, so markup without an explicit `xmlns` still becomes real SVG — the same choice
 *  `svg-paint.ts` documents. A DOMParser document is inert: no scripts, no subresource loads. */
function parseInert(markup: string): SVGSVGElement | null {
	const doc = new DOMParser().parseFromString(markup, 'text/html');
	return doc.querySelector('svg');
}

/** A short, stable namespace for one drawing's ids. Content-derived so the same bytes give the same
 *  prefix — which is what makes a re-paste of an unchanged drawing reconcile cleanly. */
export function artNamespace(markup: string): string {
	let h = 2166136261;
	for (let i = 0; i < markup.length; i++) {
		h ^= markup.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return `m${(h >>> 0).toString(36)}`;
}

// ── Step 2 · harvest the naming hints the sanitizer is about to destroy ──────────────────────────

/** A label harvested from the drawing, keyed by the author id it sat on. Values are DATA: filtered
 *  to a safe character set and length-capped before they ever reach a React tree. */
export type HintMap = Map<string, string>;

/** Trim an author-supplied string down to something safe to show and to slug. */
function cleanLabel(raw: string | null | undefined): string {
	if (!raw) return '';
	return raw
		.replace(/[^A-Za-z0-9 _.-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 32)
		.trim();
}

/** `inkscape:label` and `serif:id` are what Inkscape and Affinity name layers with, and BOTH are
 *  stripped by the sanitizer. Read them off the inert pre-sanitize parse, keyed by the author id so
 *  they can be reattached after namespacing. Illustrator's `data-name`, `<title>` and `aria-label`
 *  survive, so they are read later from the sanitized art and are not harvested here. */
export function harvestHints(svg: SVGSVGElement): HintMap {
	const hints: HintMap = new Map();
	for (const el of Array.from(svg.querySelectorAll('*'))) {
		const id = el.getAttribute('id');
		if (!id) continue;
		const label = cleanLabel(el.getAttribute('inkscape:label') || el.getAttribute('serif:id'));
		if (label) hints.set(id, label);
	}
	return hints;
}

// ── Step 3 · expand <use> before the sanitizer deletes it ───────────────────────────────────────

export interface ExpandOutcome {
	expanded: number;
	unresolved: number;
	/** True when a cap was hit. The caller ABORTS rather than shipping a half-expanded drawing. */
	aborted: boolean;
}

/**
 * Inline every same-document `<use>`, in place, on the inert hint document.
 *
 * The craft ADR (§8.1) asks for this by name: `<use>` is a reference to a node already in the
 * document, so inlining it before sanitizing is lossless — and it is the difference between a
 * sprite export choreographing normally and arriving as an empty box.
 *
 * The clone's ids are STRIPPED: two copies of one symbol would otherwise duplicate every id inside
 * it, and `svg-paint.ts`'s node map is first-wins, so the second copy would be unaddressable while
 * looking fine. Stripped ids are re-minted by the census, which names by structure anyway.
 */
export function expandUses(svg: SVGSVGElement): ExpandOutcome {
	const doc = svg.ownerDocument;
	let expanded = 0;
	let unresolved = 0;
	let budget = USE_NODE_CAP;

	for (let depth = 0; depth < USE_DEPTH_CAP; depth++) {
		const uses = Array.from(svg.querySelectorAll('use'));
		if (uses.length === 0) return { expanded, unresolved, aborted: false };

		for (const use of uses) {
			const ref = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
			const id = ref.startsWith('#') ? ref.slice(1) : '';
			// `getElementById` is document-wide; scope it back to this svg so a reference cannot reach
			// out of the drawing. A self-reference (a symbol containing the use that draws it) is a
			// cycle and is dropped rather than followed.
			const found = id ? doc.getElementById(id) : null;
			const target = found && svg.contains(found) && !found.contains(use) ? found : null;
			if (!target) {
				use.remove();
				unresolved++;
				continue;
			}

			const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
			// `x`/`y` on a `<use>` are equivalent to a translate applied after its own transform.
			const x = Number(use.getAttribute('x') || 0);
			const y = Number(use.getAttribute('y') || 0);
			const t = [use.getAttribute('transform') || '', x || y ? `translate(${x} ${y})` : ''].filter(Boolean).join(' ');
			if (t) g.setAttribute('transform', t);
			for (const attr of Array.from(use.attributes)) {
				const n = attr.name.toLowerCase();
				if (n === 'href' || n === 'xlink:href' || n === 'x' || n === 'y' || n === 'transform') continue;
				try {
					g.setAttribute(attr.name, attr.value);
				} catch {
					/* a namespaced attribute the target document rejects — not worth failing the paste over */
				}
			}

			// A `<symbol>` or nested `<svg>` contributes its CHILDREN; anything else is cloned whole.
			const targetTag = tag(target);
			const contributes = targetTag === 'symbol' || targetTag === 'svg' ? Array.from(target.children) : [target];
			for (const node of contributes) {
				budget -= 1 + node.querySelectorAll('*').length;
				if (budget < 0) return { expanded, unresolved, aborted: true };
				g.appendChild(node.cloneNode(true));
			}
			for (const idEl of Array.from(g.querySelectorAll('[id]'))) idEl.removeAttribute('id');

			use.replaceWith(g);
			expanded++;
		}
	}
	// Still `<use>` nodes after the depth cap — nesting deeper than we follow.
	return { expanded, unresolved, aborted: svg.querySelector('use') != null };
}

// ── Step 6 · namespace every id, and rewrite every reference to it ──────────────────────────────

/** Escape a string for use inside a RegExp. */
function escapeReg(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface NamespaceOutcome {
	renamed: number;
	duplicates: number;
}

/**
 * Prefix every id with `ns-` and rewrite every reference that pointed at it.
 *
 * Two failures this prevents, both silent:
 *  • Two assets on one deck. `id="a"` / `id="clip0"` / `id="gradient1"` are what every exporter
 *    writes, so the second asset's `url(#clip0)` resolves to the FIRST asset's clip path. The
 *    painter is safe (it scopes its map to its own parsed clone) but the deck is not, and the same
 *    corruption hits one asset inserted twice.
 *  • A duplicate id inside ONE drawing. `svg-paint.ts`'s node map is first-wins and `parseScene`
 *    rejects a duplicate `pathRef`, so the later twin is unaddressable. De-duplicated here.
 *
 * The prefix also makes every id start with `m<hash>-`, which is what keeps a minted id out of
 * DOMPurify's clobbering set (`body`, `title`, `name`, …) — where the id ATTRIBUTE is stripped while
 * the element survives. Structural, not cosmetic.
 */
export function namespaceIds(svg: SVGSVGElement, ns: string): NamespaceOutcome {
	const rename = new Map<string, string>();
	const taken = new Set<string>();
	let duplicates = 0;

	for (const el of Array.from(svg.querySelectorAll('[id]'))) {
		const old = el.getAttribute('id');
		if (!old) continue;
		let next = `${ns}-${old}`;
		if (taken.has(next)) {
			duplicates++;
			let n = 2;
			while (taken.has(`${next}-${n}`)) n++;
			next = `${next}-${n}`;
		}
		taken.add(next);
		el.setAttribute('id', next);
		// A duplicated author id maps to the FIRST rewrite — matching the painter's first-wins map,
		// so a `url(#dup)` reference keeps pointing where it pointed before.
		if (!rename.has(old)) rename.set(old, next);
	}
	if (rename.size === 0) return { renamed: 0, duplicates };

	// Longest-first so `#foo` cannot eat the head of `#foobar`; the trailing guard stops a match at
	// the end. A FUNCTION replacement, never a string: an id can contain `$&` / `$'`, which
	// `String.replace` would expand in a string replacement and corrupt the reference into a
	// dangling pointer. (The same reasoning `chart-anima.ts` records for its own namespacing pass.)
	const olds = Array.from(rename.keys()).sort((a, b) => b.length - a.length);
	for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
		for (const name of el.getAttributeNames()) {
			if (name !== 'href' && name !== 'xlink:href' && !REF_ATTRS.includes(name)) continue;
			const val = el.getAttribute(name);
			if (!val || val.indexOf('#') === -1) continue;
			let out = val;
			for (const old of olds) {
				if (out.indexOf(`#${old}`) === -1) continue;
				const next = rename.get(old);
				out = out.replace(new RegExp(`#${escapeReg(old)}(?![\\w-])`, 'g'), () => `#${next}`);
			}
			if (out !== val) el.setAttribute(name, out);
		}
	}
	return { renamed: rename.size, duplicates };
}

// ── Step 7 · a coordinate box, because three things break without one ───────────────────────────

type Box = [number, number, number, number];

/** Read four finite numbers out of a `viewBox`, or null. */
function readViewBox(svg: SVGSVGElement): Box | null {
	const vb = svg.getAttribute('viewBox');
	if (!vb) return null;
	const p = vb.trim().split(/[\s,]+/).map(Number);
	return p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0 ? ([p[0], p[1], p[2], p[3]] as Box) : null;
}

/**
 * Estimate a node's box from its own geometry attributes.
 *
 * `getBBox()` is the accurate answer and it needs layout — but intake runs BEFORE anything mounts,
 * and the place-word namer needs a position for every part. So this reads the attributes an
 * exporter writes. It is approximate on purpose: it decides which third of the drawing a part sits
 * in, and it is never used for painting (the painter takes its own `getBBox` at mount).
 *
 * Returns null when nothing usable is on the node — the namer then falls back to a shape word alone.
 */
export function estimateBox(el: Element): Box | null {
	const num = (n: string) => Number(el.getAttribute(n));
	const t = tag(el);
	if (t === 'rect' || t === 'image' || t === 'use' || t === 'svg') {
		const [x, y, w, h] = [num('x') || 0, num('y') || 0, num('width'), num('height')];
		if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [x, y, w, h];
		return null;
	}
	if (t === 'circle' || t === 'ellipse') {
		const cx = num('cx') || 0;
		const cy = num('cy') || 0;
		const rx = t === 'circle' ? num('r') : num('rx');
		const ry = t === 'circle' ? num('r') : num('ry');
		if (!Number.isFinite(rx) || !Number.isFinite(ry)) return null;
		return [cx - rx, cy - ry, rx * 2, ry * 2];
	}
	if (t === 'line') {
		const [x1, y1, x2, y2] = [num('x1') || 0, num('y1') || 0, num('x2') || 0, num('y2') || 0];
		return [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
	}
	if (t === 'text') {
		const x = num('x');
		const y = num('y');
		return Number.isFinite(x) && Number.isFinite(y) ? [x, y, 0, 0] : null;
	}
	// path / polyline / polygon — pull every number out of the geometry and take its extent. Crude
	// (a cubic's control points sit outside the curve) and sufficient for a third-of-the-canvas call.
	const geom = el.getAttribute('d') || el.getAttribute('points') || '';
	if (!geom) {
		// A group: union of its children.
		const kids = Array.from(el.children).map(estimateBox).filter((b): b is Box => b != null);
		if (kids.length === 0) return null;
		const x0 = Math.min(...kids.map((b) => b[0]));
		const y0 = Math.min(...kids.map((b) => b[1]));
		const x1 = Math.max(...kids.map((b) => b[0] + b[2]));
		const y1 = Math.max(...kids.map((b) => b[1] + b[3]));
		return [x0, y0, x1 - x0, y1 - y0];
	}
	const nums = geom.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number).filter(Number.isFinite) ?? [];
	if (nums.length < 2) return null;
	const xs = nums.filter((_, i) => i % 2 === 0);
	const ys = nums.filter((_, i) => i % 2 === 1);
	const x0 = Math.min(...xs);
	const y0 = Math.min(...ys);
	return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0];
}

/** The union of several boxes, or null. */
function unionBox(boxes: (Box | null)[]): Box | null {
	const bs = boxes.filter((b): b is Box => b != null);
	if (bs.length === 0) return null;
	const x0 = Math.min(...bs.map((b) => b[0]));
	const y0 = Math.min(...bs.map((b) => b[1]));
	const x1 = Math.max(...bs.map((b) => b[0] + b[2]));
	const y1 = Math.max(...bs.map((b) => b[1] + b[3]));
	return [x0, y0, x1 - x0, y1 - y0];
}

/**
 * Guarantee the drawing has a usable `viewBox`, stamping one if it can.
 *
 * A `width="100%" height="100%"` export — routine for an inline poster — breaks three things at
 * once: `aspectFromSvgTag` picks the slide composition from the viewBox, `svg-paint.ts`'s `svgSize`
 * falls back to a hardcoded 300x150, and the place-word namer has nothing to measure against.
 *
 * Order: an existing usable viewBox wins; else px width/height; else the union of the children's
 * estimated boxes; else null, and the caller refuses with `no-coordinate-box`.
 */
export function ensureViewBox(svg: SVGSVGElement): { box: Box | null; stamped: boolean } {
	const existing = readViewBox(svg);
	if (existing) return { box: existing, stamped: false };

	const px = (n: string) => {
		const raw = svg.getAttribute(n);
		if (!raw) return Number.NaN;
		const v = Number.parseFloat(raw);
		return /^[\d.]+(px)?$/.test(raw.trim()) && Number.isFinite(v) && v > 0 ? v : Number.NaN;
	};
	const w = px('width');
	const h = px('height');
	if (Number.isFinite(w) && Number.isFinite(h)) {
		const box: Box = [0, 0, w, h];
		svg.setAttribute('viewBox', box.join(' '));
		return { box, stamped: true };
	}

	const union = unionBox(Array.from(svg.children).map(estimateBox));
	if (union && union[2] > 0 && union[3] > 0) {
		// Breathing room, so a stroke on the outer edge is not clipped by its own half-width.
		const pad = Math.max(union[2], union[3]) * 0.02;
		const box: Box = [union[0] - pad, union[1] - pad, union[2] + pad * 2, union[3] + pad * 2];
		svg.setAttribute('viewBox', box.map((n) => Number(n.toFixed(3))).join(' '));
		return { box, stamped: true };
	}
	return { box: null, stamped: false };
}

// ── Step 8 · the census, and the shallowest readable cut of the tree ────────────────────────────

/** Element children that paint, ignoring the containers that never do. */
function paintableChildren(node: Element): Element[] {
	return Array.from(node.children).filter((c) => !NON_PAINTING_CONTAINERS.has(tag(c)) && tag(c) !== 'title' && tag(c) !== 'desc' && tag(c) !== 'metadata');
}

/**
 * The cut of the tree we show as rows.
 *
 * Measured over this repo's 353 SVG files (craft ADR §7.1): "one group, one part" does not work —
 * 39% have no top-level `<g>` at all, and for those that do the median count is 1, a wrapper around
 * the whole drawing. What does work is: descend while the cut is a lone wrapper group, then take the
 * paintable children. That yields 2-12 rows for 84% of the corpus.
 */
export function cutOfTree(svg: SVGSVGElement): Element[] {
	let node: Element = svg;
	let kids = paintableChildren(node);
	// Unwrap `<g id="Layer_1">` and friends, however many deep.
	while (kids.length === 1 && tag(kids[0]) === 'g' && paintableChildren(kids[0]).length > 0) {
		node = kids[0];
		kids = paintableChildren(node);
	}
	return kids;
}

/** Does this node, or an ancestor up to the root, paint a stroke? `highlight` scales stroke-width
 *  and nothing else, so a fill-only shape cannot be emphasized and the control says so. */
export function hasStroke(el: Element, root: Element): boolean {
	let node: Element | null = el;
	while (node) {
		const attr = node.getAttribute('stroke');
		const style = node.getAttribute('style') || '';
		const inline = /(?:^|;)\s*stroke\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
		const value = inline || attr;
		if (value && value.toLowerCase() !== 'none') return true;
		if (node === root) break;
		node = node.parentElement;
	}
	return false;
}

// ── Step 9 · naming a part ──────────────────────────────────────────────────────────────────────

/** Shape words, so a nameless part still reads as something. */
const SHAPE_WORD: Record<string, string> = {
	path: 'Shape',
	line: 'Line',
	polyline: 'Line',
	polygon: 'Shape',
	rect: 'Rectangle',
	circle: 'Circle',
	ellipse: 'Ellipse',
	text: 'Text',
	g: 'Group',
	image: 'Image',
};

/** An id an exporter generated carries no meaning — do not show it as a name. */
const SERIAL_ID = /^(?:path|g|rect|circle|ellipse|line|poly\w*|layer|vector|group|shape|svg|_?\d+|[0-9a-f]{6,})[-_]?\d*$/i;
const HUMANE_ID = /^[a-z][a-z0-9 _-]{1,31}$/i;

/** Where a box sits, in thirds of the drawing. Only ever a disambiguator. */
export function placeWord(box: Box | null, view: Box): string {
	if (!box) return '';
	const cx = box[0] + box[2] / 2;
	const cy = box[1] + box[3] / 2;
	const col = (cx - view[0]) / view[2];
	const row = (cy - view[1]) / view[3];
	const v = row < 1 / 3 ? 'upper' : row > 2 / 3 ? 'lower' : '';
	const h = col < 1 / 3 ? 'left' : col > 2 / 3 ? 'right' : 'center';
	return v && h !== 'center' ? `${v} ${h}` : v || h;
}

/**
 * Name a part. First hit wins, and every rung is verified against what survives the sanitizer:
 * `<title>`, `aria-label`, `data-name`, `id` and `class` all survive; `inkscape:label` and
 * `serif:id` do not, which is why they arrive pre-harvested in `hints`.
 */
export function namePart(el: Element, view: Box, hints: HintMap, authorId: string): string {
	const own = cleanLabel(el.querySelector(':scope > title')?.textContent);
	if (own) return own;

	const aria = cleanLabel(el.getAttribute('aria-label'));
	if (aria) return aria;

	const dataName = cleanLabel(el.getAttribute('data-name'));
	if (dataName) return dataName;

	const harvested = authorId ? hints.get(authorId) : undefined;
	if (harvested) return harvested;

	if (authorId && HUMANE_ID.test(authorId) && !SERIAL_ID.test(authorId)) {
		return cleanLabel(authorId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
	}

	if (tag(el) === 'text') {
		const text = cleanLabel(el.textContent);
		if (text) return text;
	}

	const shape = SHAPE_WORD[tag(el)] ?? 'Shape';
	const place = placeWord(estimateBox(el), view);
	return place ? `${shape} · ${place}` : shape;
}

/** Make every label distinct, so two rows are never the same word. */
function dedupe(labels: string[]): string[] {
	const seen = new Map<string, number>();
	return labels.map((l) => {
		const n = (seen.get(l) ?? 0) + 1;
		seen.set(l, n);
		return n === 1 ? l : `${l} ${n}`;
	});
}

// ── The doorway ─────────────────────────────────────────────────────────────────────────────────

/** Count the literal colors a drawing paints with — the receipt reports these as information, and
 *  "Match the theme" is the fix that line names. `var(--token)` values are already palette-blind. */
function countFixedColors(svg: SVGSVGElement): number {
	const found = new Set<string>();
	for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
		for (const name of ['fill', 'stroke']) {
			const v = el.getAttribute(name);
			if (v && v !== 'none' && !v.startsWith('var(') && !v.startsWith('url(') && v !== 'currentColor') found.add(`${name}:${v}`);
		}
		const style = el.getAttribute('style') || '';
		for (const m of style.matchAll(/(?:^|;)\s*(fill|stroke)\s*:\s*([^;]+)/gi)) {
			const v = m[2].trim();
			if (v && v !== 'none' && !v.startsWith('var(') && !v.startsWith('url(') && v !== 'currentColor') found.add(`${m[1]}:${v}`);
		}
	}
	return found.size;
}

/** Count what the sanitizer removed, by diffing the pre- and post-sanitize trees. */
function countRemoved(before: SVGSVGElement, after: SVGSVGElement | null, receipt: IntakeReceipt): void {
	const tally = (root: Element | null, name: string) => (root ? root.querySelectorAll(name).length : 0);
	receipt.removed.stylesheets = tally(before, 'style') - tally(after, 'style');
	const unsafeBefore = tally(before, 'script') + tally(before, 'foreignObject') + tally(before, 'animate') + tally(before, 'set');
	const unsafeAfter = tally(after, 'script') + tally(after, 'foreignObject') + tally(after, 'animate') + tally(after, 'set');
	receipt.removed.unsafe = Math.max(0, unsafeBefore - unsafeAfter);
}

/**
 * Take what a person pasted and return the art, the parts, and the receipt.
 *
 * Every refusal names a DIFFERENT cause, because they have different fixes — collapsing them into
 * one "no parts found" is the failure this whole module exists to avoid.
 */
export function intake(raw: string): IntakeResult {
	const receipt = emptyReceipt();

	// 1 · normalize. A BOM survives the sanitizer as a text node, so it would ride into the stored
	// art, the poster, and the author's markdown line.
	const text = normalizeSourceText(String(raw ?? ''));
	if (!text.trim()) return { ok: false, failure: 'not-svg', message: 'There is nothing here yet. Paste the SVG markup, or drop the .svg file.', receipt };

	const hintDoc = parseInert(text);
	if (!hintDoc) {
		return { ok: false, failure: 'not-svg', message: 'That paste has no <svg> element in it. Copy the SVG markup itself, or drop the .svg file.', receipt };
	}

	// 2 · harvest the hints the sanitizer is about to destroy.
	const hints = harvestHints(hintDoc);

	// 3 · expand <use> BEFORE the sanitizer deletes it.
	const expansion = expandUses(hintDoc);
	receipt.rewritten.usesExpanded = expansion.expanded;
	receipt.removed.unresolvedUses = expansion.unresolved;
	if (expansion.aborted) {
		return {
			ok: false,
			failure: 'expansion-aborted',
			message: 'This drawing reuses one shape so many times that expanding it would make a file too big to travel in a deck. Flatten the instances in your drawing tool and bring it again.',
			receipt,
		};
	}

	// 4 · the security boundary (HARD RULE #22). Everything below operates on this string.
	const sanitized = sanitizeSlideHtml(hintDoc.outerHTML);
	const svg = parseInert(sanitized);
	if (!svg) {
		return { ok: false, failure: 'not-svg', message: 'Nothing survived reading that drawing — it may not be SVG at all. Copy the SVG markup itself, or drop the .svg file.', receipt };
	}
	countRemoved(hintDoc, svg, receipt);

	// 5 · strip what the painter strips anyway, so the STORED drawing equals the PAINTED one. An
	// <image href="https://…"> survives DOMPurify and would otherwise be a live off-origin fetch in
	// every recipient's copy of an exported deck.
	for (const el of Array.from(svg.querySelectorAll('*'))) {
		if (NET_NEW_STRIPS.has(tag(el))) {
			if (tag(el) === 'image') receipt.removed.images++;
			else receipt.removed.smil++;
			el.remove();
		}
	}

	// 6 · namespace, so two assets on one deck cannot corrupt each other.
	const ns = artNamespace(sanitized);
	const authorIds = new Map<Element, string>();
	for (const el of Array.from(svg.querySelectorAll('[id]'))) authorIds.set(el, el.getAttribute('id') || '');
	const namespaced = namespaceIds(svg, ns);
	receipt.rewritten.idsNamespaced = namespaced.renamed;
	receipt.rewritten.duplicateIds = namespaced.duplicates;

	// 7 · a coordinate box, or an honest refusal.
	const { box, stamped } = ensureViewBox(svg);
	receipt.rewritten.viewBoxStamped = stamped;
	if (!box) {
		return {
			ok: false,
			failure: 'no-coordinate-box',
			message: 'This drawing has no coordinate box, so its parts cannot be placed. Re-export it with a viewBox.',
			receipt,
		};
	}

	// 8 · the cut, then bands if the cut is too long to read.
	let cut = cutOfTree(svg);
	if (cut.length === 0) {
		return {
			ok: false,
			failure: 'nothing-survived',
			message: 'Nothing in this drawing can be animated one part at a time. If it was built from reusable symbols, flatten or expand them on export and bring it again.',
			receipt,
		};
	}
	if (cut.length > MAX_ROWS) {
		cut = bandTheCut(svg, cut, ns, receipt);
	}

	// 9 · address and name every row. Every part gets an id — including one the author never gave —
	// because `pathRef` IS the address and a part without one silently never moves.
	const labels: string[] = [];
	const rows: Omit<IntakePart, 'label'>[] = [];
	cut.forEach((el, i) => {
		let pathRef = el.getAttribute('id') || '';
		if (!pathRef) {
			pathRef = `${ns}-p${i + 1}`;
			el.setAttribute('id', pathRef);
		}
		const authorId = authorIds.get(el) ?? '';
		labels.push(namePart(el, box, hints, authorId));
		const t = tag(el);
		const isBand = pathRef.startsWith(`${ns}-band-`);
		rows.push({
			pathRef,
			tag: t,
			drawable: GEOMETRY_TAGS.has(t),
			strokeable: hasStroke(el, svg),
			band: isBand,
			childCount: isBand || t === 'g' ? el.querySelectorAll('*').length : 0,
		});
	});
	const parts: IntakePart[] = dedupe(labels).map((label, i) => ({ ...rows[i], label }));

	// The art is the serialized, sanitized, rewritten tree — one string, from which both the stored
	// `art` and the poster derive, so the card and the deck can never disagree with the stage.
	const art = svg.outerHTML;
	receipt.artBytes = new TextEncoder().encode(art).length;
	receipt.parts = parts.length;
	receipt.bands = parts.filter((p) => p.band).length;
	receipt.kept.fixedColors = countFixedColors(svg);
	receipt.rewritten.titlesKept = svg.querySelectorAll('title').length;

	if (receipt.artBytes > ART_MAX_BYTES) {
		return {
			ok: false,
			failure: 'too-big',
			message: `That drawing is ${Math.round(receipt.artBytes / 1024)} KB — too big to travel inside a deck. The ceiling is ${ART_MAX_BYTES / 1024} KB. Simplify it in your drawing tool, or crop to the part you want to animate.`,
			receipt,
		};
	}
	if (receipt.artBytes > ART_WARN_BYTES) {
		receipt.notes.push(`This drawing is ${Math.round(receipt.artBytes / 1024)} KB — the slide it lands on will be slow to edit.`);
	}

	return { ok: true, art, parts, viewBox: box, receipt };
}

/**
 * Bin an over-long cut into contiguous bands of document order.
 *
 * Document order, not spatial order: it is what the exporter emitted, what a human drew, and what
 * `compile.ts` itself uses for `sequence`. Each band is a synthesized `<g>` inserted into the art —
 * legitimate because the only bytes added are elements we authored, and NECESSARY because
 * `svg-paint.ts` resolves parts from `querySelectorAll('[id]')`, which cannot match the root. A band
 * has to be a real wrapper element or it has no address.
 */
function bandTheCut(svg: SVGSVGElement, cut: Element[], ns: string, receipt: IntakeReceipt): Element[] {
	const bandCount = Math.ceil(cut.length / MAX_ROWS);
	const perBand = Math.ceil(cut.length / bandCount);
	const doc = svg.ownerDocument;
	const bands: Element[] = [];

	for (let b = 0; b < bandCount; b++) {
		const members = cut.slice(b * perBand, (b + 1) * perBand);
		if (members.length === 0) continue;
		const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('id', `${ns}-band-${b + 1}`);
		members[0].parentNode?.insertBefore(g, members[0]);
		for (const m of members) g.appendChild(m);
		bands.push(g);
	}
	receipt.rewritten.bandsCreated = bands.length;
	receipt.notes.push(`${cut.length} shapes, grouped into ${bands.length} bands automatically. Open a band to choreograph its parts separately, or re-export with layer groups for better grouping.`);
	return bands;
}
