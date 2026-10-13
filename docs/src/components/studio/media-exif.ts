// Read what a photo's own file says about itself — a description, who made it, when it was taken, and
// whether it carried a location — BEFORE the importer scrubs or re-encodes it. The stored bytes never
// keep any of it (media-scrub.ts, the canvas re-encode), so this is the one chance to read it. Decision
// note: engineering/decisions/2026-10-12-library-media-assets.md §Editing a photo's metadata.
//
// WHAT IS KEPT AND WHAT IS NOT. Four things come out: a description, a credit, a date taken, and a yes/no
// "this file carried a location". The location itself is never read into a value: the parser looks for
// the presence of GPS coordinates and reports `hadLocation`, nothing more. Camera, lens, exposure,
// software and every other tag are ignored; a deck has no use for them.
//
// WHERE IT LOOKS. JPEG (EXIF, XMP and IPTC), PNG (`eXIf`, `iTXt` XMP, `tEXt` fields) and WebP (`EXIF`,
// `XMP `). A phone writes EXIF; Lightroom, Photos and most editors also write XMP, and news and stock
// photography write IPTC, so a photo edited anywhere usually has its description in one of the three.
//
// UNTRUSTED. The file is from anyone. Every read is bounds-checked, every size is capped, text is a plain
// string and never markup, and a malformed block ends that block, never the import. This module never
// throws: a file it cannot read gives `{}`.

import { isIsoDate } from './media-edit';

export type FileMeta = {
	/** A description the file carried: XMP description, IPTC caption, EXIF ImageDescription, or a title. */
	caption?: string;
	/** Who made it: XMP creator, IPTC byline, EXIF Artist, else a copyright line. */
	credit?: string;
	/** `YYYY-MM-DD`, from the date the picture was taken. */
	taken?: string;
	/** The file carried GPS coordinates. The coordinates themselves are not read. */
	hadLocation?: true;
};

/** The most bytes of any one metadata block read. A phone's EXIF is under 64 KB; XMP is capped at 64 KB per
 *  JPEG segment. */
const MAX_BLOCK = 1 << 20;
const MAX_XMP_CHARS = 262_144;
const MAX_IFD_ENTRIES = 512;
const MAX_CAPTION = 140;
const MAX_CREDIT = 100;

const utf8 = new TextDecoder('utf-8');
const latin1 = new TextDecoder('latin1');

// ── text hygiene ────────────────────────────────────────────────────────────────────────────────────────

