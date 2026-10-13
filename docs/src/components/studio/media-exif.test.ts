// @vitest-environment node
// The reader gets files built byte by byte, the way a camera, an editor and a hostile stranger would write
// them. A mock of the parser would agree with whatever it does, so every input here is real container bytes.
import { describe, expect, it } from 'vitest';
import { readFileMeta } from './media-exif';

const enc = new TextEncoder();
const bytes = (...parts: (number[] | Uint8Array | string)[]): Uint8Array => {
	const flat = parts.flatMap((p) => (typeof p === 'string' ? [...enc.encode(p)] : [...p]));
	return new Uint8Array(flat);
};
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

// ── a TIFF block (big-endian) ───────────────────────────────────────────────────────────────────────────

type Tag = { tag: number; ascii?: string; long?: number };
/** IFD0 holding `ifd0`, an Exif IFD holding `exif` and, when `gps` is given, a GPS IFD holding those tags. */
function tiff(ifd0: Tag[], exif: Tag[] = [], gps?: Tag[]): Uint8Array {
	const blocks: { at: number; body: number[] }[] = [];
	const heap: number[] = [];
	const heapAt = (n: number) => 8 + n; // patched below once the IFD sizes are known
	const sizeOf = (t: Tag[]) => 2 + t.length * 12 + 4;
	const ifd0Extra: Tag[] = [...ifd0];
	if (exif.length) ifd0Extra.push({ tag: 0x8769, long: 0 });
	if (gps) ifd0Extra.push({ tag: 0x8825, long: 0 });
	ifd0Extra.sort((a, b) => a.tag - b.tag);
	const ifd0Size = sizeOf(ifd0Extra);
	const exifAt = 8 + ifd0Size;
	const gpsAt = exifAt + (exif.length ? sizeOf(exif) : 0);
	const dataAt = gpsAt + (gps ? sizeOf(gps) : 0);
	const entries = (tags: Tag[], ptrs: Record<number, number> = {}): number[] => {
		const out = [...be16(tags.length)];
		for (const t of tags) {
			if (t.ascii !== undefined) {
				const v = [...enc.encode(t.ascii), 0];
				if (v.length <= 4) out.push(...be16(t.tag), ...be16(2), ...be32(v.length), ...v, ...Array(4 - v.length).fill(0));
				else {
					out.push(...be16(t.tag), ...be16(2), ...be32(v.length), ...be32(dataAt + heap.length));
					heap.push(...v);
				}
			} else out.push(...be16(t.tag), ...be16(4), ...be32(1), ...be32(ptrs[t.tag] ?? t.long ?? 0));
		}
		out.push(0, 0, 0, 0);
		return out;
	};
	const a = entries(ifd0Extra, { 34665: exifAt, 34853: gpsAt });
	const b = exif.length ? entries(exif) : [];
	const c = gps ? entries(gps) : [];
	void blocks;
	void heapAt;
	return bytes('MM', be16(42), be32(8), a, b, c, heap);
}

const GPS_LAT: Tag[] = [{ tag: 0x0001, ascii: 'N' }, { tag: 0x0002, long: 0 }];
const exifAscii = (t: Uint8Array) => bytes('Exif\0\0', t);

// ── containers ──────────────────────────────────────────────────────────────────────────────────────────

const seg = (marker: number, body: Uint8Array) => bytes([0xff, marker], be16(body.length + 2), body);
const jpeg = (...segments: Uint8Array[]) => bytes([0xff, 0xd8], ...segments, [0xff, 0xda, 0, 2], [1, 2, 3], [0xff, 0xd9]);

