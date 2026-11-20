/**
 * lib/core/pdf-compose/backdrop.mjs — a finish's backdrop as vector drawing.
 *
 * A finish paints its wash (a glow) and its texture (a grid, a weave, rings, dots) as CSS gradient
 * layers on the slide's `.backdrop` element (lib/base/base.finish.css § COMPOSITOR). Left in the
 * slide's photo, the PDF stores them as a 1x picture, usually a JPEG, and JPEG cuts a gradient that
 * spans a few color levels into 8x8 blocks with color patches: the "dithering" the owner saw
 * (engineering/decisions/2026-11-20-backdrop-gradient-fidelity.md). This module turns those layers
 * into drawing the writer can put in the PDF instead:
 *
 *   - a glow (a linear or radial gradient) is ONE axial or radial shading. The bottom glow sits on
 *     the slide's solid color, so it is blended onto that color here and needs no transparency; a
 *     glow above it that fades out carries its fade as a soft mask;
 *   - a texture (a repeating gradient of hard-edged bands) is filled paths: stripes, rings, or a
 *     disk per tile. Never a per-pixel function: Chrome's own printer writes a repeating gradient
 *     as a PostScript-function shading, and poppler took 26.6 s to draw a 10-slide deck of them.
 *
 * Pure and DOM-free: the reader (read-slide.mjs `readBackdrop`) hands it computed CSS strings and
 * the box, and it answers `{ prims }` or `{ refuse }`. A refusal keeps the backdrop in the photo,
 * as before, under a `backdrop-*` reason in LATTICE_PDF_REPORT.
 *
 * Colors follow the browser: CSS interpolates gradient stops with premultiplied alpha, in sRGB when
 * every stop is a legacy color (`rgb()`), and in Oklab otherwise (`color(srgb …)`, which is what a
 * finish's `color-mix` computes to). Each segment is sampled at SAMPLES points with that math, so
 * the PDF's linear sRGB ramp between samples follows the screen's curve.
 */

/** Samples per gradient segment. Eight follow an Oklab curve to within a level on a finish's glow. */
export const SAMPLES = 8;
/** The most disks one dot-texture layer may draw before the backdrop stays in the photo. */
export const MAX_DISKS = 6000;
/** The most bands (stripes or rings) one texture layer may draw. */
export const MAX_BANDS = 2000;

// ── Colors ──────────────────────────────────────────────────────────────────────────────────

const NUM = String.raw`(-?[\d.]+(?:e-?\d+)?)`;
const RGB_RE = new RegExp(String.raw`^rgba?\(\s*${NUM}\s*,\s*${NUM}\s*,\s*${NUM}\s*(?:,\s*${NUM}\s*)?\)$`, 'i');
const SRGB_RE = new RegExp(String.raw`^color\(\s*srgb\s+${NUM}\s+${NUM}\s+${NUM}\s*(?:\/\s*${NUM}\s*)?\)$`, 'i');

/**
 * A computed CSS color as `{ c: [r, g, b] (0..255, unrounded), a: 0..1, legacy }`, or null for a
 * form this module does not read (it then refuses, and the backdrop stays in the photo).
 * @param {string} s
 */
export function parseColor(s) {
	const t = s.trim();
	if (t === 'transparent') return { c: [0, 0, 0], a: 0, legacy: true };
	let m = t.match(RGB_RE);
	if (m) return { c: [m[1], m[2], m[3]].map((v) => clamp255(Number(v))), a: m[4] == null ? 1 : clamp01(Number(m[4])), legacy: true };
	// A wide-gamut color (an `oklch()` accent past sRGB) computes to channels outside 0..1. The screen clips it, and so does
	// this: unclamped, it aborted the writer (pdf-lib refuses the fill) and wrapped around in the glow picture.
	m = t.match(SRGB_RE);
	if (m) return { c: [m[1], m[2], m[3]].map((v) => clamp255(Number(v) * 255)), a: m[4] == null ? 1 : clamp01(Number(m[4])), legacy: false };
	return null;
}

const clamp255 = (v) => Math.min(255, Math.max(0, v));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const toLin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const fromLin = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.sign(x) * Math.abs(x) ** (1 / 2.4) - 0.055);

