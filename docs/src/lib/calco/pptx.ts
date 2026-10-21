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
 * SHAPES (a slide's `shapes`) are PptxGenJS presets where the outline is one (`rect`,
 * `roundRect`, `line`) and custom geometry where it is not (per-corner radii, a rule that
 * wraps a corner); a label is one `addText` with the shape's fill and outline. PptxGenJS has
 * no group API, so a group's members are written adjacent under a tagged name and
 * `tidyPptx` wraps them in a `p:grpSp` (`groupShapes`).
 *
 * SCHEMA: PptxGenJS 3.12 writes three things the OOXML schema forbids, and `tidyPptx` mends
 * them whenever the caller passes JSZip: a `<a:pPr>` before EVERY run of a paragraph (the
 * schema allows one, first), `p:notesMasterIdLst` after `p:sldIdLst` (it belongs before),
 * and a `[Content_Types].xml` override for a slide master per slide, where one exists.
 * It also writes ONE theme for the slide master and the notes master, which PowerPoint
 * refuses to open once the notes master is in its schema position; `tidyPptx` gives each
 * master its own copy (`giveMastersOwnThemes`).
 */

import { type FontMetrics, faceFamilyName, faceFor, faceKey, facesUsed, uniqueFaceNames } from './fonts.js';
import { applyTransform, bareHex, dominantStyle, metricsFor, placeFrame, spacingMultiple } from './layout.js';
import { isPosition, planMasters, withoutHoisted } from './masters.js';
import { imageMime } from './picture.js';
import { canEmbedAsEot, renameFace, toEot } from './sfnt.js';
import { drawOrder, labelInsets, type ShapeGeometry, shapeGeometry } from './shapes.js';
import type { Deck, EmbeddedFont, FrameRole, JSZipClass, Shape, TextFrame, TextRun } from './types.js';

/** The family name PowerPoint sees for an embedded face (`faceFamilyName`, with the PPTX-safe family). */
export function pptxFaceName(face: { family: string; weight: number; italic: boolean }): string {
	return faceFamilyName({ ...face, family: safeFamily(face.family) });
}

const PX_PER_IN = 96;
/** The name prefix that marks a group's members until tidyPptx groups them (never page text). */
const GROUP_TAG = 'calco-group-';
/** The name prefix that marks a title or a page number until tidyPptx makes it one (never page text). */
const ROLE_TAG = 'calco-role-';
/** The name prefix that marks a slide's content picture until tidyPptx locks it. */
const LOCK_TAG = 'calco-lock|';
/** What a role is called in the file, so a reader finds it in the selection pane. */
const ROLE_NAMES: Record<FrameRole, string> = { title: 'Title', eyebrow: 'Eyebrow', subtitle: 'Subtitle', header: 'Header', footer: 'Footer', number: 'Slide number' };
/** The layout's title placeholder: PptxGenJS numbers a layout's first placeholder 100. */
const TITLE_IDX = 100;
const PT_PER_PX = 0.75;

/** The minimal PptxGenJS surface Calco uses. */
export interface PptxGenJSLike {
	title: string;
	subject: string;
	author: string;
	company: string;
	layout: string;
	defineLayout(layout: { name: string; width: number; height: number }): void;
	defineSlideMaster(master: Record<string, unknown>): void;
	addSlide(options?: { masterName: string }): {
		addImage(options: Record<string, unknown>): unknown;
		addText(text: Array<{ text: string; options?: Record<string, unknown> }>, options: Record<string, unknown>): unknown;
		addShape(shape: string, options: Record<string, unknown>): unknown;
		addNotes(notes: string): unknown;
	};
	write(options: { outputType: string }): Promise<unknown>;
}
export type PptxGenJSClass = new () => PptxGenJSLike;

/**
 * Text PptxGenJS writes into XML as-is: characters XML 1.0 forbids would make the part
 * unreadable, so they go. (It escapes `<>&` in run text itself.)
 */