const xmpPacket = (inner: string) => `<?xpacket begin="" id="x"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">${inner}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
const alt = (name: string, v: string) => `<${name}><rdf:Alt><rdf:li xml:lang="x-default">${v}</rdf:li></rdf:Alt></${name}>`;
const jpegXmp = (inner: string) => seg(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', xmpPacket(inner)));

function iim(sets: [number, number, string | number[]][]): Uint8Array {
	const out: number[] = [];
	for (const [rec, set, v] of sets) {
		const b = typeof v === 'string' ? [...enc.encode(v)] : v;
		out.push(0x1c, rec, set, ...be16(b.length), ...b);
	}
	return new Uint8Array(out);
}
const jpegIptc = (sets: [number, number, string | number[]][]) => {
	const data = iim(sets);
	const pad = data.length % 2 ? [0] : [];
	return seg(0xed, bytes('Photoshop 3.0\0', '8BIM', be16(0x0404), [0, 0], be32(data.length), data, pad));
};

const pngChunk = (type: string, body: Uint8Array) => bytes(be32(body.length), type, body, [0, 0, 0, 0]);
const png = (...chunks: Uint8Array[]) => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk('IHDR', new Uint8Array(13)), ...chunks, pngChunk('IDAT', bytes([1, 2, 3])), pngChunk('IEND', new Uint8Array(0)));
const itxtXmp = (inner: string, compressed = false) => pngChunk('iTXt', bytes('XML:com.adobe.xmp', [0, compressed ? 1 : 0, 0], [0], [0], xmpPacket(inner)));
const text = (k: string, v: string) => pngChunk('tEXt', bytes(k, [0], v));

const riff = (type: string, body: Uint8Array) => bytes(type, le32(body.length), body, body.length % 2 ? [0] : []);
const webp = (...chunks: Uint8Array[]) => {
	const inner = bytes('WEBP', riff('VP8 ', new Uint8Array(10)), ...chunks);
	return bytes('RIFF', le32(inner.length), inner);
};

// ── tests ───────────────────────────────────────────────────────────────────────────────────────────────

describe('JPEG EXIF', () => {
	it('reads the description, artist and date taken from a phone-style block', () => {
		const t = tiff([{ tag: 0x010e, ascii: 'The team on the roof' }, { tag: 0x013b, ascii: 'Ada Lovelace' }], [{ tag: 0x9003, ascii: '2026:03:04 09:15:00' }]);
		expect(readFileMeta(jpeg(seg(0xe1, exifAscii(t))))).toEqual({ caption: 'The team on the roof', credit: 'Ada Lovelace', taken: '2026-03-04' });
	});

	it('reports that a location was there and never its value', () => {
		const t = tiff([{ tag: 0x010e, ascii: 'A door in the hall' }], [], GPS_LAT);
		const out = readFileMeta(jpeg(seg(0xe1, exifAscii(t))));
		expect(out).toEqual({ caption: 'A door in the hall', hadLocation: true });
		expect(JSON.stringify(out)).not.toMatch(/\d{2}\.\d{3}/);
	});

	it('does not call a bare GPS version a location', () => {
		const t = tiff([], [], [{ tag: 0x0000, long: 0 }]);
		expect(readFileMeta(jpeg(seg(0xe1, exifAscii(t))))).toEqual({});
	});

	it('uses the copyright as the credit when there is no artist, without the © sign', () => {
		const t = tiff([{ tag: 0x8298, ascii: '© 2026 Ada Lovelace' }]);
		expect(readFileMeta(jpeg(seg(0xe1, exifAscii(t)))).credit).toBe('2026 Ada Lovelace');
	});

	it('takes the original date over the digitized one, and never the modified date', () => {
		const t = tiff([{ tag: 0x0132, ascii: '2030:01:01 00:00:00' }], [{ tag: 0x9004, ascii: '2025:06:07 10:00:00' }, { tag: 0x9003, ascii: '2025:06:06 10:00:00' }]);
		expect(readFileMeta(jpeg(seg(0xe1, exifAscii(t)))).taken).toBe('2025-06-06');
		const modifiedOnly = tiff([{ tag: 0x0132, ascii: '2030:01:01 00:00:00' }]);
		expect(readFileMeta(jpeg(seg(0xe1, exifAscii(modifiedOnly)))).taken).toBeUndefined();
	});

	it('reads UTF-8 text as UTF-8', () => {
		const t = tiff([{ tag: 0x010e, ascii: 'Café au lait, Zürich' }]);
		expect(readFileMeta(jpeg(seg(0xe1, exifAscii(t)))).caption).toBe('Café au lait, Zürich');
	});
});

describe('JPEG XMP and IPTC', () => {
	it('prefers an XMP description to the camera default in EXIF', () => {
		const t = tiff([{ tag: 0x010e, ascii: 'SONY DSC' }]);
		const out = readFileMeta(jpeg(seg(0xe1, exifAscii(t)), jpegXmp(alt('dc:description', 'Launch day &amp; the whole crew'))));
		expect(out.caption).toBe('Launch day & the whole crew');
	});

	it('reads the creator, the title as a fallback, and the date from XMP', () => {
		const out = readFileMeta(jpeg(jpegXmp(`${alt('dc:title', 'Sunrise over the bay')}<dc:creator><rdf:Seq><rdf:li>Grace Hopper</rdf:li></rdf:Seq></dc:creator><photoshop:DateCreated>2024-11-02T07:30:00</photoshop:DateCreated>`)));
		expect(out).toEqual({ caption: 'Sunrise over the bay', credit: 'Grace Hopper', taken: '2024-11-02' });
	});

	it('reads an attribute-form property', () => {
		const packet = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="r"><rdf:Description xmlns:exif="e" exif:DateTimeOriginal="2023-05-06T01:02:03"/></rdf:RDF></x:xmpmeta>`;
		expect(readFileMeta(jpeg(seg(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', packet)))).taken).toBe('2023-05-06');
	});

	it('flags a location written as XMP text, without reading it', () => {
		const out = readFileMeta(jpeg(jpegXmp('<exif:GPSLatitude>51,30.1N</exif:GPSLatitude>')));
		expect(out).toEqual({ hadLocation: true });
	});

	it('reads IPTC caption, byline and date', () => {
		const out = readFileMeta(jpeg(jpegIptc([[2, 120, 'Crowds at the harbor festival'], [2, 80, 'Katherine Johnson'], [2, 55, '20220815']])));
		expect(out).toEqual({ caption: 'Crowds at the harbor festival', credit: 'Katherine Johnson', taken: '2022-08-15' });
	});

	it('reads IPTC as UTF-8 only when the file says so', () => {
		const utf = readFileMeta(jpeg(jpegIptc([[1, 90, [0x1b, 0x25, 0x47]], [2, 120, 'Zürich skyline']])));
		expect(utf.caption).toBe('Zürich skyline');
		const latin = readFileMeta(jpeg(jpegIptc([[2, 120, [...enc.encode('Z'), 0xfc, ...enc.encode('rich skyline')]]])));
		expect(latin.caption).toBe('Zürich skyline');
	});

	it('decodes XML entities and drops tags and CDATA wrappers, so text is never markup', () => {
		const out = readFileMeta(jpeg(jpegXmp(alt('dc:description', '&lt;b&gt;bold&lt;/b&gt; &#169; <![CDATA[x < y]]>'))));
		expect(out.caption).toBe('<b>bold</b> © x < y');
	});
});

