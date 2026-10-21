/**
 * Calco's public types: the deck model a reader produces and a writer consumes.
 *
 * Every length is in CSS pixels of the slide box (a 1280×720 slide is 1280 wide), so a
 * reader never needs to know the output format and a writer never needs a browser. Types
 * are erased at build time, so nothing here reaches the serialized reader.
 */

/** How a run of text is drawn. One run = one stretch of text with one style. */
export interface TextStyle {
	/** The font family the browser actually drew with (not the whole fallback stack). */
	family: string;
	/** CSS weight, 100–900. */
	weight: number;
	italic: boolean;
	/** Font size in px. */
	size: number;
	/** Text color as `#rrggbb`. */
	color: string;
	/** Text opacity, 0–1. */
	alpha: number;
	/**
	 * The color the text APPEARS as when `alpha < 1`: `color` blended over the nearest
	 * solid background behind it, as `#rrggbb`. Absent when there is no solid background to
	 * blend over (a picture, a gradient). A writer prefers it to a translucent color, which
	 * LibreOffice clips when the run is also letter-spaced.
	 */
	flatColor?: string;
	/**
	 * A solid color behind the run, as `#rrggbb`: an inline chip (a code span, a mark) drawn as a text highlight, so
	 * it moves with its words and wraps with them. The chip's translucent tint is blended over what is behind it.
	 * The chip's corners, border and padding are not carried.
	 */
	highlight?: string;
	/** Extra space after each character, px. */
	letterSpacing: number;
	/** CSS `text-transform` (`none`, `uppercase`, `lowercase`, `capitalize`). */
	transform: string;
	underline: boolean;
	strike: boolean;
	/** False when the page turned ligatures off (`font-variant-ligatures: none`), as code does. */
	ligatures: boolean;
	/** CSS `font-variant-caps: small-caps` (or `all-small-caps`). */
	smallCaps?: boolean;
}

/** A stretch of text in one style. `text` is the SOURCE text, before `transform`. */
export interface TextRun {
	text: string;
	style: TextStyle;
}

/** One paragraph's box. Lines are broken where the browser broke them. */
export interface TextFrame {
	/** Left edge of the text column, px. */
	x: number;
	/** Top of the first line's glyph box (ascent + descent), px. */
	y: number;
	/** Width of the text column, px. */
	w: number;
	/** Height from the first line's top to the last line's bottom, px. */
	h: number;
	/** Height of the first line's glyph box, px (sets where its baseline sits). */
	firstLineHeight: number;
	/** Distance between one line's top and the next, px. */
	lineHeight: number;
	align: 'left' | 'center' | 'right';
	lines: TextRun[][];
	/** The group this text moves with: the index of its card in `Slide.shapes`. */
	group?: number;
	/**
	 * What the text is on the slide, when the page says so: the slide's `title`, the
	 * `eyebrow` kicker above a heading, the `subtitle` below one, the running `header` and
	 * `footer`, and the page `number`. A writer names the box by it, and where the format has
	 * a placeholder for it (title, footer, slide number) writes one.
	 */
	role?: FrameRole;
}

/** What a text frame is on the slide (see `TextFrame.role`). */
export type FrameRole = 'title' | 'eyebrow' | 'subtitle' | 'header' | 'footer' | 'number';

/** A color with its opacity. */
export interface Paint {
	/** `#rrggbb`. */
	color: string;
	/** 0–1, the element's opacity folded in. */
	alpha: number;
}

/** One color stop of a linear gradient. */
export interface GradientStop extends Paint {
	/** 0–1 along the gradient line. */
	pos: number;
}

/** A linear gradient fill: the CSS angle in degrees (0 is toward the top, 90 toward the right) and its stops. */
export interface Gradient {
	angle: number;
	stops: GradientStop[];
}

/** An outer shadow, in px. */
export interface Shadow extends Paint {
	x: number;
	y: number;
	blur: number;
}

/** One step of a path: move, line, cubic Bézier, close. */
export type PathCmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

/**
 * A box or a rule the reader lifted out of the slide picture, so it can be drawn as a
 * native office shape (engineering/decisions/2026-10-07-calco-native-shapes.md).
 *
 * A `box` is a CSS border box: `x, y, w, h` its outer edge, `radii` its outer corner radii
 * (top-left, top-right, bottom-right, bottom-left, already clamped as CSS clamps them),
 * `stroke` a border the same on all four sides, drawn INSIDE the edge as CSS draws it. A
 * writer whose outline straddles the path insets the path by half the stroke width.
 *
 * A `line` is one side of a border: a straight stroke from `(x, y)` to `(x + w, y + h)`
 * along the middle of the border band, so `h` is 0 for a horizontal rule and `w` for a
 * vertical one.
 *
 * A `path` is a drawn mark (a check, a cross, a dash): `x, y, w, h` the bounding box of its
 * `path`, which is relative to that box. It is stroked (`stroke`, with `cap` and `join`) and/or
 * filled (`fill`), and a writer draws it as the format's freeform shape, so it stays a real,
 * recolorable object. The reader lifts it from a pseudo-element that paints a CSS mask.
 */
