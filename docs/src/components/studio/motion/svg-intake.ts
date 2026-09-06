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
import { PROCESSED_ATTR } from './instance';
import { ART_MAX_BYTES, ART_WARN_BYTES } from './limits';

/** Tags anime.js can actually stroke. `drawable.ts` calls `createDrawable(node)`, which stamps
 *  `pathLength="1000"` and writes normalized `stroke-dasharray` on THAT node — so on a `<g>` or
 *  `<text>` the dash values are inherited by children whose real lengths are in user units, and the
 *  group flashes on instead of drawing. It does not throw, so nothing reports it. */
const GEOMETRY_TAGS = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);

/** Containers whose contents never paint on their own. Their ids are still namespaced (step 6);
 *  they are simply not offered as parts, because animating one addresses a node nobody can see. */
const NON_PAINTING_CONTAINERS = new Set(['defs', 'clippath', 'mask', 'marker', 'symbol', 'pattern', 'lineargradient', 'radialgradient', 'filter']);

/** Removed AFTER the sanitizer, because DOMPurify keeps them and `svg-paint.ts` does not.
 *  Keeping the two in step means the stored drawing equals the painted drawing.
 *  `feimage` is here for the OTHER reason below: it fetches. */
const NET_NEW_STRIPS = new Set(['image', 'animatetransform', 'animatemotion', 'feimage']);

/** Any value that would make the browser fetch from somewhere else.
 *
 *  Stripping `<image href="https://…">` and stopping there was half a guard. MEASURED in real
 *  Chromium against a beacon server, from a real HTTP origin, with the art injected the way the
 *  Library thumbnail injects it: `fill="url(http://…)"`, `mask="url(http://…)"`,
 *  `<feImage href>` and `style="background-image:url(http://…)"` ALL fetched. (Only
 *  `filter="url(http://…)"` was refused by the browser itself.)
 *
 *  `svg-paint.ts` carries a comment asserting that an external `url()` in a filter/mask/fill
 *  attribute "is not a fetch vector browsers honor cross-document". That is not true in Chromium
 *  131, and this is the file that has to act on it: the harm is exactly the one the `<image>` strip
 *  names — a beacon that fires from the Studio's own origin every time the shelf paints, and that
 *  bakes into every exported copy of the deck a recipient opens. */