describe('PNG and WebP', () => {
	it('reads an eXIf chunk, an uncompressed XMP iTXt chunk and tEXt fields', () => {
		const t = tiff([{ tag: 0x013b, ascii: 'Linus T.' }], [{ tag: 0x9003, ascii: '2021:09:10 12:00:00' }]);
		expect(readFileMeta(png(pngChunk('eXIf', t)))).toEqual({ credit: 'Linus T.', taken: '2021-09-10' });
		expect(readFileMeta(png(itxtXmp(alt('dc:description', 'A diagram of the pipeline')))).caption).toBe('A diagram of the pipeline');
		expect(readFileMeta(png(text('Description', 'Quarterly revenue chart'), text('Author', 'Finance team'), text('Creation Time', '2024-01-31'))))
			.toEqual({ caption: 'Quarterly revenue chart', credit: 'Finance team', taken: '2024-01-31' });
	});

	it('skips a compressed XMP packet instead of inflating it', () => {
		expect(readFileMeta(png(itxtXmp(alt('dc:description', 'Should not be read'), true)))).toEqual({});
	});

	it('reads a chunk that sits after the picture data', () => {
		const t = tiff([{ tag: 0x010e, ascii: 'Late metadata' }]);
		const file = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk('IHDR', new Uint8Array(13)), pngChunk('IDAT', bytes([1])), pngChunk('eXIf', t), pngChunk('IEND', new Uint8Array(0)));
		expect(readFileMeta(file).caption).toBe('Late metadata');
	});

	it('reads WebP EXIF (with or without the Exif header) and XMP', () => {
		const t = tiff([{ tag: 0x010e, ascii: 'A WebP caption' }], [], GPS_LAT);
		expect(readFileMeta(webp(riff('EXIF', t)))).toEqual({ caption: 'A WebP caption', hadLocation: true });
		expect(readFileMeta(webp(riff('EXIF', exifAscii(t)))).caption).toBe('A WebP caption');
		expect(readFileMeta(webp(riff('XMP ', enc.encode(xmpPacket(alt('dc:description', 'XMP in WebP')))))).caption).toBe('XMP in WebP');
	});
});