export interface Shape {
	kind: 'box' | 'line' | 'path' | 'picture';
	x: number;
	y: number;
	w: number;
	h: number;
	radii?: [number, number, number, number];
	fill?: Paint;
	/** A linear gradient the box is filled with. `fill` then holds a stand-in color for a reader that ignores it. */
	gradient?: Gradient;
	stroke?: Paint & { width: number };
	shadow?: Shadow;
	/** A line: the side of its box it was. */
	side?: 'top' | 'right' | 'bottom' | 'left';
	/**
	 * A line on a rounded box: the radius of the corner at its start and at its end. Each
	 * end wraps 45° of that corner's arc (at the middle of the band), as the browser hands
	 * the corner to the next side there. Absent when both corners are square.
	 */
	wrap?: [number, number];
	/** A path: its outline, relative to the box `x, y`. */
	path?: PathCmd[];
	/** A path: whether it is closed (a filled mark) or open (a stroked one). */
	closed?: boolean;
	/** A path's stroke ends and corners. */
	cap?: 'butt' | 'round' | 'square';
	join?: 'miter' | 'round' | 'bevel';
	/** Drawn by a pseudo-element of the box it groups with (a pill's dot or mark), not by an element. */
	pseudo?: boolean;
	/**
	 * A group inside its card's group: the index of the shape that owns it. A pill inside a card is
	 * one object (its box, its dot, its ring, its mark), and that object is one member of the card.
	 */
	sub?: number;
	/**
	 * A picture: what could not be a shape (a photo, a chart, an icon, a box with a paint Calco cannot draw), cropped
	 * from the slide. The reader fixes where it is and the host fills in the bytes; the picture sits in the paint order
	 * among the shapes, so a card can hold an icon above its fill. Its description is the element's own alt text.
	 */
	image?: Uint8Array;
	alt?: string;
	/** A picture that holds a raster image (an `<img>`, a video poster, a canvas): lossy JPEG is fine for it. */
	photo?: boolean;
	/** A label: the index in `Slide.frames` of the text this box carries inside it. */
	text?: number;
	/** The group this shape moves with: the index of its card in `Slide.shapes`. */
	group?: number;
}

/**
 * What a slide paints behind its content: a flat color, or a picture of the page's own paint
 * (its border, rules, washes and textures). Slides whose backgrounds match share one, so a
 * writer puts it on a master page / layout once and the slides inherit it.
 */
export interface Background {
	/** `#rrggbb`, when the background is one flat color. Then there is no `image`. */
	color?: string;
	/** PNG bytes, slide-sized, opaque. */
	image?: Uint8Array;
}

/** A slide, read. */
export interface Slide {
	/**
	 * The slide as one picture (PNG bytes). In PICTURE mode it is the whole slide; in
	 * EDITABLE mode it is the slide with its text hidden, and `frames` carries the text.
	 * With `background` set it is only the FOREGROUND: transparent wherever the slide
	 * shows nothing but its background, which the master page supplies.
	 * Absent when the slide's pictures are `Shape`s of kind `picture`: each carries its own bytes.
	 */
	image?: Uint8Array;
	/** Index into `Deck.backgrounds`: the background this slide inherits. Absent: none (the picture is opaque). */
	background?: number;
	/** Editable text. Empty in picture mode. */
	frames: TextFrame[];
	/**
	 * Native shapes, in paint order (back to front), drawn over the picture and under the
	 * text. Absent or empty when the reader was not asked for shapes.
	 */
	shapes?: Shape[];
	/** Speaker notes, plain text. */
	notes?: string | null;
	/** Alt text for the slide picture. */
	description?: string | null;
}

/** A whole deck, ready to write. */
export interface Deck {
	/** Slide box width and height in px — sets the page aspect. */
	width: number;
	height: number;
	slides: Slide[];
	/** The backgrounds the slides share, by index (see `Slide.background`). */
	backgrounds?: Background[];
	title?: string;
	subject?: string;
	author?: string;
	/** Provenance; ODP keeps it as a user-defined property, PPTX as the company field. */
	company?: string;
	/** Fonts to embed (ODP). A writer embeds only the faces some run uses. */
	fonts?: EmbeddedFont[];
}

/** A static TrueType/OpenType face, ready to embed. */
export interface EmbeddedFont {
	family: string;
	weight: number;
	italic: boolean;
	/** sfnt bytes (TrueType or CFF OpenType), one fixed weight. */
	bytes: Uint8Array;
}

/** The JSZip class, passed in (Calco has no dependencies of its own). */
export type JSZipClass = new () => {
	file(name: string, data: string | Uint8Array, options?: Record<string, unknown>): unknown;
	generateAsync(options: Record<string, unknown>): Promise<unknown>;
};
