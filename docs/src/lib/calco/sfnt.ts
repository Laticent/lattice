/**
 * Two sfnt (TrueType/OpenType) operations PowerPoint needs and an office suite does not:
 *
 *  - `renameFace` gives a face its own family name. PowerPoint's font model is a family
 *    with four slots (regular, bold, italic, bold italic), so Outfit 300, 500 and 600 have
 *    nowhere to go. Each such weight is embedded as a family of its own ("Outfit Medium")
 *    in its regular slot, and its runs ask for that family by name.
 *  - `toEot` wraps a face as Embedded OpenType, the container PowerPoint stores in
 *    `ppt/fonts/*.fntdata`. Version 2.1, no compression, no XOR: the TrueType bytes follow
 *    the header unchanged, which libeot (what LibreOffice links) decodes byte for byte.
 *
 * Pure and dependency-free, like the rest of Calco. All offsets are from the OpenType and
 * EOT specifications (https://www.w3.org/Submission/EOT/).
 */

interface Table {
	tag: string;
	data: Uint8Array;
}

function readTables(bytes: Uint8Array): { flavor: number; tables: Table[] } {
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const flavor = v.getUint32(0);
	const n = v.getUint16(4);
	const tables: Table[] = [];
	for (let i = 0; i < n; i++) {
		const rec = 12 + i * 16;
		const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
		const off = v.getUint32(rec + 8);
		const len = v.getUint32(rec + 12);
		if (off + len > bytes.length) throw new Error(`calco: table ${tag} runs past the font`);
		tables.push({ tag, data: bytes.slice(off, off + len) });
	}
	return { flavor, tables };
}

function checksum(data: Uint8Array): number {
	let sum = 0;
	const padded = data.length % 4 ? new Uint8Array(data.length + (4 - (data.length % 4))) : data;
	if (padded !== data) padded.set(data);
	const v = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
	for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
	return sum;
}

function writeTables(flavor: number, tables: Table[]): Uint8Array {
	const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
	const n = sorted.length;
	let entrySelector = 0;
	while (2 ** (entrySelector + 1) <= n) entrySelector++;
	const searchRange = 2 ** entrySelector * 16;
	const headerLen = 12 + n * 16;
	let total = headerLen;
	for (const t of sorted) total += (t.data.length + 3) & ~3;
	const out = new Uint8Array(total);
	const v = new DataView(out.buffer);
	v.setUint32(0, flavor);
	v.setUint16(4, n);
	v.setUint16(6, searchRange);
	v.setUint16(8, entrySelector);
	v.setUint16(10, n * 16 - searchRange);
	let at = headerLen;
	let headAt = -1;
	sorted.forEach((t, i) => {
		const rec = 12 + i * 16;
		for (let k = 0; k < 4; k++) out[rec + k] = t.tag.charCodeAt(k);
		if (t.tag === 'head') {
			// checkSumAdjustment is computed over the whole font with this field zeroed.
			new DataView(t.data.buffer, t.data.byteOffset, t.data.byteLength).setUint32(8, 0);
			headAt = at;
		}
		v.setUint32(rec + 4, checksum(t.data));
		v.setUint32(rec + 8, at);
		v.setUint32(rec + 12, t.data.length);
		out.set(t.data, at);
		at += (t.data.length + 3) & ~3;
	});
	if (headAt >= 0) v.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
	return out;
}

function utf16be(s: string): Uint8Array {
	const out = new Uint8Array(s.length * 2);
	for (let i = 0; i < s.length; i++) {
		out[i * 2] = s.charCodeAt(i) >> 8;
		out[i * 2 + 1] = s.charCodeAt(i) & 0xff;
	}
	return out;
}

/** Name IDs a rename replaces: the family, style, unique, full, version and PostScript names, and the typographic and variations names that would contradict them. */
const RENAMED_IDS = new Set([1, 2, 3, 4, 5, 6, 16, 17, 21, 22, 25]);

interface NameRecord {
	platform: number;
	encoding: number;
	language: number;
	id: number;
	bytes: Uint8Array;
}

/** Every record of a name table, so a rename can keep the copyright, license and the names STAT and the stylistic sets point at. */
function nameRecords(t: Table | undefined): NameRecord[] {
	if (!t || t.data.length < 6) return [];
	const v = new DataView(t.data.buffer, t.data.byteOffset, t.data.byteLength);
	const count = v.getUint16(2);
	const storage = v.getUint16(4);
	const out: NameRecord[] = [];
	for (let i = 0; i < count && 6 + i * 12 + 12 <= t.data.length; i++) {
		const r = 6 + i * 12;
		const len = v.getUint16(r + 8);
		const off = storage + v.getUint16(r + 10);
		if (off + len > t.data.length) continue;
		out.push({ platform: v.getUint16(r), encoding: v.getUint16(r + 2), language: v.getUint16(r + 4), id: v.getUint16(r + 6), bytes: t.data.slice(off, off + len) });
	}
	return out;
}