describe('what is not a description', () => {
	const cap = (s: string) => readFileMeta(jpeg(seg(0xe1, exifAscii(tiff([{ tag: 0x010e, ascii: s }]))))).caption;

	it('rejects a camera or editor default, a file name and a bare number', () => {
		for (const junk of ['OLYMPUS DIGITAL CAMERA', 'SONY DSC', 'Canon', 'IMG_2041', 'DSC00123', 'PXL_20260304_091500', 'Screenshot', 'Untitled', 'Created with GIMP', 'Processed with VSCO', 'Adobe Photoshop', 'team-photo.jpg', '20260304', ' ', 'ab']) {
			expect(cap(junk), junk).toBeUndefined();
		}
	});

	it('keeps a real sentence that merely starts with a camera word', () => {
		expect(cap('Canon hill at dusk')).toBe('Canon hill at dusk');
		expect(cap('Image of the new lobby')).toBe('Image of the new lobby');
	});

	it('cuts a long description at a word, with an ellipsis, inside 140 characters', () => {
		const long = `${'The whole team gathered on the roof terrace for the launch photo '.repeat(4)}`;
		const out = cap(long) as string;
		expect(out.length).toBeLessThanOrEqual(140);
		expect(out.endsWith('…')).toBe(true);
		expect(out).not.toMatch(/\s…$/);
	});

	it('puts control characters and line breaks to one clean line', () => {
		expect(cap(`Line one\r\nLine two${String.fromCharCode(1)}${String.fromCharCode(0x202e)} end`)).toBe('Line one Line two end');
	});

	it('rejects an impossible date and accepts a leap day', () => {
		const date = (d: string) => readFileMeta(jpeg(seg(0xe1, exifAscii(tiff([], [{ tag: 0x9003, ascii: d }]))))).taken;
		expect(date('2026:99:99 00:00:00')).toBeUndefined();
		expect(date('0000:00:00 00:00:00')).toBeUndefined();
		expect(date('2026:02:29 10:00:00')).toBeUndefined();
		expect(date('2024:02:29 10:00:00')).toBe('2024-02-29');
	});
});