const EXTERNAL_URL_RE = /url\(\s*['"]?\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const EXTERNAL_HREF_RE = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/** Attributes that can carry a `url(#id)` reference we must rewrite when we namespace. */
const REF_ATTRS = ['fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'style'];

// The ceilings live in `limits.ts` so a caller can take a number without taking this kernel — see
// that file's header for why that matters to the Studio route's size budget.
export { ART_MAX_BYTES, ART_WARN_BYTES } from './limits';

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
	/** The human name, shown in the running order. A rename is written back into the drawing as that
	 *  node's `<title>` (`setPartTitle`), which is rung one of the naming cascade — so it round-trips
	 *  through save, reopen and Replace with no field on the record to hold it. */
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
	removed: { stylesheets: number; images: number; smil: number; unsafe: number; unresolvedUses: number; offOrigin: number };
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
		removed: { stylesheets: 0, images: 0, smil: 0, unsafe: 0, unresolvedUses: 0, offOrigin: 0 },
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
 *  prefix, which keeps a re-paste of an unchanged drawing diffable and its ids readable.
 *
 *  IT IS NOT WHAT KEEPS TWO COPIES APART. Content-derivation cannot: one drawing inserted twice is
 *  byte-identical by definition, and a saved asset re-read from the Library keeps the namespace
 *  stamped on it, so it would not come through here at all. Uniqueness belongs at the INSERT seam,
 *  where a document actually acquires a copy — see `reinstance` below. */
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
 *    corruption hits one asset inserted twice — which is why `artNamespace` mints a fresh prefix
 *    per intake rather than hashing the content, those two inserts being byte-identical.
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
			// `indexOf('#')` alone matches every `fill="#abcdef"`, which put every painted element into
			// the inner loop over every id — quadratic, and measured at 1.6s for 3000 nodes that became
			// 248ms once the hex colors stopped qualifying. A real reference is `url(#…)` or a bare
			// fragment href; a color is neither.
			if (!val || (val.indexOf('url(#') === -1 && !val.startsWith('#'))) continue;
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

/** How many PAINTING descendants a node has. `querySelectorAll('*')` counts a `<title>` we insert on
 *  a rename, and counting our own metadata as the author's shapes makes "24 shapes together" drift
 *  upward every time somebody names something. */
function shapeCount(el: Element): number {
	return Array.from(el.querySelectorAll('*')).filter((c) => {
		const t = tag(c);
		return !NON_PAINTING_CONTAINERS.has(t) && t !== 'title' && t !== 'desc' && t !== 'metadata' && t !== 'stop';
	}).length;
}

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
	// `<animate>` and `<set>` are DECLARATIVE ANIMATION, not hostility. Folding them into `unsafe`
	// made the receipt tell a designer their SMIL was "a script or event handler" — a false statement
	// on the one screen this module exists to make honest.
	const smilBefore = tally(before, 'animate') + tally(before, 'set');
	const smilAfter = tally(after, 'animate') + tally(after, 'set');
	receipt.removed.smil += Math.max(0, smilBefore - smilAfter);
	const unsafeBefore = tally(before, 'script') + tally(before, 'foreignObject');
	const unsafeAfter = tally(after, 'script') + tally(after, 'foreignObject');
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

	// REFUSE ON THE RAW BYTES FIRST. The real ceiling is measured on the sanitized art, but reaching
	// it costs a parse, a <use> expansion, a DOMPurify pass and an id rewrite — and a 2 MB paste
	// spent 78 seconds on that work in real Chromium before being refused for its size anyway,
	// freezing the tab (and the user's unsaved deck) the whole time. Nothing survives sanitizing to
	// more than it arrived as, so anything this far over the ceiling cannot come in under it.
	const rawBytes = text.length;
	if (rawBytes > ART_MAX_BYTES * 4) {
		receipt.artBytes = rawBytes;
		return {
			ok: false,
			failure: 'too-big',
			message: `That drawing is about ${Math.round(rawBytes / 1024)} KB — far too big to travel inside a deck, where the ceiling is ${ART_MAX_BYTES / 1024} KB. Simplify it in your drawing tool, or crop to the part you want to animate.`,
			receipt,
		};
	}

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

	// 5 · strip what the painter strips anyway, so the STORED drawing equals the PAINTED one — and
	// close every off-origin fetch, not just the one that wears an <image> tag.
	for (const el of Array.from(svg.querySelectorAll('*'))) {
		const t = tag(el);
		if (NET_NEW_STRIPS.has(t)) {
			if (t === 'image' || t === 'feimage') receipt.removed.images++;
			else receipt.removed.smil++;
			el.remove();
			continue;
		}
		for (const name of el.getAttributeNames()) {
			const val = el.getAttribute(name);
			if (!val) continue;
			const isHref = name === 'href' || name === 'xlink:href';
			if ((isHref && EXTERNAL_HREF_RE.test(val)) || EXTERNAL_URL_RE.test(val)) {
				el.removeAttribute(name);
				receipt.removed.offOrigin++;
			}
		}
	}

	// 6 · namespace, so two assets on one deck cannot corrupt each other — ONCE. Art we already
	// processed carries its stamp and its prefixes; re-prefixing it is what made reopening a saved
	// asset lose the whole running order.
	const alreadyProcessed = svg.hasAttribute(PROCESSED_ATTR);
	const ns = alreadyProcessed ? (svg.getAttribute(PROCESSED_ATTR) ?? artNamespace(sanitized)) : artNamespace(sanitized);
	const authorIds = new Map<Element, string>();
	for (const el of Array.from(svg.querySelectorAll('[id]'))) authorIds.set(el, el.getAttribute('id') || '');
	if (!alreadyProcessed) {
		const namespaced = namespaceIds(svg, ns);
		receipt.rewritten.idsNamespaced = namespaced.renamed;
		receipt.rewritten.duplicateIds = namespaced.duplicates;
		svg.setAttribute(PROCESSED_ATTR, ns);
	}

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
	// Every id already in the drawing, so a MINTED one cannot land on top of one. A drawing that
	// happens to contain `id="p1"` would otherwise produce two parts with the same `pathRef` —
	// which `parseScene` rejects outright (an un-craftable asset blamed on us), or, when the twin is
	// in `<defs>`, sails through and binds the part to a GRADIENT, so the plan validates and the
	// wrong node animates with nothing to report it. The de-dup at step 6 cannot see this, because
	// the collision is created here, three steps later.
	const minted = new Set(Array.from(svg.querySelectorAll('[id]')).map((e) => e.getAttribute('id') ?? ''));
	cut.forEach((el, i) => {
		let pathRef = el.getAttribute('id') || '';
		if (!pathRef) {
			let n = i + 1;
			while (minted.has(`${ns}-p${n}`)) n++;
			pathRef = `${ns}-p${n}`;
			minted.add(pathRef);
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
			childCount: isBand || t === 'g' ? shapeCount(el) : 0,
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

	// The design record's §14.3 keeps the winning track's better half: the cap binds the POSTER too,
	// because the poster is the artifact that inlines into the slide and it carries the drawing plus
	// whatever the drawing library stamps on top. The art is the floor of that measurement, so
	// refusing on art alone left the thing that actually lands in the deck unmeasured.
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
	// `ceil(n / MAX_ROWS)` bands each holding up to MAX_ROWS is only <= MAX_ROWS bands while
	// n <= MAX_ROWS^2 — 600 shapes produced 25 rows against a cap documented as 24. Bound the COUNT
	// and let each band hold more, which is what the cap is actually about: a list you can read.
	const bandCount = Math.min(MAX_ROWS, Math.ceil(cut.length / MAX_ROWS));
	const perBand = Math.ceil(cut.length / bandCount);
	const doc = svg.ownerDocument;
	const bands: Element[] = [];
	// Checked against the ids already in the drawing, for the same reason the census mints checked:
	// a drawing carrying `id="band-1"` would otherwise have its own group shadow ours, and
	// `svg-paint`'s first-wins map would land the band's choreography on the author's group.
	const usedIds = new Set(Array.from(svg.querySelectorAll('[id]')).map((e) => e.getAttribute('id') ?? ''));

	for (let b = 0; b < bandCount; b++) {
		const members = cut.slice(b * perBand, (b + 1) * perBand);
		if (members.length === 0) continue;
		const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
		let bandId = `${ns}-band-${b + 1}`;
		let bump = 2;
		while (usedIds.has(bandId)) bandId = `${ns}-band-${b + 1}-${bump++}`;
		usedIds.add(bandId);
		g.setAttribute('id', bandId);
		members[0].parentNode?.insertBefore(g, members[0]);
		for (const m of members) g.appendChild(m);
		bands.push(g);
	}
	receipt.rewritten.bandsCreated = bands.length;
	receipt.notes.push(`${cut.length} shapes, grouped into ${bands.length} bands automatically. Open a band to choreograph its parts separately, or re-export with layer groups for better grouping.`);
	return bands;
}

// ── After intake: the two edits that have to reach the ART, not just React state ─────────────────

/**
 * Split a band back into its members.
 *
 * A band is a `<g>` this module synthesized (§ `bandTheCut`) purely so an over-long cut stays
 * readable. It is NOT a wall: without a way back down, the faculty physically cannot choreograph one
 * specific shape of any drawing over `MAX_ROWS` leaves, which is its whole purpose.
 *
 * The wrapper carries no transform and no paint — we authored it — so unwrapping it is lossless.
 * Members that arrived without an id get one here, because `pathRef` IS the address and a part
 * without one silently never moves.
 *
 * Returns null when `bandRef` is not a band we made, so a caller cannot accidentally dissolve a
 * group the AUTHOR drew — that group may carry a transform its children depend on.
 */
export function splitBand(art: string, bandRef: string): { art: string; members: IntakePart[] } | null {
	const svg = parseInert(art);
	if (!svg) return null;
	const band = svg.querySelector(`[id="${CSS.escape(bandRef)}"]`);
	if (!band || tag(band) !== 'g' || !/-band-\d+(?:-\d+)?$/.test(bandRef)) return null;

	const view = readViewBox(svg) ?? [0, 0, 100, 100];
	const members = Array.from(band.children).filter((c) => !NON_PAINTING_CONTAINERS.has(tag(c)));
	if (members.length === 0) return null;

	const taken = new Set(Array.from(svg.querySelectorAll('[id]')).map((e) => e.getAttribute('id') ?? ''));
	const ns = bandRef.replace(/-band-\d+$/, '');
	const rows: IntakePart[] = [];
	const labels: string[] = [];

	const slot = bandRef.split('-').pop() ?? '1';
	members.forEach((el, i) => {
		let pathRef = el.getAttribute('id') || '';
		if (!pathRef) {
			// Checked against every id already in the drawing, for the same reason the census mints
			// checked: a duplicate `pathRef` either makes the asset unsaveable or binds the part to
			// the wrong node, and neither says anything.
			let n = i + 1;
			while (taken.has(`${ns}-b${slot}s${n}`)) n++;
			pathRef = `${ns}-b${slot}s${n}`;
			taken.add(pathRef);
			el.setAttribute('id', pathRef);
		}
		labels.push(namePart(el, view, new Map(), ''));
		const t = tag(el);
		rows.push({ pathRef, label: '', tag: t, drawable: GEOMETRY_TAGS.has(t), strokeable: hasStroke(el, svg), band: false, childCount: t === 'g' ? shapeCount(el) : 0 });
	});

	// Unwrap: move the members up to where the band sat, then drop the wrapper.
	const parent = band.parentNode;
	for (const el of members) parent?.insertBefore(el, band);
	band.remove();

	return { art: svg.outerHTML, members: dedupe(labels).map((label, i) => ({ ...rows[i], label })) };
}

/**
 * Write a part's name INTO the drawing, as its `<title>`.
 *
 * Renaming has to reach the art or it does not survive a save: reopening re-derives every label from
 * the art (there is no field on the record for them), so a rename kept only in React state degrades
 * back to "Shape · upper left" the moment you close the tab. `<title>` is the right home for three
 * reasons at once — it survives the sanitizer (pinned in `docs/e2e/svg-paste-guard.spec.ts`), it is
 * already the first rung of the naming cascade, and it is what gives that node its accessible name.
 *
 * Any existing `<title>` is REPLACED, not appended to: two of them make the accessible name
 * ambiguous, and every engine with an opinion reads only the first.
 */
export function setPartTitle(art: string, pathRef: string, label: string): string {
	const svg = parseInert(art);
	if (!svg) return art;
	const node = svg.querySelector(`[id="${CSS.escape(pathRef)}"]`);
	if (!node) return art;
	for (const t of Array.from(node.children)) {
		if (tag(t) === 'title') t.remove();
	}
	const clean = cleanLabel(label);
	if (clean) {
		const title = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'title');
		title.textContent = clean;
		node.insertBefore(title, node.firstChild);
	}
	return svg.outerHTML;
}
