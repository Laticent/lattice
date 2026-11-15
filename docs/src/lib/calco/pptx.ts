/**
 * The PPTX writer: a Deck → a PowerPoint file with real text boxes over each slide's picture. Calco writes the
 * OOXML package itself with JSZip, as `writeOdp` writes the .odp: no third-party writer and no correction pass
 * (engineering/decisions/2026-11-13-native-pptx-writer.md).
 *
 * THE PACKAGE is the minimal set every reader accepts: `[Content_Types].xml`, the package and part
 * relationships, `docProps/core.xml` and `app.xml`, `ppt/presentation.xml` with `presProps`, `viewProps` and
 * `tableStyles`, one slide master with its layouts (masters.ts), a notes master, the slides and their notes, the
 * media named by a hash of their bytes (one part per distinct picture, whatever slide it is on), and the fonts.
 * Each master has its own theme part: PowerPoint refuses a package whose slide master and notes master share
 * one. Parts are listed in the schema order PowerPoint checks (`p:notesMasterIdLst` before `p:sldIdLst`,
 * `p:embeddedFontLst` after `p:notesSz`), and each shape id is unique on its part.
 *
 * FONTS are embedded when the deck carries them: each face as Embedded OpenType in `ppt/fonts/*.fntdata`,
 * listed in `p:embeddedFontLst` (sfnt.ts). PowerPoint's font model is a family with four slots. A regular or
 * bold face (400 or 700, upright or italic) goes in its slot of the family's own name ("Playfair Display"), and
 * its runs name that family with the bold or italic flag, so a reader that has the family or can fetch it
 * (LibreOffice, Google Slides) finds it by name and ignores the embedded copy. Any other weight has no slot, so
 * it is a family of its own ("Outfit SemiBold") in its regular slot, named with no flag. A run whose face is not
 * embedded names its family and is bold at 600 or heavier, as OOXML has no numeric weight.
 *
 * LINE SPACING is proportional (`spcPct`), the browser's pitch over the face's natural line, because Google
 * Slides reads an exact `spcPts` as a multiple of the font size and spreads every line by the face's own line
 * height. A paragraph stays one box, editable as one; each browser line is one `a:p`.
 *
 * `text-transform` is applied to the text itself (an uppercase label is stored in capitals); small caps are the
 * run's `cap="small"`.
 *
 * SHAPES (a slide's `shapes`) are presets where the outline is one (`rect`, `roundRect`, `line`) and custom
 * geometry where it is not (per-corner radii, a rule that wraps a corner, a drawn mark). A label is one shape
 * that carries its text. A card's members are a `p:grpSp`, unless a member is custom geometry: Apple's Office
 * importer (iPhone Preview, macOS Quick Look) drops custom geometry inside a group, so such a card is written
 * loose in its paint order (engineering/decisions/2026-11-01-icon-font.md § 3.6; the owner's call, 2026-11-03).
 * A pill inside a card (`Shape.sub`) is a group inside the card's group.
 *
 * ROLES: a slide's title is the slide's title placeholder, drawn where the browser drew it, so Outline view and
 * a screen reader find it; a page number that is the slide's position is a `slidenum` field, so it follows the
 * slide when slides move. Running chrome two slides share lives on their layout (masters.ts).
 *
 * XML is assembled from escaped values only (`xmlAttr`, `xmlText`): every value goes through `xmlSafe`, which strips
 * the characters XML 1.0 forbids, and is then escaped. Page text never names a tag or an attribute.
 */

import { type FontMetrics, faceFamilyName, faceFor, faceKey, facesUsed, uniqueFaceNames } from './fonts.js';
import { applyTransform, bareHex, dominantStyle, metricsFor, type PlacedBox, placeFrame, spacingMultiple } from './layout.js';
import { isPosition, type MasterPlan, planMasters, withoutHoisted } from './masters.js';
import { imageExt } from './picture.js';
import { canEmbedAsEot, type FaceSlot, renameFace, toEot } from './sfnt.js';
import { drawOrder, labelInsets, type ShapeGeometry, shapeGeometry } from './shapes.js';
import type { Background, Deck, EmbeddedFont, FrameRole, JSZipClass, Paint, Shape, Slide, TextFrame, TextRun, TextStyle } from './types.js';

export const PPTX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Loops, not a spread: `Math.min(...xs)` overflows the call stack past about 120,000 values. */
const lowest = (xs: number[]) => xs.reduce((m, v) => (v < m ? v : m), Number.POSITIVE_INFINITY);
const highest = (xs: number[]) => xs.reduce((m, v) => (v > m ? v : m), Number.NEGATIVE_INFINITY);

const EMU_PER_IN = 914400;
const PX_PER_IN = 96;
const PT_PER_PX = 0.75;
const EMU_PER_PT = 12700;
/** PowerPoint's 16:9 slide, 13.333 × 7.5 in. */
const WIDE = { cx: 12192000, cy: 6858000 };
/** The notes page PowerPoint itself writes: 7.5 × 10 in. */
const NOTES = { cx: 6858000, cy: 9144000 };

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.presentationml';
/** `a:blip`'s extension for an SVG beside its PNG fallback, as PowerPoint 2016 and later write it. */
const SVG_EXT = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';
const NS_ASVG = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main';
/** The id of a `slidenum` field, as PowerPoint writes one (any GUID will do; this one is stable). */
const SLIDENUM_FIELD = '{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}';
/** What a role is called in the file, so a reader finds it in the selection pane. */
const ROLE_NAMES: Record<FrameRole, string> = { title: 'Title', eyebrow: 'Eyebrow', subtitle: 'Subtitle', header: 'Header', footer: 'Footer', number: 'Slide number' };