describe('hostile and broken files', () => {
	it('gives {} for something that is not an image, an empty file and a lone signature', () => {
		for (const b of [new Uint8Array(0), bytes('hello world, I am text'), bytes([0xff, 0xd8]), bytes([0x89, 0x50, 0x4e, 0x47])]) expect(readFileMeta(b)).toEqual({});
	});

	it('survives every truncation of a valid file', () => {
		const t = tiff([{ tag: 0x010e, ascii: 'A caption that is long enough to matter' }, { tag: 0x013b, ascii: 'Someone Long' }], [{ tag: 0x9003, ascii: '2026:03:04 09:15:00' }], GPS_LAT);
		const file = jpeg(seg(0xe1, exifAscii(t)), jpegXmp(alt('dc:description', 'x'.repeat(40))), jpegIptc([[2, 120, 'Caption here']]));
		for (let n = 0; n <= file.length; n++) expect(() => readFileMeta(file.subarray(0, n))).not.toThrow();
		for (const f of [png(pngChunk('eXIf', t), itxtXmp(alt('dc:description', 'x'))), webp(riff('EXIF', t))]) for (let n = 0; n <= f.length; n++) expect(() => readFileMeta(f.subarray(0, n))).not.toThrow();
	});

	it('survives an IFD whose offsets point outside the block, and a count that overruns', () => {
		const evil = bytes('MM', be16(42), be32(8), be16(3), [0x01, 0x0e, 0, 2], be32(0xffffff), be32(0x7fffffff), [0x01, 0x3b, 0, 2], be32(10), be32(100000), [0x87, 0x69, 0, 4], be32(1), be32(0xfffffff0), [0, 0, 0, 0]);
		expect(readFileMeta(jpeg(seg(0xe1, exifAscii(evil))))).toEqual({});
	});

	it('survives an IFD that points back at itself', () => {
		const loop = bytes('MM', be16(42), be32(8), be16(1), [0x87, 0x69, 0, 4], be32(1), be32(8), [0, 0, 0, 0]);
		expect(() => readFileMeta(jpeg(seg(0xe1, exifAscii(loop))))).not.toThrow();
	});

	it('survives a segment length that lies and a marker storm', () => {
		expect(readFileMeta(bytes([0xff, 0xd8], [0xff, 0xe1, 0xff, 0xff], 'Exif\0\0junk'))).toEqual({});
		expect(readFileMeta(bytes([0xff, 0xd8], new Array(5000).fill(0xff)))).toEqual({});
	});

	it('does not run away on a huge XMP packet or a pathological one', () => {
		const big = `<dc:description>${'<rdf:li>'.repeat(40000)}</dc:description>`;
		const start = Date.now();
		readFileMeta(jpeg(jpegXmp(big)));
		readFileMeta(jpeg(seg(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', `<dc:description ${'a="'.repeat(30000)}`))));
		expect(Date.now() - start).toBeLessThan(2000);
	});

	it('never puts markup or a script into a value as anything but text', () => {
		const out = readFileMeta(jpeg(jpegXmp(alt('dc:description', '&lt;img src=x onerror=alert(1)&gt;')))).caption;
		expect(out).toBe('<img src=x onerror=alert(1)>');
	});
});

describe('XMP is read in linear time', () => {
	// The checker's inputs: each of these took seconds to minutes with the first regex-based reader.
	const timed = (file: Uint8Array) => {
		const start = performance.now();
		readFileMeta(file);
		return performance.now() - start;
	};
	const MAX = 262_144;
	const packetOf = (inner: string) => bytes('http://ns.adobe.com/xap/1.0/\0', inner);

	it('does not slow down on a run of "<" with no ">"', () => {
		const inner = `<dc:description>${'<'.repeat(60_000)}</dc:description>`;
		expect(timed(jpeg(seg(0xe1, packetOf(inner))))).toBeLessThan(300);
		// The same packet four times in one PNG, at the size the reader accepts.
		const big = `<dc:description>${'<'.repeat(MAX - 50)}</dc:description>`;
		expect(timed(png(itxtXmp(big), itxtXmp(big), itxtXmp(big), itxtXmp(big)))).toBeLessThan(1500);
	});

	it('does not slow down on repeated unterminated openings, attributes or CDATA', () => {
		for (const piece of ['<dc:description a', '<![CDATA[', '<dc:description>', '<rdf:li>', 'dc:title ', 'dc:description  ', '<!--']) {
			const inner = piece.repeat(Math.floor((MAX - 100) / piece.length));
			expect(timed(png(itxtXmp(inner), itxtXmp(inner), itxtXmp(inner), itxtXmp(inner))), piece).toBeLessThan(1500);
		}
	});

	it('still reads the value after an unrelated element that looks a little like it', () => {
		const out = readFileMeta(jpeg(jpegXmp(`<dc:description2>decoy</dc:description2>${alt('dc:description', 'The real one')}`)));
		expect(out.caption).toBe('The real one');
	});
});

describe('text read from a file is well formed', () => {
	it('never ends in half an emoji, and drops a lone surrogate written as an entity', () => {
		const t = tiff([{ tag: 0x010e, ascii: `${'a'.repeat(137)} \u{1F600}\u{1F600}\u{1F600} tail` }]);
		const cap = readFileMeta(jpeg(seg(0xe1, exifAscii(t)))).caption as string;
		expect(cap.isWellFormed()).toBe(true);
		const viaEntity = readFileMeta(jpeg(jpegXmp(alt('dc:description', 'bad &#xD800; unit &#55357; here')))).caption as string;
		expect(viaEntity.isWellFormed()).toBe(true);
		expect(viaEntity).toBe('bad unit here');
	});

	it('strips the hidden characters a stored description would lose anyway', () => {
		const hidden = `x\u3164y\u2800z${String.fromCodePoint(0xe0100)}w`;
		expect(readFileMeta(jpeg(jpegXmp(alt('dc:description', hidden)))).caption).toBe('xyzw');
	});
});

describe('location flags in XMP', () => {
	it('flags an element or an attribute, and not a description that merely mentions the tag', () => {
		expect(readFileMeta(jpeg(jpegXmp('<exif:GPSLatitude>51,30N</exif:GPSLatitude>'))).hadLocation).toBe(true);
		const attr = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="r"><rdf:Description\n  exif:GPSLongitude = "0,7W"/></rdf:RDF></x:xmpmeta>';
		expect(readFileMeta(jpeg(seg(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', attr)))).hadLocation).toBe(true);
		const said = readFileMeta(jpeg(jpegXmp(alt('dc:description', 'We discussed exif:GPSLatitude handling at the offsite'))));
		expect(said.hadLocation).toBeUndefined();
		expect(said.caption).toContain('offsite');
	});
});

describe('location flags', () => {
	it('flags a longitude-only XMP packet, and an IFD pointer written as type IFD (13)', () => {
		expect(readFileMeta(jpeg(jpegXmp('<exif:GPSLongitude>0,7.5W</exif:GPSLongitude>')))).toEqual({ hadLocation: true });
		// A TIFF whose GPS pointer entry has type 13: patch the type word of the 0x8825 entry in a normal block.
		const t = tiff([{ tag: 0x010e, ascii: 'A caption here' }], [], GPS_LAT);
		const idx = [...t].findIndex((_, i) => t[i] === 0x88 && t[i + 1] === 0x25);
		const patched = new Uint8Array(t);
		patched[idx + 3] = 13;
		expect(readFileMeta(jpeg(seg(0xe1, exifAscii(patched))))).toEqual({ caption: 'A caption here', hadLocation: true });
	});
});
