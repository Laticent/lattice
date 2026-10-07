/**
 * Fonts: which faces a deck uses, getting them ready to embed, and the two metrics a
 * writer needs to put a baseline where the browser put it.
 *
 * Calco does no font PROCESSING itself. A web font is usually variable (one file holds every
 * weight) and an office suite draws a variable file at its default weight, so each face
 * has to be pinned to one weight first. That needs a shaping engine (HarfBuzz), which the
 * host already has; `prepareFonts` takes it as a `pin` function and stays dependency-free.
 */
import type { Deck, EmbeddedFont, TextStyle } from './types';

/** Vertical metrics as fractions of the em: what a writer needs to place a baseline. */
export interface FontMetrics {
	/** Distance from the baseline up to the top of the glyph box. */
	ascent: number;
	/** Distance from the baseline down to the bottom of the glyph box (positive). */
	descent: number;
	/** The extra leading the face asks for between lines (0 when it asks for none). */
	lineGap?: number;
}

/**
 * Read a face's vertical metrics from its sfnt tables, the way Chrome and LibreOffice read
 * them: OS/2's typographic ascender/descender when the font sets USE_TYPO_METRICS (bit 7
 * of `fsSelection`), else `hhea`. Returns null for bytes that are not an sfnt.
 */
export function readFontMetrics(bytes: Uint8Array): FontMetrics | null {
	if (bytes.length < 12) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = view.getUint32(0);
	// 0x00010000 TrueType, 'OTTO' CFF, 'true' old Apple TrueType.
	if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null;
	const numTables = view.getUint16(4);
	const tables: Record<string, number> = {};
	for (let i = 0; i < numTables; i++) {
		const rec = 12 + i * 16;
		if (rec + 16 > bytes.length) return null;
		const name = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
		tables[name] = view.getUint32(rec + 8);
	}
	if (tables.head === undefined || tables.hhea === undefined) return null;
	// Every read below stays inside the buffer; a hostile offset returns null, never throws.
	if (tables.head + 20 > bytes.length || tables.hhea + 8 > bytes.length) return null;
	const upm = view.getUint16(tables.head + 18);
	if (!upm) return null;
	let ascent = view.getInt16(tables.hhea + 4);
	let descent = view.getInt16(tables.hhea + 6);
	let gap = tables.hhea + 10 <= bytes.length ? view.getInt16(tables.hhea + 8) : 0;
	const os2 = tables['OS/2'];
	if (os2 !== undefined && os2 + 74 <= bytes.length) {
		const useTypo = (view.getUint16(os2 + 62) & 0x80) !== 0;
		if (useTypo) {
			ascent = view.getInt16(os2 + 68);
			descent = view.getInt16(os2 + 70);
			gap = view.getInt16(os2 + 72);
		}
	}
	return { ascent: ascent / upm, descent: Math.abs(descent) / upm, lineGap: Math.max(0, gap) / upm };
}

/**
 * May this face be embedded in a document? The OS/2 `fsType` field says: bit 1 (value 2)
 * is RESTRICTED license embedding, which forbids it. Anything else — installable,
 * preview & print, editable, or a face with no OS/2 table — may be embedded. A face
 * that cannot be read is not embedded.
 */
export function embeddingAllowed(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const numTables = view.getUint16(4);
	for (let i = 0; i < numTables; i++) {
		const rec = 12 + i * 16;
		if (rec + 16 > bytes.length) return false;
		if (String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]) !== 'OS/2') continue;
		const at = view.getUint32(rec + 8);
		if (at + 10 > bytes.length) return false;
		const fsType = view.getUint16(at + 8);
		// Restricted (bit 1) forbids embedding; bitmap-only (bit 9) forbids the outlines Calco embeds.
		return (fsType & 0x000f) !== 0x0002 && (fsType & 0x0200) === 0;
	}
	return readFontMetrics(bytes) !== null;
}

/** One face a deck draws with, and whether any run of it keeps ligatures. */
export interface FaceUse {
	family: string;
	weight: number;
	italic: boolean;
	/**
	 * False when ANY run in this face turned ligatures off. An embedded face cannot carry
	 * ligatures for one run and not another, and a code run that suddenly draws `<!--` as
	 * an arrow is worse than a heading that loses an `fi` ligature.
	 */
	ligatures: boolean;
}

/** Every face the deck's text uses, deduplicated by family + weight + italic. */
export function facesUsed(deck: Deck): FaceUse[] {
	const seen = new Map<string, FaceUse>();
	for (const slide of deck.slides) {
		for (const frame of slide.frames) {
			for (const line of frame.lines) {
				for (const run of line) {
					const s = run.style;
					const key = faceKey(s.family, s.weight, s.italic);
					const use = seen.get(key);
					if (use) use.ligatures = use.ligatures && s.ligatures;
					else seen.set(key, { family: s.family, weight: s.weight, italic: s.italic, ligatures: s.ligatures });
				}
			}
		}
	}
	return [...seen.values()];
}