export function xmlSafe(text: string | null | undefined): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
	return (text == null ? '' : String(text)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
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
 * `groups`: tag each card's members so `tidyPptx` can group them (the caller then runs it).
 */
export function buildPptx(PptxGenJS: PptxGenJSClass, deck: Deck, options?: { embedded?: EmbeddingPlan; groups?: boolean }): PptxGenJSLike {
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
	// PptxGenJS escapes markup in the document properties, but not control characters.
	pptx.title = xmlSafe(deck.title || '').trim() || 'deck';
	if (deck.subject) pptx.subject = xmlSafe(deck.subject);
	pptx.author = xmlSafe(deck.author || 'Calco');
	pptx.company = xmlSafe(deck.company || 'Calco');
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

	// A frame's runs and the options that place them where the browser drew them.
	const textOf = (frame: TextFrame) => {
		const lines = frame.lines;
		const lead = dominantStyle(lines.find((l) => l.length) || lines[0]);
		const metrics = metricsFor(lead, fonts, metricsCache);
		const box = placeFrame(frame, W, metrics, lead.size, 'proportional');
		// An empty line (a blank line in code) is an empty paragraph in the lead style.
		const runs = lines.flatMap((line, li) => {
			const last = li < lines.length - 1;
			if (!line.length) return [runOptions({ text: '', style: lead }, last)];
			return line.map((run, ri) => runOptions(run, ri === line.length - 1 && last));
		});
		const options: Record<string, unknown> = {
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
		};
		return { runs, box, options };
	};
	const alphaOf = (a: number) => Math.round((1 - a) * 100);
	// A shape's outline and paint, as PptxGenJS options: a preset where the outline is one
	// (a resized rounded rectangle keeps its corners), else custom geometry.
	const shapeOf = (shape: Shape, geom: ShapeGeometry): { kind: string; options: Record<string, unknown> } => {
		const options: Record<string, unknown> = { x: inch(geom.x), y: inch(geom.y), w: inch(geom.w), h: inch(geom.h) };
		const stroke = shape.stroke;
		options.line = stroke ? { color: bareHex(stroke.color), width: points(stroke.width), transparency: alphaOf(stroke.alpha) } : { type: 'none' };
		if (shape.fill && geom.closed) options.fill = { color: bareHex(shape.fill.color), transparency: alphaOf(shape.fill.alpha) };
		if (shape.shadow) {
			const { x, y, blur } = shape.shadow;
			const angle = (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
			// PptxGenJS reads 0 as "unset" for each of these, so a zero is written as a hair.
			options.shadow = { type: 'outer', color: bareHex(shape.shadow.color), opacity: shape.shadow.alpha, blur: points(blur) || 0.01, offset: points(Math.hypot(x, y)) || 0.01, angle: angle || 0.01 };
		}
		if (geom.preset === 'line') return { kind: 'line', options };
		if (geom.preset === 'rect') {
			if (geom.radius) options.rectRadius = inch(geom.radius);
			return { kind: geom.radius ? 'roundRect' : 'rect', options };
		}
		options.points = geom.path.map((c) => {
			if (c[0] === 'Z') return { close: true };
			if (c[0] === 'C') return { x: inch(c[5]), y: inch(c[6]), curve: { type: 'cubic', x1: inch(c[1]), y1: inch(c[2]), x2: inch(c[3]), y2: inch(c[4]) } };
			return c[0] === 'M' ? { x: inch(c[1]), y: inch(c[2]), moveTo: true } : { x: inch(c[1]), y: inch(c[2]) };
		});
		return { kind: 'custGeom', options };
	};
	// Where a label's text sits inside its shape (null: it cannot, see labelInsets).
	const insetsOf = (shape: Shape, frame: TextFrame) => labelInsets(shapeGeometry(shape), textOf(frame).box, frame.align);

	// LAYOUTS. Slides that share a background and running chrome share a layout (masters.ts):
	// the layout holds the background, the title placeholder and the header, footer and page
	// number that repeat, and the slide holds what is its own. A deck with no roles and no
	// shared background keeps the single default layout, as before.
	const useLayouts = !!deck.backgrounds?.length || deck.slides.some((sl) => sl.frames.some((f) => f.role));
	const masters = useLayouts ? planMasters(deck) : null;
	const layoutName = (li: number) => `Layout ${li + 1}`;
	if (masters) {
		masters.layouts.forEach((layout, li) => {
			const paint = layout.paint;
			const background = paint?.color ? { color: bareHex(paint.color) } : paint?.image ? { data: `${imageMime(paint.image)};base64,${toBase64(paint.image)}` } : undefined;
			// The title placeholder sits where the first slide on this layout put its title.
			const first = deck.slides.findIndex((sl, i) => masters.layoutOf[i] === li && sl.frames.some((f) => f.role === 'title' && f.group === undefined));
			const titleFrame = first < 0 ? null : (deck.slides[first].frames.find((f) => f.role === 'title') as TextFrame);
			const tb = titleFrame ? textOf(titleFrame).box : { x: W * 0.05, y: H * 0.08, w: W * 0.9, h: H * 0.14 };
			const objects: Array<Record<string, unknown>> = [{ placeholder: { options: { name: 'title', type: 'title', x: inch(tb.x), y: inch(tb.y), w: inch(tb.w), h: inch(tb.h), margin: 0 }, text: 'Title' } }];
			for (const role of ['header', 'footer'] as const) {
				const frame = layout.chrome[role];
				if (!frame) continue;
				const { runs, box, options } = textOf(frame);
				objects.push({ text: { text: runs[0].text, options: { ...runs[0].options, ...options, x: inch(box.x), y: inch(box.y), w: inch(box.w), h: inch(box.h), margin: 0, objectName: ROLE_NAMES[role] } } });
			}
			const master: Record<string, unknown> = { title: layoutName(li), objects };
			if (background) master.background = background;
			const num = layout.chrome.number;
			if (num) {
				const { runs, box, options } = textOf(num);
				master.slideNumber = { ...runs[0].options, align: options.align, x: inch(box.x), y: inch(box.y), w: inch(box.w), h: inch(box.h), margin: 0 };
			}
			pptx.defineSlideMaster(master);
		});
	}

	deck.slides.forEach((original, i) => {
		if (!original.image?.length) throw new Error(`calco: slide ${i + 1} has no image`);
		const slide = masters ? withoutHoisted(original, masters.hoisted[i]) : original;
		const s = pptx.addSlide(masters ? { masterName: layoutName(masters.layoutOf[i]) } : undefined);
		// ALWAYS set altText: PptxGenJS otherwise writes the image's file name, which a
		// screen reader reads aloud.
		s.addImage({ data: `${imageMime(slide.image)};base64,${toBase64(slide.image)}`, x: 0, y: 0, w: slideW, h: slideH, altText: xmlSafe((slide.description || '').trim()) || `Slide ${i + 1}`, ...(options?.groups && masters ? { objectName: `${LOCK_TAG}Slide ${i + 1}` } : {}) });
		const n = i + 1;
		for (const { group, items } of drawOrder(slide, (shape, frame) => !!insetsOf(shape, frame))) {
			// A group's members carry its number in their names; tidyPptx wraps them in a p:grpSp.
			// Only when the package will be tidied (`groups`); otherwise the members stay loose.
			const tag = group === undefined || !options?.groups ? '' : `${GROUP_TAG}${group + 1}|`;
			for (const item of items) {
				if ('frame' in item) {
					const { runs, box, options: textOptions } = textOf(item.frame);
					const role = item.frame.role;
					// A title becomes a placeholder and a page number a field, when tidyPptx runs.
					const roleTag = options?.groups && group === undefined && (role === 'title' || (role === 'number' && isPosition(item.frame, n))) ? `${ROLE_TAG}${role}|` : '';
					const name = role ? `${ROLE_NAMES[role]} ${n}` : `Text ${n}.${item.index + 1}`;
					s.addText(runs, { ...textOptions, x: inch(box.x), y: inch(box.y), w: inch(box.w), h: inch(box.h), margin: 0, objectName: `${tag}${roleTag}${name}` });
					continue;
				}
				const geom = shapeGeometry(item.shape);
				const { kind, options: shapeOptions } = shapeOf(item.shape, geom);
				const name = `${tag}${item.label ? 'Label' : item.shape.kind === 'line' ? 'Rule' : 'Shape'} ${n}.${item.index + 1}`;
				if (!item.label) {
					s.addShape(kind, { ...shapeOptions, objectName: name });
					continue;
				}
				const text = textOf(item.label);
				const ins = labelInsets(geom, text.box, item.label.align) as NonNullable<ReturnType<typeof labelInsets>>;
				// Insets in points: PptxGenJS's margin is [left, right, bottom, top].
				s.addText(text.runs, { ...text.options, ...shapeOptions, shape: kind, margin: [points(ins.l), points(ins.r), 0, points(ins.t)], objectName: name });
			}
		}
		if (original.notes) s.addNotes(xmlSafe(original.notes));
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
 * Wrap each run of shapes named with the same group tag (`GROUP_TAG` + number + `|`) in a
 * `p:grpSp`, and take the tag out of their names. PptxGenJS 3.12 has no group API; it writes
 * a slide's objects in the order they were added, so a group's members are adjacent
 * `<p:sp>` elements. The group's frame is its members' bounding box, and its child frame is
 * the same box, so every member keeps the slide coordinates PptxGenJS gave it.
 */
export function groupShapes(xml: string): string {
	if (!xml.includes(GROUP_TAG)) return xml;
	let nextId = Math.max(1, ...Array.from(xml.matchAll(/<p:cNvPr id="(\d+)"/g), (m) => Number(m[1]))) + 1;
	const tagged = new RegExp(`(<p:cNvPr id="\\d+" name=")${GROUP_TAG}(\\d+)\\|`);
	const wrap = (group: string, members: string[]) => {
		const boxes = members.map((sp) => {
			const off = sp.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
			const ext = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
			if (!off || !ext) throw new Error('calco: a grouped shape has no position');
			return [Number(off[1]), Number(off[2]), Number(off[1]) + Number(ext[1]), Number(off[2]) + Number(ext[2])];
		});
		const x = Math.min(...boxes.map((b) => b[0]));
		const y = Math.min(...boxes.map((b) => b[1]));
		const cx = Math.max(...boxes.map((b) => b[2])) - x;
		const cy = Math.max(...boxes.map((b) => b[3])) - y;
		const frame = `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${cx}" cy="${cy}"/>`;
		return (
			`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${nextId++}" name="Group ${group}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
			`<p:grpSpPr><a:xfrm>${frame}</a:xfrm></p:grpSpPr>${members.join('')}</p:grpSp>`
		);
	};
	// One linear scan with indexOf, not a regex over runs of `<p:sp>`: a backtracking pattern
	// there is polynomial in the number of adjacent shapes (CodeQL).
	const OPEN = '<p:sp>';
	const CLOSE = '</p:sp>';
	let out = '';
	let at = 0;
	let current: string | null = null;
	let members: string[] = [];
	const flush = () => {
		if (current !== null) out += wrap(current, members);
		current = null;
		members = [];
	};
	for (;;) {
		const start = xml.indexOf(OPEN, at);
		const end = start < 0 ? -1 : xml.indexOf(CLOSE, start);
		if (end < 0) break;
		// A group's members are ADJACENT shapes: anything between two closes the group.
		if (start !== at) {
			flush();
			out += xml.slice(at, start);
		}
		const sp = xml.slice(start, end + CLOSE.length);
		const m = sp.match(tagged);
		const group = m ? m[2] : null;
		if (group !== current) flush();
		if (m) {
			current = group;
			members.push(sp.replace(tagged, '$1'));
		} else out += sp;
		at = end + CLOSE.length;
	}
	flush();
	return out + xml.slice(at);
}

const THEME_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme';

/** Where a relationship `target` points, from the folder of the part that owns the `.rels`. */
function resolveTarget(partDir: string, target: string): string {
	if (target.startsWith('/')) return target.slice(1);
	const out = partDir.split('/');
	for (const seg of target.split('/')) {
		if (seg === '..') out.pop();
		else if (seg !== '.') out.push(seg);
	}
	return out.join('/');
}

/**
 * Give every master its own theme part. PptxGenJS 3.12 writes ONE `theme1.xml` and points both
 * the slide master and the notes master at it, and PowerPoint refuses such a package ("Sorry,
 * PowerPoint can't read") once `p:notesMasterIdLst` is in its schema position, which the
 * mend above puts it in. Each master after the first that names a theme another master
 * already owns gets a copy of it under a new name, with its relationship and content type.
 */
async function giveMastersOwnThemes(zip: ZipLike): Promise<void> {
	const text = async (name: string) => (zip.file(name) as { async(type: string): Promise<string> }).async('string');
	const order = { slideMasters: 0, notesMasters: 1, handoutMasters: 2 } as const;
	const masters = Object.keys(zip.files)
		.map((name) => ({ name, m: name.match(/^ppt\/(slideMasters|notesMasters|handoutMasters)\/(?:slide|notes|handout)Master(\d+)\.xml$/) }))
		.filter((x): x is { name: string; m: RegExpMatchArray } => !!x.m)
		.sort((a, b) => order[a.m[1] as keyof typeof order] - order[b.m[1] as keyof typeof order] || Number(a.m[2]) - Number(b.m[2]));
	let next = 1 + Math.max(0, ...Object.keys(zip.files).map((n) => Number(n.match(/^ppt\/theme\/theme(\d+)\.xml$/)?.[1] ?? 0)));
	const owned = new Set<string>();
	const added: string[] = [];
	for (const { name } of masters) {
		const dir = name.slice(0, name.lastIndexOf('/'));
		const relsName = `${dir}/_rels/${name.slice(name.lastIndexOf('/') + 1)}.rels`;
		if (!zip.file(relsName)) continue;
		let rels = await text(relsName);
		for (const el of rels.match(/<Relationship\b[^>]*\/>/g) || []) {
			if (!el.includes(`Type="${THEME_REL_TYPE}"`)) continue;
			const target = el.match(/\bTarget="([^"]+)"/)?.[1];
			const part = target && resolveTarget(dir, target);
			if (!part || !zip.file(part)) continue;
			if (!owned.has(part)) {
				owned.add(part);
				continue;
			}
			const copy = `ppt/theme/theme${next++}.xml`;
			zip.file(copy, await text(part));
			rels = rels.replace(el, el.replace(/\bTarget="[^"]+"/, `Target="${posixRelative(dir, copy)}"`));
			owned.add(copy);
			added.push(copy);
		}
		zip.file(relsName, rels);
	}
	if (added.length && zip.file('[Content_Types].xml')) {
		let types = await text('[Content_Types].xml');
		for (const part of added) {
			if (types.includes(`PartName="/${part}"`)) continue;
			const like = types.match(/<Override PartName="\/ppt\/theme\/theme\d+\.xml"[^>]*\/>/);
			if (!like) continue;
			types = types.replace('</Types>', `${like[0].replace(/PartName="[^"]+"/, `PartName="/${part}"`)}</Types>`);
		}
		zip.file('[Content_Types].xml', types);
	}
}

/** The relative path from folder `fromDir` to `to`, both inside the package. */
function posixRelative(fromDir: string, to: string): string {
	const a = fromDir.split('/');
	const b = to.split('/');
	while (a.length && b.length > 1 && a[0] === b[0]) {
		a.shift();
		b.shift();
	}
	return [...a.map(() => '..'), ...b].join('/');
}

/**
 * Make each tagged text box what its tag says: a title becomes the slide's title placeholder
 * (its position and runs stay its own, so it draws where the browser drew it, and the layout's
 * placeholder supplies the slide's title to Outline view and screen readers); a page number
 * becomes a slide-number field, so it follows the slide when slides are moved. The tag comes
 * out of the shape's name either way. PptxGenJS cannot place a placeholder or write a field
 * inside a slide's own text box, as it cannot group. It also drops the empty placeholders
 * PptxGenJS copies from the layout onto every slide.
 */
export function applyRoles(xml: string): string {
	if (!xml.includes(ROLE_TAG) && !xml.includes(LOCK_TAG) && !xml.includes('hasCustomPrompt')) return xml;
	// The slide's content picture stays where it is unless a reader unlocks it: it is the one
	// object nobody means to drag, and the first one a stray touch grabs.
	xml = xml.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, (pic) =>
		pic.includes(`name="${LOCK_TAG}`) ? pic.replace(`name="${LOCK_TAG}`, 'name="').replace(/<a:picLocks[^>]*\/>/, '<a:picLocks noChangeAspect="1" noMove="1" noResize="1"/>') : pic,
	);
	return xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => {
		// PptxGenJS copies each of the layout's placeholders onto every slide, empty, with a
		// prompt. A slide that used one has written its own; the rest would show "Click to add".
		if (sp.includes('hasCustomPrompt="1"') && sp.includes('<a:endParaRPr') && !sp.includes('<a:t>')) return '';
		const m = sp.match(/<p:cNvPr id="\d+" name="calco-role-(title|number)\|/);
		if (!m) return sp;
		const out = sp.replace(`name="${ROLE_TAG}${m[1]}|`, 'name="');
		if (m[1] === 'title') {
			return out.replace(/<p:cNvSpPr[^>]*\/>/, '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>').replace(/<p:nvPr\s*\/>|<p:nvPr>\s*<\/p:nvPr>/, `<p:nvPr><p:ph type="title" idx="${TITLE_IDX}"/></p:nvPr>`);
		}
		return out.replace(/<a:r>(<a:rPr[^>]*\/>|<a:rPr[^>]*>[\s\S]*?<\/a:rPr>)<a:t>([^<]*)<\/a:t><\/a:r>/, '<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">$1<a:t>$2</a:t></a:fld>');
	});
}

/**
 * Mend what PptxGenJS 3.12 writes against the OOXML schema (see the header): one `<a:pPr>`
 * per paragraph in every slide and notes slide, `p:notesMasterIdLst` straight after
 * `p:sldMasterIdLst`, and no content-type override for a part the package does not hold.
 * The repeated `<a:pPr>` are identical (paragraph options are the box's), so nothing renders
 * differently; a strict reader no longer has an invalid part to repair. It also wraps each
 * card's tagged members in a `p:grpSp` (`groupShapes`), which PptxGenJS cannot write.
 */
async function tidyPptx(zip: ZipLike): Promise<void> {
	const text = async (name: string) => (zip.file(name) as { async(type: string): Promise<string> }).async('string');
	for (const name of Object.keys(zip.files).filter((n) => /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(n))) {
		const xml = await text(name);
		const tidy = groupShapes(applyRoles(onePPrPerParagraph(xml)));
		if (tidy !== xml) zip.file(name, tidy);
	}
	if (zip.file('ppt/presentation.xml')) {
		const pres = await text('ppt/presentation.xml');
		const notes = pres.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/);
		const masters = pres.indexOf('</p:sldMasterIdLst>');
		if (notes && notes.index !== undefined && masters >= 0 && notes.index > masters) {
			const without = pres.slice(0, notes.index) + pres.slice(notes.index + notes[0].length);
			const at = without.indexOf('</p:sldMasterIdLst>') + '</p:sldMasterIdLst>'.length;
			const tidy = without.slice(0, at) + notes[0] + without.slice(at);
			if (tidy !== pres) zip.file('ppt/presentation.xml', tidy);
		}
	}
	if (zip.file('[Content_Types].xml')) {
		const types = await text('[Content_Types].xml');
		const tidy = types.replace(/<Override PartName="\/([^"]+)"[^>]*\/>/g, (m, part: string) => (zip.file(part) ? m : ''));
		if (tidy !== types) zip.file('[Content_Types].xml', tidy);
	}
	await giveMastersOwnThemes(zip);
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
	// PptxGenJS's `STREAM` is a Node buffer; JSZip has no stream output on every platform.
	if (outputType === 'STREAM') outputType = 'nodebuffer';
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
 * Mend PptxGenJS 3.12's schema errors in a `.pptx` it wrote, and nothing else: the same
 * `tidyPptx` the editable export runs, for a package Calco did not build (Lattice's
 * picture-only `.pptx` writes through PptxGenJS directly). `outputType` is JSZip's.
 *
 * The pictures in `ppt/media/` are copied as they were stored, and only the XML is
 * deflated: a slide picture is a PNG or JPEG, compressed already, and deflating 58 of them
 * again took 1.4 s to save a tenth of the file. Copied, the tidy takes about 0.1 s.
 */
export async function tidyPptxPackage<T = Uint8Array>(JSZip: JSZipClass, bytes: Uint8Array, outputType = 'uint8array'): Promise<T> {
	const zip = (await (JSZip as unknown as { loadAsync(b: Uint8Array): Promise<ZipLike> }).loadAsync(bytes)) as ZipLike;
	if (outputType === 'STREAM') outputType = 'nodebuffer';
	await tidyPptx(zip);
	for (const [name, entry] of Object.entries(zip.files)) {
		if (name.startsWith('ppt/media/')) (entry as { options: { compression?: string } }).options.compression = 'STORE';
	}
	return (await zip.generateAsync({ type: outputType, mimeType: PPTX_MIMETYPE, compression: 'DEFLATE' })) as T;
}

/**
 * Build and serialize in one call. `outputType` is PptxGenJS's (`uint8array`, `blob`, …).
 * Pass `JSZip` to embed the deck's fonts, mend PptxGenJS's schema errors and group each card
 * with its contents (`tidyPptx`); without it the runs name their families only, the shapes
 * are loose, and the package is as PptxGenJS wrote it.
 */
export async function writePptx<T = Uint8Array>(PptxGenJS: PptxGenJSClass, deck: Deck, outputType = 'uint8array', JSZip?: JSZipClass): Promise<T> {
	if (!JSZip) return (await buildPptx(PptxGenJS, deck).write({ outputType })) as T;
	const plan = planEmbedding(deck);
	const raw = (await buildPptx(PptxGenJS, deck, { ...(plan.faces.length ? { embedded: plan } : {}), groups: true }).write({ outputType: 'uint8array' })) as Uint8Array;
	return embedPptxFonts<T>(JSZip, raw, plan.faces, outputType);
}