/** One line of plain text: control and invisible characters out, whitespace collapsed. */
function oneLine(v: string): string {
	return (
		v
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
			.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
			.replace(/[\p{Cf}\p{Zl}\p{Zp}]+/gu, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/** A cut at a word boundary with an ellipsis, so a long description is not left ending mid-word. */
function clip(v: string, max: number): string {
	if (v.length <= max) return v;
	const cut = v.slice(0, max - 1);
	const at = cut.lastIndexOf(' ');
	return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

// A camera or an editor's own default, a file name, or a bare number is not a description of the picture.
const JUNK = [
	/^(?:olympus digital camera|sony dsc|kodak (?:digital|easyshare)|fujifilm|nikon|canon|samsung|apple|iphone|android|pentax|panasonic|leica|ricoh|minolta|casio|hp photosmart|screenshot|untitled|image|photo|picture|dcim|exif|jpeg|jpg|png)$/i,
	/^(?:img|dsc|dscn|dscf|pxl|mvimg|p|dcp|sam|pic|photo|image|scan)[ _-]?\d[\w -]*$/i,
	/^(?:created|processed|edited|generated|made|saved|optimized) (?:with|by|using|in) .{0,40}$/i,
	/^(?:adobe )?photoshop(?: \d[\d.]*)?$/i,
	/^[\d._ :/-]+$/,
	/\.(?:jpe?g|png|webp|heic|heif|gif|tiff?|bmp)$/i,
];

function descriptive(v: string): string | undefined {
	const t = oneLine(v);
	if (t.length < 3) return undefined;
	if (JUNK.some((re) => re.test(t))) return undefined;
	return clip(t, MAX_CAPTION);
}

function personal(v: string): string | undefined {
	const t = oneLine(v).replace(/^(?:©|\(c\)|copyright(?: ©)?)\s*/i, '');
	if (t.length < 2 || /^[\d._ :/-]+$/.test(t) || /^(?:unknown|n\/a|none|anonymous|all rights reserved)$/i.test(t)) return undefined;
	return clip(t, MAX_CREDIT);
}

/** `2026:03:04 09:15:00`, `2026-03-04T09:15:00Z` or `20260304` → `2026-03-04`, when it is a real day. */
function dateOf(v: string): string | undefined {
	const m = /^\s*(\d{4})[:\-./]?(\d{2})[:\-./]?(\d{2})(?!\d)/.exec(v);
	if (!m) return undefined;
	const d = `${m[1]}-${m[2]}-${m[3]}`;
	return m[1] !== '0000' && isIsoDate(d) ? d : undefined;
}

// ── EXIF / TIFF ─────────────────────────────────────────────────────────────────────────────────────────

type Found = { description?: string; artist?: string; copyright?: string; original?: string; digitized?: string; location?: true };

function readTiff(t: Uint8Array): Found {
	const out: Found = {};
	if (t.length < 14) return out;
	const le = t[0] === 0x49 && t[1] === 0x49;
	if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return out;
	const u16 = (i: number) => (i + 2 <= t.length ? (le ? t[i] | (t[i + 1] << 8) : (t[i] << 8) | t[i + 1]) : 0);
	const u32 = (i: number) => (i + 4 <= t.length ? (le ? (t[i] | (t[i + 1] << 8) | (t[i + 2] << 16) | (t[i + 3] << 24)) >>> 0 : ((t[i] << 24) | (t[i + 1] << 16) | (t[i + 2] << 8) | t[i + 3]) >>> 0) : 0);
	if (u16(2) !== 42) return out;

	/** The entries of the IFD at `at`: tag → [type, count, valueOffset]. A bad offset gives none. */
	const entries = (at: number): Map<number, [number, number, number]> => {
		const map = new Map<number, [number, number, number]>();
		if (at < 8 || at + 2 > t.length) return map;
		const n = Math.min(u16(at), MAX_IFD_ENTRIES);
		for (let k = 0; k < n; k++) {
			const e = at + 2 + k * 12;
			if (e + 12 > t.length) break;
			const type = u16(e + 2);
			const count = u32(e + 4);
			// A value of 4 bytes or fewer sits inside the entry; longer ones are at an offset.
			const size = count * ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] ?? 1);
			map.set(u16(e), [type, count, size <= 4 ? e + 8 : u32(e + 8)]);
		}
		return map;
	};
	const ascii = (ent: [number, number, number] | undefined): string | undefined => {
		if (!ent || ent[0] !== 2) return undefined;
		const [, count, at] = ent;
		if (count < 1 || count > 4096 || at + count > t.length) return undefined;
		const bytes = t.subarray(at, at + count);
		const end = bytes.indexOf(0);
		const raw = end === -1 ? bytes : bytes.subarray(0, end);
		// EXIF says ASCII; cameras write UTF-8 or Latin-1 anyway. Take UTF-8 unless it is not valid UTF-8.
		const asUtf8 = utf8.decode(raw);
		return asUtf8.includes('�') ? latin1.decode(raw) : asUtf8;
	};

	const ifd0 = entries(u32(4));
	out.description = ascii(ifd0.get(0x010e));
	out.artist = ascii(ifd0.get(0x013b));
	out.copyright = ascii(ifd0.get(0x8298));
	const exifPtr = ifd0.get(0x8769);
	if (exifPtr && exifPtr[0] === 4) {
		const exif = entries(u32(exifPtr[2]));
		out.original = ascii(exif.get(0x9003));
		out.digitized = ascii(exif.get(0x9004));
	}
	const gpsPtr = ifd0.get(0x8825);
	if (gpsPtr && gpsPtr[0] === 4) {
		// Coordinates present: GPSLatitude (0x0002) or GPSLongitude (0x0004). A bare GPSVersionID is no location.
		const gps = entries(u32(gpsPtr[2]));
		if (gps.has(0x0002) || gps.has(0x0004)) out.location = true;
	}
	return out;
}

// ── XMP ─────────────────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unxml(v: string): string {
	return v
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|(amp|lt|gt|quot|apos));/gi, (_w, dec: string, hex: string, name: string) => {
			if (name) return ENTITIES[name.toLowerCase()];
			const cp = dec ? +dec : Number.parseInt(hex, 16);
			return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ' ';
		});
}

/** The first text value of an XMP property: `<dc:x><rdf:Alt><rdf:li>…</rdf:li></rdf:Alt></dc:x>`, a plain
 *  element, or an attribute on the description. Patterns are anchored on literal tag names and the input is
 *  capped, so a hostile packet cannot make this expensive. */
function xmpValue(xmp: string, name: string): string | undefined {
	const el = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xmp);
	if (el) {
		const li = /<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/i.exec(el[1]);
		return unxml(li ? li[1] : el[1]);
	}
	const attr = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(xmp);
	return attr ? unxml(attr[1]) : undefined;
}

