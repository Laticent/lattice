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
 * LINE SPACING is proportional (`spcPct`), the browser's pitch over the face's natural line,
 * because Google Slides reads an exact `spcPts` as a multiple of the font size and spreads
 * every line by the face's own line height. A paragraph stays one box, editable as one.
 *
 * `text-transform` is applied to the text itself: PptxGenJS exposes no all-caps flag, so an
 * uppercase label is stored in capitals.
 *
 * SCHEMA: PptxGenJS 3.12 writes three things the OOXML schema forbids, and `tidyPptx` mends
 * them whenever the caller passes JSZip: a `<a:pPr>` before EVERY run of a paragraph (the
 * schema allows one, first), `p:notesMasterIdLst` after `p:sldIdLst` (it belongs before),
 * and a `[Content_Types].xml` override for a slide master per slide, where one exists.
 */

import { type FontMetrics, faceFamilyName, faceFor, faceKey, facesUsed, uniqueFaceNames } from './fonts';
import { applyTransform, bareHex, dominantStyle, metricsFor, placeFrame, spacingMultiple } from './layout';
import { canEmbedAsEot, renameFace, toEot } from './sfnt';
import type { Deck, EmbeddedFont, JSZipClass, TextRun } from './types';

/** The family name PowerPoint sees for an embedded face (`faceFamilyName`, with the PPTX-safe family). */
export function pptxFaceName(face: { family: string; weight: number; italic: boolean }): string {
	return faceFamilyName({ ...face, family: safeFamily(face.family) });
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
export function buildPptx(PptxGenJS: PptxGenJSClass, deck: Deck, options?: { embedded?: EmbeddingPlan }): PptxGenJSLike {
	if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
		throw new Error('calco: no slides to write');
	}
	const W = deck.width > 0 ? deck.width : 1280;
	const H = deck.height > 0 ? deck.height : 720;
	const page = pptxPageSize(W, H);
	// The deck's px map onto the page's inches; font sizes scale the same way.
	// LAYOUT_WIDE is 12192000 EMU, a hair over the 13.333in PptxGenJS names it by; the picture
	// and the px→in scale use the exact width, or a 1px sliver of slide shows at the right edge.
	const slideW = page.wide ? 12192000 / 914400 : page.w;
	const slideH = page.wide ? 6858000 / 914400 : page.h;
	const inPerPx = slideW / W;
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
		// Only the run's EXACT face, and only when the file carries it: a nearest-weight
		// stand-in or a face that could not be embedded would name a family nobody has.
		const name = options?.embedded?.byKey.get(faceKey(s.family, s.weight, s.italic));
		const face = name !== undefined;
		const opts: Record<string, unknown> = {
			fontFace: face ? name : safeFamily(s.family),
			fontSize: Math.max(1, points(s.size)), // OOXML: 1pt is the smallest size (a 2px spacer on a wide deck)
			color: bareHex(s.alpha < 1 && s.flatColor ? s.flatColor : s.color),
			bold: face ? false : s.weight >= 600,
			italic: face ? false : s.italic,
		};
		if (s.alpha < 1 && !s.flatColor) opts.transparency = Math.round((1 - s.alpha) * 100);
		if (s.letterSpacing) opts.charSpacing = points(s.letterSpacing);
		// PptxGenJS has no small-caps option, but writes `lang` into <a:rPr> unescaped, so the
		// attribute rides in it: `lang="en-US" cap="small"`. A constant, never page text.
		// (pptx.test.js pins the output, so a PptxGenJS that starts escaping it fails loudly.)
		if (s.smallCaps) opts.lang = 'en-US" cap="small';
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
		s.addImage({ data: `image/png;base64,${toBase64(slide.image)}`, x: 0, y: 0, w: slideW, h: slideH, altText: xmlSafe((slide.description || '').trim()) || `Slide ${i + 1}` });
		for (const frame of slide.frames || []) {
			const lines = frame.lines;
			if (!lines.some((l) => l.length)) continue;
			const lead = dominantStyle(lines.find((l) => l.length) || lines[0]);
			const metrics = metricsFor(lead, fonts, metricsCache);
			const box = placeFrame(frame, W, metrics, lead.size, 'proportional');
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
				// Proportional, not exact: Google Slides reads an exact `spcPts` as a multiple of
				// the font size and applies it to the face's own, taller line, so every line ran
				// ~26% apart and paragraphs spilled out of their cards. A multiple of the face's
				// natural line height reads the same in Google Slides and LibreOffice.
				lineSpacingMultiple: spacingMultiple(frame, metrics, lead.size),
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

/** What a .pptx embeds: each face once, under a family name no other face uses, and the run styles it serves. */
export interface EmbeddingPlan {
	faces: Array<{ face: EmbeddedFont; name: string }>;
	/** `faceKey(family, weight, italic)` of a run style → the embedded family it names. */
	byKey: Map<string, string>;
}

/**
 * Plan the embedding: every run style whose exact face the deck carries as TrueType with the
 * tables an EOT header repeats. Names are unique: two weights that round to one name
 * ("Outfit Bold" for 700 and 720) keep the second's number ("Outfit 720").
 */
export function planEmbedding(deck: Deck): EmbeddingPlan {
	const fonts = deck.fonts || [];
	const plan: EmbeddingPlan = { faces: [], byKey: new Map() };
	const exact = new Map<string, EmbeddedFont>();
	for (const use of facesUsed(deck)) {
		const face = faceFor(use, fonts);
		if (face && face.weight === use.weight && canEmbedAsEot(face.bytes)) exact.set(faceKey(use.family, use.weight, use.italic), face);
	}
	const names = uniqueFaceNames([...new Set(exact.values())].map((face) => ({ ...face, family: safeFamily(face.family), face })));
	for (const [entry, name] of names) plan.faces.push({ face: entry.face, name });
	for (const [key, face] of exact) {
		const hit = plan.faces.find((f) => f.face === face);
		if (hit) plan.byKey.set(key, hit.name);
	}
	return plan;
}

type ZipLike = {
	file(name: string, data?: unknown, options?: unknown): { async(type: string): Promise<string> } | null;
	generateAsync(options: Record<string, unknown>): Promise<unknown>;
	files: Record<string, unknown>;
};

/** Keep the first `<a:pPr>` of each paragraph; PptxGenJS repeats the same one before every run. */
function onePPrPerParagraph(xml: string): string {
	return xml.replace(/<a:p>[\s\S]*?<\/a:p>/g, (para) => {
		let seen = false;
		return para.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, (ppr) => {
			if (seen) return '';
			seen = true;
			return ppr;
		});
	});
}

/**
 * Mend what PptxGenJS 3.12 writes against the OOXML schema (see the header): one `<a:pPr>`
 * per paragraph in every slide and notes slide, `p:notesMasterIdLst` straight after
 * `p:sldMasterIdLst`, and no content-type override for a part the package does not hold.
 * The repeated `<a:pPr>` are identical (paragraph options are the box's), so nothing renders
 * differently; a strict reader no longer has an invalid part to repair.
 */
async function tidyPptx(zip: ZipLike): Promise<void> {
	const text = async (name: string) => (zip.file(name) as { async(type: string): Promise<string> }).async('string');
	for (const name of Object.keys(zip.files).filter((n) => /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(n))) {
		const xml = await text(name);
		const tidy = onePPrPerParagraph(xml);
		if (tidy !== xml) zip.file(name, tidy);
	}
	if (zip.file('ppt/presentation.xml')) {
		const pres = await text('ppt/presentation.xml');
		const notes = pres.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/);
		const masters = pres.indexOf('</p:sldMasterIdLst>');
		if (notes && notes.index !== undefined && masters >= 0 && notes.index > masters) {
			const without = pres.slice(0, notes.index) + pres.slice(notes.index + notes[0].length);
			const at = without.indexOf('</p:sldMasterIdLst>') + '</p:sldMasterIdLst>'.length;
			zip.file('ppt/presentation.xml', without.slice(0, at) + notes[0] + without.slice(at));
		}
	}
	if (zip.file('[Content_Types].xml')) {
		const types = await text('[Content_Types].xml');
		const tidy = types.replace(/<Override PartName="\/([^"]+)"[^>]*\/>/g, (m, part: string) => (zip.file(part) ? m : ''));
		if (tidy !== types) zip.file('[Content_Types].xml', tidy);
	}
}