/** Text with the characters XML 1.0 forbids removed. Escape it (`xmlText`, `xmlAttr`) before it goes into a part. */
export function xmlSafe(text: string | null | undefined): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
	return (text == null ? '' : String(text)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

/** Element text: safe, then `&`, `<` and `>` escaped. */
function xmlText(value: string | null | undefined): string {
	return xmlSafe(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** An attribute value: safe, then escaped for a double-quoted attribute. Tabs and line breaks are kept as references. */
function xmlAttr(value: string | null | undefined): string {
	return xmlText(value).replace(/"/g, '&quot;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
}

/** A font family as Calco names it in the file: no quotes or markup, so the name an embedded face carries inside its own tables is the name a run asks for. */
export function safeFamily(family: string): string {
	return xmlSafe(family).replace(/["'<>&]/g, '').trim() || 'sans-serif';
}

/** The family name PowerPoint sees for an embedded face (`faceFamilyName`, with the PPTX-safe family). */
export function pptxFaceName(face: { family: string; weight: number; italic: boolean }): string {
	return faceFamilyName({ ...face, family: safeFamily(face.family) });
}

/**
 * The slide size in inches. A 16:9 deck is PowerPoint's own wide slide (13.333 × 7.5); any other aspect keeps
 * the longest edge at 13.333 in.
 */
export function pptxPageSize(width: number, height: number): { w: number; h: number; wide: boolean } {
	const w = Number(width);
	const h = Number(height);
	if (!(w > 0 && h > 0) || Math.abs(w / h - 16 / 9) < 0.01) return { w: 13.333, h: 7.5, wide: true };
	const longest = Math.max(w, h);
	const round = (n: number) => Math.round(n * 1000) / 1000;
	return { w: round((w / longest) * 13.333), h: round((h / longest) * 13.333), wide: false };
}

/** What a .pptx embeds: each face once, under a family name no other face uses, and the run styles it serves. */
export interface EmbeddingPlan {
	faces: Array<{ face: EmbeddedFont; name: string; slot: FaceSlot }>;
	/** `faceKey(family, weight, italic)` of a run style → the family it names and the bold and italic flags that pick the slot. */
	byKey: Map<string, { name: string; bold: boolean; italic: boolean }>;
}

const slotOf = (bold: boolean, italic: boolean): FaceSlot => (bold ? (italic ? 'boldItalic' : 'bold') : italic ? 'italic' : 'regular');

/**
 * Plan the embedding: every run style whose exact face the deck carries as TrueType with the tables an EOT
 * header repeats. Names are unique: two weights that round to one name ("Outfit Bold" for 700 and 720) keep
 * the second's number ("Outfit 720").
 */
export function planEmbedding(deck: Deck): EmbeddingPlan {
	const fonts = deck.fonts || [];
	const plan: EmbeddingPlan = { faces: [], byKey: new Map() };
	const exact = new Map<string, EmbeddedFont>();
	for (const use of facesUsed(deck)) {
		const face = faceFor(use, fonts);
		if (face && face.weight === use.weight && canEmbedAsEot(face.bytes)) exact.set(faceKey(use.family, use.weight, use.italic), face);
	}
	// A regular or bold face (400 or 700, upright or italic) goes in its slot of the family's OWN name, flagged bold or
	// italic; every other weight is a family of its own in the regular slot.
	const slotted = new Map<EmbeddedFont, { name: string; slot: FaceSlot }>();
	const taken = new Set<string>();
	const others: EmbeddedFont[] = [];
	const parsed = [...exact].map(([key, face]) => {
		const parts = key.split('|');
		return { face, weight: Number(parts[parts.length - 2]) };
	});
	// An italic face is slotted only beside the upright face of its weight: a family with a bold italic and no bold
	// would let a reader that weighs boldness over slant draw an upright bold run in italic.
	const hasUpright = (family: string, weight: number) => parsed.some((x) => x.face.family === family && x.weight === weight && !x.face.italic);
	for (const { face, weight } of parsed) {
		if (slotted.has(face) || others.includes(face)) continue;
		const bold = weight === 700;
		if ((weight !== 400 && !bold) || (face.italic && !hasUpright(face.family, weight))) {
			others.push(face);
			continue;
		}
		const name = safeFamily(face.family);
		const slot = slotOf(bold, face.italic);
		if (taken.has(`${name}|${slot}`)) others.push(face);
		else {
			taken.add(`${name}|${slot}`);
			slotted.set(face, { name, slot });
		}
	}
	for (const [face, { name, slot }] of slotted) plan.faces.push({ face, name, slot });
	// Full names too: "Outfit" in the bold slot is "Outfit Bold", so a family of its own may not be called that.
	const fullNames = new Set(plan.faces.map((f) => (f.slot === 'regular' ? f.name : `${f.name} ${{ bold: 'Bold', italic: 'Italic', boldItalic: 'Bold Italic', regular: '' }[f.slot]}`)));
	const names = uniqueFaceNames(others.map((face) => ({ ...face, family: safeFamily(face.family), face })));
	for (const [entry, name] of names) {
		let unique = name;
		while (fullNames.has(unique) || taken.has(`${unique}|regular`)) unique = `${unique} ${entry.weight}`;
		fullNames.add(unique);
		taken.add(`${unique}|regular`);
		plan.faces.push({ face: entry.face, name: unique, slot: 'regular' });
	}
	for (const [key, face] of exact) {
		const hit = plan.faces.find((f) => f.face === face);
		if (hit) plan.byKey.set(key, { name: hit.name, bold: hit.slot === 'bold' || hit.slot === 'boldItalic', italic: hit.slot === 'italic' || hit.slot === 'boldItalic' });
	}
	return plan;
}

/**
 * A 64-bit FNV-1a hash of some bytes, as 16 hex digits: the name of a media part. Two pictures with the same
 * bytes are one part however many slides show them.
 */
function contentHash(bytes: Uint8Array): string {
	// Two 32-bit halves, so the arithmetic stays in Math.imul's exact range.
	let h1 = 0x811c9dc5;
	let h2 = 0xcbf29ce4;
	for (let i = 0; i < bytes.length; i++) {
		h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
		h2 = Math.imul(h2 ^ bytes[i] ^ (h1 >>> 24), 0x01000193);
	}
	return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** One part's relationships, numbered `rId1`, `rId2`, … in the order they are added. */
class Rels {
	private list: string[] = [];
	private byKey = new Map<string, string>();
	/** Add a relationship (or return the one already added for this type and target). */
	add(type: string, target: string): string {
		const key = `${type} ${target}`;
		const hit = this.byKey.get(key);
		if (hit) return hit;
		const id = `rId${this.list.length + 1}`;
		this.list.push(`<Relationship Id="${id}" Type="${xmlAttr(type)}" Target="${xmlAttr(target)}"/>`);
		this.byKey.set(key, id);
		return id;
	}
	xml(): string {
		return `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.list.join('')}</Relationships>`;
	}
}

/** The theme every master gets a copy of: Office's colors and fonts, and the three entries each style list must hold. */
function themeXml(name: string): string {
	const clr = (tag: string, rgb: string) => `<a:${tag}><a:srgbClr val="${rgb}"/></a:${tag}>`;
	const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
	const line = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
	const effect = '<a:effectStyle><a:effectLst/></a:effectStyle>';
	return (
		`${DECL}<a:theme xmlns:a="${NS_A}" name="${xmlAttr(name)}"><a:themeElements>` +
		`<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
		`${clr('dk2', '44546A')}${clr('lt2', 'E7E6E6')}${clr('accent1', '4472C4')}${clr('accent2', 'ED7D31')}${clr('accent3', 'A5A5A5')}` +
		`${clr('accent4', 'FFC000')}${clr('accent5', '5B9BD5')}${clr('accent6', '70AD47')}${clr('hlink', '0563C1')}${clr('folHlink', '954F72')}</a:clrScheme>` +
		`<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
		`<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
		`<a:fmtScheme name="Office"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst>` +
		`<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
		`<a:effectStyleLst>${effect}${effect}${effect}</a:effectStyleLst>` +
		`<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme>` +
		`</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
	);
}

/** Nine list levels, as PowerPoint's own text styles carry them: `marL` steps of half an inch. */
function levels(attrs: (lvl: number) => string, rPr = '<a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr>'): string {
	let out = '';
	for (let l = 1; l <= 9; l++) out += `<a:lvl${l}pPr${attrs(l)}>${rPr}</a:lvl${l}pPr>`;
	return out;
}
const levelAttrs = (l: number) => ` marL="${(l - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"`;

/** An empty shape tree's root: id 1, at the origin. */
const TREE_ROOT = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

/** One drawn object on a slide, before groups are wrapped: its XML, its frame in EMU, and whether it is custom geometry. */
interface Member {
	xml: string;
	box: [number, number, number, number];
	custom: boolean;
	sub?: number;
}

/**
 * Build the package. `JSZip` is passed in (Calco has no dependencies of its own). Returns the zip; call
 * `generateAsync({ ...pptxZipOptions, type })`, or use `writePptx`.
 */
export function buildPptx(JSZip: JSZipClass, deck: Deck) {
	if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
		throw new Error('calco: no slides to write');
	}
	const W = deck.width > 0 ? deck.width : 1280;
	const H = deck.height > 0 ? deck.height : 720;
	const page = pptxPageSize(W, H);
	const size = page.wide ? WIDE : { cx: Math.round(page.w * EMU_PER_IN), cy: Math.round(page.h * EMU_PER_IN) };
	// The deck's px map onto the slide's EMU; points scale the same way (a 1280px deck: 1px = 0.75pt).
	const emuPerPx = size.cx / W;
	const ptPerPx = (size.cx / EMU_PER_IN / W) * PX_PER_IN * PT_PER_PX;
	const emu = (px: number) => Math.round(px * emuPerPx);
	const points = (px: number) => Math.round(px * ptPerPx * 100) / 100;
	/** A length in points, written in EMU (line widths, shadows, label insets). */
	const ptEmu = (px: number) => Math.round(points(px) * EMU_PER_PT);
	/** OOXML alpha in thousandths of a percent, from 0–1, whole percent as PowerPoint's UI keeps it. */
	const alphaVal = (a: number) => (100 - Math.round((1 - a) * 100)) * 1000;
	const color = (hex: string, alpha = 1) => {
		const a = alphaVal(alpha);
		return a < 100000 ? `<a:srgbClr val="${xmlAttr(bareHex(hex))}"><a:alpha val="${a}"/></a:srgbClr>` : `<a:srgbClr val="${xmlAttr(bareHex(hex))}"/>`;
	};
	const solid = (p: Paint) => `<a:solidFill>${color(p.color, p.alpha)}</a:solidFill>`;

	const zip = new JSZip();
	const NO_DIRS = { createFolders: false };
	const overrides: string[] = [];
	const defaults = new Map<string, string>([
		['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
		['xml', 'application/xml'],
	]);
	const part = (name: string, xml: string, contentType?: string) => {
		zip.file(name, xml, NO_DIRS);
		if (contentType) overrides.push(`<Override PartName="/${xmlAttr(name)}" ContentType="${xmlAttr(contentType)}"/>`);
	};

	// MEDIA, one part per distinct content. Pictures are compressed already, so they are stored, not deflated.
	const media = new Map<string, Array<{ bytes: Uint8Array; name: string }>>();
	const mediaPart = (bytes: Uint8Array, ext: string): string => {
		const hash = contentHash(bytes);
		const list = media.get(hash) || [];
		const hit = list.find((m) => m.name.endsWith(`.${ext}`) && sameBytes(m.bytes, bytes));
		if (hit) return hit.name;
		const name = `ppt/media/${hash}${list.length ? `-${list.length}` : ''}.${ext}`;
		list.push({ bytes, name });
		media.set(hash, list);
		zip.file(name, bytes, { ...NO_DIRS, compression: ext === 'svg' ? 'DEFLATE' : 'STORE' });
		defaults.set(ext, { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml' }[ext] as string);
		return name;
	};
	const utf8 = (s: string) => new TextEncoder().encode(s);
	const IMAGE_REL = `${REL}/image`;
	const picRel = (rels: Rels, bytes: Uint8Array) => rels.add(IMAGE_REL, `../media/${mediaPart(bytes, imageExt(bytes)).split('/').pop()}`);

	// FONTS. Only a run's EXACT face, and only when the file carries it: a nearest-weight stand-in or a face that
	// could not be embedded would name a family nobody has.
	const embedded = planEmbedding(deck);
	const fonts: EmbeddedFont[] = deck.fonts || [];
	const metricsCache = new Map<EmbeddedFont, FontMetrics | null>();

	/** One run's properties: `a:rPr` (or `a:endParaRPr`, which takes no run-only attributes). */
	const runProps = (s: TextStyle, tag = 'a:rPr', end = false): string => {
		const hit = embedded.byKey.get(faceKey(s.family, s.weight, s.italic));
		const face = hit ? hit.name : safeFamily(s.family);
		const bold = hit ? hit.bold : s.weight >= 600;
		const italic = hit ? hit.italic : s.italic;
		// OOXML's smallest size is 1pt (a 2px spacer on a wide deck).
		const sz = Math.round(Math.max(1, points(s.size)) * 100);
		const fillColor = s.alpha < 1 && s.flatColor ? s.flatColor : s.color;
		const fillAlpha = s.alpha < 1 && !s.flatColor ? s.alpha : 1;
		let a = ` lang="en-US" sz="${sz}"`;
		if (bold) a += ' b="1"';
		if (italic) a += ' i="1"';
		if (!end) {
			if (s.underline) a += ' u="sng"';
			if (s.strike) a += ' strike="sngStrike"';
			if (s.smallCaps) a += ' cap="small"';
			// Spaced text is set without kerning, as the browser sets it.
			if (s.letterSpacing) a += ` spc="${Math.round(points(s.letterSpacing) * 100)}" kern="0"`;
		}
		a += ' dirty="0"';
		const highlight = !end && s.highlight ? `<a:highlight>${color(s.highlight)}</a:highlight>` : '';
		const fam = xmlAttr(face);
		return `<${tag}${a}><a:solidFill>${color(fillColor, fillAlpha)}</a:solidFill>${highlight}<a:latin typeface="${fam}" pitchFamily="34" charset="0"/><a:ea typeface="${fam}"/><a:cs typeface="${fam}"/></${tag}>`;
	};
	const runXml = (run: TextRun) => `<a:r>${runProps(run.style)}<a:t>${xmlText(applyTransform(run.text, run.style.transform))}</a:t></a:r>`;

	/** A frame's box (where the browser drew it) and its paragraphs, one per browser line. */
	const textOf = (frame: TextFrame, opts: { field?: boolean } = {}): { box: PlacedBox; paras: string } => {
		const lines = frame.lines;
		const lead = dominantStyle(lines.find((l) => l.length) || lines[0]);
		const metrics = metricsFor(lead, fonts, metricsCache);
		// Capped: PowerPoint never wraps a text box (`wrap="none"`), so a split piece's box can end at its text.
		const box = placeFrame(frame, W, metrics, lead.size, 'proportional', true);
		// Proportional, not exact (see the header). One line states 100%.
		const spacing = Math.round(spacingMultiple(frame, metrics, lead.size) * 100000);
		const algn = { left: 'l', center: 'ctr', right: 'r' }[frame.align] || 'l';
		const pPr = `<a:pPr marL="0" indent="0" algn="${algn}"><a:lnSpc><a:spcPct val="${spacing}"/></a:lnSpc><a:buNone/></a:pPr>`;
		let fieldDone = !opts.field;
		const paras = lines
			.map((line) => {
				const runs = line
					.map((run) => {
						if (fieldDone) return runXml(run);
						fieldDone = true;
						return `<a:fld id="${SLIDENUM_FIELD}" type="slidenum">${runProps(run.style)}<a:t>${xmlText(applyTransform(run.text, run.style.transform))}</a:t></a:fld>`;
					})
					.join('');
				// An empty line (a blank line in code) is an empty paragraph in the lead style.
				return `<a:p>${pPr}${runs}${runProps(line.length ? dominantStyle(line) : lead, 'a:endParaRPr', true)}</a:p>`;
			})
			.join('');
		return { box, paras };
	};
	/** A text body. `ins` are a label's insets inside its shape, px; a free box has none. */
	const txBody = (paras: string, ins?: { l: number; t: number; r: number }) =>
		`<p:txBody><a:bodyPr wrap="none" lIns="${ins ? ptEmu(ins.l) : 0}" tIns="${ins ? ptEmu(ins.t) : 0}" rIns="${ins ? ptEmu(ins.r) : 0}" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody>`;
	const xfrm = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${Math.max(0, emu(w))}" cy="${Math.max(0, emu(h))}"/></a:xfrm>`;
	const boxOf = (x: number, y: number, w: number, h: number): Member['box'] => [emu(x), emu(y), emu(x) + Math.max(0, emu(w)), emu(y) + Math.max(0, emu(h))];
	const rectGeom = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
	const NO_LINE = '<a:ln><a:noFill/></a:ln>';

	/** A shape's geometry, fill, outline and shadow (the inside of `p:spPr` after its frame). */
	const shapeProps = (shape: Shape, geom: ShapeGeometry): { xml: string; custom: boolean } => {
		let geometry: string;
		let custom = false;
		if (geom.preset === 'line') geometry = '<a:prstGeom prst="line"><a:avLst/></a:prstGeom>';
		else if (geom.preset === 'rect' && !geom.radius) geometry = rectGeom;
		else if (geom.preset === 'rect') {
			// The corner as a share of the shorter side; 50000 is a full half-round.
			const adj = Math.min(50000, Math.round((geom.radius as number) * 100000 / Math.max(1e-9, Math.min(geom.w, geom.h))));
			geometry = `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
		} else {
			custom = true;
			const pt = (x: number, y: number) => `<a:pt x="${emu(x)}" y="${emu(y)}"/>`;
			const path = geom.path
				.map((c) => {
					if (c[0] === 'Z') return '<a:close/>';
					if (c[0] === 'M') return `<a:moveTo>${pt(c[1], c[2])}</a:moveTo>`;
					if (c[0] === 'L') return `<a:lnTo>${pt(c[1], c[2])}</a:lnTo>`;
					return `<a:cubicBezTo>${pt(c[1], c[2])}${pt(c[3], c[4])}${pt(c[5], c[6])}</a:cubicBezTo>`;
				})
				.join('');
			geometry =
				'<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/>' +
				`<a:pathLst><a:path w="${Math.max(0, emu(geom.w))}" h="${Math.max(0, emu(geom.h))}"${geom.closed ? '' : ' fill="none"'}>${path}</a:path></a:pathLst></a:custGeom>`;
		}
		let fill = '<a:noFill/>';
		if (geom.closed && shape.gradient?.stops.length) {
			// CSS 0° points up and turns clockwise; DrawingML 0° points right.
			const ang = Math.round(((((shape.gradient.angle - 90) % 360) + 360) % 360) * 60000);
			const stops = shape.gradient.stops
				.map((st) => {
					const a = Math.round(st.alpha * 100000);
					return `<a:gs pos="${Math.round(st.pos * 100000)}"><a:srgbClr val="${xmlAttr(bareHex(st.color))}">${a < 100000 ? `<a:alpha val="${a}"/>` : ''}</a:srgbClr></a:gs>`;
				})
				.join('');
			fill = `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`;
		} else if (geom.closed && shape.fill) fill = solid(shape.fill);
		const stroke = shape.stroke;
		let line = NO_LINE;
		if (stroke) {
			// A CSS dash is about four widths on and three off, a dot one and one: PowerPoint's `dash` and `sysDot`.
			const dash = stroke.dash === 'dash' ? 'dash' : stroke.dash === 'dot' ? 'sysDot' : 'solid';
			const path = shape.kind === 'path';
			const cap = path && shape.cap === 'round' ? ' cap="rnd"' : path && shape.cap === 'square' ? ' cap="sq"' : '';
			const join = path && (shape.join === 'round' || shape.cap === 'round') ? '<a:round/>' : path && shape.join === 'bevel' ? '<a:bevel/>' : '';
			line = `<a:ln w="${ptEmu(stroke.width)}"${cap}>${solid(stroke)}<a:prstDash val="${dash}"/>${join}</a:ln>`;
		}
		let effect = '';
		if (shape.shadow) {
			const { x, y, blur } = shape.shadow;
			const dir = Math.round(((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360 * 60000) % 21600000;
			effect =
				`<a:effectLst><a:outerShdw blurRad="${ptEmu(blur)}" dist="${ptEmu(Math.hypot(x, y))}" dir="${dir}" sx="100000" sy="100000" kx="0" ky="0" algn="bl" rotWithShape="0">` +
				`${color(shape.shadow.color, shape.shadow.alpha)}</a:outerShdw></a:effectLst>`;
		}
		return { xml: `${geometry}${fill}${line}${effect}`, custom };
	};

	/** `p:cNvPr`: the shape's id, its name and, when it has one, its description (alt text). */
	const cNvPr = (id: number, name: string, descr?: string) => `<p:cNvPr id="${id}" name="${xmlAttr(name)}"${descr ? ` descr="${xmlAttr(descr)}"` : ''}/>`;
	const picture = (id: number, name: string, descr: string, rid: string, x: number, y: number, w: number, h: number, opts: { locked?: boolean; svgRid?: string } = {}) =>
		`<p:pic><p:nvPicPr>${cNvPr(id, name, descr)}<p:cNvPicPr><a:picLocks noChangeAspect="1"${opts.locked ? ' noMove="1" noResize="1"' : ''}/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
		`<p:blipFill><a:blip r:embed="${rid}">${opts.svgRid ? `<a:extLst><a:ext uri="${SVG_EXT}"><asvg:svgBlip xmlns:asvg="${NS_ASVG}" r:embed="${opts.svgRid}"/></a:ext></a:extLst>` : ''}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
		`<p:spPr>${xfrm(x, y, w, h)}${rectGeom}</p:spPr></p:pic>`;

	// LAYOUTS. Slides that share a background and running chrome share a layout (masters.ts): the layout holds the
	// background, the title placeholder and the header, footer and page number that repeat, and the slide holds what
	// is its own. A deck with no roles and no shared background has one blank layout.
	const useLayouts = !!deck.backgrounds?.length || deck.slides.some((sl) => sl.frames.some((f) => f.role));
	const plan: MasterPlan = useLayouts ? planMasters(deck) : { layouts: [{ chrome: {} }], layoutOf: deck.slides.map(() => 0), hoisted: deck.slides.map(() => new Set<number>()) };
	const masterRels = new Rels();
	const layoutIds: string[] = [];
	/** The page number's placeholder and its look, per layout that carries one: each of its slides draws one too. */
	const numberOf = new Map<number, { frame: TextFrame }>();
	const numberSp = (id: number, frame: TextFrame, digits: string | null) => {
		const { box } = textOf(frame);
		const lead = frame.lines[0].find((r) => !r.style.emoji) ?? frame.lines[0][0];
		const algn = { left: 'l', center: 'ctr', right: 'r' }[frame.align] || 'l';
		const lst = `<a:lstStyle><a:lvl1pPr algn="${algn}">${runProps(lead.style, 'a:defRPr', true)}</a:lvl1pPr></a:lstStyle>`;
		// A layout's field shows PowerPoint's own stand-in for "this slide's number"; a slide's shows its digits. The
		// look lives in the list style, so the field run carries none of its own and follows it.
		const body = `<a:fld id="${SLIDENUM_FIELD}" type="slidenum"><a:rPr lang="en-US" b="0"/><a:t>${xmlText(digits ?? '‹#›')}</a:t></a:fld>`;
		return (
			`<p:sp><p:nvSpPr>${cNvPr(id, `Slide Number Placeholder ${id - 1}`)}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="12"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr>${xfrm(box.x, box.y, box.w, box.h)}${rectGeom}</p:spPr>` +
			`<p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0"/>${lst}<a:p><a:pPr algn="${algn}"/>${body}<a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
		);
	};
	const background = (rels: Rels, paint: Background | undefined): string => {
		if (paint?.color) return `<p:bg><p:bgPr><a:solidFill>${color(paint.color)}</a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
		if (paint?.image?.length) {
			const rid = picRel(rels, paint.image);
			return `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`;
		}
		return '';
	};
	plan.layouts.forEach((layout, li) => {
		const rels = new Rels();
		rels.add(`${REL}/slideMaster`, '../slideMasters/slideMaster1.xml');
		let id = 2;
		let tree = '';
		if (useLayouts) {
			// The title placeholder sits where the first slide on this layout put its title.
			const first = deck.slides.findIndex((sl, i) => plan.layoutOf[i] === li && sl.frames.some((f) => f.role === 'title' && f.group === undefined));
			const titleFrame = first < 0 ? null : (deck.slides[first].frames.find((f) => f.role === 'title') as TextFrame);
			const tb = titleFrame ? textOf(titleFrame).box : { x: W * 0.05, y: H * 0.08, w: W * 0.9, h: H * 0.14 };
			tree +=
				`<p:sp><p:nvSpPr>${cNvPr(id++, 'Title Placeholder')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title" hasCustomPrompt="1"/></p:nvPr></p:nvSpPr>` +
				`<p:spPr>${xfrm(tb.x, tb.y, tb.w, tb.h)}${rectGeom}</p:spPr>` +
				`<p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>Title</a:t></a:r><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody></p:sp>`;
			for (const role of ['header', 'footer'] as const) {
				const frame = layout.chrome[role];
				if (!frame) continue;
				const { box, paras } = textOf(frame);
				tree += `<p:sp><p:nvSpPr>${cNvPr(id++, ROLE_NAMES[role])}<p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr>${xfrm(box.x, box.y, box.w, box.h)}${rectGeom}<a:noFill/>${NO_LINE}</p:spPr>${txBody(paras)}</p:sp>`;
			}
			if (layout.chrome.number) {
				numberOf.set(li, { frame: layout.chrome.number });
				tree += numberSp(id++, layout.chrome.number, null);
			}
		}
		const name = useLayouts ? `Layout ${li + 1}` : 'Blank';
		const xml =
			`${DECL}<p:sldLayout ${NS} preserve="1"${useLayouts ? '' : ' type="blank"'}><p:cSld name="${xmlAttr(name)}">${background(rels, layout.paint)}<p:spTree>${TREE_ROOT}${tree}</p:spTree></p:cSld>` +
			'<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
		part(`ppt/slideLayouts/slideLayout${li + 1}.xml`, xml, `${CT}.slideLayout+xml`);
		part(`ppt/slideLayouts/_rels/slideLayout${li + 1}.xml.rels`, rels.xml());
		layoutIds.push(masterRels.add(`${REL}/slideLayout`, `../slideLayouts/slideLayout${li + 1}.xml`));
	});

	// THE SLIDE MASTER: no placeholders of its own (each layout carries what it draws), PowerPoint's text styles.
	masterRels.add(`${REL}/theme`, '../theme/theme1.xml');
	const titleStyle = `<a:lvl1pPr algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr>`;
	const bodyStyle = levels((l) => ` marL="${(l - 1) * 457200}" indent="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"`);
	part(
		'ppt/slideMasters/slideMaster1.xml',
		`${DECL}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${TREE_ROOT}</p:spTree></p:cSld>` +
			`<p:clrMap ${CLR_MAP}/><p:sldLayoutIdLst>${layoutIds.map((rid, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="${rid}"/>`).join('')}</p:sldLayoutIdLst>` +
			`<p:hf sldNum="0" hdr="0" ftr="0" dt="0"/><p:txStyles><p:titleStyle>${titleStyle}</p:titleStyle><p:bodyStyle>${bodyStyle}</p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${levels(levelAttrs)}</p:otherStyle></p:txStyles></p:sldMaster>`,
		`${CT}.slideMaster+xml`,
	);
	part('ppt/slideMasters/_rels/slideMaster1.xml.rels', masterRels.xml());
	part('ppt/theme/theme1.xml', themeXml('Office Theme'), 'application/vnd.openxmlformats-officedocument.theme+xml');

	// THE SLIDES.
	const lockPicture = useLayouts;
	let notesCount = 0;
	deck.slides.forEach((original, i) => {
		if (original.image && !original.image.length) throw new Error(`calco: slide ${i + 1} has no image`);
		const n = i + 1;
		const li = plan.layoutOf[i];
		const slide: Slide = withoutHoisted(original, plan.hoisted[i]);
		const rels = new Rels();
		rels.add(`${REL}/slideLayout`, `../slideLayouts/slideLayout${li + 1}.xml`);
		let nextId = 2;
		let tree = '';
		// The slide's content picture. ALWAYS described: a screen reader otherwise reads "Picture".
		if (slide.image?.length) tree += picture(nextId++, `Slide ${n}`, xmlSafe(slide.description || '').trim() || `Slide ${n}`, picRel(rels, slide.image), 0, 0, W, H, { locked: lockPicture });
		const insetsOf = (shape: Shape, frame: TextFrame) => labelInsets(shapeGeometry(shape), textOf(frame).box, frame.align);
		let titled = false;
		for (const { group, items } of drawOrder(slide, (shape, frame) => !!insetsOf(shape, frame))) {
			const members: Member[] = [];
			for (const item of items) {
				if ('frame' in item) {
					const frame = item.frame;
					const role = frame.role;
					// A title is the slide's title placeholder and a page number a field, unless a card carries them.
					const isTitle = useLayouts && group === undefined && role === 'title' && !titled;
					const isNumber = group === undefined && role === 'number' && isPosition(frame, n);
					if (isTitle) titled = true;
					const { box, paras } = textOf(frame, { field: isNumber });
					const name = role ? `${ROLE_NAMES[role]} ${n}` : `Text ${n}.${item.index + 1}`;
					const nv = isTitle ? '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr>' : '<p:cNvSpPr txBox="1"/><p:nvPr/>';
					members.push({
						xml: `<p:sp><p:nvSpPr>${cNvPr(nextId++, name)}${nv}</p:nvSpPr><p:spPr>${xfrm(box.x, box.y, box.w, box.h)}${rectGeom}<a:noFill/>${NO_LINE}</p:spPr>${txBody(paras)}</p:sp>`,
						box: boxOf(box.x, box.y, box.w, box.h),
						custom: false,
					});
					continue;
				}
				const shape = item.shape;
				if (shape.kind === 'picture') {
					if (!shape.image?.length) continue;
					const rid = picRel(rels, shape.image);
					const svgRid = shape.svg ? rels.add(IMAGE_REL, `../media/${mediaPart(utf8(shape.svg), 'svg').split('/').pop()}`) : undefined;
					const name = `Picture ${n}.${item.index + 1}`;
					members.push({ xml: picture(nextId++, name, xmlSafe(shape.alt || '') || name, rid, shape.x, shape.y, shape.w, shape.h, { svgRid }), box: boxOf(shape.x, shape.y, shape.w, shape.h), custom: false, sub: shape.sub });
					continue;
				}
				const geom = shapeGeometry(shape);
				const props = shapeProps(shape, geom);
				const kind = item.label ? 'Label' : shape.kind === 'line' ? 'Rule' : shape.kind === 'path' ? 'Mark' : 'Shape';
				const nvPr = cNvPr(nextId++, `${kind} ${n}.${item.index + 1}`, item.label ? undefined : xmlSafe(shape.alt || ''));
				let body = '';
				if (item.label) {
					const { box, paras } = textOf(item.label);
					body = txBody(paras, labelInsets(geom, box, item.label.align) as NonNullable<ReturnType<typeof labelInsets>>);
				}
				members.push({
					xml: `<p:sp><p:nvSpPr>${nvPr}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(geom.x, geom.y, geom.w, geom.h)}${props.xml}</p:spPr>${body}</p:sp>`,
					box: boxOf(geom.x, geom.y, geom.w, geom.h),
					custom: props.custom,
					sub: shape.sub,
				});
			}
			tree += group === undefined ? members.map((m) => m.xml).join('') : wrapCard(group, members, () => nextId++);
		}
		// The page number the layout draws: the slide carries its own placeholder, with its own digits, so it shows.
		const num = numberOf.get(li);
		if (num) tree += numberSp(nextId++, num.frame, String(n));
		const notes = xmlSafe(original.notes || '');
		if (notes.trim()) {
			notesCount++;
			const notesRels = new Rels();
			notesRels.add(`${REL}/notesMaster`, '../notesMasters/notesMaster1.xml');
			notesRels.add(`${REL}/slide`, `../slides/slide${n}.xml`);
			const paras = notes
				.split(/\r\n|\r|\n/)
				.map((line) => (line ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${xmlText(line)}</a:t></a:r></a:p>` : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'))
				.join('');
			part(
				`ppt/notesSlides/notesSlide${n}.xml`,
				`${DECL}<p:notes ${NS}><p:cSld><p:spTree>${TREE_ROOT}` +
					`<p:sp><p:nvSpPr>${cNvPr(2, 'Slide Image Placeholder 1')}<p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>` +
					`<p:sp><p:nvSpPr>${cNvPr(3, 'Notes Placeholder 2')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>` +
					'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>',
				`${CT}.notesSlide+xml`,
			);
			part(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, notesRels.xml());
			rels.add(`${REL}/notesSlide`, `../notesSlides/notesSlide${n}.xml`);
		}
		part(
			`ppt/slides/slide${n}.xml`,
			`${DECL}<p:sld ${NS}><p:cSld name="${xmlAttr(`Slide ${n}`)}"><p:spTree>${TREE_ROOT}${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
			`${CT}.slide+xml`,
		);
		part(`ppt/slides/_rels/slide${n}.xml.rels`, rels.xml());
	});

	// THE NOTES MASTER, with a theme of its own.
	part(
		'ppt/notesMasters/notesMaster1.xml',
		`${DECL}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${TREE_ROOT}` +
			`<p:sp><p:nvSpPr>${cNvPr(2, 'Slide Image Placeholder 1')}<p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm>${rectGeom}<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>` +
			`<p:sp><p:nvSpPr>${cNvPr(3, 'Notes Placeholder 2')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm>${rectGeom}</p:spPr>` +
			'<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Notes</a:t></a:r></a:p></p:txBody></p:sp>' +
			`</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/><p:notesStyle>${levels(levelAttrs, '<a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr>')}</p:notesStyle></p:notesMaster>`,
		`${CT}.notesMaster+xml`,
	);
	const notesMasterRels = new Rels();
	notesMasterRels.add(`${REL}/theme`, '../theme/theme2.xml');
	part('ppt/notesMasters/_rels/notesMaster1.xml.rels', notesMasterRels.xml());
	part('ppt/theme/theme2.xml', themeXml('Notes Theme'), 'application/vnd.openxmlformats-officedocument.theme+xml');

	// THE PRESENTATION: masters, slides, sizes, the embedded fonts, the default text style.
	const presRels = new Rels();
	const masterRid = presRels.add(`${REL}/slideMaster`, 'slideMasters/slideMaster1.xml');
	const notesMasterRid = presRels.add(`${REL}/notesMaster`, 'notesMasters/notesMaster1.xml');
	const slideRids = deck.slides.map((_s, i) => presRels.add(`${REL}/slide`, `slides/slide${i + 1}.xml`));
	presRels.add(`${REL}/presProps`, 'presProps.xml');
	presRels.add(`${REL}/viewProps`, 'viewProps.xml');
	presRels.add(`${REL}/theme`, 'theme/theme1.xml');
	presRels.add(`${REL}/tableStyles`, 'tableStyles.xml');
	// One `p:embeddedFont` per family name, its faces in the schema's slot order.
	const byName = new Map<string, Array<{ slot: FaceSlot; rid: string }>>();
	embedded.faces.forEach(({ face, name, slot }, i) => {
		const style = { regular: 'Regular', bold: 'Bold', italic: 'Italic', boldItalic: 'Bold Italic' }[slot];
		const eot = toEot(renameFace(face.bytes, name, slot), { family: name, style, full: slot === 'regular' ? name : `${name} ${style}` });
		zip.file(`ppt/fonts/font${i + 1}.fntdata`, eot, NO_DIRS);
		defaults.set('fntdata', 'application/x-fontdata');
		byName.set(name, [...(byName.get(name) || []), { slot, rid: presRels.add(`${REL}/font`, `fonts/font${i + 1}.fntdata`) }]);
	});
	const fontList = [...byName]
		.map(([name, list]) => {
			const slots = (['regular', 'bold', 'italic', 'boldItalic'] as const).map((k) => {
				const hit = list.find((x) => x.slot === k);
				return hit ? `<p:${k} r:id="${hit.rid}"/>` : '';
			});
			return `<p:embeddedFont><p:font typeface="${xmlAttr(name)}" charset="0"/>${slots.join('')}</p:embeddedFont>`;
		})
		.join('');
	part(
		'ppt/presentation.xml',
		`${DECL}<p:presentation ${NS} saveSubsetFonts="1"${fontList ? ' embedTrueTypeFonts="1"' : ''}>` +
			`<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${masterRid}"/></p:sldMasterIdLst>` +
			`<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRid}"/></p:notesMasterIdLst>` +
			`<p:sldIdLst>${slideRids.map((rid, i) => `<p:sldId id="${256 + i}" r:id="${rid}"/>`).join('')}</p:sldIdLst>` +
			`<p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="${NOTES.cx}" cy="${NOTES.cy}"/>` +
			(fontList ? `<p:embeddedFontLst>${fontList}</p:embeddedFontLst>` : '') +
			`<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${levels(levelAttrs)}</p:defaultTextStyle></p:presentation>`,
		`${CT}.presentation.main+xml`,
	);
	part('ppt/_rels/presentation.xml.rels', presRels.xml());
	part('ppt/presProps.xml', `${DECL}<p:presentationPr ${NS}/>`, `${CT}.presProps+xml`);
	part(
		'ppt/viewProps.xml',
		`${DECL}<p:viewPr ${NS}><p:normalViewPr horzBarState="maximized"><p:restoredLeft sz="15611"/><p:restoredTop sz="94610"/></p:normalViewPr>` +
			'<p:slideViewPr><p:cSldViewPr snapToGrid="0"><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr>' +
			'<p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>',
		`${CT}.viewProps+xml`,
	);
	part('ppt/tableStyles.xml', `${DECL}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`, `${CT}.tableStyles+xml`);

	// THE DOCUMENT PROPERTIES.
	const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
	const title = xmlSafe(deck.title || '').trim() || 'deck';
	const author = xmlSafe(deck.author || 'Calco');
	part(
		'docProps/core.xml',
		`${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
			`<dc:title>${xmlText(title)}</dc:title>${deck.subject ? `<dc:subject>${xmlText(deck.subject)}</dc:subject>` : ''}<dc:creator>${xmlText(author)}</dc:creator><cp:lastModifiedBy>${xmlText(author)}</cp:lastModifiedBy><cp:revision>1</cp:revision>` +
			`<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
		'application/vnd.openxmlformats-package.core-properties+xml',
	);
	part(
		'docProps/app.xml',
		`${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
			`<TotalTime>0</TotalTime><Words>0</Words><Application>Calco</Application><PresentationFormat>${page.wide ? 'On-screen Show (16:9)' : 'Custom'}</PresentationFormat>` +
			`<Paragraphs>0</Paragraphs><Slides>${deck.slides.length}</Slides><Notes>${notesCount}</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips><ScaleCrop>false</ScaleCrop>` +
			`<Company>${xmlText(xmlSafe(deck.company || 'Calco'))}</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>`,
		'application/vnd.openxmlformats-officedocument.extended-properties+xml',
	);
	const pkgRels = new Rels();
	pkgRels.add(`${REL}/officeDocument`, 'ppt/presentation.xml');
	pkgRels.add('http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml');
	pkgRels.add(`${REL}/extended-properties`, 'docProps/app.xml');
	zip.file('_rels/.rels', pkgRels.xml(), NO_DIRS);
	zip.file(
		'[Content_Types].xml',
		`${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${[...defaults].map(([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`).join('')}${overrides.join('')}</Types>`,
		NO_DIRS,
	);
	return zip;
}

/**
 * A card's members as they are written: one `p:grpSp`, with each run of one sub-group's members (a pill) nested
 * as a group of its own. A card with any custom geometry is written loose, in paint order (see the header); a
 * sub-group of presets alone stays a group even inside a loose card, so it still moves as one. The group's frame
 * is its members' bounding box and its child frame the same box, so every member keeps its slide coordinates.
 */
function wrapCard(group: number, members: Member[], nextId: () => number): string {
	const wrap = (name: string, list: Member[]): Member => {
		const x = lowest(list.map((m) => m.box[0]));
		const y = lowest(list.map((m) => m.box[1]));
		const r = highest(list.map((m) => m.box[2]));
		const b = highest(list.map((m) => m.box[3]));
		const frame = `<a:off x="${x}" y="${y}"/><a:ext cx="${r - x}" cy="${b - y}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${r - x}" cy="${b - y}"/>`;
		return {
			xml: `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${nextId()}" name="${name}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm>${frame}</a:xfrm></p:grpSpPr>${list.map((m) => m.xml).join('')}</p:grpSp>`,
			box: [x, y, r, b],
			custom: list.some((m) => m.custom),
		};
	};
	const parts: Member[] = [];
	for (let i = 0; i < members.length; ) {
		const { sub } = members[i];
		let j = i + 1;
		while (sub !== undefined && j < members.length && members[j].sub === sub) j++;
		const run = members.slice(i, j);
		if (sub !== undefined && run.length > 1 && !run.some((m) => m.custom)) parts.push(wrap(`Group ${group + 1}.${sub + 1}`, run));
		else parts.push(...run);
		i = j;
	}
	if (members.some((m) => m.custom) || parts.length < 2) return parts.map((m) => m.xml).join('');
	return wrap(`Group ${group + 1}`, parts).xml;
}

/** Options for `zip.generateAsync`: DEFLATE the XML (media were added STORED), typed as a PowerPoint. */
export const pptxZipOptions = Object.freeze({ compression: 'DEFLATE', mimeType: PPTX_MIMETYPE });

/** Build and serialize in one call. `outputType` is JSZip's (`uint8array`, `nodebuffer`, `blob`, `arraybuffer`, `base64`, …). */
export async function writePptx<T = Uint8Array>(JSZip: JSZipClass, deck: Deck, outputType = 'uint8array'): Promise<T> {
	return (await buildPptx(JSZip, deck).generateAsync({ ...pptxZipOptions, type: outputType })) as T;
}
