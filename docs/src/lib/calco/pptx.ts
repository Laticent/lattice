/**
 * The PPTX writer: a Deck → a PowerPoint file with real text boxes over each slide's
 * picture. PptxGenJS is passed in and owns the OOXML package (masters, layouts, the notes
 * master), which is boilerplate no reader of this file needs to see.
 *
 * FONTS are embedded when the caller passes JSZip and the deck carries fonts: each face as
 * Embedded OpenType in `ppt/fonts/*.fntdata`, listed in `p:embeddedFontLst` (sfnt.ts).
 * PowerPoint's font model is a family with four slots. A regular or bold face (400 or 700,
 * upright or italic) goes in its slot of the family's own name ("Playfair Display"), and its
 * runs name that family with the bold or italic flag, so a reader that has the family or can
 * fetch it (LibreOffice, Google Slides) finds it by name and ignores the embedded copy. Any
 * other weight has no slot, so it is a family of its own ("Outfit SemiBold") in its regular
 * slot, named with no flag. A run whose face is not embedded names its family and is bold at
 * 600 or heavier, as OOXML has no numeric weight.
 *
 * LINE SPACING is proportional (`spcPct`), the browser's pitch over 1.2 times the font size (layout.ts `OOXML_LINE`),
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

import { mergeCardText } from './cardtext.js';
import { type FontMetrics, faceFamilyName, faceFor, faceKey, facesUsed, uniqueFaceNames } from './fonts.js';
import { applyTransform, bareHex, dominantStyle, flowLines, metricsFor, paragraphGap, placeFrame, spacingMultiple } from './layout.js';
import { isPosition, planMasters, withoutHoisted } from './masters.js';
import { imageMime } from './picture.js';
import { canEmbedAsEot, type FaceSlot, renameFace, toEot } from './sfnt.js';
import { drawOrder, labelInsets, type ShapeGeometry, shapeGeometry } from './shapes.js';
import type { Deck, EmbeddedFont, FrameRole, Gradient, JSZipClass, Shape, TextFrame, TextRun } from './types.js';

/** Loops, not a spread: `Math.min(...xs)` overflows the call stack past about 120,000 values. */
const lowest = (xs: number[]) => xs.reduce((m, v) => (v < m ? v : m), Number.POSITIVE_INFINITY);
const highest = (xs: number[]) => xs.reduce((m, v) => (v > m ? v : m), Number.NEGATIVE_INFINITY);

/** The family name PowerPoint sees for an embedded face (`faceFamilyName`, with the PPTX-safe family). */
export function pptxFaceName(face: { family: string; weight: number; italic: boolean }): string {
	return faceFamilyName({ ...face, family: safeFamily(face.family) });
}