/** Host hooks for `prepareFonts`. */
export interface FontHost {
	/**
	 * The font file for a face (WOFF2, TTF or OTF), or null when the host has none (a
	 * system font). The host picks the nearest weight it ships.
	 */
	load(face: { family: string; weight: number; italic: boolean }): Promise<Uint8Array | null> | Uint8Array | null;
	/**
	 * Return a static sfnt pinned to `weight`, keeping EVERY character (the reader of an
	 * editable file types new words), with ligature features dropped when `ligatures` is false.
	 */
	pin(bytes: Uint8Array, options: { weight: number; ligatures: boolean }): Promise<Uint8Array> | Uint8Array;
}

/**
 * Load and pin every face the deck uses. A face the host cannot load is skipped: its runs
 * still name the family, and the reader's office suite substitutes. So is a face whose
 * license forbids embedding (`embeddingAllowed`): Calco never puts a restricted font in a
 * file someone else will open.
 */
export async function prepareFonts(deck: Deck, host: FontHost): Promise<EmbeddedFont[]> {
	const out: EmbeddedFont[] = [];
	for (const face of facesUsed(deck)) {
		const raw = await host.load(face);
		if (!raw) continue;
		const bytes = await host.pin(raw, { weight: face.weight, ligatures: face.ligatures });
		if (!embeddingAllowed(bytes)) continue;
		out.push({ family: face.family, weight: face.weight, italic: face.italic, bytes });
	}
	return out;
}

/**
 * The OpenType layout features a pinned face should keep. Ligatures (`liga`, `clig`,
 * `calt`) go when the page turned them off for some run in the face, as code does.
 * Every host's `pin` uses this list, so the CLI and a browser embed the same face.
 */
export function pinFeatures(ligatures: boolean): string[] {
	const base = ['kern', 'tnum', 'lnum', 'onum', 'pnum', 'case', 'zero', 'ss01', 'ss02'];
	return ligatures ? [...base, 'liga', 'clig', 'calt'] : base;
}

/**
 * The nearest face in a host's font list: same family and slant, nearest weight. A list
 * entry gives its slant as `italic` or as a CSS `style` (`normal` / `italic`).
 */
export function nearestFace<T extends { family: string; weight: number; italic?: boolean; style?: string }>(
	list: readonly T[],
	want: { family: string; weight: number; italic: boolean },
): T | null {
	let best: T | null = null;
	for (const f of list) {
		const italic = f.italic ?? f.style === 'italic';
		if (f.family !== want.family || italic !== want.italic) continue;
		if (!best || Math.abs(f.weight - want.weight) < Math.abs(best.weight - want.weight)) best = f;
	}
	return best;
}

/** The embedded face a style draws with: same family and slant, nearest weight. */
export function faceFor(style: Pick<TextStyle, 'family' | 'weight' | 'italic'>, fonts: EmbeddedFont[]): EmbeddedFont | null {
	let best: EmbeddedFont | null = null;
	for (const f of fonts) {
		if (f.family !== style.family || f.italic !== style.italic) continue;
		if (!best || Math.abs(f.weight - style.weight) < Math.abs(best.weight - style.weight)) best = f;
	}
	return best;
}

export function faceKey(family: string, weight: number, italic: boolean): string {
	return `${family}|${weight}|${italic ? 'i' : 'n'}`;
}

const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: '', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

/**
 * The family name an embedded face is written under: the family itself for a plain regular,
 * else the family with its weight and slant ("Outfit SemiBold", "Playfair Display Bold
 * Italic"). Every face is its own family's regular, so a reader never has to resolve a
 * weight: PowerPoint has only four slots per family, and iOS (CoreText) matches by the
 * names inside the font. A pinned variable face still carries the variable font's names
 * ("Outfit Thin" for every Outfit weight), so the file is renamed to match (sfnt.ts).
 */
export function faceFamilyName(face: { family: string; weight: number; italic: boolean }, numeric = false): string {
	const family =
		Array.from(String(face.family))
			.filter((ch) => ch.charCodeAt(0) >= 0x20 && !`"'<>&\\`.includes(ch))
			.join('')
			.trim() || 'sans-serif';
	const w = numeric ? String(face.weight) : (WEIGHT_NAMES[Math.round(face.weight / 100) * 100] ?? String(face.weight));
	return [family, w, face.italic ? 'Italic' : ''].filter(Boolean).join(' ');
}

/** A unique family name per face: two weights that round to one name keep their number ("Outfit 720"). */
export function uniqueFaceNames<F extends { family: string; weight: number; italic: boolean }>(faces: F[]): Map<F, string> {
	const out = new Map<F, string>();
	const taken = new Set<string>();
	for (const face of faces) {
		let name = faceFamilyName(face);
		if (taken.has(name)) name = faceFamilyName(face, true);
		let n = 2;
		const base = name;
		while (taken.has(name)) name = `${base} ${n++}`;
		taken.add(name);
		out.set(face, name);
	}
	return out;
}
