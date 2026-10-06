/**
 * The PPTX writer: a Deck → a PowerPoint file with real text boxes over each slide's
 * picture. PptxGenJS is passed in and owns the OOXML package (masters, layouts, the notes
 * master), which is boilerplate no reader of this file needs to see.
 *
 * Three things PowerPoint cannot carry from the model, each a deliberate choice:
 *   - FONTS are named, not embedded. PowerPoint's embedded-font part is its own format and
 *     could not be verified here, so a reader without the deck's fonts sees a substitute.
 *   - WEIGHT is bold or not: a run at 600 or heavier is bold. OOXML has no numeric weight.
 *   - `text-transform` is applied to the text itself. PptxGenJS exposes no all-caps flag,
 *     so an uppercase label is stored in capitals.
 */

import type { FontMetrics } from './fonts';
import { applyTransform, bareHex, dominantStyle, metricsFor, placeFrame } from './layout';
import type { Deck, EmbeddedFont, TextRun } from './types';

const PX_PER_IN = 96;
const PT_PER_PX = 0.75;

/** The minimal PptxGenJS surface Calco uses. */
export interface PptxGenJSLike {
	title: string;
	subject: string;
	author: string;
	company: string;
	layout: string;
	defineLayout(layout: { name: string; width: number; height: number }): void;
	addSlide(): {
		addImage(options: Record<string, unknown>): unknown;
		addText(text: Array<{ text: string; options?: Record<string, unknown> }>, options: Record<string, unknown>): unknown;
		addNotes(notes: string): unknown;
	};
	write(options: { outputType: string }): Promise<unknown>;
}
export type PptxGenJSClass = new () => PptxGenJSLike;

/** Base64 for PNG bytes, in Node or a browser, without a dependency. */
function toBase64(bytes: Uint8Array): string {
	const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
	if (B) return B.from(bytes).toString('base64');
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(bin);
}

/**
 * The slide size in inches. A 16:9 deck uses PptxGenJS's built-in LAYOUT_WIDE (13.333 ×
 * 7.5); any other aspect gets a custom layout with the longest edge at 13.333in.
 */
export function pptxPageSize(width: number, height: number): { w: number; h: number; wide: boolean } {
	const w = Number(width);
	const h = Number(height);
	if (!(w > 0 && h > 0) || Math.abs(w / h - 16 / 9) < 0.01) return { w: 13.333, h: 7.5, wide: true };
	const longest = Math.max(w, h);
	const round = (n: number) => Math.round(n * 1000) / 1000;
	return { w: round((w / longest) * 13.333), h: round((h / longest) * 13.333), wide: false };
}

/**
 * Build the presentation. Returns the PptxGenJS instance; call `write({ outputType })`.
 */
export function buildPptx(PptxGenJS: PptxGenJSClass, deck: Deck): PptxGenJSLike {
	if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
		throw new Error('calco: no slides to write');
	}
	const W = deck.width > 0 ? deck.width : 1280;
	const H = deck.height > 0 ? deck.height : 720;
	const page = pptxPageSize(W, H);
	// The deck's px map onto the page's inches; font sizes scale the same way.
	const inPerPx = page.w / W;
	const ptScale = (inPerPx * PX_PER_IN) * PT_PER_PX;
	const inch = (px: number) => Math.round(px * inPerPx * 10000) / 10000;
	const points = (px: number) => Math.round(px * ptScale * 100) / 100;

	const pptx = new PptxGenJS();
	pptx.title = (deck.title || 'deck').trim();
	if (deck.subject) pptx.subject = deck.subject;
	pptx.author = deck.author || 'Calco';
	pptx.company = deck.company || 'Calco';
	if (page.wide) pptx.layout = 'LAYOUT_WIDE';
	else {
		pptx.defineLayout({ name: 'CALCO', width: page.w, height: page.h });
		pptx.layout = 'CALCO';
	}

	const fonts: EmbeddedFont[] = deck.fonts || [];
	const metricsCache = new Map<EmbeddedFont, FontMetrics | null>();
	const runOptions = (run: TextRun, breakLine: boolean) => {
		const s = run.style;
		const opts: Record<string, unknown> = {
			fontFace: s.family,
			fontSize: points(s.size),
			color: bareHex(s.alpha < 1 && s.flatColor ? s.flatColor : s.color),
			bold: s.weight >= 600,
			italic: s.italic,
		};
		if (s.alpha < 1 && !s.flatColor) opts.transparency = Math.round((1 - s.alpha) * 100);
		if (s.letterSpacing) opts.charSpacing = points(s.letterSpacing);
		if (s.underline) opts.underline = { style: 'sng' };
		if (s.strike) opts.strike = 'sngStrike';
		if (breakLine) opts.breakLine = true;
		return { text: applyTransform(run.text, s.transform), options: opts };
	};

	deck.slides.forEach((slide, i) => {
		if (!slide.image?.length) throw new Error(`calco: slide ${i + 1} has no image`);
		const s = pptx.addSlide();
		// ALWAYS set altText: PptxGenJS otherwise writes the image's file name, which a
		// screen reader reads aloud.
		s.addImage({ data: `image/png;base64,${toBase64(slide.image)}`, x: 0, y: 0, w: page.w, h: page.h, altText: (slide.description || '').trim() || `Slide ${i + 1}` });
		for (const frame of slide.frames || []) {
			const lines = frame.lines.filter((l) => l.length);
			if (!lines.length) continue;
			const lead = dominantStyle(lines[0]);
			const box = placeFrame({ ...frame, lines }, W, metricsFor(lead, fonts, metricsCache), lead.size);
			const runs = lines.flatMap((line, li) => line.map((run, ri) => runOptions(run, ri === line.length - 1 && li < lines.length - 1)));
			s.addText(runs, {
				x: inch(box.x),
				y: inch(box.y),
				w: inch(box.w),
				h: inch(box.h),
				margin: 0,
				valign: 'top',
				align: frame.align,
				lineSpacing: points(frame.lineHeight),
				paraSpaceBefore: 0,
				paraSpaceAfter: 0,
				fit: 'none',
				wrap: true,
			});
		}
		if (slide.notes) s.addNotes(slide.notes);
	});
	return pptx;
}

export const PPTX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Build and serialize in one call. `outputType` is PptxGenJS's (`uint8array`, `blob`, …). */
export async function writePptx<T = Uint8Array>(PptxGenJS: PptxGenJSClass, deck: Deck, outputType = 'uint8array'): Promise<T> {
	return (await buildPptx(PptxGenJS, deck).write({ outputType })) as T;
}