function readXmp(bytes: Uint8Array): Found & { title?: string; created?: string } {
	const xmp = utf8.decode(bytes.subarray(0, MAX_XMP_CHARS));
	const out: Found & { title?: string; created?: string } = {};
	out.description = xmpValue(xmp, 'dc:description');
	out.title = xmpValue(xmp, 'dc:title');
	out.artist = xmpValue(xmp, 'dc:creator');
	out.copyright = xmpValue(xmp, 'dc:rights');
	out.original = xmpValue(xmp, 'exif:DateTimeOriginal') ?? xmpValue(xmp, 'photoshop:DateCreated');
	out.created = xmpValue(xmp, 'xmp:CreateDate');
	// Coordinates as XMP text. Present or not; the value is never kept.
	if (/\sexif:GPSLatitude\s*=|<exif:GPSLatitude[\s>]/i.test(xmp)) out.location = true;
	return out;
}

// ── IPTC (inside a Photoshop APP13 segment) ─────────────────────────────────────────────────────────────

function readIptc(seg: Uint8Array): { caption?: string; title?: string; byline?: string; copyright?: string; date?: string } {
	const out: { caption?: string; title?: string; byline?: string; copyright?: string; date?: string } = {};
	const head = 'Photoshop 3.0\0';
	if (seg.length < head.length || latin1.decode(seg.subarray(0, head.length)) !== head) return out;
	let i = head.length;
	// 8BIM resource blocks: signature, 2-byte id, a padded Pascal name, a 4-byte size, padded data.
	for (let guard = 0; guard < 256 && i + 12 <= seg.length; guard++) {
		if (latin1.decode(seg.subarray(i, i + 4)) !== '8BIM') break;
		const id = (seg[i + 4] << 8) | seg[i + 5];
		const nameLen = seg[i + 6];
		i += 7 + nameLen + ((nameLen + 1) % 2);
		if (i + 4 > seg.length) break;
		const size = ((seg[i] << 24) | (seg[i + 1] << 16) | (seg[i + 2] << 8) | seg[i + 3]) >>> 0;
		i += 4;
		if (size > seg.length - i) break;
		if (id === 0x0404) readIim(seg.subarray(i, i + size), out);
		i += size + (size % 2);
	}
	return out;
}

function readIim(d: Uint8Array, out: ReturnType<typeof readIptc>): void {
	let utf = false;
	const text = (b: Uint8Array) => {
		if (utf) return utf8.decode(b);
		const u = utf8.decode(b);
		return u.includes('�') ? latin1.decode(b) : u;
	};
	for (let i = 0, guard = 0; i + 5 <= d.length && guard < 1024; guard++) {
		if (d[i] !== 0x1c) break;
		const record = d[i + 1];
		const set = d[i + 2];
		const len = (d[i + 3] << 8) | d[i + 4];
		// An extended-size dataset (high bit set) is not text we want; stop rather than misread.
		if (len & 0x8000 || i + 5 + len > d.length) break;
		const val = d.subarray(i + 5, i + 5 + len);
		if (record === 1 && set === 90 && val.length === 3 && val[0] === 0x1b && val[1] === 0x25 && val[2] === 0x47) utf = true; // ESC % G
		else if (record === 2) {
			if (set === 120) out.caption = text(val);
			else if (set === 5) out.title = text(val);
			else if (set === 80) out.byline = out.byline ?? text(val);
			else if (set === 116) out.copyright = text(val);
			else if (set === 55) out.date = latin1.decode(val);
		}
		i += 5 + len;
	}
}

// ── containers ──────────────────────────────────────────────────────────────────────────────────────────

type Blocks = { tiff: Uint8Array[]; xmp: Uint8Array[]; iptc: Uint8Array[] };

const XMP_JPEG = 'http://ns.adobe.com/xap/1.0/\0';
const asciiAt = (b: Uint8Array, at: number, s: string) => at + s.length <= b.length && latin1.decode(b.subarray(at, at + s.length)) === s;

function jpegBlocks(b: Uint8Array): Blocks {
	const out: Blocks = { tiff: [], xmp: [], iptc: [] };
	let i = 2;
	for (let guard = 0; guard < 4096 && i + 4 <= b.length; guard++) {
		if (b[i] !== 0xff) break;
		const marker = b[i + 1];
		if (marker === 0xff) {
			i++;
			continue;
		}
		if (marker === 0xda || marker === 0xd9) break; // the picture data begins: metadata is all before it
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2;
			continue;
		}
		const len = (b[i + 2] << 8) | b[i + 3];
		if (len < 2 || i + 2 + len > b.length) break;
		const body = b.subarray(i + 4, i + 2 + len);
		if (marker === 0xe1) {
			if (asciiAt(body, 0, 'Exif\0\0')) out.tiff.push(body.subarray(6));
			else if (asciiAt(body, 0, XMP_JPEG)) out.xmp.push(body.subarray(XMP_JPEG.length));
		} else if (marker === 0xed) out.iptc.push(body);
		i += 2 + len;
	}
	return out;
}

