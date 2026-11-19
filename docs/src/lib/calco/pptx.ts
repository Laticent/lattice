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
 * slide when slides move. Running chrome two slides share lives on the master, or on their layout (masters.ts).
 *
 * THE THEME is the deck's (theme.ts): its colors and its heading and body faces, the master's text styles in its type, and
 * layouts named for what they are with title and body placeholders in that type, so new content looks like the deck.
 *
 * XML is assembled from escaped values only (`xmlAttr`, `xmlText`): every value goes through `xmlSafe`, which strips
 * the characters XML 1.0 forbids, and is then escaped. Page text never names a tag or an attribute.
 */

import { type FontMetrics, faceFamilyName, faceFor, faceKey, facesUsed, uniqueFaceNames } from './fonts.js';
import { applyTransform, dominantStyle, metricsFor, type PlacedBox, placeFrame, spacingMultiple } from './layout.js';
import { isPosition, type MasterPlan, planMasters, withoutHoisted } from './masters.js';
import { imageExt } from './picture.js';
import { canEmbedAsEot, type FaceSlot, fontClass, renameFace, toEot } from './sfnt.js';
import { drawOrder, labelInsets, type ShapeGeometry, shapeGeometry } from './shapes.js';
import { type ColorSlot, luminance, readTheme } from './theme.js';
import type { Background, Deck, EmbeddedFont, FrameRole, JSZipClass, Paint, Shape, Slide, TextFrame, TextRun, TextStyle } from './types.js';

export const PPTX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Loops, not a spread: `Math.min(...xs)` overflows the call stack past about 120,000 values. */
const lowest = (xs: number[]) => xs.reduce((m, v) => (v < m ? v : m), Number.POSITIVE_INFINITY);
const highest = (xs: number[]) => xs.reduce((m, v) => (v > m ? v : m), Number.NEGATIVE_INFINITY);

const EMU_PER_IN = 914400;
const PX_PER_IN = 96;
const PT_PER_PX = 0.75;
/** PowerPoint's 16:9 slide, 13⅓ × 7.5 in. */
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
const ROLE_NAMES: Record<FrameRole, string> = { title: 'Title', eyebrow: 'Eyebrow', subtitle: 'Subtitle', header: 'Header', footer: 'Footer', number: 'Slide number', meta: 'Meta' };