/**
 * The name table a renamed face carries: its own Windows (Unicode BMP, US English) records
 * for the IDs a rename owns, and every other record of the original kept as it was.
 */
function nameTable(family: string, version: string, keep: NameRecord[] = []): Uint8Array {
	const ps = family.replace(/[^A-Za-z0-9-]/g, '');
	const records: Array<[number, string]> = [
		[1, family],
		[2, 'Regular'],
		[3, `${ps};Calco`],
		[4, family],
		[5, version],
		[6, ps || 'CalcoFace'],
	];
	const all: NameRecord[] = [
		...keep.filter((r) => !RENAMED_IDS.has(r.id)),
		...records.map(([id, text]) => ({ platform: 3, encoding: 1, language: 0x409, id, bytes: utf16be(text) })),
	];
	// The spec orders records by platform, encoding, language, then name ID.
	all.sort((a, b) => a.platform - b.platform || a.encoding - b.encoding || a.language - b.language || a.id - b.id);
	const headerLen = 6 + all.length * 12;
	const total = headerLen + all.reduce((n, r) => n + r.bytes.length, 0);
	const out = new Uint8Array(total);
	const v = new DataView(out.buffer);
	v.setUint16(0, 0);
	v.setUint16(2, all.length);
	v.setUint16(4, headerLen);
	let off = 0;
	all.forEach((rec, i) => {
		const r = 6 + i * 12;
		v.setUint16(r, rec.platform);
		v.setUint16(r + 2, rec.encoding);
		v.setUint16(r + 4, rec.language);
		v.setUint16(r + 6, rec.id);
		v.setUint16(r + 8, rec.bytes.length);
		v.setUint16(r + 10, off);
		out.set(rec.bytes, headerLen + off);
		off += rec.bytes.length;
	});
	return out;
}

/** The version string from a face's own name table, or a neutral one. */
function versionOf(tables: Table[]): string {
	const t = tables.find((x) => x.tag === 'name');
	if (!t) return 'Version 1.0';
	const v = new DataView(t.data.buffer, t.data.byteOffset, t.data.byteLength);
	const count = v.getUint16(2);
	const storage = v.getUint16(4);
	for (let i = 0; i < count; i++) {
		const r = 6 + i * 12;
		if (v.getUint16(r + 6) !== 5 || v.getUint16(r) !== 3) continue;
		const len = v.getUint16(r + 8);
		const off = storage + v.getUint16(r + 10);
		let s = '';
		for (let k = 0; k + 1 < len && off + k + 1 < t.data.length; k += 2) s += String.fromCharCode((t.data[off + k] << 8) | t.data[off + k + 1]);
		if (s) return s;
	}
	return 'Version 1.0';
}

/**
 * The same face under its own family name, as that family's REGULAR face: the name table
 * is rewritten, OS/2 `fsSelection` says Regular, `head.macStyle` is cleared. The outlines,
 * metrics and weight class are untouched.
 */
export function renameFace(bytes: Uint8Array, family: string): Uint8Array {
	const { flavor, tables } = readTables(bytes);
	const version = versionOf(tables);
	const next = tables.map((t) => {
		if (t.tag === 'name') return { tag: 'name', data: nameTable(family, version, nameRecords(t)) };
		if (t.tag === 'OS/2' && t.data.length >= 64) {
			const d = t.data.slice();
			const v = new DataView(d.buffer);
			// Keep USE_TYPO_METRICS (bit 7) and the rest; set REGULAR (bit 6), clear ITALIC (0) and BOLD (5).
			v.setUint16(62, (v.getUint16(62) & ~0x0021) | 0x0040);
			return { tag: t.tag, data: d };
		}
		if (t.tag === 'head' && t.data.length >= 46) {
			const d = t.data.slice();
			new DataView(d.buffer).setUint16(44, 0); // macStyle: not bold, not italic
			return { tag: t.tag, data: d };
		}
		return t;
	});
	if (!next.some((t) => t.tag === 'name')) next.push({ tag: 'name', data: nameTable(family, version) });
	return writeTables(flavor, next);
}

