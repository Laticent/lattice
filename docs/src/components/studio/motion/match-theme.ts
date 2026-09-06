// MATCH THE THEME — rewrite a drawing's own colors to palette tokens, in the ART.
//
// This is v1's ONLY color mechanism, and the reason it rewrites the art rather than setting
// `SvgElement.color` on the spec is measured, not stylistic:
//
//   `svg-paint.ts` does `node.setAttribute('stroke', resolveColor(el.color, target))` — it sets
//   STROKE ONLY, never fill, and it sets it on the CLONE the live stage mounts, never on the slide's
//   poster. So a spec-level token picker is inert on the fill-only art most people paste, AND
//   invisible in the PDF and in every shared `.html` — which is most of where a deck is read.
//
// Rewriting the art reaches fill and stroke, lands in the poster, and therefore survives into the
// PDF and the exported player. It also satisfies HARD RULE #3 on the shipped artifact rather than
// only in the live preview.
//
// It is OFFERED, never forced. The intake receipt already reports "N fixed colors — this drawing
// will not recolor with the deck's theme"; this is the fix that line names. A drawing whose author
// chose its palette deliberately keeps it by simply not pressing the button.

/** The categorical ramp, in the order a reader meets it. `--accent` leads because a drawing's
 *  busiest color is almost always its subject. */
const RAMP = ['var(--accent)', 'var(--cat-2-mark)', 'var(--cat-3-mark)', 'var(--cat-4-mark)', 'var(--cat-5-mark)', 'var(--cat-6-mark)', 'var(--cat-7-mark)', 'var(--cat-8-mark)'];

/** Near-black and near-white are structural rather than categorical: an outline drawn in black wants
 *  the deck's ink, and a white fill wants the deck's paper. Mapping them into the ramp is what makes
 *  a recolored drawing look like a parrot. */
const INK = 'var(--text-heading)';
const PAPER = 'var(--bg)';

function isTokenish(v: string): boolean {
	const s = v.trim().toLowerCase();
	return s === '' || s === 'none' || s === 'currentcolor' || s === 'transparent' || s.startsWith('var(') || s.startsWith('url(');
}

/** Parse a CSS color into 0-255 channels, or null when it is not one we can reason about. */
export function readColor(value: string): [number, number, number] | null {
	const v = value.trim().toLowerCase();
	const hex = /^#([0-9a-f]{3,8})$/.exec(v);
	if (hex) {
		const h = hex[1];
		if (h.length === 3 || h.length === 4) return [Number.parseInt(h[0] + h[0], 16), Number.parseInt(h[1] + h[1], 16), Number.parseInt(h[2] + h[2], 16)];
		if (h.length === 6 || h.length === 8) return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)];
		return null;
	}
	const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
	if (rgb) {
		const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
		if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) return [parts[0], parts[1], parts[2]];
	}
	const NAMED: Record<string, [number, number, number]> = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128] };
	return NAMED[v] ?? null;
}

/** Which token a literal color should become. Near-black → ink, near-white → paper, everything else
 *  takes a ramp slot in FIRST-SEEN order, so the drawing's own reading order decides the palette. */
export function tokenFor(value: string, assigned: Map<string, string>): string | null {
	const key = value.trim().toLowerCase();
	const already = assigned.get(key);
	if (already) return already;
	const rgb = readColor(value);
	if (!rgb) return null;
	const [r, g, b] = rgb;
	const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	const spread = Math.max(r, g, b) - Math.min(r, g, b);
	let token: string;
	if (spread < 24 && luma < 0.22) token = INK;
	else if (spread < 24 && luma > 0.88) token = PAPER;
	else token = RAMP[Array.from(assigned.values()).filter((t) => t !== INK && t !== PAPER).length % RAMP.length];
	assigned.set(key, token);
	return token;
}

/**
 * Rewrite every literal `fill` and `stroke` in the drawing to a palette token.
 *
 * Written as PRESENTATION ATTRIBUTES rather than inline style, deliberately: an inline `style`
 * outranks a presentation attribute in the cascade, so paint written as style would be immovable by
 * anything downstream — including the engine itself.
 */
export function matchTheme(art: string): string {
	const doc = new DOMParser().parseFromString(art, 'text/html');
	const svg = doc.querySelector('svg');
	if (!svg) return art;
	const assigned = new Map<string, string>();

	for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
		for (const name of ['fill', 'stroke'] as const) {
			const attr = el.getAttribute(name);
			if (attr && !isTokenish(attr)) {
				const token = tokenFor(attr, assigned);
				if (token) el.setAttribute(name, token);
			}
		}
		const style = el.getAttribute('style');
		if (!style) continue;
		let rest = style;
		for (const name of ['fill', 'stroke'] as const) {
			const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(rest);
			if (!m || isTokenish(m[1])) continue;
			const token = tokenFor(m[1], assigned);
			if (!token) continue;
			// Move it OUT of style and onto the attribute, so nothing downstream is outranked.
			rest = rest.replace(m[0], '');
			el.setAttribute(name, token);
		}
		const cleaned = rest.replace(/^\s*;+|;+\s*$/g, '').trim();
		if (cleaned) el.setAttribute('style', cleaned);
		else el.removeAttribute('style');
	}
	return svg.outerHTML;
}
