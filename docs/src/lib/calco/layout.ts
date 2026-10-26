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
import { type FontMetrics, faceFor, readFontMetrics } from './fonts.js';
import type { EmbeddedFont, TextFrame, TextRun, TextStyle } from './types.js';

/** Loops, not a spread: `Math.min(...xs)` overflows the call stack past about 120,000 values. */
const highest = (xs: number[]) => xs.reduce((m, v) => (v > m ? v : m), Number.NEGATIVE_INFINITY);

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
 * What a proportional `spcPct` of 100% is, in ems: a line 1.2 times the font size, whatever the
 * face (so PowerPoint's own files do not shift when a font is swapped). LibreOffice's PPTX
 * import turns on its `FontIndependentLineSpacing` mode to match: the first baseline sits at
 * `top + m * 1.2 * size - 0.2 * size` (fitted on three faces and five spacings in LibreOffice 24.2
 * and again in 26.8, to three decimals). The earlier model, the face's own ascent + descent, was
 * 5% off for Outfit and 12% for Playfair. PowerPoint itself is UNVERIFIED.
 */
export const OOXML_LINE = 1.2;
/** The part of that line below the baseline, in ems. */
export const OOXML_DESCENT = 0.2;

/**
 * Line spacing as a multiple of `OOXML_LINE` times the font size: the pitch the browser used, in
 * the unit a proportional `spcPct` is read in. `metrics` is kept for callers; the unit is
 * font-independent.
 */
export function spacingMultiple(frame: TextFrame, _metrics: FontMetrics, size: number): number {
	return size > 0 ? frame.lineHeight / (OOXML_LINE * size) : 1;
}

/**
 * Place one frame. `slideW` bounds the spare width; `metrics` is the first line's
 * dominant face.
 *
 * `spacing` is how the writer states line spacing, because it moves the first baseline:
 *  - `exact` (the .odp's fixed line height): the suite puts all the leading ABOVE the
 *    text, so the box top is the baseline minus (pitch − descent);
 *  - `proportional` (the .pptx's spcPct): the line is `OOXML_LINE` × size scaled by the
 *    multiple, with `OOXML_DESCENT` × size below the baseline, so the box top is the baseline
 *    minus (pitch − 0.2 × size). Measured in LibreOffice 24.2 and 26.8.
 */
export function placeFrame(frame: TextFrame, slideW: number, metrics: FontMetrics, size: number, spacing: 'exact' | 'proportional' = 'exact'): PlacedBox {
	const { ascent, descent } = metrics;
	// The browser's baseline: the glyph box splits ascent : descent.
	const baseline = frame.y + (frame.firstLineHeight * ascent) / (ascent + descent);
	const y = baseline - (frame.lineHeight - (spacing === 'proportional' ? OOXML_DESCENT : descent) * size);
	const maxSize = highest(frame.lines.flat().map((r) => r.style.size));
	const room =
		frame.align === 'center'
			? 2 * Math.min(frame.x, slideW - frame.x - frame.w)
			: frame.align === 'right'
				? frame.x
				: slideW - frame.x - frame.w;
	// A flow frame wraps at `w`, so its slack is a hair for the suite's own measure, not room
	// for an overhang: a word the browser wrapped must still not fit.
	const wanted = frame.flow ? Math.max(1.5, 0.01 * frame.w) : Math.max(0.1 * frame.w, 3 * maxSize);
	const slack = Math.max(0, Math.min(wanted, room));
	const x = frame.align === 'center' ? frame.x - slack / 2 : frame.align === 'right' ? frame.x - slack : frame.x;
	return { x, y, w: frame.w + slack, h: frame.lineHeight * frame.lines.length };
}

/**
 * A flow frame's lines as one paragraph: the browser's soft wraps become a space (the one the
 * browser dropped at each wrap) and the spacer that held a later line at its start is
 * dropped. Other frames keep their lines.
 */
export function flowLines(frame: TextFrame): TextRun[][] {
	if (!frame.flow) return frame.lines;
	const isSpacer = (r: TextRun) => r.style.size === 2 && r.text === '\u00A0';
	const out: TextRun[] = [];
	frame.lines.forEach((line, li) => {
		const runs = li ? line.filter((r, i) => !(i === 0 && isSpacer(r))) : line;
		const prev = out[out.length - 1];
		const next = runs[0];
		if (li && prev && next && !/\s$/.test(prev.text) && !/^\s/.test(next.text)) out.push({ text: ' ', style: prev.style });
		out.push(...runs);
	});
	return [out];
}

/**
 * The space before `next` when it follows `prev` in one text body, so its first baseline lands
 * where the browser put it. Both frames keep the geometry the browser gave them; this is the
 * baseline-to-baseline distance less what the suite already spends on the line itself
 * (`spacing` as in `placeFrame`). Never negative.
 */
export function paragraphGap(prev: TextFrame, prevMetrics: FontMetrics, prevSize: number, next: TextFrame, nextMetrics: FontMetrics, nextSize: number, spacing: 'exact' | 'proportional'): number {
	const base = (f: TextFrame, m: FontMetrics) => f.y + (f.firstLineHeight * m.ascent) / (m.ascent + m.descent);
	const delta = base(next, nextMetrics) - (base(prev, prevMetrics) + (prev.lines.length - 1) * prev.lineHeight);
	// Each paragraph's line puts `d` below its baseline: the face's descent for a fixed line
	// height, `OOXML_DESCENT` for a proportional one.
	const below = (m: FontMetrics, size: number) => (spacing === 'proportional' ? OOXML_DESCENT : m.descent) * size;
	return Math.max(0, delta - next.lineHeight + below(nextMetrics, nextSize) - below(prevMetrics, prevSize));
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
