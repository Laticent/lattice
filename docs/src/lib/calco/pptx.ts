/**
 * The PPTX writer: a Deck → a PowerPoint file with real text boxes over each slide's
 * picture. PptxGenJS is passed in and owns the OOXML package (masters, layouts, the notes
 * master), which is boilerplate no reader of this file needs to see.
 *
 * FONTS are embedded when the caller passes JSZip and the deck carries fonts: each face as
 * Embedded OpenType in `ppt/fonts/*.fntdata`, listed in `p:embeddedFontLst` (sfnt.ts).
 * PowerPoint's font model is a family with four slots, so every face that is not a plain
 * regular gets a family of its own ("Outfit SemiBold", "Playfair Display Bold Italic") in
 * its regular slot, and its runs name that family with no bold or italic flag. A run whose
 * face is not embedded names its family and is bold at 600 or heavier, as OOXML has no
 * numeric weight.
 *
 * `text-transform` is applied to the text itself: PptxGenJS exposes no all-caps flag, so an
 * uppercase label is stored in capitals.
 */

import { type FontMetrics, faceFor, facesUsed } from './fonts';
import { applyTransform, bareHex, dominantStyle, metricsFor, placeFrame } from './layout';
import { renameFace, toEot } from './sfnt';
import type { Deck, EmbeddedFont, JSZipClass, TextRun } from './types';

const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: '', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

/**
 * The family name PowerPoint sees for an embedded face: the family itself for a plain
 * regular, else the family with its weight and slant ("Outfit SemiBold", "Playfair Display
 * Italic"), so every face has a regular slot of its own.
 */
export function pptxFaceName(face: { family: string; weight: number; italic: boolean }): string {
	const w = WEIGHT_NAMES[Math.round(face.weight / 100) * 100] ?? String(face.weight);
	return [safeFamily(face.family), w, face.italic ? 'Italic' : ''].filter(Boolean).join(' ');
}

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

/**
 * Text PptxGenJS writes into XML as-is: characters XML 1.0 forbids would make the part
 * unreadable, so they go. (It escapes `<>&` in run text itself.)
 */
function xmlSafe(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
	return String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
}

/** A font family as an attribute value PptxGenJS will NOT escape: no quotes or markup. */
export function safeFamily(family: string): string {
	return xmlSafe(family).replace(/["'<>&]/g, '').trim() || 'sans-serif';
}

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
export function buildPptx(PptxGenJS: PptxGenJSClass, deck: Deck, options?: { embedFonts?: boolean }): PptxGenJSLike {
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
		// An embedded face is named as its own family and carries its weight and slant; a
		// system font is asked for by family, with OOXML's bold and italic flags.
		const face = options?.embedFonts ? faceFor(s, fonts) : null;
		const opts: Record<string, unknown> = {
			fontFace: face ? pptxFaceName(face) : safeFamily(s.family),
			fontSize: points(s.size),
			color: bareHex(s.alpha < 1 && s.flatColor ? s.flatColor : s.color),
			bold: face ? false : s.weight >= 600,
			italic: face ? false : s.italic,
		};
		if (s.alpha < 1 && !s.flatColor) opts.transparency = Math.round((1 - s.alpha) * 100);
		if (s.letterSpacing) opts.charSpacing = points(s.letterSpacing);
		if (s.underline) opts.underline = { style: 'sng' };
		if (s.strike) opts.strike = 'sngStrike';
		if (breakLine) opts.breakLine = true;
		return { text: xmlSafe(applyTransform(run.text, s.transform)), options: opts };
	};

	deck.slides.forEach((slide, i) => {
		if (!slide.image?.length) throw new Error(`calco: slide ${i + 1} has no image`);
		const s = pptx.addSlide();
		// ALWAYS set altText: PptxGenJS otherwise writes the image's file name, which a
		// screen reader reads aloud.
		s.addImage({ data: `image/png;base64,${toBase64(slide.image)}`, x: 0, y: 0, w: page.w, h: page.h, altText: xmlSafe((slide.description || '').trim()) || `Slide ${i + 1}` });
		for (const frame of slide.frames || []) {
			const lines = frame.lines;
			if (!lines.some((l) => l.length)) continue;
			const lead = dominantStyle(lines.find((l) => l.length) || lines[0]);
			const box = placeFrame(frame, W, metricsFor(lead, fonts, metricsCache), lead.size);
			// An empty line (a blank line in code) is an empty paragraph in the lead style.
			const runs = lines.flatMap((line, li) => {
				const last = li < lines.length - 1;
				if (!line.length) return [runOptions({ text: '', style: lead }, last)];
				return line.map((run, ri) => runOptions(run, ri === line.length - 1 && last));
			});
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
				// Lines are already broken where the browser broke them. Without wrapping, a
				// substitute font that runs wider overhangs the box instead of adding a line that
				// lands on the next paragraph.
				wrap: false,
			});
		}
		if (slide.notes) s.addNotes(xmlSafe(slide.notes));
	});
	return pptx;
}