/** The family name inside a face's name table (nameID 1, Windows), for tests and checks. */
export function familyNameOf(bytes: Uint8Array): string | null {
	const { tables } = readTables(bytes);
	const t = tables.find((x) => x.tag === 'name');
	if (!t) return null;
	const v = new DataView(t.data.buffer, t.data.byteOffset, t.data.byteLength);
	const count = v.getUint16(2);
	const storage = v.getUint16(4);
	for (let i = 0; i < count; i++) {
		const r = 6 + i * 12;
		if (v.getUint16(r + 6) !== 1 || v.getUint16(r) !== 3) continue;
		const len = v.getUint16(r + 8);
		const off = storage + v.getUint16(r + 10);
		let s = '';
		for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode((t.data[off + k] << 8) | t.data[off + k + 1]);
		return s;
	}
	return null;
}

function utf16le(s: string): Uint8Array {
	const out = new Uint8Array(s.length * 2);
	for (let i = 0; i < s.length; i++) {
		out[i * 2] = s.charCodeAt(i) & 0xff;
		out[i * 2 + 1] = s.charCodeAt(i) >> 8;
	}
	return out;
}

/**
 * Whether `toEot` can wrap a face: TrueType outlines (an EOT holds no CFF), a table
 * directory that reads, an OS/2 of version 1 or later (it carries the code-page ranges the
 * header repeats) and a head table. A face that fails is named, not embedded.
 */
export function canEmbedAsEot(bytes: Uint8Array): boolean {
	if (bytes.length < 12 || bytes[0] !== 0x00 || bytes[1] !== 0x01 || bytes[2] !== 0x00 || bytes[3] !== 0x00) return false;
	try {
		const { tables } = readTables(bytes);
		const os2 = tables.find((t) => t.tag === 'OS/2')?.data;
		const head = tables.find((t) => t.tag === 'head')?.data;
		return !!os2 && os2.length >= 86 && !!head && head.length >= 54;
	} catch {
		return false;
	}
}

/**
 * Wrap a TrueType face as Embedded OpenType 2.1: an uncompressed, unobfuscated header that
 * repeats the face's own OS/2 and head facts, its names, then the font data as is.
 */
export function toEot(ttf: Uint8Array, names: { family: string; style?: string; full?: string }): Uint8Array {
	const { tables } = readTables(ttf);
	const os2 = tables.find((t) => t.tag === 'OS/2')?.data;
	const head = tables.find((t) => t.tag === 'head')?.data;
	if (!os2 || os2.length < 86 || !head) throw new Error('calco: a face without OS/2 or head cannot be embedded');
	const o = new DataView(os2.buffer, os2.byteOffset, os2.byteLength);
	const h = new DataView(head.buffer, head.byteOffset, head.byteLength);
	const strs = [names.family, names.style || 'Regular', versionOf(tables), names.full || names.family, ''].map(utf16le);
	const fixed = 82; // through Reserved4 (ends at byte 80) + Padding1 (2)
	const variable = strs.reduce((n, s, i) => n + 2 + s.length + (i < strs.length - 1 ? 2 : 0), 0);
	const headerLen = fixed + variable;
	const total = headerLen + ttf.length;
	const out = new Uint8Array(total);
	const v = new DataView(out.buffer);
	v.setUint32(0, total, true); // EOTSize
	v.setUint32(4, ttf.length, true); // FontDataSize
	v.setUint32(8, 0x00020001, true); // Version 2.1
	v.setUint32(12, 0, true); // Flags: no subsetting, no compression, no XOR
	out.set(os2.subarray(32, 42), 16); // PANOSE
	out[26] = 1; // Charset: DEFAULT_CHARSET
	out[27] = o.getUint16(62) & 0x01 ? 1 : 0; // Italic
	v.setUint32(28, o.getUint16(4), true); // Weight
	v.setUint16(32, o.getUint16(8), true); // fsType
	v.setUint16(34, 0x504c, true); // MagicNumber
	for (let i = 0; i < 4; i++) v.setUint32(36 + i * 4, o.getUint32(42 + i * 4), true); // UnicodeRange1-4
	v.setUint32(52, o.getUint32(78), true); // CodePageRange1
	v.setUint32(56, o.getUint32(82), true); // CodePageRange2
	v.setUint32(60, h.getUint32(8), true); // CheckSumAdjustment
	// 64..79 Reserved1-4, 80..81 Padding1: zero.
	let at = fixed;
	strs.forEach((s, i) => {
		v.setUint16(at, s.length, true);
		out.set(s, at + 2);
		at += 2 + s.length;
		if (i < strs.length - 1) at += 2; // Padding2..Padding5
	});
	out.set(ttf, at);
	return out;
}
