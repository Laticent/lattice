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
	/** Extra space after each character, px. */
	letterSpacing: number;
	/** CSS `text-transform` (`none`, `uppercase`, `lowercase`, `capitalize`). */
	transform: string;
	underline: boolean;
	strike: boolean;
	/** False when the page turned ligatures off (`font-variant-ligatures: none`), as code does. */
	ligatures: boolean;
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
}

/** A slide, read. */
export interface Slide {
	/**
	 * The slide as one picture (PNG bytes). In PICTURE mode it is the whole slide; in
	 * EDITABLE mode it is the slide with its text hidden, and `frames` carries the text.
	 */
	image: Uint8Array;
	/** Editable text. Empty in picture mode. */
	frames: TextFrame[];
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