/** Text with the characters XML 1.0 forbids removed. Escape it (`xmlText`, `xmlAttr`) before it goes into a part. */
export function xmlSafe(text: string | null | undefined): string {
	return (
		(text == null ? '' : String(text))
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
			// A lone surrogate half is no character at all: a zip writer turns it into U+FFFD, which a reader draws as a box.
			.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
	);
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

/**
 * A color as OOXML spells it: six hex digits, upper case. Calco's reader always hands `#rrggbb`; anything else from a
 * hand-built deck (`#abc` is expanded, `#rrggbbaa` loses its alpha, which travels separately) falls back to black
 * rather than writing a value the schema rejects.
 */
function hexOf(color: string): string {
	const h = String(color ?? '').trim().replace(/^#/, '');
	if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return h.slice(0, 6).toUpperCase();
	if (/^[0-9a-f]{3}$/i.test(h)) return [...h].map((c) => c + c).join('').toUpperCase();
	return '000000';
}

/** The family name PowerPoint sees for an embedded face (`faceFamilyName`, with the PPTX-safe family). */
export function pptxFaceName(face: { family: string; weight: number; italic: boolean }): string {
	return faceFamilyName({ ...face, family: safeFamily(face.family) });
}

/**
 * The slide size: `cx` and `cy` in EMU, exact, and `w` and `h` in inches to three places for display. A 16:9 deck is
 * PowerPoint's own wide slide, 12192000 × 6858000 EMU (13⅓ × 7.5 in). Any other aspect, a near-16:9 one included, keeps
 * its own aspect with the longest edge at 12192000 EMU, so the deck's px map onto the slide by one factor on both axes
 * and nothing runs past an edge.
 */
export function pptxPageSize(width: number, height: number): { w: number; h: number; cx: number; cy: number; wide: boolean } {
	const w = Number(width);
	const h = Number(height);
	const inches = (emu: number) => Math.round((emu / EMU_PER_IN) * 1000) / 1000;
	if (!(w > 0 && h > 0) || Math.abs(w * 9 - h * 16) < 1e-6 * h) return { w: inches(WIDE.cx), h: inches(WIDE.cy), cx: WIDE.cx, cy: WIDE.cy, wide: true };
	const longest = Math.max(w, h);
	const cx = Math.round((WIDE.cx * w) / longest);
	const cy = Math.round((WIDE.cx * h) / longest);
	return { w: inches(cx), h: inches(cy), cx, cy, wide: false };
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

/** A theme's colors and faces. Leave them out for Office's own (the notes master's theme). */
interface ThemeSpec {
	/** Six hex digits per slot, upper case. */
	colors?: Record<ColorSlot, string>;
	/** The heading and body faces, as runs name them. */
	major?: string;
	minor?: string;
}

/**
 * A theme part: its colors and fonts (the deck's for the slide master, theme.ts; Office's for the notes master), and
 * the three entries each style list must hold.
 */
function themeXml(name: string, spec: ThemeSpec = {}): string {
	const clr = (tag: string, rgb: string) => `<a:${tag}><a:srgbClr val="${rgb}"/></a:${tag}>`;
	const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
	const line = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
	const effect = '<a:effectStyle><a:effectLst/></a:effectStyle>';
	const c = spec.colors;
	const scheme = c
		? `<a:clrScheme name="${xmlAttr(name)}">${clr('dk1', c.dk1)}${clr('lt1', c.lt1)}${clr('dk2', c.dk2)}${clr('lt2', c.lt2)}${clr('accent1', c.accent1)}${clr('accent2', c.accent2)}` +
			`${clr('accent3', c.accent3)}${clr('accent4', c.accent4)}${clr('accent5', c.accent5)}${clr('accent6', c.accent6)}${clr('hlink', c.hlink)}${clr('folHlink', c.folHlink)}</a:clrScheme>`
		: `<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
			`${clr('dk2', '44546A')}${clr('lt2', 'E7E6E6')}${clr('accent1', '4472C4')}${clr('accent2', 'ED7D31')}${clr('accent3', 'A5A5A5')}` +
			`${clr('accent4', 'FFC000')}${clr('accent5', '5B9BD5')}${clr('accent6', '70AD47')}${clr('hlink', '0563C1')}${clr('folHlink', '954F72')}</a:clrScheme>`;
	const major = xmlAttr(spec.major || 'Calibri Light');
	const minor = xmlAttr(spec.minor || 'Calibri');
	return (
		`${DECL}<a:theme xmlns:a="${NS_A}" name="${xmlAttr(name)}"><a:themeElements>${scheme}` +
		`<a:fontScheme name="${xmlAttr(spec.major ? name : 'Office')}"><a:majorFont><a:latin typeface="${major}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
		`<a:minorFont><a:latin typeface="${minor}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
		`<a:fmtScheme name="Office"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst>` +
		`<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
		`<a:effectStyleLst>${effect}${effect}${effect}</a:effectStyleLst>` +
		`<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme>` +
		`</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
	);
}

/** Nine list levels, as PowerPoint's own text styles carry them: `marL` steps of half an inch. */
function levels(attrs: (lvl: number) => string, rPr = '<a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr>', pre = ''): string {
	let out = '';
	for (let l = 1; l <= 9; l++) out += `<a:lvl${l}pPr${attrs(l)}>${pre}${rPr}</a:lvl${l}pPr>`;
	return out;
}
const levelAttrs = (l: number) => ` marL="${(l - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"`;

/** An empty shape tree's root: id 1, at the origin. */
const TREE_ROOT = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
/** The color map of a dark look, as Office's own dark themes write it: text is the light pair, background the dark. */
const CLR_MAP_DARK = 'bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
/** WCAG contrast ratio of two `#rrggbb` colors. */
const contrastOf = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};
/** A ground dark enough that white reads better on it than black. */
const isDark = (ground: string) => luminance(ground) < 0.179;

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
	deck.slides.forEach((sl, i) => {
		if (!sl || !Array.isArray(sl.frames)) throw new Error(`calco: slide ${i + 1} is missing or has no frames list`);
	});
	const W = deck.width > 0 ? deck.width : 1280;
	const H = deck.height > 0 ? deck.height : 720;
	const page = pptxPageSize(W, H);
	const size = { cx: page.cx, cy: page.cy };
	// The deck's px map onto the slide's EMU; points scale the same way (a 1280px deck: 1px = 0.75pt).
	const emuPerPx = size.cx / W;
	const ptPerPx = (size.cx / EMU_PER_IN / W) * PX_PER_IN * PT_PER_PX;
	// Every number reaches the file through these, so one that is not finite (NaN from a hand-built deck) is 0, never
	// the text "NaN", and each kind is held to the range the schema gives it (`clamp`).
	const fin = (n: number) => (Number.isFinite(n) ? n : 0);
	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(fin(n))));
	const emu = (px: number) => Math.round(fin(px) * emuPerPx);
	const points = (px: number) => Math.round(fin(px) * ptPerPx * 100) / 100;
	/** A length that is not a position (line widths, shadows, label insets), in EMU straight from px: no detour through rounded points. */
	const lenEmu = (px: number) => clamp(fin(px) * emuPerPx, 0, 20116800);
	/** OOXML alpha in thousandths of a percent, from 0–1, exact: the file holds 1/1000 of a percent even where PowerPoint's UI shows whole ones. */
	const alphaVal = (a: number) => clamp(fin(a) * 100000, 0, 100000);
	const color = (hex: string, alpha = 1) => {
		const a = alphaVal(alpha);
		const rgb = hexOf(hex);
		return a < 100000 ? `<a:srgbClr val="${rgb}"><a:alpha val="${a}"/></a:srgbClr>` : `<a:srgbClr val="${rgb}"/>`;
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

	// WHAT KIND OF FACE a run names, for a reader that does not have it: the face's PANOSE number and its pitch and family
	// byte, read from the face when the deck carries one of that family, else the family from the CSS generic the author
	// declared. Neither known: no claim (the attributes are optional; "34", swiss and variable, on a monospaced face sent
	// PowerPoint to Arial).
	const GENERIC_FAMILY: Record<string, number> = { serif: 0x12, 'sans-serif': 0x22, monospace: 0x31, cursive: 0x42, fantasy: 0x52 };
	const classCache = new Map<string, ReturnType<typeof fontClass>>();
	const latinAttrs = (s: TextStyle): string => {
		const key = s.family.toLowerCase();
		if (!classCache.has(key)) {
			const face = fonts.find((f) => f.family.toLowerCase() === key);
			classCache.set(key, face ? fontClass(face.bytes) : null);
		}
		const read = classCache.get(key);
		const declared = s.generic ? GENERIC_FAMILY[s.generic] : 0;
		// The face's own word wins; a face that leaves its family blank (most web fonts do) takes the declared one.
		const pitchFamily = read ? (read.pitchFamily & 0xf0 ? read.pitchFamily : (declared & 0xf0) | (read.pitchFamily & 0x03)) : declared;
		return `${read?.panose ? ` panose="${read.panose}"` : ''}${pitchFamily ? ` pitchFamily="${pitchFamily}" charset="0"` : ''}`;
	};
	/** A run's language: its own `lang`, else the deck's, else US English; a tag that is not well formed is skipped. */
	const LANG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;
	const deckLang = deck.lang && LANG.test(deck.lang) ? deck.lang : 'en-US';
	const langOf = (s?: TextStyle) => (s?.lang && LANG.test(s.lang) ? s.lang : deckLang);

	/** One run's properties: `a:rPr` (or `a:endParaRPr`, which takes no run-only attributes). */
	const runProps = (s: TextStyle, tag = 'a:rPr', end = false): string => {
		const hit = embedded.byKey.get(faceKey(s.family, s.weight, s.italic));
		const face = hit ? hit.name : safeFamily(s.family);
		const bold = hit ? hit.bold : s.weight >= 600;
		const italic = hit ? hit.italic : s.italic;
		// OOXML's smallest size is 1pt (a 2px spacer on a wide deck).
		const sz = clamp(points(s.size) * 100, 100, 400000);
		const fillColor = s.alpha < 1 && s.flatColor ? s.flatColor : s.color;
		const fillAlpha = s.alpha < 1 && !s.flatColor ? s.alpha : 1;
		// Weight, slant, caps and letter-spacing are always written, "off" included: the master's and layouts' text styles
		// carry the deck's title and body look (bold, all caps, letter-spaced), and a run that left them out would inherit
		// them in PowerPoint (engineering/decisions/2026-11-18-calco-master-theme.md §3).
		let a = ` lang="${langOf(s)}" sz="${sz}"`;
		a += bold ? ' b="1"' : ' b="0"';
		a += italic ? ' i="1"' : ' i="0"';
		if (!end) {
			if (s.underline) a += ' u="sng"';
			if (s.strike) a += ' strike="sngStrike"';
			a += s.smallCaps ? ' cap="small"' : ' cap="none"';
			a += ` spc="${fin(s.letterSpacing) ? clamp(points(s.letterSpacing) * 100, -400000, 400000) : 0}"`;
		}
		// Kerned at every size, as the browser kerns: letter-spaced text and 9pt labels too (measured in Chromium). `kern` is
		// the smallest size kerning applies at, in hundredths of a point, so 1pt; not 0, which the spec reads as "every
		// size" and PowerPoint writes for "off". The default styles' 12pt would leave every small label unkerned and wider
		// than the slide drew it.
		a += ' kern="100"';
		a += ' dirty="0"';
		const highlight = !end && s.highlight ? `<a:highlight>${color(s.highlight)}</a:highlight>` : '';
		const fam = xmlAttr(face);
		return `<${tag}${a}><a:solidFill>${color(fillColor, fillAlpha)}</a:solidFill>${highlight}<a:latin typeface="${fam}"${latinAttrs(s)}/><a:ea typeface="${fam}"/><a:cs typeface="${fam}"/></${tag}>`;
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
		const spacing = clamp(spacingMultiple(frame, metrics, lead.size) * 100000, 0, 13200000);
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
		`<p:txBody><a:bodyPr wrap="none" lIns="${ins ? lenEmu(ins.l) : 0}" tIns="${ins ? lenEmu(ins.t) : 0}" rIns="${ins ? lenEmu(ins.r) : 0}" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody>`;
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
					// A stop keeps its exact opacity (a wash's fade), not the whole percent a fill rounds to.
					const a = clamp(st.alpha * 100000, 0, 100000);
					return `<a:gs pos="${clamp(st.pos * 100000, 0, 100000)}"><a:srgbClr val="${hexOf(st.color)}">${a < 100000 ? `<a:alpha val="${a}"/>` : ''}</a:srgbClr></a:gs>`;
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
			line = `<a:ln w="${lenEmu(stroke.width)}"${cap}>${solid(stroke)}<a:prstDash val="${dash}"/>${join}</a:ln>`;
		}
		let effect = '';
		if (shape.shadow) {
			const { x, y, blur } = shape.shadow;
			const dir = Math.round(((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360 * 60000) % 21600000;
			effect =
				`<a:effectLst><a:outerShdw blurRad="${lenEmu(blur)}" dist="${lenEmu(Math.hypot(x, y))}" dir="${dir}" sx="100000" sy="100000" kx="0" ky="0" algn="bl" rotWithShape="0">` +
				`${color(shape.shadow.color, shape.shadow.alpha)}</a:outerShdw></a:effectLst>`;
		}
		return { xml: `${geometry}${fill}${line}${effect}`, custom };
	};

	/** `p:cNvPr`: the shape's id, its name and, when it has one, its description (alt text). */
	const cNvPr = (id: number, name: string, descr?: string) => `<p:cNvPr id="${id}" name="${xmlAttr(name)}"${descr ? ` descr="${xmlAttr(descr)}"` : ''}/>`;
	// `full`: the slide's own picture covers the slide exactly. Its height is the slide's, not H scaled by the width:
	// a near-16:9 deck (1280 × 722) is drawn on the wide slide, and its picture would otherwise run past the bottom edge.
	const fullFrame = `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${size.cx}" cy="${size.cy}"/></a:xfrm>`;
	const picture = (id: number, name: string, descr: string, rid: string, x: number, y: number, w: number, h: number, opts: { locked?: boolean; svgRid?: string; full?: boolean } = {}) =>
		`<p:pic><p:nvPicPr>${cNvPr(id, name, descr)}<p:cNvPicPr><a:picLocks noChangeAspect="1"${opts.locked ? ' noMove="1" noResize="1"' : ''}/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
		`<p:blipFill><a:blip r:embed="${rid}">${opts.svgRid ? `<a:extLst><a:ext uri="${SVG_EXT}"><asvg:svgBlip xmlns:asvg="${NS_ASVG}" r:embed="${opts.svgRid}"/></a:ext></a:extLst>` : ''}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
		`<p:spPr>${opts.full ? fullFrame : xfrm(x, y, w, h)}${rectGeom}</p:spPr></p:pic>`;

	// THE THEME, read off what the deck draws (theme.ts): what an office app offers for new content.
	const theme = readTheme(deck);
	// A dark deck (its text lighter than its ground) is written the Office way: the theme's dk1/dk2 are the dark pair
	// and lt1/lt2 the light one, and the master's color map reads text from the light pair. Built-in shape, table and
	// chart styles assume dk is dark (red team and inversion, 2026-11-19).
	const deckDark = luminance(theme.colors.dk1) > luminance(theme.colors.lt1);
	/** Text that does not read on a layout's ground (under 3:1) takes the first fallback that does, else white or black. */
	const readable = (frame: TextFrame | undefined, ground: string | undefined, ...fallbacks: Array<string | undefined>): TextFrame | undefined => {
		if (!frame || !ground) return frame;
		const lead = dominantStyle(frame.lines.find((l) => l.length) || frame.lines[0]);
		const ink = lead.alpha < 1 && lead.flatColor ? lead.flatColor : lead.color;
		if (contrastOf(ink, ground) >= 3) return frame;
		const pick = [...fallbacks, '#ffffff', '#000000'].find((c): c is string => !!c && contrastOf(c, ground) >= 4.5) ?? (isDark(ground) ? '#ffffff' : '#000000');
		return { ...frame, lines: frame.lines.map((line) => line.map((r) => ({ ...r, style: { ...r.style, color: pick, alpha: 1, flatColor: undefined } }))) };
	};
	/** The family a style's runs name, and whether they flag bold or italic (as `runProps` decides). */
	const faceRef = (st: TextStyle) => {
		const hit = embedded.byKey.get(faceKey(st.family, st.weight, st.italic));
		return hit ? { name: hit.name, bold: hit.bold, italic: hit.italic } : { name: safeFamily(st.family), bold: st.weight >= 600, italic: st.italic };
	};
	const majorFace = theme.title ? faceRef(theme.title.style).name : undefined;
	const minorFace = theme.body ? faceRef(theme.body.style).name : majorFace;
	/**
	 * A text style's default run: size, weight, slant, spacing, color and the theme face (`+mj` heading, `+mn` body) when it
	 * is the theme's, else the face by name.
	 */
	const defRPr = (st: TextStyle | undefined, font: 'mj' | 'mn', fallbackPt: number, scheme?: 'tx1' | 'tx2') => {
		if (!st) return `<a:defRPr sz="${fallbackPt * 100}" kern="1200"><a:solidFill><a:schemeClr val="${scheme ?? 'tx1'}"/></a:solidFill><a:latin typeface="+${font}-lt"/><a:ea typeface="+${font}-ea"/><a:cs typeface="+${font}-cs"/></a:defRPr>`;
		const ref = faceRef(st);
		const themed = ref.name === (font === 'mj' ? majorFace : minorFace);
		const fam = themed ? `+${font}-lt` : xmlAttr(ref.name);
		const sz = clamp(points(st.size) * 100, 100, 400000);
		const spc = fin(st.letterSpacing) ? ` spc="${clamp(points(st.letterSpacing) * 100, -400000, 400000)}"` : '';
		const cap = st.transform === 'uppercase' ? ' cap="all"' : st.smallCaps ? ' cap="small"' : '';
		return (
			`<a:defRPr sz="${sz}" b="${ref.bold ? 1 : 0}" i="${ref.italic ? 1 : 0}"${cap}${spc} kern="100"><a:solidFill>${scheme ? `<a:schemeClr val="${scheme}"/>` : color(st.alpha < 1 && st.flatColor ? st.flatColor : st.color, st.alpha < 1 && !st.flatColor ? st.alpha : 1)}</a:solidFill>` +
			`<a:latin typeface="${fam}"${themed ? '' : latinAttrs(st)}/><a:ea typeface="${themed ? `+${font}-ea` : fam}"/><a:cs typeface="${themed ? `+${font}-cs` : fam}"/></a:defRPr>`
		);
	};
	/** A frame's line pitch as a paragraph's `a:lnSpc`, as its text boxes state it. */
	const lnSpcOf = (frame: TextFrame | undefined) => {
		if (!frame) return '';
		const lead = dominantStyle(frame.lines.find((l) => l.length) || frame.lines[0]);
		const pct = clamp(spacingMultiple(frame, metricsFor(lead, fonts, metricsCache), lead.size) * 100000, 0, 13200000);
		return `<a:lnSpc><a:spcPct val="${pct}"/></a:lnSpc>`;
	};
	const algnOf = (frame: TextFrame | undefined) => (frame ? { left: 'l', center: 'ctr', right: 'r' }[frame.align] || 'l' : 'l');
	/** A list style's first level in a frame's look: what a placeholder's new text is typed in. */
	const lvl1 = (frame: TextFrame | undefined, font: 'mj' | 'mn') => {
		if (!frame) return '<a:lstStyle/>';
		const lead = dominantStyle(frame.lines.find((l) => l.length) || frame.lines[0]);
		return `<a:lstStyle><a:lvl1pPr marL="0" indent="0" algn="${algnOf(frame)}">${lnSpcOf(frame)}<a:buNone/>${defRPr(lead, font, 18)}</a:lvl1pPr></a:lstStyle>`;
	};
	const PH_BODY = '<a:bodyPr vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:normAutofit/></a:bodyPr>';

	// LAYOUTS. Slides that share a background and running chrome share a layout (masters.ts). The running chrome most
	// slides show (header, footer, page number) is drawn once, on the master; a layout that shows exactly that draws
	// none of its own, and one that shows other chrome, or none, hides the master's and draws its own. Each layout has
	// the title placeholder and a body (or, on a title look, subtitle) placeholder in the deck's own type, so a slide
	// added in PowerPoint looks like the deck. A deck with no roles and no shared background has one blank layout.
	const useLayouts = !!deck.backgrounds?.length || deck.slides.some((sl) => sl.frames.some((f) => f.role));
	const plan: MasterPlan = useLayouts
		? planMasters(deck)
		: { layouts: [{ kind: 'content', name: 'Blank', fromMaster: false, chrome: {}, vary: {} }], layoutOf: deck.slides.map(() => 0), hoisted: deck.slides.map(() => new Set<number>()), master: { chrome: {} } };
	const masterRels = new Rels();
	const layoutIds: string[] = [];
	/** The page number's placeholder and its look, per layout that carries one: each of its slides draws one too. */
	const numberOf = new Map<number, { frame: TextFrame }>();
	const numberSp = (id: number, frame: TextFrame, digits: string | null) => {
		const { box } = textOf(frame);
		const lead = frame.lines[0].find((r) => !r.style.emoji) ?? frame.lines[0][0];
		const algn = { left: 'l', center: 'ctr', right: 'r' }[frame.align] || 'l';
		// The whole look (letter-spacing, opacity and caps too) lives in the list style, so the field run carries none
		// of its own and follows it.
		const lst = `<a:lstStyle><a:lvl1pPr algn="${algn}">${runProps(lead.style, 'a:defRPr')}</a:lvl1pPr></a:lstStyle>`;
		// A layout's field shows PowerPoint's own stand-in for "this slide's number"; a slide's shows its digits.
		const body = `<a:fld id="${SLIDENUM_FIELD}" type="slidenum"><a:rPr lang="${deckLang}"/><a:t>${xmlText(digits ?? '‹#›')}</a:t></a:fld>`;
		return (
			`<p:sp><p:nvSpPr>${cNvPr(id, `Slide Number Placeholder ${id - 1}`)}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="12"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr>${xfrm(box.x, box.y, box.w, box.h)}${rectGeom}</p:spPr>` +
			`<p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0"/>${lst}<a:p><a:pPr algn="${algn}"/>${body}<a:endParaRPr lang="${deckLang}"/></a:p></p:txBody></p:sp>`
		);
	};
	/** A header or footer drawn on a layout or the master: text, not a placeholder (a slide has no header placeholder). */
	const chromeSp = (id: number, role: 'header' | 'footer', frame: TextFrame) => {
		const { box, paras } = textOf(frame);
		return `<p:sp><p:nvSpPr>${cNvPr(id, ROLE_NAMES[role])}<p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr>${xfrm(box.x, box.y, box.w, box.h)}${rectGeom}<a:noFill/>${NO_LINE}</p:spPr>${txBody(paras)}</p:sp>`;
	};
	const background = (rels: Rels, paint: Background | undefined): string => {
		if (paint?.color) return `<p:bg><p:bgPr><a:solidFill>${color(paint.color)}</a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
		if (paint?.image?.length) {
			const rid = picRel(rels, paint.image);
			return `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`;
		}
		return '';
	};
	/** The first frame of a role, outside cards, on the slides of a layout (or of the deck). */
	const firstFrame = (role: FrameRole, li?: number) => {
		for (let i = 0; i < deck.slides.length; i++) {
			if (li !== undefined && plan.layoutOf[i] !== li) continue;
			const f = deck.slides[i].frames.find((fr) => fr.role === role && fr.group === undefined && fr.lines.length);
			if (f) return f;
		}
		return undefined;
	};
	/** A slide's frames that are a shape's own label (a tag chip, a pill): never a layout's body or lead look. */
	const labelsOf = (slide: Slide) => new Set((slide.shapes || []).map((sh) => sh.text).filter((t): t is number => t !== undefined));
	/** The first plain paragraph (no role, outside cards) below the title on a layout's slides: a title look's lead line. */
	const firstLead = (li: number, title: { y: number; h: number }) => {
		for (let i = 0; i < deck.slides.length; i++) {
			if (plan.layoutOf[i] !== li) continue;
			const labels = labelsOf(deck.slides[i]);
			const f = deck.slides[i].frames.find((fr, fi) => !fr.role && fr.group === undefined && !labels.has(fi) && fr.lines.length && textOf(fr).box.y >= title.y + title.h / 2);
			if (f) return f;
		}
		return undefined;
	};
	/** The first plain paragraph (no role, outside cards) on a layout's slides: what its body text looks like. */
	const firstPlain = (li: number) => {
		for (let i = 0; i < deck.slides.length; i++) {
			if (plan.layoutOf[i] !== li) continue;
			const labels = labelsOf(deck.slides[i]);
			const f = deck.slides[i].frames.find((fr, fi) => !fr.role && fr.group === undefined && !labels.has(fi) && fr.lines.length);
			if (f) return f;
		}
		return undefined;
	};
	/**
	 * A title frame's look at a quieter role's weight and size: its ink, regular, `scale` of its size. The fallback for a
	 * slot the layout's slides do not show, so it is in THIS layout's ink (light on a dark look), never the master's.
	 */
	const quieter = (frame: TextFrame | undefined, scale = 0.4): TextFrame | undefined =>
		frame && { ...frame, lines: frame.lines.map((line) => line.map((r) => ({ ...r, style: { ...r.style, weight: 400, size: r.style.size * scale } }))) };
	/** A text placeholder (`type="body"`, its own idx) where and as a role is drawn: eyebrow, meta, or a header or footer whose text varies. */
	const textPh = (id: number, name: string, idx: number, frame: TextFrame, prompt: string, ground?: string, ink?: string) => {
		const { box } = textOf(frame);
		frame = readable(frame, ground, ink) as TextFrame;
		return (
			`<p:sp><p:nvSpPr>${cNvPr(id, `${name} Placeholder`)}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="${idx}" hasCustomPrompt="1"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr>${xfrm(box.x, box.y, box.w, Math.max(box.h, 16))}${rectGeom}</p:spPr>` +
			`<p:txBody>${PH_BODY}${lvl1(frame, 'mn')}<a:p><a:r><a:rPr lang="${deckLang}" dirty="0"/><a:t>${xmlText(prompt)}</a:t></a:r><a:endParaRPr lang="${deckLang}" dirty="0"/></a:p></p:txBody></p:sp>`
		);
	};
	const titleBox = (frame: TextFrame | undefined) => (frame ? textOf(frame).box : { x: W * 0.05, y: H * 0.08, w: W * 0.9, h: H * 0.14 });
	/** Where a layout's body goes: under its title, over its footer, across what its first slide draws. */
	const bodyBox = (li: number, title: { x: number; y: number; w: number; h: number }) => {
		const first = deck.slides.findIndex((_s, i) => plan.layoutOf[i] === li);
		const chrome = plan.layouts[li].chrome;
		const floor = Math.min(...(['footer', 'number'] as const).map((r) => (chrome[r] ? textOf(chrome[r] as TextFrame).box.y : H)), H * 0.92) - 16;
		const top = title.y + title.h + 24;
		let x0 = title.x;
		let x1 = title.x + title.w;
		if (first >= 0) {
			const slide = deck.slides[first];
			const boxes = [
				...slide.frames.filter((f) => !f.role && f.lines.length).map((f) => textOf(f).box),
				...(slide.shapes || []).map((sh) => ({ x: sh.x, y: sh.y, w: sh.w, h: sh.h })),
			].filter((b) => b.y + b.h > top && b.y < floor && b.w > 0);
			if (boxes.length) {
				x0 = Math.min(x0, ...boxes.map((b) => b.x));
				x1 = Math.max(x1, ...boxes.map((b) => b.x + b.w));
			}
		}
		x0 = Math.max(0, x0);
		x1 = Math.min(W, Math.max(x1, x0 + W * 0.3));
		return { x: x0, y: top, w: x1 - x0, h: Math.max(H * 0.1, floor - top) };
	};
	const masterNumber = plan.master.chrome.number;
	plan.layouts.forEach((layout, li) => {
		const rels = new Rels();
		rels.add(`${REL}/slideMaster`, '../slideMasters/slideMaster1.xml');
		let id = 2;
		let tree = '';
		if (useLayouts) {
			// The title placeholder sits where the first slide on this layout put its title, in that title's look.
			// Every slot's look is its own role's on this layout, else the deck's, and reads on this layout's ground (3:1 or
			// more), else takes an ink that does: never an empty style, which inherits the master's (red team, 2026-11-19:
			// white body text on white, dark titles on navy).
			const ground = layout.ground;
			const ownTitle = firstFrame('title', li);
			const titleFrame = readable(ownTitle ?? theme.title?.frame, ground) as TextFrame | undefined;
			const titleInk = titleFrame && dominantStyle(titleFrame.lines.find((l) => l.length) || titleFrame.lines[0]).color;
			const tb = titleBox(ownTitle);
			tree +=
				`<p:sp><p:nvSpPr>${cNvPr(id++, 'Title Placeholder')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title" hasCustomPrompt="1"/></p:nvPr></p:nvSpPr>` +
				`<p:spPr>${xfrm(tb.x, tb.y, tb.w, tb.h)}${rectGeom}</p:spPr>` +
				`<p:txBody>${PH_BODY}${lvl1(titleFrame, 'mj')}<a:p><a:r><a:rPr lang="${deckLang}" dirty="0"/><a:t>Title</a:t></a:r><a:endParaRPr lang="${deckLang}" dirty="0"/></a:p></p:txBody></p:sp>`;
			if (layout.kind === 'title') {
				// A title look's second line: the subtitle, where and as the deck drew one; else the first plain paragraph
				// under the title (a lead line); else the title's own ink at a subtitle's size. Never an empty style: that
				// inherits the master's body ink, dark text on a dark title look (owner, Google Slides, 2026-11-19).
				const sub = firstFrame('subtitle', li) ?? firstLead(li, tb);
				const look = readable(sub ?? quieter(titleFrame), ground, titleInk);
				const sb = sub ? textOf(sub).box : { x: tb.x, y: tb.y + tb.h + 16, w: tb.w, h: H * 0.08 };
				tree +=
					`<p:sp><p:nvSpPr>${cNvPr(id++, 'Subtitle Placeholder')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="subTitle" idx="1" hasCustomPrompt="1"/></p:nvPr></p:nvSpPr>` +
					`<p:spPr>${xfrm(sb.x, sb.y, sb.w, Math.max(sb.h, 24))}${rectGeom}</p:spPr>` +
					`<p:txBody>${PH_BODY}${lvl1(look, 'mn')}<a:p><a:r><a:rPr lang="${deckLang}" dirty="0"/><a:t>Subtitle</a:t></a:r><a:endParaRPr lang="${deckLang}" dirty="0"/></a:p></p:txBody></p:sp>`;
			} else {
				const bb = bodyBox(li, tb);
				// The body in the look of this layout's own body text, else its title's ink at body size: never an empty style,
				// which inherits the master's ink (dark on a dark content look).
				const bodyLook = readable(firstPlain(li) ?? theme.body?.frame ?? quieter(titleFrame, 0.5), ground, titleInk);
				tree +=
					`<p:sp><p:nvSpPr>${cNvPr(id++, 'Content Placeholder')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>` +
					`<p:spPr>${xfrm(bb.x, bb.y, bb.w, bb.h)}${rectGeom}</p:spPr>` +
					`<p:txBody>${PH_BODY}${lvl1(bodyLook, 'mn')}<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="${deckLang}" dirty="0"/><a:t>Text</a:t></a:r></a:p></p:txBody></p:sp>`;
			}
			// The rest of the look its slides show, each in its own place and ink: the eyebrow and the meta line (a source,
			// a basis), and a header or footer whose text differs from slide to slide, as text placeholders.
			// A slot taken from another slide of the layout than its title can land on the title placeholder: left out then.
			// Compared where the text is (the frames' own boxes), not the placeholders' padded ones, which an eyebrow just
			// above its title always touches.
			const clear = (f: TextFrame | undefined) => {
				if (!f || !ownTitle) return f;
				const t = ownTitle;
				const ix = Math.min(f.x + f.w, t.x + t.w) - Math.max(f.x, t.x);
				const iy = Math.min(f.y + f.h, t.y + t.h) - Math.max(f.y, t.y);
				return ix > 0 && iy > 0 && ix * iy > Math.min(f.w * f.h, t.w * t.h) / 3 ? undefined : f;
			};
			const eyebrow = clear(firstFrame('eyebrow', li));
			if (eyebrow) tree += textPh(id++, 'Eyebrow', 13, eyebrow, 'Eyebrow', ground, titleInk);
			const meta = clear(firstFrame('meta', li));
			if (meta) tree += textPh(id++, 'Meta', 14, meta, 'Source', ground, titleInk);
			if (layout.vary.header) tree += textPh(id++, 'Header', 15, layout.vary.header, 'Header', ground, titleInk);
			if (layout.vary.footer) tree += textPh(id++, 'Footer', 16, layout.vary.footer, 'Footer', ground, titleInk);
			if (!layout.fromMaster) for (const role of ['header', 'footer'] as const) if (layout.chrome[role]) tree += chromeSp(id++, role, layout.chrome[role] as TextFrame);
			if (layout.chrome.number) {
				numberOf.set(li, { frame: layout.chrome.number });
				tree += numberSp(id++, layout.chrome.number, null);
			}
		}
		const type = !useLayouts ? ' type="blank"' : layout.look === 'divider' ? ' type="secHead"' : layout.kind === 'title' ? ' type="title"' : ' type="obj"';
		// A layout that does not show the master's chrome hides it (the master holds nothing else).
		const hide = useLayouts && !layout.fromMaster ? ' showMasterSp="0"' : '';
		const xml =
			`${DECL}<p:sldLayout ${NS} preserve="1"${type}${hide}><p:cSld name="${xmlAttr(useLayouts ? layout.name : 'Blank')}">${background(rels, layout.paint)}<p:spTree>${TREE_ROOT}${tree}</p:spTree></p:cSld>` +
			// What PowerPoint's Header & Footer dialog and a new slide on this layout read: a page number when the layout has one.
			// A layout whose ground is the other way from the deck's (a navy divider in a light deck) maps text to the
			// other pair, so a text box, table or chart added on it reads.
			`<p:clrMapOvr>${layout.ground && isDark(layout.ground) !== deckDark ? `<a:overrideClrMapping ${isDark(layout.ground) ? CLR_MAP_DARK : CLR_MAP}/>` : '<a:masterClrMapping/>'}</p:clrMapOvr>${useLayouts ? `<p:hf sldNum="${layout.chrome.number ? 1 : 0}" hdr="0" ftr="0" dt="0"/>` : ''}</p:sldLayout>`;
		part(`ppt/slideLayouts/slideLayout${li + 1}.xml`, xml, `${CT}.slideLayout+xml`);
		part(`ppt/slideLayouts/_rels/slideLayout${li + 1}.xml.rels`, rels.xml());
		layoutIds.push(masterRels.add(`${REL}/slideLayout`, `../slideLayouts/slideLayout${li + 1}.xml`));
	});

	// THE SLIDE MASTER: the title and body placeholders every layout inherits, the running chrome most slides show,
	// and text styles in the deck's own type (theme.ts), so a new slide, a new text box and the theme fonts are the deck's.
	masterRels.add(`${REL}/theme`, '../theme/theme1.xml');
	let masterTree = '';
	let mid = 2;
	if (useLayouts) {
		const tb = titleBox(theme.title?.frame);
		masterTree +=
			`<p:sp><p:nvSpPr>${cNvPr(mid++, 'Title Placeholder')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr>${xfrm(tb.x, tb.y, tb.w, tb.h)}${rectGeom}</p:spPr><p:txBody>${PH_BODY}<a:lstStyle/><a:p><a:r><a:rPr lang="${deckLang}"/><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>`;
		const by = tb.y + tb.h + 24;
		masterTree +=
			`<p:sp><p:nvSpPr>${cNvPr(mid++, 'Text Placeholder')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr>${xfrm(tb.x, by, tb.w, Math.max(H * 0.1, H * 0.88 - by))}${rectGeom}</p:spPr><p:txBody>${PH_BODY}<a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="${deckLang}"/><a:t>Text</a:t></a:r></a:p></p:txBody></p:sp>`;
		for (const role of ['header', 'footer'] as const) if (plan.master.chrome[role]) masterTree += chromeSp(mid++, role, plan.master.chrome[role] as TextFrame);
		if (masterNumber) masterTree += numberSp(mid++, masterNumber, null);
	}
	const titleStyle = `<a:lvl1pPr algn="${algnOf(theme.title?.frame)}" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">${lnSpcOf(theme.title?.frame) || ''}<a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/>${defRPr(theme.title?.style, 'mj', 44, 'tx2')}</a:lvl1pPr>`;
	// Body text in the deck's type at every level; no bullets (the deck's paragraphs carry none), indented by level.
	// The master's styles take the theme's text colors (tx1, tx2), so a layout's color map decides the ink of anything
	// typed on it: light on a dark look, dark on a light one.
	const bodyRPr = defRPr(theme.body?.style, 'mn', 18, 'tx1');
	const bodyLn = lnSpcOf(theme.body?.frame);
	const bodyStyle = levels((l) => ` marL="${(l - 1) * 457200}" indent="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"`, bodyRPr, `${bodyLn}<a:spcBef><a:spcPts val="600"/></a:spcBef><a:buNone/>`);
	// Other text (a new text box) in the body's face and ink.
	const otherStyle = levels(levelAttrs, bodyRPr);
	// The master's ground is white, as Office's `bg1` was before the deck had a theme: a slide with no background of its own
	// shows it, and `lt1` (the deck's main ground, by role) may be dark, which would repaint that slide.
	part(
		'ppt/slideMasters/slideMaster1.xml',
		`${DECL}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${deckDark ? hexOf(theme.colors.lt1) : 'FFFFFF'}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${TREE_ROOT}${masterTree}</p:spTree></p:cSld>` +
			`<p:clrMap ${deckDark ? CLR_MAP_DARK : CLR_MAP}/><p:sldLayoutIdLst>${layoutIds.map((rid, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="${rid}"/>`).join('')}</p:sldLayoutIdLst>` +
			`<p:hf sldNum="${masterNumber ? 1 : 0}" hdr="0" ftr="0" dt="0"/><p:txStyles><p:titleStyle>${titleStyle}</p:titleStyle><p:bodyStyle>${bodyStyle}</p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="${deckLang}"/></a:defPPr>${otherStyle}</p:otherStyle></p:txStyles></p:sldMaster>`,
		`${CT}.slideMaster+xml`,
	);
	part('ppt/slideMasters/_rels/slideMaster1.xml.rels', masterRels.xml());
	const roleColors = Object.fromEntries(Object.entries(theme.colors).map(([k, v]) => [k, hexOf(v)])) as Record<ColorSlot, string>;
	// Written the Office way: dk1/dk2 the dark pair, lt1/lt2 the light one (a dark deck's text is the light pair).
	const themeColors = deckDark ? { ...roleColors, dk1: roleColors.lt1, lt1: roleColors.dk1, dk2: roleColors.lt2, lt2: roleColors.dk2 } : roleColors;
	part('ppt/theme/theme1.xml', themeXml(deck.title ? `${xmlSafe(deck.title).slice(0, 60)}` : 'Deck Theme', { colors: themeColors, major: majorFace, minor: minorFace }), 'application/vnd.openxmlformats-officedocument.theme+xml');

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
		if (slide.image?.length) tree += picture(nextId++, `Slide ${n}`, xmlSafe(slide.description || '').trim() || `Slide ${n}`, picRel(rels, slide.image), 0, 0, W, H, { locked: lockPicture, full: true });
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
				.map((line) => (line ? `<a:p><a:r><a:rPr lang="${deckLang}" dirty="0"/><a:t>${xmlText(line)}</a:t></a:r></a:p>` : `<a:p><a:endParaRPr lang="${deckLang}" dirty="0"/></a:p>`))
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

	// THE NOTES MASTER, with a theme of its own. Its slide image has the slide's aspect, centered in the 16:9 box
	// PowerPoint gives it (5486400 × 3086100 EMU), so a portrait or square deck's notes page shows its slide undistorted.
	const NOTE_IMG = { x: 685800, y: 1143000, cx: 5486400, cy: 3086100 };
	const imgCy = Math.min(NOTE_IMG.cy, Math.round((NOTE_IMG.cx * size.cy) / size.cx));
	const imgCx = Math.round((imgCy * size.cx) / size.cy);
	const imgX = NOTE_IMG.x + Math.round((NOTE_IMG.cx - imgCx) / 2);
	part(
		'ppt/notesMasters/notesMaster1.xml',
		`${DECL}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${TREE_ROOT}` +
			`<p:sp><p:nvSpPr>${cNvPr(2, 'Slide Image Placeholder 1')}<p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr><a:xfrm><a:off x="${imgX}" y="${NOTE_IMG.y}"/><a:ext cx="${imgCx}" cy="${imgCy}"/></a:xfrm>${rectGeom}<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>` +
			`<p:sp><p:nvSpPr>${cNvPr(3, 'Notes Placeholder 2')}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>` +
			`<p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm>${rectGeom}</p:spPr>` +
			`<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:r><a:rPr lang="${deckLang}"/><a:t>Notes</a:t></a:r></a:p></p:txBody></p:sp>` +
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
			`<p:defaultTextStyle><a:defPPr><a:defRPr lang="${deckLang}"/></a:defPPr>${levels(levelAttrs)}</p:defaultTextStyle></p:presentation>`,
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
	// Only what the deck says: no stand-in title, author or company (the program is `Application`, not the author).
	const title = xmlSafe(deck.title || '').trim();
	const author = xmlSafe(deck.author || '').trim();
	const company = xmlSafe(deck.company || '').trim();
	part(
		'docProps/core.xml',
		`${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
			`${title ? `<dc:title>${xmlText(title)}</dc:title>` : ''}${deck.subject ? `<dc:subject>${xmlText(deck.subject)}</dc:subject>` : ''}${author ? `<dc:creator>${xmlText(author)}</dc:creator><cp:lastModifiedBy>${xmlText(author)}</cp:lastModifiedBy>` : ''}<cp:revision>1</cp:revision>` +
			`<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
		'application/vnd.openxmlformats-package.core-properties+xml',
	);
	part(
		'docProps/app.xml',
		`${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
			// "Widescreen" is PowerPoint's name for 13⅓ × 7.5 in; "On-screen Show (16:9)" is its 10 × 5.625 in slide. No word or
			// paragraph count: a zero is a false count, and PowerPoint fills both in when it saves.
			`<Application>Calco</Application><PresentationFormat>${page.wide ? 'Widescreen' : 'Custom'}</PresentationFormat>` +
			`<Slides>${deck.slides.length}</Slides><Notes>${notesCount}</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips><ScaleCrop>false</ScaleCrop>` +
			`${company ? `<Company>${xmlText(company)}</Company>` : ''}<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>`,
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
			xml: `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${nextId()}" name="${xmlAttr(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm>${frame}</a:xfrm></p:grpSpPr>${list.map((m) => m.xml).join('')}</p:grpSp>`,
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
	// A card is one object to move and select, so even a card of one member is a group.
	if (!members.length) return '';
	if (members.some((m) => m.custom)) return parts.map((m) => m.xml).join('');
	return wrap(`Group ${group + 1}`, parts).xml;
}

/** Options for `zip.generateAsync`: DEFLATE the XML (media were added STORED), typed as a PowerPoint. */
export const pptxZipOptions = Object.freeze({ compression: 'DEFLATE', mimeType: PPTX_MIMETYPE });

/** Build and serialize in one call. `outputType` is JSZip's (`uint8array`, `nodebuffer`, `blob`, `arraybuffer`, `base64`, …). */
export async function writePptx<T = Uint8Array>(JSZip: JSZipClass, deck: Deck, outputType = 'uint8array'): Promise<T> {
	return (await buildPptx(JSZip, deck).generateAsync({ ...pptxZipOptions, type: outputType })) as T;
}