/**
 * Add the embedded faces to a written package: `ppt/fonts/calco-fontN.fntdata` (EOT), a font
 * relationship from the presentation part, the `fntdata` content type, and
 * `p:embeddedFontLst` right after `p:notesSz` (where the schema puts it), with
 * `embedTrueTypeFonts="1"` on the presentation. The package is tidied first (`tidyPptx`),
 * so an empty `faces` only tidies.
 */
export async function embedPptxFonts<T = Uint8Array>(JSZip: JSZipClass, bytes: Uint8Array, faces: EmbeddingPlan['faces'], outputType = 'uint8array'): Promise<T> {
	const zip = (await (JSZip as unknown as { loadAsync(b: Uint8Array): Promise<ZipLike> }).loadAsync(bytes)) as ZipLike;
	await tidyPptx(zip);
	if (!faces.length) return (await zip.generateAsync({ type: outputType, mimeType: PPTX_MIMETYPE, compression: 'DEFLATE' })) as T;
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
	faces.forEach(({ face, name }, i) => {
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
	// JSZip writes every output type PptxGenJS does (uint8array, nodebuffer, blob, arraybuffer, base64, binarystring).
	return (await zip.generateAsync({ type: outputType, mimeType: PPTX_MIMETYPE, compression: 'DEFLATE' })) as T;
}

/**
 * Build and serialize in one call. `outputType` is PptxGenJS's (`uint8array`, `blob`, …).
 * Pass `JSZip` to embed the deck's fonts and mend PptxGenJS's schema errors (`tidyPptx`);
 * without it the runs name their families only and the package is as PptxGenJS wrote it.
 */
export async function writePptx<T = Uint8Array>(PptxGenJS: PptxGenJSClass, deck: Deck, outputType = 'uint8array', JSZip?: JSZipClass): Promise<T> {
	if (!JSZip) return (await buildPptx(PptxGenJS, deck).write({ outputType })) as T;
	const plan = planEmbedding(deck);
	const raw = (await buildPptx(PptxGenJS, deck, plan.faces.length ? { embedded: plan } : undefined).write({ outputType: 'uint8array' })) as Uint8Array;
	return embedPptxFonts<T>(JSZip, raw, plan.faces, outputType);
}
