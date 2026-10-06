/**
 * Where a text box goes so the office suite draws its text where the browser did.
 *
 * Two differences between the browser and an office suite decide the box:
 *
 * 1. LEADING. With a fixed line height L and a glyph box of ascent + descent, CSS splits
 *    the spare space evenly above and below the glyphs (half-leading). LibreOffice's fixed
 *    line spacing puts ALL of it above, so its baseline sits at `top + L - descent`. Placing
 *    the box at the browser's glyph top would draw every line low by half the leading —
 *    6px for 28px Outfit on a 47.6px pitch, measured. So the box is placed from the
 *    browser's BASELINE: `top = baseline - (L - descent)`.
 *
 * 2. WIDTH. The suite measures with its own shaper, so a line can come out a hair wider
 *    than the browser's and wrap. Lines are already broken where the browser broke them,
 *    so the box gets spare width on the side its alignment grows toward, kept on the slide.
 */
import { type FontMetrics, faceFor, readFontMetrics } from './fonts';
import type { EmbeddedFont, TextFrame, TextStyle } from './types';

/** Used when the face is not embedded: a typical text face (ascent 0.8 of the glyph box). */
const FALLBACK: FontMetrics = { ascent: 0.96, descent: 0.24 };

/** A text frame's box on the page, px. */
export interface PlacedBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The style that sets a line's height: the largest run in it. */
export function dominantStyle(line: TextFrame['lines'][number]): TextStyle {
	let best = line[0].style;
	for (const run of line) if (run.style.size > best.size) best = run.style;
	return best;
}

/** Metrics for a style, from its embedded face, cached per face. */
export function metricsFor(style: TextStyle, fonts: EmbeddedFont[], cache: Map<EmbeddedFont, FontMetrics | null>): FontMetrics {
	const face = faceFor(style, fonts);
	if (!face) return FALLBACK;
	if (!cache.has(face)) cache.set(face, readFontMetrics(face.bytes));
	return cache.get(face) || FALLBACK;
}

/**
 * Place one frame. `slideW` bounds the spare width; `metrics` is the first line's
 * dominant face.
 */
export function placeFrame(frame: TextFrame, slideW: number, metrics: FontMetrics, size: number): PlacedBox {
	const { ascent, descent } = metrics;
	// The browser's baseline: the glyph box splits ascent : descent.
	const baseline = frame.y + (frame.firstLineHeight * ascent) / (ascent + descent);
	const y = baseline - (frame.lineHeight - descent * size);
	const maxSize = Math.max(...frame.lines.flat().map((r) => r.style.size));
	const room =
		frame.align === 'center'
			? 2 * Math.min(frame.x, slideW - frame.x - frame.w)
			: frame.align === 'right'
				? frame.x
				: slideW - frame.x - frame.w;
	const slack = Math.max(0, Math.min(Math.max(0.1 * frame.w, 3 * maxSize), room));
	const x = frame.align === 'center' ? frame.x - slack / 2 : frame.align === 'right' ? frame.x - slack : frame.x;
	return { x, y, w: frame.w + slack, h: frame.lineHeight * frame.lines.length };
}

/** `text-transform` applied to source text, for formats with no transform attribute. */
export function applyTransform(text: string, transform: string): string {
	if (transform === 'uppercase') return text.toUpperCase();
	if (transform === 'lowercase') return text.toLowerCase();
	if (transform === 'capitalize') return text.replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());
	return text;
}

/** `#rrggbb` → `RRGGBB` (OOXML spells colors without the hash). */
export function bareHex(color: string): string {
	return color.replace(/^#/, '').toUpperCase();
}