const PX_PER_IN = 96;
/** The name prefix that marks a group's members until tidyPptx groups them (never page text). */
const GROUP_TAG = 'calco-group-';
/** The name marker for a sub-group (a pill inside a card) until tidyPptx nests it. */
const SUB_TAG = 'calco-sub-';
/** The name prefix that marks a title or a page number until tidyPptx makes it one (never page text). */
const ROLE_TAG = 'calco-role-';
/** The name marker for a path whose stroke ends and corners are round, until tidyPptx writes them. */
const ROUND_TAG = 'calco-round|';
/** The name marker for a gradient fill, `calco-grad-<css angle>~<pos>:<rrggbb>:<alpha>~…|`, until tidyPptx writes it. */
const GRAD_TAG = 'calco-grad-';
const gradTag = (g: Gradient | undefined) => (g ? `${GRAD_TAG}${g.angle}~${g.stops.map((st) => `${st.pos}:${st.color.replace('#', '')}:${st.alpha}`).join('~')}|` : '');
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
		// An embedded face is named by its family (400 and 700 in the bold and italic slots) or, with no slot, as a
		// family of its own; a system font is asked for by family, with OOXML's bold and italic flags.
		// Only the run's EXACT face, and only when the file carries it: a nearest-weight
		// stand-in or a face that could not be embedded would name a family nobody has.
		const hit = options?.embedded?.byKey.get(faceKey(s.family, s.weight, s.italic));
		const opts: Record<string, unknown> = {
			fontFace: hit ? hit.name : safeFamily(s.family),
			fontSize: Math.max(1, points(s.size)), // OOXML: 1pt is the smallest size (a 2px spacer on a wide deck)
			color: bareHex(s.alpha < 1 && s.flatColor ? s.flatColor : s.color),
			bold: hit ? hit.bold : s.weight >= 600,
			italic: hit ? hit.italic : s.italic,
		};
		if (s.alpha < 1 && !s.flatColor) opts.transparency = Math.round((1 - s.alpha) * 100);
		if (s.letterSpacing) opts.charSpacing = points(s.letterSpacing);
		// PptxGenJS has no small-caps option, but writes `lang` into <a:rPr> unescaped, so the
		// attribute rides in it: `lang="en-US" cap="small"`. A constant, never page text.
		// (pptx.test.js pins the output, so a PptxGenJS that starts escaping it fails loudly.)
		if (s.smallCaps) opts.lang = 'en-US" cap="small';
		if (s.underline) opts.underline = { style: 'sng' };
		if (s.strike) opts.strike = 'sngStrike';
		if (s.highlight) opts.highlight = bareHex(s.highlight);
		if (breakLine) opts.breakLine = true;
		return { text: xmlSafe(applyTransform(run.text, s.transform)), options: opts };
	};

	// A frame's runs and the options that place them where the browser drew them. A card's text
	// (`frame.next`) is one body: each following paragraph carries its own line spacing and the
	// space the browser left before it.
	const textOf = (frame: TextFrame) => {
		const parts = [frame, ...(frame.next || [])].map((f) => {
			const lines = flowLines(f);
			const lead = dominantStyle(lines.find((l) => l.length) || lines[0]);
			return { f, lines, lead, metrics: metricsFor(lead, fonts, metricsCache) };
		});
		const first = parts[0];
		const box = placeFrame(frame, W, first.metrics, first.lead.size, 'proportional');
		const flat = parts.flatMap((p, k) => p.lines.map((line, li) => ({ p, k, li, line })));
		// An empty line (a blank line in code) is an empty paragraph in the lead style.
		const runs = flat.flatMap(({ p, k, li, line }, n) => {
			const breakLine = n < flat.length - 1;
			const own: Record<string, unknown> = {};
			if (k) {
				own.lineSpacingMultiple = spacingMultiple(p.f, p.metrics, p.lead.size);
				if (!li) {
					const prev = parts[k - 1];
					own.paraSpaceBefore = points(paragraphGap(prev.f, prev.metrics, prev.lead.size, p.f, p.metrics, p.lead.size, 'proportional'));
				}
			}
			const mark = (r: { text: string; options: Record<string, unknown> }, ri: number) => (ri === 0 && k ? { ...r, options: { ...r.options, ...own } } : r);
			if (!line.length) return [mark(runOptions({ text: '', style: p.lead }, breakLine), 0)];
			return line.map((run, ri) => mark(runOptions(run, breakLine && ri === line.length - 1), ri));
		});
		const options: Record<string, unknown> = {
			valign: 'top',
			align: frame.align,
			// Proportional, not exact: Google Slides reads an exact `spcPts` as a multiple of
			// the font size and applies it to the face's own, taller line, so every line ran
			// ~26% apart and paragraphs spilled out of their cards. A multiple of the face's
			// natural line height reads the same in Google Slides and LibreOffice.
			lineSpacingMultiple: spacingMultiple(frame, first.metrics, first.lead.size),
			paraSpaceBefore: 0,
			paraSpaceAfter: 0,
			fit: 'none',
			// Lines are already broken where the browser broke them, so a frame wraps only when
			// the browser did (`flow`): without wrapping, a substitute font that runs wider
			// overhangs the box instead of adding a line that lands on the next paragraph.
			wrap: !!frame.flow,
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
	const insetsOf = (shape: Shape, frame: TextFrame) => labelInsets(shapeGeometry(shape), textOf(frame).box, frame.align, !!frame.flow);

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
		if (original.image && !original.image.length) throw new Error(`calco: slide ${i + 1} has no image`);
		const slide = mergeCardText(masters ? withoutHoisted(original, masters.hoisted[i]) : original);
		const s = pptx.addSlide(masters ? { masterName: layoutName(masters.layoutOf[i]) } : undefined);
		// ALWAYS set altText: PptxGenJS otherwise writes the image's file name, which a
		// screen reader reads aloud.
		if (slide.image?.length) s.addImage({ data: `${imageMime(slide.image)};base64,${toBase64(slide.image)}`, x: 0, y: 0, w: slideW, h: slideH, altText: xmlSafe((slide.description || '').trim()) || `Slide ${i + 1}`, ...(options?.groups && masters ? { objectName: `${LOCK_TAG}Slide ${i + 1}` } : {}) });
		const n = i + 1;
		for (const { group, items } of drawOrder(slide, (shape, frame) => !!insetsOf(shape, frame))) {
			// A group's members carry its number in their names; tidyPptx wraps them in a p:grpSp.
			// Only when the package will be tidied (`groups`); otherwise the members stay loose.
			const tag = group === undefined || !options?.groups ? '' : `${GROUP_TAG}${group + 1}|`;
			// A pill inside a card is a group inside the card's group.
			const subTag = (sub: number | undefined) => (tag && sub !== undefined ? `${SUB_TAG}${sub + 1}|` : '');
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
				if (item.shape.kind === 'picture') {
					const pic = item.shape;
					if (pic.image?.length) {
						s.addImage({ data: `${imageMime(pic.image)};base64,${toBase64(pic.image)}`, x: inch(pic.x), y: inch(pic.y), w: inch(pic.w), h: inch(pic.h), altText: xmlSafe(pic.alt || '') || `Picture ${n}.${item.index + 1}`, objectName: `${tag}${subTag(pic.sub)}Picture ${n}.${item.index + 1}` });
					}
					continue;
				}
				const geom = shapeGeometry(item.shape);
				const { kind, options: shapeOptions } = shapeOf(item.shape, geom);
				const name = `${tag}${subTag(item.shape.sub)}${item.shape.kind === 'path' && item.shape.cap === 'round' ? ROUND_TAG : ''}${gradTag(item.shape.gradient)}${item.label ? 'Label' : item.shape.kind === 'line' ? 'Rule' : item.shape.kind === 'path' ? 'Mark' : 'Shape'} ${n}.${item.index + 1}`;
				if (!item.label) {
					s.addShape(kind, { ...shapeOptions, objectName: name });
					continue;
				}
				const text = textOf(item.label);
				const ins = labelInsets(geom, text.box, item.label.align, !!item.label.flow) as NonNullable<ReturnType<typeof labelInsets>>;
				// A `roundRect`'s text rectangle is the preset's own, inset on every side by the corner's
				// 45-degree point (ECMA-376 presetShapeDefinitions: `il = r * (1 - cos 45)`), so the
				// shape's insets are taken from the padding less that. ODP corners do not inset text.
				const lift = kind === 'roundRect' ? (geom.radius || 0) * (1 - Math.SQRT1_2) : 0;
				const inner = (v: number) => Math.max(0, v - lift);
				// Insets in points: PptxGenJS's margin is [left, right, bottom, top].
				s.addText(text.runs, { ...text.options, ...shapeOptions, shape: kind, margin: [points(inner(ins.l)), points(inner(ins.r)), 0, points(inner(ins.t))], objectName: name });
			}
		}
		if (original.notes) s.addNotes(xmlSafe(original.notes));
	});
	return pptx;
}