/** sRGB (0..255) to Oklab. */
export function toOklab([r, g, b]) {
	const R = toLin(r), G = toLin(g), B = toLin(b);
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** Oklab to sRGB (0..255, unclamped). */
export function fromOklab([L, A, Bb]) {
	const l = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * Bb) ** 3;
	return [fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

/**
 * The color a gradient paints a fraction `t` of the way from stop `p` to stop `q`: premultiplied
 * interpolation in `space` ('srgb' or 'oklab'), as CSS Images 4 specifies and Chrome paints.
 * A stop at zero alpha contributes no color, so a fade to `transparent` keeps the other stop's hue.
 * @returns {{ c: number[], a: number }}
 */
export function mixStops(p, q, t, space) {
	const conv = space === 'oklab' ? toOklab : (c) => c;
	const back = space === 'oklab' ? fromOklab : (c) => c;
	const a = p.a + (q.a - p.a) * t;
	if (a <= 1e-6) return { c: (p.a >= q.a ? p : q).c.slice(), a: 0 };
	const P = conv(p.c), Q = conv(q.c);
	const pre = P.map((v, i) => (v * p.a + (Q[i] * q.a - v * p.a) * t) / a);
	return { c: back(pre).map((v) => Math.min(255, Math.max(0, v))), a };
}

// ── Parsing ─────────────────────────────────────────────────────────────────────────────────

/** Split a CSS value on its top-level commas (none inside parentheses). */
export function splitTop(v) {
	const out = [];
	let depth = 0, start = 0;
	for (let i = 0; i < v.length; i++) {
		if (v[i] === '(') depth++;
		else if (v[i] === ')') depth--;
		else if (v[i] === ',' && depth === 0) { out.push(v.slice(start, i).trim()); start = i + 1; }
	}
	out.push(v.slice(start).trim());
	return out;
}

/** Split on top-level whitespace. */
function splitSpaces(v) {
	const out = [];
	let depth = 0, cur = '';
	for (const ch of v) {
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}

const LEN = /^(-?[\d.]+(?:e-?\d+)?)(px|%)$/;
/** `calc(P% ± Npx)`: a right- or bottom-anchored position, a clear panel's ramp end, a bleed size. */
const CALC = /^calc\((-?[\d.]+(?:e-?\d+)?)%\s*([+-])\s*(-?[\d.]+(?:e-?\d+)?)px\)$/;
const ANGLE = /^(-?[\d.]+)(deg|grad|rad|turn)$/;
const SIDE_ANGLE = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 };
const POS_WORD = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
const EXTENT = new Set(['closest-side', 'closest-corner', 'farthest-side', 'farthest-corner']);

/**
 * One computed background-image layer, parsed. `{ none: true }` for `none`, `{ refuse }` for a form
 * this module does not read, else `{ kind: 'linear'|'radial', repeating, angle?, radial?, stops, space }`
 * where each stop is `{ color, pos: [{ v, unit }] }` as written (positions resolved later, against the
 * gradient line's length).
 * @param {string} s
 */
export function parseLayer(s) {
	const t = s.trim();
	if (t === 'none') return { none: true };
	const m = t.match(/^(repeating-)?(linear|radial)-gradient\((.*)\)$/s);
	if (!m) return { refuse: 'backdrop-image' };
	const repeating = !!m[1], kind = m[2];
	const args = splitTop(m[3]);
	let head = args[0];
	let space = '';
	const inM = head.match(/(?:^|\s)in\s+([a-z-]+)(\s+(?:shorter|longer|increasing|decreasing)\s+hue)?\s*$/);
	if (inM) { space = inM[1]; head = head.slice(0, inM.index).trim(); if (inM[2]) return { refuse: 'backdrop-space' }; }
	let isPrelude = !!inM;
	const out = { kind, repeating, space, stops: [] };
	if (kind === 'linear') {
		out.angle = 180;
		if (ANGLE.test(head)) {
			const a = head.match(ANGLE);
			out.angle = Number(a[1]) * { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 }[a[2]];
			isPrelude = true;
		} else if (head in SIDE_ANGLE) { out.angle = SIDE_ANGLE[head]; isPrelude = true; }
		else if (/^to\s/.test(head)) return { refuse: 'backdrop-angle' }; // a corner depends on the box's ratio: not written by any finish
	} else {
		const toks = splitSpaces(head);
		const at = toks.indexOf('at');
		const before = at < 0 ? toks : toks.slice(0, at);
		const pos = at < 0 ? [] : toks.slice(at + 1);
		const looksPrelude = at >= 0 || before.length && before.every((x) => x === 'circle' || x === 'ellipse' || EXTENT.has(x) || LEN.test(x));
		const r = { shape: 'ellipse', extent: 'farthest-corner', size: null, at: ['50%', '50%'] };
		if (looksPrelude && head !== '') {
			isPrelude = true;
			const sizes = [];
			for (const x of before) {
				if (x === 'circle' || x === 'ellipse') r.shape = x;
				else if (EXTENT.has(x)) r.extent = x;
				else if (LEN.test(x)) sizes.push(x);
				else return { refuse: 'backdrop-radial' };
			}
			if (sizes.length === 1) { r.shape = 'circle'; if (sizes[0].endsWith('%')) return { refuse: 'backdrop-radial' }; r.size = [sizes[0], sizes[0]]; }
			else if (sizes.length === 2) { r.shape = 'ellipse'; r.size = sizes; }
			else if (sizes.length) return { refuse: 'backdrop-radial' };
			if (pos.length) {
				const p = pos.map((x) => POS_WORD[x] ?? x);
				if (p.length === 1) p.push('50%');
				// `top left` reads y first: put the horizontal value first.
				if (p.length === 2 && (pos[0] === 'top' || pos[0] === 'bottom' || pos[1] === 'left' || pos[1] === 'right')) p.reverse();
				if (p.length !== 2 || !p.every((x) => LEN.test(x))) return { refuse: 'backdrop-radial' };
				r.at = p;
			}
		}
		out.radial = r;
	}
	if (isPrelude) args.shift();
	const isPos = (t) => LEN.test(t) || CALC.test(t);
	for (const a of args) {
		const toks = splitSpaces(a);
		const pos = [];
		while (toks.length > 1 && isPos(toks.at(-1))) pos.unshift(toks.pop());
		if (toks.length === 1 && isPos(toks[0])) return { refuse: 'backdrop-hint' }; // a color hint
		const color = parseColor(toks.join(' '));
		if (!color) return { refuse: 'backdrop-color' };
		out.stops.push({ color, pos: pos.map((p) => {
			const x = p.match(LEN);
			if (x) return { v: Number(x[1]), unit: x[2], plus: 0 };
			const c = p.match(CALC); // calc(P% ± Npx), as a clear panel's ramp ends compute
			return { v: Number(c[1]), unit: '%', plus: (c[2] === '-' ? -1 : 1) * Number(c[3]) };
		}) });
	}
	if (out.stops.length < 2) return { refuse: 'backdrop-image' };
	if (!space) space = out.stops.every((s) => s.color.legacy) ? 'srgb' : 'oklab';
	if (space !== 'srgb' && space !== 'oklab') return { refuse: 'backdrop-space' };
	out.space = space;
	return out;
}

/**
 * Stops as `[{ u, color }]` with `u` in px along a gradient line `len` long, after CSS's fix-up:
 * first and last default to 0 and 100%, each is at least the one before, and a run with no
 * position spreads evenly between its neighbors.
 */
export function resolveStops(stops, len) {
	const raw = [];
	for (const s of stops) {
		if (!s.pos.length) raw.push({ color: s.color, u: null });
		for (const p of s.pos) raw.push({ color: s.color, u: (p.unit === '%' ? (p.v / 100) * len : p.v) + (p.plus || 0) });
	}
	if (raw[0].u == null) raw[0].u = 0;
	if (raw.at(-1).u == null) raw.at(-1).u = len;
	let hi = -Infinity;
	for (const r of raw) if (r.u != null) { r.u = Math.max(r.u, hi); hi = r.u; }
	for (let i = 1; i < raw.length; i++) {
		if (raw[i].u != null) continue;
		let j = i;
		while (raw[j].u == null) j++;
		const a = raw[i - 1].u, b = raw[j].u;
		for (let k = i; k < j; k++) raw[k].u = a + ((b - a) * (k - i + 1)) / (j - i + 1);
	}
	return raw;
}

/** Sampled stops `[{ u, c, a }]`: every stop, plus SAMPLES-1 points inside each segment of nonzero length. */
export function sampleStops(stops, space) {
	const out = [];
	for (let i = 0; i < stops.length; i++) {
		const s = stops[i];
		out.push({ u: s.u, c: s.color.c.slice(), a: s.color.a });
		const n = stops[i + 1];
		if (!n || n.u <= s.u) continue;
		const flat = n.color.a === s.color.a && n.color.c.every((v, k) => Math.abs(v - s.color.c[k]) < 1e-6);
		if (flat) continue;
		for (let k = 1; k < SAMPLES; k++) {
			const t = k / SAMPLES;
			const m = mixStops(s.color, n.color, t, space);
			out.push({ u: s.u + t * (n.u - s.u), c: m.c, a: m.a });
		}
	}
	return out;
}

// ── Geometry ────────────────────────────────────────────────────────────────────────────────

const lenOf = (x, ref) => { const m = x.match(LEN); return m[2] === '%' ? (Number(m[1]) / 100) * ref : Number(m[1]); };

/** The radial ray's x and y radii for a box `w`×`h` with the center at (cx, cy) inside it. */
export function radialRadii(r, w, h, cx, cy) {
	if (r.size) return [lenOf(r.size[0], w), lenOf(r.size[1], h)];
	const dx = [cx, w - cx], dy = [cy, h - cy];
	const near = r.extent.startsWith('closest');
	const sx = near ? Math.min(...dx) : Math.max(...dx);
	const sy = near ? Math.min(...dy) : Math.max(...dy);
	if (r.shape === 'circle') {
		if (r.extent.endsWith('side')) { const v = near ? Math.min(sx, sy) : Math.max(sx, sy); return [v, v]; }
		const v = Math.hypot(sx, sy);
		return [v, v];
	}
	if (r.extent.endsWith('side')) return [sx, sy];
	// An ellipse through the corner keeps the side ratio (CSS Images 3 § 3.2.2): both radii grow by √2.
	return [sx * Math.SQRT2, sy * Math.SQRT2];
}

/** CSS's linear gradient line through a box: [x0, y0, x1, y1] and its length. */
export function linearLine(angle, x, y, w, h) {
	const t = (angle * Math.PI) / 180;
	const s = Math.sin(t), c = Math.cos(t);
	const L = Math.abs(w * s) + Math.abs(h * c);
	const cx = x + w / 2, cy = y + h / 2;
	return { coords: [cx - (s * L) / 2, cy + (c * L) / 2, cx + (s * L) / 2, cy - (c * L) / 2], len: L, dir: [s, -c] };
}

/** A repeating gradient's stops as hard-edged bands over one period: `{ period, start, bands: [{ u0, u1, c, a }] }`, or `{ refuse }`. */
export function bandsOf(stops) {
	const first = stops[0].u, last = stops.at(-1).u;
	const period = last - first;
	if (!(period > 0.25)) return { refuse: 'backdrop-period' };
	const bands = [];
	for (let i = 0; i < stops.length - 1; i++) {
		const s = stops[i], n = stops[i + 1];
		if (n.u <= s.u) continue; // a hard edge
		const same = n.color.a === s.color.a && n.color.c.every((v, k) => Math.abs(v - s.color.c[k]) < 0.5);
		if (!same) return { refuse: 'backdrop-texture-ramp' };
		if (s.color.a > 0) bands.push({ u0: s.u - first, u1: n.u - first, c: s.color.c, a: s.color.a });
	}
	return { period, start: first, bands };
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/** An ellipse as path commands (`[['M', x, y], ['C', …], …, ['Z']]`): clockwise, or the other way for a hole. */
export function ellipse(cx, cy, rx, ry, ccw = false) {
	const k = 0.5522847498, a = rx * k, b = ry * k;
	const R = (v) => r3(v);
	if (!ccw) {
		return [['M', R(cx + rx), R(cy)],
			['C', R(cx + rx), R(cy + b), R(cx + a), R(cy + ry), R(cx), R(cy + ry)],
			['C', R(cx - a), R(cy + ry), R(cx - rx), R(cy + b), R(cx - rx), R(cy)],
			['C', R(cx - rx), R(cy - b), R(cx - a), R(cy - ry), R(cx), R(cy - ry)],
			['C', R(cx + a), R(cy - ry), R(cx + rx), R(cy - b), R(cx + rx), R(cy)], ['Z']];
	}
	return [['M', R(cx + rx), R(cy)],
		['C', R(cx + rx), R(cy - b), R(cx + a), R(cy - ry), R(cx), R(cy - ry)],
		['C', R(cx - a), R(cy - ry), R(cx - rx), R(cy - b), R(cx - rx), R(cy)],
		['C', R(cx - rx), R(cy + b), R(cx - a), R(cy + ry), R(cx), R(cy + ry)],
		['C', R(cx + a), R(cy + ry), R(cx + rx), R(cy + b), R(cx + rx), R(cy)], ['Z']];
}

/**
 * One layer's drawing, or `{ refuse }`. `tile` is where the image is drawn (its own box) and
 * `clip` the area it may paint (the backdrop's box); `repeat` whether the tile repeats over `clip`.
 * Primitives, all in slide px:
 *   { kind: 'shade', type: 'linear'|'radial', coords, space (matrix: shading space to slide px), clip: [x, y, w, h], stops: [{ u (0..1), c, a }] }
 *   { kind: 'fill', path: [[op, …nums]], rule: 'nonzero'|'evenodd', clip, c, a }
 */
export function layerPrims(layer, tile, clip, repeat) {
	const [tx, ty, tw, th] = tile;
	if (!(tw > 0 && th > 0)) return { prims: [] };
	const covers = tx <= clip[0] + 0.5 && ty <= clip[1] + 0.5 && tx + tw >= clip[0] + clip[2] - 0.5 && ty + th >= clip[1] + clip[3] - 0.5;
	const area = repeat ? clip : [Math.max(tx, clip[0]), Math.max(ty, clip[1]), Math.min(tx + tw, clip[0] + clip[2]) - Math.max(tx, clip[0]), Math.min(ty + th, clip[1] + clip[3]) - Math.max(ty, clip[1])];
	if (!(area[2] > 0 && area[3] > 0)) return { prims: [] };
	// A tile smaller than the area it repeats over: only a dot texture is read (a disk per tile).
	if (repeat && !covers) return dotPrims(layer, tile, clip);
	if (layer.kind === 'linear') {
		const { coords, len, dir } = linearLine(layer.angle, tx, ty, tw, th);
		if (!(len > 0)) return { prims: [] };
		const stops = resolveStops(layer.stops, len);
		if (!layer.repeating) return { prims: [{ kind: 'shade', type: 'linear', coords, space: [1, 0, 0, 1, 0, 0], clip: area, stops: norm(sampleStops(stops, layer.space), 0, len) }] };
		const b = bandsOf(stops);
		if (b.refuse) return b;
		// Stripes across the line: a band at u runs perpendicular to `dir`, long enough to cross the tile.
		const [x0, y0] = coords;
		const px = -dir[1], py = dir[0];
		const M = len + tw + th;
		const k0 = Math.floor((0 - b.start - b.period) / b.period), k1 = Math.ceil((len - b.start) / b.period);
		if ((k1 - k0) * b.bands.length > MAX_BANDS) return { refuse: 'backdrop-too-many-bands' };
		return { prims: groupByColor(b.bands, (band) => {
			const path = [];
			for (let k = k0; k <= k1; k++) {
				const u0 = b.start + k * b.period + band.u0, u1 = b.start + k * b.period + band.u1;
				if (u1 < 0 || u0 > len) continue;
				const a = [x0 + dir[0] * u0, y0 + dir[1] * u0], c = [x0 + dir[0] * u1, y0 + dir[1] * u1];
				path.push(['M', r3(a[0] - px * M), r3(a[1] - py * M)], ['L', r3(a[0] + px * M), r3(a[1] + py * M)], ['L', r3(c[0] + px * M), r3(c[1] + py * M)], ['L', r3(c[0] - px * M), r3(c[1] - py * M)], ['Z']);
			}
			return { path, rule: 'nonzero' };
		}, area) };
	}
	const r = layer.radial;
	const cx = tx + lenOf(r.at[0], tw), cy = ty + lenOf(r.at[1], th);
	const [rx, ry] = radialRadii(r, tw, th, cx - tx, cy - ty);
	if (!(rx > 0 && ry > 0)) return { refuse: 'backdrop-radial-zero' };
	const stops = resolveStops(layer.stops, rx);
	const k = ry / rx;
	if (!layer.repeating) {
		return { prims: [{ kind: 'shade', type: 'radial', coords: [cx, cy, 0, cx, cy, rx], space: [1, 0, 0, k, 0, cy * (1 - k)], clip: area, stops: norm(sampleStops(stops, layer.space), 0, rx) }] };
	}
	const b = bandsOf(stops);
	if (b.refuse) return b;
	// Rings out to the farthest corner of the area, measured in the ray's own (x) units.
	const far = Math.max(...[[area[0], area[1]], [area[0] + area[2], area[1]], [area[0], area[1] + area[3]], [area[0] + area[2], area[1] + area[3]]].map(([x, y]) => Math.hypot(x - cx, (y - cy) / k)));
	const k1 = Math.ceil((far - b.start) / b.period);
	const k0 = Math.floor(-b.start / b.period) - 1;
	if ((k1 - k0 + 1) * b.bands.length > MAX_BANDS) return { refuse: 'backdrop-too-many-bands' };
	return { prims: groupByColor(b.bands, (band) => {
		const path = [];
		for (let i = k0; i <= k1; i++) {
			const u0 = Math.max(0, b.start + i * b.period + band.u0), u1 = b.start + i * b.period + band.u1;
			if (u1 <= 0 || u0 > far) continue;
			path.push(...ellipse(cx, cy, u1, u1 * k));
			if (u0 > 0) path.push(...ellipse(cx, cy, u0, u0 * k, true));
		}
		return { path, rule: 'nonzero' };
	}, area) };
}

/** Bands of one color share one path. */
function groupByColor(bands, build, clip) {
	const byKey = new Map();
	for (const band of bands) {
		const key = `${band.c.join(',')}|${band.a}`;
		const { path, rule } = build(band);
		if (!byKey.has(key)) byKey.set(key, { kind: 'fill', path: [], rule, clip, c: band.c, a: band.a });
		byKey.get(key).path.push(...path);
	}
	return [...byKey.values()].filter((p) => p.path.length);
}

/** Stops in px to 0..1 over [u0, u1]. */
function norm(stops, u0, u1) {
	return stops.map((s) => ({ u: (s.u - u0) / (u1 - u0), c: s.c, a: s.a }));
}

/**
 * A dot texture: a small radial gradient (a flat disk that fades to transparent within a pixel)
 * repeated in tiles. Drawn as one disk per tile at the fade's midpoint radius. Anything else in a
 * small repeating tile stays in the photo.
 */
function dotPrims(layer, tile, clip) {
	if (layer.kind !== 'radial' || layer.repeating) return { refuse: 'backdrop-tile' };
	const [tx, ty, tw, th] = tile;
	const r = layer.radial;
	const cx = lenOf(r.at[0], tw), cy = lenOf(r.at[1], th);
	const [rx, ry] = radialRadii(r, tw, th, cx, cy);
	if (!(rx > 0 && ry > 0)) return { refuse: 'backdrop-radial-zero' };
	const stops = resolveStops(layer.stops, rx);
	// Flat ink from the center to r1, a fade of at most 1 px to transparent at r2, and nothing past it.
	const ink = stops[0].color;
	let i = 0;
	while (i + 1 < stops.length && stops[i + 1].color.a === ink.a && stops[i + 1].color.c.every((v, k) => Math.abs(v - ink.c[k]) < 0.5)) i++;
	const r1 = stops[i].u;
	const rest = stops.slice(i + 1);
	if (!rest.length || rest.some((s) => s.color.a > 0) || ink.a <= 0) return { refuse: 'backdrop-tile' };
	const r2 = rest[0].u;
	if (r2 - r1 > 1 || r2 <= 0) return { refuse: 'backdrop-tile' };
	const rad = (r1 + r2) / 2, k = ry / rx;
	if (rad * Math.max(1, k) > Math.min(tw, th) / 2) return { refuse: 'backdrop-tile' }; // a disk that reaches the tile's edge would be cut there
	const i0 = Math.floor((clip[0] - tx) / tw), i1 = Math.ceil((clip[0] + clip[2] - tx) / tw);
	const j0 = Math.floor((clip[1] - ty) / th), j1 = Math.ceil((clip[1] + clip[3] - ty) / th);
	if ((i1 - i0) * (j1 - j0) > MAX_DISKS) return { refuse: 'backdrop-too-many-dots' };
	const path = [];
	for (let i2 = i0; i2 < i1; i2++) for (let j = j0; j < j1; j++) path.push(...ellipse(tx + i2 * tw + cx, ty + j * th + cy, rad, rad * k));
	return { prims: [{ kind: 'fill', path, rule: 'nonzero', clip, c: ink.c, a: ink.a }] };
}

// ── The whole backdrop ──────────────────────────────────────────────────────────────────────

/** A computed `background-size` entry for a gradient (no intrinsic size) in an area `W`×`H`. */
export function tileSize(size, W, H) {
	const s = size.trim();
	if (s === 'cover' || s === 'contain') return [W, H];
	const p = splitSpaces(s);
	const one = (x, ref) => {
		if (x === 'auto') return null;
		if (LEN.test(x)) return lenOf(x, ref);
		const c = x.match(CALC);
		return c ? (Number(c[1]) / 100) * ref + (c[2] === '-' ? -1 : 1) * Number(c[3]) : NaN;
	};
	const w = one(p[0], W), h = one(p[1] ?? 'auto', H);
	if (Number.isNaN(w) || Number.isNaN(h)) return null;
	return [w ?? W, h ?? H];
}

/**
 * A computed `background-position` entry for a tile `w`×`h` in an area `W`×`H`: two lengths, each a px, a %
 * (of the room left over), or the `calc(P% ± Npx)` a right- or bottom-anchored mark computes to.
 */
export function tilePos(pos, W, H, w, h) {
	const p = splitSpaces(pos.trim());
	if (p.length !== 2) return null;
	const at = (x, room) => {
		const m = x.match(LEN);
		if (m) return m[2] === '%' ? (Number(m[1]) / 100) * room : Number(m[1]);
		const c = x.match(CALC);
		if (c) return (Number(c[1]) / 100) * room + (c[2] === '-' ? -1 : 1) * Number(c[3]);
		return NaN;
	};
	const out = [at(p[0], W - w), at(p[1], H - h)];
	return out.some(Number.isNaN) ? null : out;
}

/**
 * The backdrop's drawing, bottom layer first, or `{ refuse }`.
 * @param {{ stack: Array<{ image: string, size: string, position: string, repeat: string }>, box: number[], bg: number[] }} b
 *   the computed `background-*` lists of each painted box, bottom first (the `.backdrop` itself, then its
 *   mark and edge pseudo-elements, which fill the same box), the box `[x, y, w, h]`, and the slide's own
 *   opaque color under it.
 * @returns {{ prims: object[] } | { refuse: string }}
 */
export function backdropPrims(b) {
	const prims = [];
	const state = { bottom: true };
	for (const layers of b.stack) {
		// Drawing the reader built itself (the section's inset-shadow rings): taken as it is.
		if (layers.prims) { prims.push(...layers.prims); continue; }
		if (layers.mask) {
			const got = maskedFill(layers);
			if (got.refuse) return got;
			prims.push(...got.prims);
			if (got.prims.length) state.bottom = false;
			continue;
		}
		// An entry may bring its own box (the section's own layers, under the backdrop): where its layers are placed,
		// and where they may paint.
		const got = stackPrims(layers, layers.box || b.box, b.bg, state, layers.clip);
		if (got.refuse) return got;
		if (layers.section) for (const p of got.prims) p.section = true;
		prims.push(...got.prims);
	}
	for (const p of prims) if (p.kind === 'shade' && p.type === 'radial') trimRadial(p, b.bg);
	return { prims: toAlphaMaps(flattenBase(prims, b.box, b.bg)) };
}

/**
 * Every glow from the bottom up to the first texture, blended onto the slide's color in one opaque picture: `{ kind: 'rgbmap',
 * clip, w, h, data }` at ALPHA_STEP px a sample, computed here from the gradients' own math (no dither, no JPEG). A viewer
 * scales it smoothly. Measured per full page in Chrome's PDF engine (PDFium): an axial or radial shading 0.07 s, this picture
 * 0.012 s; poppler 0.093 s and 0.016 s. A glow is low-frequency, so a quarter-resolution sample loses nothing a reader sees.
 */
function flattenBase(all, box, bg) {
	// The section's own rings (a frame's keyline) paint under the backdrop in the browser, under a glow of a few percent. Drawn
	// under an opaque picture they would vanish, so they go just above it: the keyline stays exact, the faint glow over it is lost.
	// The section's own strips go with them: a slide's 1 px hairline, a tint-edge rail. As the bottom layer they would stop the
	// picture, and every glow above would fall back to slower opacity maps (the Studio's PDF, whose edge reader leaves its
	// hairline to the section layers). A section layer over the whole box is a glow like any other and stays in the picture.
	const lift = (p) => p.ring || (p.section && !(p.kind === 'shade' && smooth(p) && covers(p.layerClip || p.clip, box)));
	const rings = all.filter(lift);
	const prims = all.filter((p) => !lift(p));
	// Only a smooth glow over the whole box: a hard stop (a band, a bar's edge) or a strip (strata's 0.31cqi top bar) would
	// blur across a quarter-resolution sample. The first one stops the picture, and it and all above draw as before.
	let n = 0;
	while (n < prims.length && prims[n].kind === 'shade' && smooth(prims[n]) && covers(prims[n].layerClip || prims[n].clip, box)) n++;
	if (!n) return [...rings, ...prims];
	const [X, Y, W, H] = box;
	const w = Math.max(1, Math.ceil(W / ALPHA_STEP)), h = Math.max(1, Math.ceil(H / ALPHA_STEP));
	const layers = prims.slice(0, n).map((p) => ({ clip: p.clip, hole: p.hole, at: p.type === 'linear' ? lineParam(p.coords) : radialParam(p.coords, p.space), stops: p.stops }));
	const data = new Uint8Array(w * h * 3);
	for (let j = 0; j < h; j++) {
		const y = Y + ((j + 0.5) * H) / h;
		for (let i = 0; i < w; i++) {
			const x = X + ((i + 0.5) * W) / w;
			let r = bg[0], g = bg[1], bl = bg[2];
			for (const L of layers) {
				if (!inside(L.clip, x, y)) continue;
				if (L.hole && ((x - L.hole[0]) / L.hole[2]) ** 2 + ((y - L.hole[1]) / L.hole[3]) ** 2 < 1) continue;
				const s = stopAt(L.stops, L.at(x, y));
				r += (s.c[0] - r) * s.a; g += (s.c[1] - g) * s.a; bl += (s.c[2] - bl) * s.a;
			}
			const o = (j * w + i) * 3;
			data[o] = Math.round(clamp255(r)); data[o + 1] = Math.round(clamp255(g)); data[o + 2] = Math.round(clamp255(bl));
		}
	}
	return [{ kind: 'rgbmap', clip: box, w, h, data }, ...rings, ...prims.slice(n)];
}

/** No hard stop: no two stops at one offset with different paint. */
function smooth(p) {
	return p.stops.every((s, i) => i === 0 || s.u > p.stops[i - 1].u + 1e-6 || (s.a === p.stops[i - 1].a && s.c.every((v, k) => Math.abs(v - p.stops[i - 1].c[k]) < 0.5)));
}
const covers = (a, b) => a[0] <= b[0] + 0.5 && a[1] <= b[1] + 0.5 && a[0] + a[2] >= b[0] + b[2] - 0.5 && a[1] + a[3] >= b[1] + b[3] - 0.5;

/** The color and alpha of sampled stops `[{ u, c, a }]` at t, padded past both ends (premultiplied between neighbors). */
function stopAt(stops, t) {
	if (t <= stops[0].u) return stops[0];
	for (let i = 1; i < stops.length; i++) {
		const b = stops[i];
		if (t > b.u) continue;
		const a = stops[i - 1];
		const f = b.u > a.u ? (t - a.u) / (b.u - a.u) : 1;
		const al = a.a + (b.a - a.a) * f;
		if (al <= 1e-6) return { c: a.c, a: 0 };
		return { c: a.c.map((v, k) => (v * a.a + (b.c[k] * b.a - v * a.a) * f) / al), a: al };
	}
	return stops.at(-1);
}

/**
 * A solid fill shaped by a mask of straight ramps: the clear panel (`backdrop: clear`) on its export face, a canvas-colored
 * box whose edges fade over a bleed, drawn there as `mask-image` (two linear ramps, `mask-composite: intersect`) for the blur
 * the screen face uses (base.finish.css § THE STUDIO RASTER). The PDF draws the same thing: the fill under a soft mask whose
 * group paints one ramp and multiplies the other over it. One shading per axis, so no tile seams (the nine-tile attempt's
 * seams: 2026-09-26-backdrop-register.md §4.7).
 * Entry: `{ image, size, position, repeat, box, clip, mask: { image, size, position, repeat, composite, box } }`.
 * Primitive: `{ kind: 'maskfill', clip, c, a, tile, ramps: [{ coords, stops: [{ u, a }] }] }`.
 */
function maskedFill(e) {
	// The fill: one solid layer (a `linear-gradient(c, c)` or the like) over the clip box.
	const layers = splitTop(e.image).map(parseLayer).filter((l) => !l.none);
	if (layers.length !== 1 || layers[0].refuse || layers[0].repeating) return { refuse: 'backdrop-mask-fill' };
	const st = layers[0].stops;
	const c0 = st[0].color;
	if (!st.every((x) => x.color.a === c0.a && x.color.c.every((v, k) => Math.abs(v - c0.c[k]) < 0.5))) return { refuse: 'backdrop-mask-fill' };
	const size = tileSize(splitTop(e.size)[0], e.box[2], e.box[3]);
	const pos = size && tilePos(splitTop(e.position)[0], e.box[2], e.box[3], size[0], size[1]);
	if (!pos) return { refuse: 'backdrop-mask-fill' };
	const fill = intersect([e.box[0] + pos[0], e.box[1] + pos[1], size[0], size[1]], e.clip);
	if (!fill) return { prims: [] };
	// The mask: one or two linear ramps along an axis, placed once each, combined by intersect (their product).
	const m = e.mask;
	const imgs = splitTop(m.image);
	const comps = splitTop(m.composite);
	if (imgs.length > 2 || (imgs.length === 2 && comps[0].trim() !== 'intersect')) return { refuse: 'backdrop-mask-composite' };
	const ramps = [];
	let tile = null;
	for (let i = 0; i < imgs.length; i++) {
		const L = parseLayer(imgs[i]);
		if (L.none || L.refuse || L.kind !== 'linear' || L.repeating || ![90, 180, 270, 0].includes(((L.angle % 360) + 360) % 360)) return { refuse: 'backdrop-mask-image' };
		if (!/^no-repeat( no-repeat)?$/.test(splitTop(m.repeat)[i % splitTop(m.repeat).length].trim())) return { refuse: 'backdrop-mask-repeat' };
		if (!L.stops.every((x) => x.color.c.every((v) => v < 0.5))) return { refuse: 'backdrop-mask-image' }; // alpha masks of black only
		const sz = tileSize(splitTop(m.size)[i % splitTop(m.size).length], m.box[2], m.box[3]);
		const ps = sz && tilePos(splitTop(m.position)[i % splitTop(m.position).length], m.box[2], m.box[3], sz[0], sz[1]);
		if (!ps) return { refuse: 'backdrop-mask-geometry' };
		const t = [m.box[0] + ps[0], m.box[1] + ps[1], sz[0], sz[1]];
		tile = tile ? intersect(tile, t) : t;
		if (!tile) return { prims: [] };
		const { coords, len } = linearLine(L.angle, ...t);
		const stops = resolveStops(L.stops, len);
		ramps.push({ coords, stops: norm(sampleStops(stops, 'srgb'), 0, len).map((x) => ({ u: x.u, a: x.a })) });
	}
	const clip = intersect(fill, tile);
	if (!clip) return { prims: [] };
	return { prims: [{ kind: 'maskfill', clip, c: c0.c, a: c0.a, ramps }] };
}

const intersect = (a, b) => {
	const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]);
	const x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
	return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
};

function stackPrims(b, box, bg, state, clipBox = box) {
	const images = splitTop(b.image);
	const sizes = splitTop(b.size), positions = splitTop(b.position), repeats = splitTop(b.repeat);
	const [X, Y, W, H] = box;
	const prims = [];
	// CSS lists the top layer first; drawing starts at the bottom.
	for (let i = images.length - 1; i >= 0; i--) {
		const layer = parseLayer(images[i]);
		if (layer.none) continue;
		if (layer.refuse) return layer;
		const size = tileSize(sizes[i % sizes.length], W, H);
		if (!size) return { refuse: 'backdrop-size' };
		const pos = tilePos(positions[i % positions.length], W, H, size[0], size[1]);
		if (!pos) return { refuse: 'backdrop-position' };
		const rep = repeats[i % repeats.length].trim();
		if (!/^(repeat|no-repeat)( (repeat|no-repeat))?$/.test(rep) || /repeat no-repeat|no-repeat repeat/.test(rep)) return { refuse: 'backdrop-repeat' };
		const got = layerPrims(layer, [X + pos[0], Y + pos[1], size[0], size[1]], clipBox, rep.startsWith('repeat'));
		if (got.refuse) return got;
		let painted = 0;
		for (const p of got.prims) {
			if (p.kind === 'shade' && p.stops.every((x) => x.a <= 1e-4)) continue; // a placeholder layer that paints nothing
			painted++;
			// The bottom glow lies on the slide's solid color alone, wherever it paints: blend it onto that color
			// here, so it needs no transparency.
			if (state.bottom && p.kind === 'shade') { p.stops = p.stops.map((s) => ({ u: s.u, c: s.c.map((v, k) => v * s.a + bg[k] * (1 - s.a)), a: 1 })); p.onSlideColor = true; }
			prims.push(p);
		}
		if (painted) state.bottom = false;
	}
	return { prims };
}

/** Slide px per sample of an opacity map: 1/4 resolution. A fade is smooth, and every viewer measured interpolates it. */
export const ALPHA_STEP = 4;

/**
 * A fade of ONE color (a glow above the bottom one, a vignette, a spotlight's scrim, the clear panel) as an opacity map:
 * `{ kind: 'alphamap', c, clip, w, h, data }`, sampled from the gradient's own math at ALPHA_STEP px. The writer draws it as
 * a 1x1 color image over that map (an image soft mask), which every viewer composites fast; a soft-mask GROUP, which poppler
 * renders as a page-sized bitmap per layer, tripled a clear-panel deck's draw time (6.8 s to 22.5 s). Neighbors of the same
 * color merge, exactly (1 − Π(1 − aᵢ)). A fade whose color changes along it keeps its soft-mask group.
 */
function toAlphaMaps(prims) {
	const out = [];
	for (const p of prims) {
		const one = alphaSource(p);
		if (!one) { out.push(p); continue; }
		const last = out.at(-1);
		if (last?.kind === 'alphamap-src' && last.c.every((v, k) => Math.abs(v - one.c[k]) < 0.5)) { last.parts.push(one); last.clip = union(last.clip, one.clip); continue; }
		out.push({ kind: 'alphamap-src', c: one.c, clip: one.clip, parts: [one] });
	}
	return out.map((p) => (p.kind === 'alphamap-src' ? rasterize(p) : p));
}

/** A primitive that is one color with a varying alpha, as `{ c, clip, alphaAt(x, y) }`, or null. */
function alphaSource(p) {
	if (p.kind === 'maskfill') {
		const ramps = p.ramps.map((r) => ({ at: lineParam(r.coords), stops: r.stops }));
		return { c: p.c, clip: p.clip, alphaAt: (x, y) => p.a * ramps.reduce((m, r) => m * stopAlpha(r.stops, r.at(x, y)), 1) };
	}
	if (p.kind !== 'shade' || !smooth(p)) return null;
	const al = p.stops.map((s) => s.a);
	if (!al.some((a) => Math.abs(a - al[0]) > 1 / 1024)) return null; // a constant alpha: a shading at one opacity
	const inked = p.stops.filter((s) => s.a > 1e-4);
	const c = inked[0].c;
	if (!inked.every((s) => s.c.every((v, k) => Math.abs(v - c[k]) < 0.75))) return null; // the color changes too
	const at = p.type === 'linear' ? lineParam(p.coords) : radialParam(p.coords, p.space);
	const hole = p.hole;
	return { c, clip: p.clip, alphaAt: (x, y) => (hole && ((x - hole[0]) / hole[2]) ** 2 + ((y - hole[1]) / hole[3]) ** 2 < 1 ? 0 : stopAlpha(p.stops, at(x, y))) };
}

const lineParam = ([x0, y0, x1, y1]) => {
	const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
	return (x, y) => ((x - x0) * dx + (y - y0) * dy) / L2;
};
const radialParam = ([cx, cy, , , , r], space) => {
	const k = space[3] || 1;
	return (x, y) => Math.hypot(x - cx, (y - cy) / k) / r;
};
/** The alpha of sampled stops `[{ u, a }]` (u 0..1) at t, padded past both ends. */
function stopAlpha(stops, t) {
	if (t <= stops[0].u) return stops[0].a;
	for (let i = 1; i < stops.length; i++) {
		const b = stops[i];
		if (t <= b.u) { const a = stops[i - 1]; return b.u > a.u ? a.a + ((b.a - a.a) * (t - a.u)) / (b.u - a.u) : b.a; }
	}
	return stops.at(-1).a;
}
const union = (a, b) => {
	const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
	return [x0, y0, Math.max(a[0] + a[2], b[0] + b[2]) - x0, Math.max(a[1] + a[3], b[1] + b[3]) - y0];
};
const inside = (q, x, y) => x >= q[0] && y >= q[1] && x < q[0] + q[2] && y < q[1] + q[3];

function rasterize(m) {
	const [X, Y, W, H] = m.clip;
	const w = Math.max(1, Math.ceil(W / ALPHA_STEP)), h = Math.max(1, Math.ceil(H / ALPHA_STEP));
	const data = new Uint8Array(w * h);
	for (let j = 0; j < h; j++) {
		const y = Y + ((j + 0.5) * H) / h;
		for (let i = 0; i < w; i++) {
			const x = X + ((i + 0.5) * W) / w;
			let keep = 1;
			for (const part of m.parts) if (inside(part.clip, x, y)) keep *= 1 - Math.min(1, Math.max(0, part.alphaAt(x, y)));
			data[j * w + i] = Math.round((1 - keep) * 255);
		}
	}
	return { kind: 'alphamap', c: m.c, clip: m.clip, w, h, data };
}

/**
 * A radial glow that has faded out (to zero alpha, or, the bottom glow only, to the slide's own color it is blended onto) paints nothing past
 * that ring: clip it to the ring's box. Poppler's cost to draw a radial shading follows the area it covers (about 0.13 s a
 * full 150-dpi page), and most glows end well inside the slide.
 */
function trimRadial(p, bg) {
	// Nothing painted: zero alpha; or, for the bottom glow ALONE (blended onto the slide's color), that color itself. Above it,
	// an opaque slide color is not nothing: a spotlight's scrim is exactly that, covering the finish outside its window.
	const empty = (s) => s.a <= 1e-4 || (p.onSlideColor && s.a >= 0.999 && s.c.every((v, k) => Math.abs(v - bg[k]) < 0.5));
	// A vignette is the other way round: empty inside a ring, ink outside. Cut the inside out (an even-odd hole).
	let j = 0;
	while (j < p.stops.length && empty(p.stops[j])) j++;
	if (j > 0 && j < p.stops.length && p.stops[j - 1].u > 0.05) {
		const [hx, hy, , , , hr] = p.coords;
		const u0 = p.stops[j - 1].u;
		p.hole = [hx, hy, u0 * hr, u0 * hr * p.space[3]];
	}
	let i = p.stops.length;
	while (i > 0 && empty(p.stops[i - 1])) i--;
	if (i === p.stops.length || i === 0) return;
	const uEnd = p.stops[i].u;
	const [cx, cy, , , , rx] = p.coords;
	const k = p.space[3];
	const ry = rx * k;
	const box = [cx - uEnd * rx, cy - uEnd * ry, 2 * uEnd * rx, 2 * uEnd * ry];
	p.layerClip = p.layerClip || p.clip; // where the layer paints before the trim: what flattenBase asks of it
	const x0 = Math.max(box[0], p.clip[0]), y0 = Math.max(box[1], p.clip[1]);
	const x1 = Math.min(box[0] + box[2], p.clip[0] + p.clip[2]), y1 = Math.min(box[1] + box[3], p.clip[1] + p.clip[3]);
	p.clip = x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : [p.clip[0], p.clip[1], 0, 0];
}