export const PPTX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** The faces a deck's runs draw with, as embeddable TrueType (CFF faces cannot be EOT-wrapped). */
function embeddableFaces(deck: Deck): EmbeddedFont[] {
	const fonts = deck.fonts || [];
	const out: EmbeddedFont[] = [];
	for (const use of facesUsed(deck)) {
		const face = faceFor(use, fonts);
		if (!face || out.includes(face)) continue;
		const b = face.bytes;
		if (b.length > 4 && b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) out.push(face);
	}
	return out;
}

type ZipLike = {
	file(name: string, data?: unknown, options?: unknown): { async(type: string): Promise<string> } | null;
	generateAsync(options: Record<string, unknown>): Promise<unknown>;
};

/**
 * Add the embedded faces to a written package: `ppt/fonts/calco-fontN.fntdata` (EOT), a font
 * relationship from the presentation part, the `fntdata` content type, and
 * `p:embeddedFontLst` right after `p:notesSz` (where the schema puts it), with
 * `embedTrueTypeFonts="1"` on the presentation.
 */
export async function embedPptxFonts(JSZip: JSZipClass, bytes: Uint8Array, faces: EmbeddedFont[]): Promise<Uint8Array> {
	const zip = (await (JSZip as unknown as { loadAsync(b: Uint8Array): Promise<ZipLike> }).loadAsync(bytes)) as ZipLike;
	const read = async (name: string) => {
		const f = zip.file(name);
		if (!f) throw new Error(`calco: the .pptx has no ${name}`);
		return f.async('string');
	};
	const types = await read('[Content_Types].xml');
	const rels = await read('ppt/_rels/presentation.xml.rels');
	let pres = await read('ppt/presentation.xml');
	const insertBefore = (xml: string, close: string, add: string) => {
		const at = xml.lastIndexOf(close);
		if (at < 0) throw new Error(`calco: the .pptx has a layout this writer cannot extend (${close})`);
		return xml.slice(0, at) + add + xml.slice(at);
	};
	const entries: string[] = [];
	const relXml: string[] = [];
	faces.forEach((face, i) => {
		const name = pptxFaceName(face);
		const eot = toEot(renameFace(face.bytes, name), { family: name });
		const part = `fonts/calco-font${i + 1}.fntdata`;
		const id = `rIdCalcoFont${i + 1}`;
		zip.file(`ppt/${part}`, eot, { createFolders: false });
		relXml.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${part}"/>`);
		entries.push(`<p:embeddedFont><p:font typeface="${name}" charset="0"/><p:regular r:id="${id}"/></p:embeddedFont>`);
	});
	if (!/Extension="fntdata"/i.test(types)) zip.file('[Content_Types].xml', insertBefore(types, '</Types>', '<Default Extension="fntdata" ContentType="application/x-fontdata"/>'));
	zip.file('ppt/_rels/presentation.xml.rels', insertBefore(rels, '</Relationships>', relXml.join('')));
	if (!/xmlns:r=/.test(pres)) throw new Error('calco: presentation.xml declares no r: namespace');
	pres = pres.replace(/<p:presentation\b([^>]*)>/, (m, attrs: string) => (/embedTrueTypeFonts=/.test(attrs) ? m : `<p:presentation${attrs} embedTrueTypeFonts="1">`));
	const notesSz = pres.match(/<p:notesSz\b[^>]*\/>|<p:notesSz\b[^>]*>[\s\S]*?<\/p:notesSz>/);
	if (!notesSz || notesSz.index === undefined) throw new Error('calco: presentation.xml has no p:notesSz');
	const after = notesSz.index + notesSz[0].length;
	pres = `${pres.slice(0, after)}<p:embeddedFontLst>${entries.join('')}</p:embeddedFontLst>${pres.slice(after)}`;
	zip.file('ppt/presentation.xml', pres);
	return (await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })) as Uint8Array;
}

/**
 * Build and serialize in one call. `outputType` is PptxGenJS's (`uint8array`, `blob`, …).
 * Pass `JSZip` to embed the deck's fonts; without it the runs name their families only.
 */
export async function writePptx<T = Uint8Array>(PptxGenJS: PptxGenJSClass, deck: Deck, outputType = 'uint8array', JSZip?: JSZipClass): Promise<T> {
	const faces = JSZip ? embeddableFaces(deck) : [];
	if (!faces.length) return (await buildPptx(PptxGenJS, deck).write({ outputType })) as T;
	const raw = (await buildPptx(PptxGenJS, deck, { embedFonts: true }).write({ outputType: 'uint8array' })) as Uint8Array;
	const bytes = await embedPptxFonts(JSZip as JSZipClass, raw, faces);
	if (outputType === 'uint8array') return bytes as T;
	if (outputType === 'nodebuffer') return (globalThis as unknown as { Buffer: { from(b: Uint8Array): unknown } }).Buffer.from(bytes) as T;
	if (outputType === 'blob') return new Blob([bytes as BlobPart], { type: PPTX_MIMETYPE }) as T;
	if (outputType === 'arraybuffer') return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as T;
	throw new Error(`calco: output type ${outputType} is not supported with embedded fonts`);
}