export const PPTX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** What a .pptx embeds: each face once, under a family name no other face uses, and the run styles it serves. */
export interface EmbeddingPlan {
	faces: Array<{ face: EmbeddedFont; name: string; slot: FaceSlot }>;
	/** `faceKey(family, weight, italic)` of a run style → the family it names and the bold and italic flags that pick the slot. */
	byKey: Map<string, { name: string; bold: boolean; italic: boolean }>;
}

const slotOf = (bold: boolean, italic: boolean): FaceSlot => (bold ? (italic ? 'boldItalic' : 'bold') : italic ? 'italic' : 'regular');

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
	// A regular or bold face (400 or 700, upright or italic) goes in its slot of the family's OWN name, flagged bold or
	// italic by the run: a reader that has the family, or can fetch it (LibreOffice, Google Slides), then finds it by
	// that name. Any other weight has no slot, so it is a family of its own ("Outfit SemiBold").
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

type ZipLike = {
	file(name: string, data?: unknown, options?: unknown): { async(type: string): Promise<string> } | null;
	generateAsync(options: Record<string, unknown>): Promise<unknown>;
	files: Record<string, unknown>;
	remove(name: string): unknown;
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
	const tagged = new RegExp(`(<p:cNvPr id="\\d+" name=")${GROUP_TAG}(\\d+)\\|(?:${SUB_TAG}(\\d+)\\|)?`);
	const wrap = (group: string, members: string[]) => {
		const boxes = members.map((sp) => {
			const off = sp.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
			const ext = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
			if (!off || !ext) throw new Error('calco: a grouped shape has no position');
			return [Number(off[1]), Number(off[2]), Number(off[1]) + Number(ext[1]), Number(off[2]) + Number(ext[2])];
		});
		const x = lowest(boxes.map((b) => b[0]));
		const y = lowest(boxes.map((b) => b[1]));
		const cx = highest(boxes.map((b) => b[2])) - x;
		const cy = highest(boxes.map((b) => b[3])) - y;
		const frame = `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${cx}" cy="${cy}"/>`;
		return (
			`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${nextId++}" name="Group ${group}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
			`<p:grpSpPr><a:xfrm>${frame}</a:xfrm></p:grpSpPr>${members.join('')}</p:grpSp>`
		);
	};
	// A card's members, with each run of one sub-group's shapes nested into a group of its own.
	const wrapCard = (group: string, members: Array<{ sub: string | null; sp: string }>) => {
		const parts: string[] = [];
		for (let i = 0; i < members.length; ) {
			const { sub } = members[i];
			let j = i + 1;
			while (sub !== null && j < members.length && members[j].sub === sub) j++;
			const run = members.slice(i, j).map((m) => m.sp);
			parts.push(sub !== null && run.length > 1 ? wrap(`${group}.${sub}`, run) : run.join(''));
			i = j;
		}
		return wrap(group, parts);
	};
	// One linear scan with indexOf, not a regex over runs of `<p:sp>`: a backtracking pattern
	// there is polynomial in the number of adjacent shapes (CodeQL). A group's members are shapes and
	// pictures (`<p:sp>`, `<p:pic>`).
	const OPENS = ['<p:sp>', '<p:pic>'];
	const CLOSES = ['</p:sp>', '</p:pic>'];
	let out = '';
	let at = 0;
	let current: string | null = null;
	let members: Array<{ sub: string | null; sp: string }> = [];
	const nextOpen = OPENS.map((o) => xml.indexOf(o, 0));
	const flush = () => {
		if (current !== null) out += wrapCard(current, members);
		current = null;
		members = [];
	};
	for (;;) {
		// The next opening of each kind, searched again only once the scan has passed it.
		for (let k = 0; k < OPENS.length; k++) if (nextOpen[k] !== -1 && nextOpen[k] < at) nextOpen[k] = xml.indexOf(OPENS[k], at);
		let start = -1;
		let kind = 0;
		nextOpen.forEach((hit, k) => {
			if (hit >= 0 && (start < 0 || hit < start)) {
				start = hit;
				kind = k;
			}
		});
		const end = start < 0 ? -1 : xml.indexOf(CLOSES[kind], start);
		if (end < 0) break;
		// A group's members are ADJACENT: anything between two closes the group.
		if (start !== at) {
			flush();
			out += xml.slice(at, start);
		}
		const sp = xml.slice(start, end + CLOSES[kind].length);
		const m = sp.match(tagged);
		const group = m ? m[2] : null;
		if (group !== current) flush();
		if (m) {
			current = group;
			members.push({ sub: m[3] ?? null, sp: sp.replace(tagged, '$1') });
		} else out += sp;
		at = end + CLOSES[kind].length;
	}
	flush();
	return out + xml.slice(at);
}

/**
 * Name every media part by what its bytes are. PptxGenJS 3.12 writes a layout's background image
 * as `ppt/media/<layout>-image-1.png` whatever it holds, so a JPEG background sat under a `.png`
 * name and a `png` content type, which desktop PowerPoint may refuse. A JPEG found under `.png` is
 * renamed `.jpeg` (a content type the package already declares) and every relationship that
 * names it follows.
 */
async function nameMediaByContent(zip: ZipLike): Promise<void> {
	const renames = new Map<string, string>();
	for (const name of Object.keys(zip.files)) {
		const m = name.match(/^ppt\/media\/([^/]+)\.png$/);
		const file = m && zip.file(name);
		if (!m || !file) continue;
		const head = (await (file as unknown as { async(type: string): Promise<Uint8Array> }).async('uint8array')).subarray(0, 2);
		if (head[0] === 0xff && head[1] === 0xd8) renames.set(name, `ppt/media/${m[1]}.jpeg`);
	}
	if (!renames.size) return;
	for (const [from, to] of renames) {
		const data = await (zip.file(from) as unknown as { async(type: string): Promise<Uint8Array> }).async('uint8array');
		zip.file(to, data);
		zip.remove(from);
	}
	for (const rels of Object.keys(zip.files).filter((n) => n.endsWith('.rels'))) {
		let xml = await (zip.file(rels) as { async(type: string): Promise<string> }).async('string');
		const before = xml;
		for (const [from, to] of renames) xml = xml.split(`media/${from.split('/').pop()}`).join(`media/${to.split('/').pop()}`);
		if (xml !== before) zip.file(rels, xml);
	}
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
 * Give every shape on a part its own id. PptxGenJS 3.12 writes a fixed id (25) for the slide-number
 * placeholder it adds to each slide that uses a layout number, so a slide with that placeholder and an
 * object of its own with that id carries the id twice. A repeated id is a repair prompt in some
 * readers; the first holder keeps its id and every later one takes the next free number.
 */
export function uniqueShapeIds(xml: string): string {
	const re = /(<p:cNvPr id=")(\d+)(")/g;
	let max = 0;
	for (const m of xml.matchAll(re)) max = Math.max(max, Number(m[2]));
	const seen = new Set<string>();
	return xml.replace(re, (_all, a: string, id: string, c: string) => {
		if (!seen.has(id)) {
			seen.add(id);
			return `${a}${id}${c}`;
		}
		max += 1;
		seen.add(String(max));
		return `${a}${max}${c}`;
	});
}

/** Swap a tagged shape's flat fill for the gradient its name carries. */
function withGradient(sp: string): string {
	const m = sp.match(new RegExp(`${GRAD_TAG}(-?[\\d.]+)((?:~[\\d.]+:[0-9a-f]{6}:[\\d.]+)+)\\|`));
	if (!m) return sp;
	const ang = Math.round((((Number(m[1]) - 90) % 360) + 360) % 360 * 60000);
	const stops = m[2]
		.slice(1)
		.split('~')
		.map((t) => {
			const [pos, rgb, alpha] = t.split(':');
			const a = Math.round(Number(alpha) * 100000);
			return `<a:gs pos="${Math.round(Number(pos) * 100000)}"><a:srgbClr val="${rgb.toUpperCase()}">${a < 100000 ? `<a:alpha val="${a}"/>` : ''}</a:srgbClr></a:gs>`;
		})
		.join('');
	const fill = `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`;
	const named = sp.replace(m[0], '');
	// The shape's own fill is the first one before its outline.
	const ln = named.indexOf('<a:ln');
	const head = ln < 0 ? named : named.slice(0, ln);
	const swapped = head.replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/, fill);
	return swapped + (ln < 0 ? '' : named.slice(ln));
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
/**
 * Rewrite each `<open>…</close>` block of `xml` with `fn`. A scan with `indexOf`, not a lazy
 * `[\s\S]*?` regex: on input with many openers and no closer a regex rescans to the end for each
 * one (quadratic), and the XML here is the library's input.
 */
function mapBlocks(xml: string, open: string, close: string, fn: (block: string) => string): string {
	let out = '';
	let at = 0;
	for (;;) {
		const start = xml.indexOf(open, at);
		if (start < 0) break;
		const end = xml.indexOf(close, start + open.length);
		if (end < 0) break;
		out += xml.slice(at, start) + fn(xml.slice(start, end + close.length));
		at = end + close.length;
	}
	return out + xml.slice(at);
}

/** Replace the first self-closing `<tag …/>` in `xml` with `replacement` (no regex: the tag's attributes are input). */
function replaceSelfClosing(xml: string, tag: string, replacement: string): string {
	const start = xml.indexOf(tag);
	if (start < 0) return xml;
	const end = xml.indexOf('>', start);
	return end > start && xml[end - 1] === '/' ? xml.slice(0, start) + replacement + xml.slice(end + 1) : xml;
}

export function applyRoles(xml: string): string {
	if (!xml.includes(ROLE_TAG) && !xml.includes(LOCK_TAG) && !xml.includes(ROUND_TAG) && !xml.includes(GRAD_TAG) && !xml.includes('hasCustomPrompt')) return xml;
	// The slide's content picture stays where it is unless a reader unlocks it: it is the one
	// object nobody means to drag, and the first one a stray touch grabs.
	xml = mapBlocks(xml, '<p:pic>', '</p:pic>', (pic) =>
		pic.includes(`name="${LOCK_TAG}`) ? replaceSelfClosing(pic.replace(`name="${LOCK_TAG}`, 'name="'), '<a:picLocks', '<a:picLocks noChangeAspect="1" noMove="1" noResize="1"/>') : pic,
	);
	return mapBlocks(xml, '<p:sp>', '</p:sp>', (spIn) => {
		let sp = spIn;
		// PptxGenJS copies each of the layout's placeholders onto every slide, empty, with a
		// prompt. A slide that used one has written its own; the rest would show "Click to add".
		if (sp.includes('hasCustomPrompt="1"') && sp.includes('<a:endParaRPr') && !sp.includes('<a:t>')) return '';
		// A gradient fill: PptxGenJS writes a flat color only, so the name carries the gradient.
		if (sp.includes(GRAD_TAG)) sp = withGradient(sp);
		// A path's stroke ends and corners: PptxGenJS cannot write them, so the name carries a marker.
		if (sp.includes(ROUND_TAG)) {
			return sp
				.replace(ROUND_TAG, '')
				.replace(/<a:ln( [^>]*)?>/, (m, attrs) => (attrs?.includes('cap=') ? m : `<a:ln${attrs || ''} cap="rnd">`))
				.replace('</a:ln>', '<a:round/></a:ln>');
		}
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
 * The repeated `<a:pPr>` of a paragraph carry the same options, except that a card's later paragraphs set
 * their own line spacing and space-before on their first run, which is the one kept; a strict reader no
 * longer has an invalid part to repair. It also wraps each
 * card's tagged members in a `p:grpSp` (`groupShapes`), which PptxGenJS cannot write.
 */
async function tidyPptx(zip: ZipLike): Promise<void> {
	const text = async (name: string) => (zip.file(name) as { async(type: string): Promise<string> }).async('string');
	for (const name of Object.keys(zip.files).filter((n) => /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(n))) {
		const xml = await text(name);
		const tidy = uniqueShapeIds(groupShapes(applyRoles(onePPrPerParagraph(xml))));
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
	await nameMediaByContent(zip);
}

/**
 * Add the embedded faces to a written package: `ppt/fonts/calco-fontN.fntdata` (EOT), a font
 * relationship from the presentation part, the `fntdata` content type, and
 * `p:embeddedFontLst` right after `p:notesSz` (where the schema puts it), with
 * `embedTrueTypeFonts="1"` on the presentation. The package is tidied first (`tidyPptx`),
 * so an empty `faces` only tidies.
 */
export async function embedPptxFonts<T = Uint8Array>(JSZip: JSZipClass, bytes: Uint8Array, faces: Array<{ face: EmbeddedFont; name: string; slot?: FaceSlot }>, outputType = 'uint8array'): Promise<T> {
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
	// One `p:embeddedFont` per family name, its faces in the schema's slot order.
	const byName = new Map<string, Array<{ slot: FaceSlot; id: string }>>();
	faces.forEach(({ face, name, slot }, i) => {
		const s: FaceSlot = slot || 'regular';
		const style = { regular: 'Regular', bold: 'Bold', italic: 'Italic', boldItalic: 'Bold Italic' }[s];
		const eot = toEot(renameFace(face.bytes, name, s), { family: name, style, full: s === 'regular' ? name : `${name} ${style}` });
		const part = `fonts/calco-font${i + 1}.fntdata`;
		const id = `rIdCalcoFont${i + 1}`;
		zip.file(`ppt/${part}`, eot, { createFolders: false });
		relXml.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${part}"/>`);
		byName.set(name, [...(byName.get(name) || []), { slot: s, id }]);
	});
	for (const [name, list] of byName) {
		const slots = (['regular', 'bold', 'italic', 'boldItalic'] as const).map((k) => {
			const hit = list.find((x) => x.slot === k);
			return hit ? `<p:${k} r:id="${hit.id}"/>` : '';
		});
		entries.push(`<p:embeddedFont><p:font typeface="${name}" charset="0"/>${slots.join('')}</p:embeddedFont>`);
	}
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