function pngBlocks(b: Uint8Array): Blocks & { text: Map<string, string> } {
	const out: Blocks & { text: Map<string, string> } = { tiff: [], xmp: [], iptc: [], text: new Map() };
	let i = 8;
	for (let guard = 0; guard < 100_000 && i + 12 <= b.length; guard++) {
		const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
		const type = latin1.decode(b.subarray(i + 4, i + 8));
		const at = i + 8;
		if (len > b.length - at - 4) break;
		const body = b.subarray(at, at + len);
		if (type === 'eXIf' && len <= MAX_BLOCK) out.tiff.push(body);
		else if (type === 'iTXt' && len <= MAX_BLOCK) {
			const nul = body.indexOf(0);
			const key = latin1.decode(body.subarray(0, nul < 0 ? 0 : nul));
			// keyword NUL, compression flag, method, language NUL, translated keyword NUL, text. Only the
			// uncompressed XMP packet is read; a deflated one is skipped, not inflated.
			if (key === 'XML:com.adobe.xmp' && body[nul + 1] === 0) {
				let p = nul + 3;
				for (let z = 0; z < 2 && p < body.length; z++) p = body.indexOf(0, p) + 1 || body.length;
				out.xmp.push(body.subarray(p));
			}
		} else if (type === 'tEXt' && len <= 65_536) {
			const nul = body.indexOf(0);
			if (nul > 0) out.text.set(latin1.decode(body.subarray(0, nul)), latin1.decode(body.subarray(nul + 1)));
		}
		if (type === 'IEND') break;
		i = at + len + 4;
	}
	return out;
}

function webpBlocks(b: Uint8Array): Blocks {
	const out: Blocks = { tiff: [], xmp: [], iptc: [] };
	let i = 12;
	for (let guard = 0; guard < 100_000 && i + 8 <= b.length; guard++) {
		const type = latin1.decode(b.subarray(i, i + 4));
		const len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
		const at = i + 8;
		if (len > b.length - at) break;
		const body = b.subarray(at, at + len);
		if (type === 'EXIF' && len <= MAX_BLOCK) out.tiff.push(asciiAt(body, 0, 'Exif\0\0') ? body.subarray(6) : body);
		else if (type === 'XMP ' && len <= MAX_BLOCK) out.xmp.push(body);
		i = at + len + (len % 2);
	}
	return out;
}

// ── the answer ──────────────────────────────────────────────────────────────────────────────────────────

/** What a photo's file says about itself. Never throws; a file it cannot read gives `{}`. */
export function readFileMeta(bytes: Uint8Array): FileMeta {
	try {
		let blocks: Blocks & { text?: Map<string, string> };
		if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) blocks = jpegBlocks(bytes);
		else if (bytes.length > 16 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) blocks = pngBlocks(bytes);
		else if (bytes.length > 16 && asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) blocks = webpBlocks(bytes);
		else return {};

		const exif: Found = {};
		for (const t of blocks.tiff.slice(0, 4)) Object.assign(exif, Object.fromEntries(Object.entries(readTiff(t)).filter(([, v]) => v !== undefined)));
		const xmp: ReturnType<typeof readXmp> = {};
		for (const x of blocks.xmp.slice(0, 4)) Object.assign(xmp, Object.fromEntries(Object.entries(readXmp(x)).filter(([, v]) => v !== undefined)));
		const iptc: ReturnType<typeof readIptc> = {};
		for (const p of blocks.iptc.slice(0, 4)) Object.assign(iptc, readIptc(p));
		const png = blocks.text;

		const out: FileMeta = {};
		// Most specific first: what a person typed into an editor beats what a camera wrote.
		const caption = [xmp.description, iptc.caption, exif.description, png?.get('Description'), xmp.title, iptc.title, png?.get('Title')].map((v) => (v ? descriptive(v) : undefined)).find(Boolean);
		if (caption) out.caption = caption;
		const credit = [xmp.artist, iptc.byline, exif.artist, png?.get('Author'), xmp.copyright, iptc.copyright, exif.copyright, png?.get('Copyright')].map((v) => (v ? personal(v) : undefined)).find(Boolean);
		if (credit) out.credit = credit;
		const taken = [exif.original, xmp.original, iptc.date, exif.digitized, xmp.created, png?.get('Creation Time')].map((v) => (v ? dateOf(v) : undefined)).find(Boolean);
		if (taken) out.taken = taken;
		if (exif.location || xmp.location) out.hadLocation = true;
		return out;
	} catch {
		return {};
	}
}
