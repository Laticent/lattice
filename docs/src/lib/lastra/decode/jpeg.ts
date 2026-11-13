/**
 * JPEG to RGBA (engineering/decisions/2026-11-13-image-library.md §3, slice 4).
 *
 * Decodes: baseline and extended sequential (SOF0, SOF1) and progressive (SOF2) frames, 8-bit, Huffman
 * coded; spectral selection and successive approximation; restart intervals; one, three or four
 * components; any integer chroma sampling (4:4:4, 4:2:2, 4:2:0, 4:4:0, 4:1:1, ...) at any size; the
 * Adobe APP14 transform (RGB, YCbCr, CMYK, YCCK); the Annex K tables when a Huffman table is missing
 * (Motion-JPEG frames), as libjpeg-turbo does.
 *
 * Matches libjpeg-turbo's default decode, which is what Chromium, Firefox and Pillow run: the accurate
 * integer IDCT, "fancy" upsampling and its YCbCr tables (jpeg-idct.ts, jpeg-sample.ts). Four-component
 * files decode as Adobe-inverted CMYK to RGB with no color management, the formula Pillow and Chromium
 * both use when a file carries no ICC profile. EXIF orientation is not applied (the reader reports it).
 *
 * Refuses, with a `LastraError`:
 * - `unsupported`: arithmetic coding (SOF9 to SOF15), lossless (SOF3), hierarchical (SOF5 to SOF7),
 *   12- or 16-bit samples, a height of 0 (set later by DNL), two components or more than four, a sampling
 *   ratio that is not a whole number.
 * - `truncated`: the file ends before EOI, inside a segment or inside a scan (Pillow refuses these too).
 * - `bad-marker`: no SOI, a segment length under 2 or past its contents, an unknown marker, a scan before
 *   its frame, a second frame.
 * - `corrupt`: an impossible frame, table or scan header; an over-full Huffman table; a progressive scan
 *   out of sequence (stricter than libjpeg, which warns and goes on: refusing is what bounds the work
 *   any input can cost); a component in two sequential scans.
 * - `too-large`: over `maxPixels` or `maxBytes`, checked on the frame header before allocating.
 *
 * Corrupt entropy-coded data inside a scan is not a refusal, as in libjpeg: a bad Huffman code decodes as
 * symbol 0, and once a scan's data runs out at a marker, the rest of the scan (up to the next restart
 * marker) leaves its coefficients as they are.
 *
 * Every loop is bounded by the input length or the block count: each coefficient of each component can
 * be in at most 14 progressive scans (one first pass and 13 refinements), and a scan whose data ran out
 * skips to its next restart marker in one step. `opts.meter` counts the steps.
 */

import { LastraError } from './errors.js';
import { CB_B, CB_G, CR_G, CR_R, idctIslow } from './jpeg-idct.js';
import { type Plane, upsample } from './jpeg-sample.js';
import { allocating, checkPixels, resolveLimits, tick } from './limits.js';
import type { DecodedImage, DecodeOptions, WorkMeter } from './types.js';

/** Zigzag position to natural (row-major) position, with 16 extra entries for the decoder's overrun. */
const NATURAL = new Int32Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63,
]);

interface Huffman {
  /** 9-bit lookahead: (length << 8) | symbol, or 0 when the code is longer than 9 bits. */
  fast: Uint16Array;
  /** Largest code of each length 1..16, or -1; index 17 is a sentinel. */
  maxcode: Int32Array;
  /** Symbol index of a code of each length: code + valoffset[length]. */
  valoffset: Int32Array;
  symbols: Uint8Array;
}

interface Component {
  id: number;
  h: number;
  v: number;
  tq: number;
  /** Real samples of this component (libjpeg's downsampled_width and _height). */
  dw: number;
  dh: number;
  /** Blocks covering the real samples; a non-interleaved scan visits exactly these. */
  bw: number;
  bh: number;
  /** Blocks per row in the coefficient store (padded to whole MCUs). */
  stride: number;
  coefs: Int16Array;
  /** The quantization table latched at the component's first scan, natural order. */
  quant: Uint16Array | null;
  /** Progressive: the successive-approximation bit last coded for each coefficient, -1 for never. */
  coefBits: Int8Array;
  scanned: boolean;
  pred: number;
  dc: Huffman | null;
  ac: Huffman | null;
}

interface Frame {
  progressive: boolean;
  width: number;
  height: number;
  hmax: number;
  vmax: number;
  mcusX: number;
  mcusY: number;
  comps: Component[];
}

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

/** Decode a JPEG to RGBA. Synchronous; `async` only so it shares `decodePng`'s signature. */
export async function decodeJpeg(bytes: Uint8Array, opts?: DecodeOptions): Promise<DecodedImage> {
  return decodeJpegSync(bytes, opts);
}

export function decodeJpegSync(bytes: Uint8Array, opts?: DecodeOptions): DecodedImage {
  const limits = resolveLimits(bytes, opts);
  const meter = limits.meter;
  const len = bytes.length;
  if (len < 2) throw new LastraError('truncated', 'the file ends before SOI');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new LastraError('bad-marker', 'not a JPEG: no SOI marker');

  const quant: (Uint16Array | null)[] = [null, null, null, null];
  const dcTables: (Huffman | null)[] = [null, null, null, null];
  const acTables: (Huffman | null)[] = [null, null, null, null];
  let frame: Frame | null = null;
  let restartInterval = 0;
  let jfif = false;
  let adobeTransform = -1;

  let pos = 2;
  for (;;) {
    tick(meter);
    // Find the next marker. libjpeg skips stray bytes before one (with a warning); so does this.
    while (pos < len && bytes[pos] !== 0xff) pos++;
    while (pos < len && bytes[pos] === 0xff) pos++;
    if (pos >= len) throw new LastraError('truncated', 'the file ends before EOI');
    const marker = bytes[pos++];
    if (marker === 0) continue; // FF 00 between segments is stray data; libjpeg's next_marker skips it too
    if (marker === 0xd9) break; // EOI
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue; // RSTn, TEM: no length
    if (marker === 0xd8) throw new LastraError('bad-marker', 'a second SOI');
    if (pos + 2 > len) throw new LastraError('truncated', `the file ends inside the 0x${marker.toString(16)} marker's length`);
    const length = u16(bytes, pos);
    if (length < 2) throw new LastraError('bad-marker', `marker 0x${marker.toString(16)} has length ${length}`);
    const start = pos + 2;
    const end = pos + length;
    if (end > len) throw new LastraError('truncated', `the file ends inside the 0x${marker.toString(16)} segment`);
    pos = end;

    if (marker === 0xdb) {
      readQuant(bytes, start, end, quant);
    } else if (marker === 0xc4) {
      readHuffman(bytes, start, end, dcTables, acTables);
    } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (frame) throw new LastraError('bad-marker', 'a second frame header');
      frame = readFrame(bytes, start, end, marker === 0xc2);
      checkPixels(frame.width, frame.height, limits);
      allocate(frame);
    } else if (marker === 0xc3 || (marker >= 0xc5 && marker <= 0xc7)) {
      throw new LastraError('unsupported', `lossless or hierarchical JPEG (SOF 0x${marker.toString(16)})`);
    } else if (marker === 0xc8 || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      throw new LastraError('unsupported', `arithmetic-coded JPEG (SOF 0x${marker.toString(16)})`);
    } else if (marker === 0xdd) {
      if (length !== 4) throw new LastraError('bad-marker', `DRI has length ${length}, not 4`);
      restartInterval = u16(bytes, start);
    } else if (marker === 0xda) {
      if (!frame) throw new LastraError('bad-marker', 'a scan before the frame header');
      pos = readScan(bytes, start, end, frame, quant, dcTables, acTables, restartInterval, meter);
    } else if (marker === 0xe0) {
      // JFIF: libjpeg needs the 14-byte header to count it.
      if (end - start >= 14 && bytes[start] === 0x4a && bytes[start + 1] === 0x46 && bytes[start + 2] === 0x49 && bytes[start + 3] === 0x46 && bytes[start + 4] === 0) jfif = true;
    } else if (marker === 0xee) {
      // Adobe: "Adobe", version, flags0, flags1, transform: 12 bytes.
      if (end - start >= 12 && bytes[start] === 0x41 && bytes[start + 1] === 0x64 && bytes[start + 2] === 0x6f && bytes[start + 3] === 0x62 && bytes[start + 4] === 0x65) adobeTransform = bytes[start + 11];
    } else if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe || marker === 0xcc || marker === 0xdc) {
      // Other APPn, COM, DAC (arithmetic conditioning, unused by a Huffman frame), DNL (height already known).
    } else {
      throw new LastraError('bad-marker', `unknown marker 0x${marker.toString(16)}`);
    }
  }

  if (!frame) throw new LastraError('corrupt', 'EOI before any frame header');
  const f = frame;
  return allocating(`the pixels of a ${f.width}x${f.height} frame`, () => assemble(f, jfif, adobeTransform, meter));
}

function readQuant(b: Uint8Array, at: number, end: number, quant: (Uint16Array | null)[]): void {
  while (at < end) {
    const pq = b[at] >> 4;
    const tq = b[at] & 15;
    if (pq > 1 || tq > 3) throw new LastraError('corrupt', `DQT precision ${pq}, table ${tq}`);
    const size = pq ? 128 : 64;
    if (at + 1 + size > end) throw new LastraError('bad-marker', 'DQT runs past its segment');
    const t = new Uint16Array(64);
    for (let k = 0; k < 64; k++) t[NATURAL[k]] = pq ? u16(b, at + 1 + 2 * k) : b[at + 1 + k];
    quant[tq] = t;
    at += 1 + size;
  }
}

function readHuffman(b: Uint8Array, at: number, end: number, dc: (Huffman | null)[], ac: (Huffman | null)[]): void {
  while (at < end) {
    if (at + 17 > end) throw new LastraError('bad-marker', 'DHT runs past its segment');
    const tc = b[at] >> 4;
    const th = b[at] & 15;
    if (tc > 1 || th > 3) throw new LastraError('corrupt', `DHT class ${tc}, table ${th}`);
    const counts = b.subarray(at + 1, at + 17);
    let total = 0;
    for (let i = 0; i < 16; i++) total += counts[i];
    if (total > 256) throw new LastraError('corrupt', `DHT lists ${total} symbols, over 256`);
    if (at + 17 + total > end) throw new LastraError('bad-marker', 'DHT runs past its segment');
    const symbols = b.slice(at + 17, at + 17 + total);
    const table = buildHuffman(counts, symbols, tc === 0);
    if (tc === 0) dc[th] = table;
    else ac[th] = table;
    at += 17 + total;
  }
}

/** libjpeg's `jpeg_make_d_derived_tbl`, with its two refusals: an over-full code space and a DC symbol over 15. */
function buildHuffman(counts: ArrayLike<number>, symbols: Uint8Array, isDC: boolean): Huffman {
  const fast = new Uint16Array(512);
  const maxcode = new Int32Array(18).fill(-1);
  const valoffset = new Int32Array(18);
  let code = 0;
  let k = 0;
  for (let l = 1; l <= 16; l++) {
    const n = counts[l - 1];
    valoffset[l] = k - code;
    // A code of length l must fit in l bits and must not be all ones (libjpeg: JERR_BAD_HUFF_TABLE).
    if (code + n >= 1 << l && n > 0) throw new LastraError('corrupt', 'a Huffman table has more codes than its lengths allow');
    for (let i = 0; i < n; i++, k++, code++) {
      if (l <= 9) {
        const first = code << (9 - l);
        const entry = (l << 8) | symbols[k];
        for (let f = 0; f < 1 << (9 - l); f++) fast[first + f] = entry;
      }
    }
    if (n > 0) maxcode[l] = code - 1;
    code <<= 1;
  }
  maxcode[17] = 0x7fffffff;
  if (isDC) for (let i = 0; i < symbols.length; i++) if (symbols[i] > 15) throw new LastraError('corrupt', `a DC Huffman symbol is ${symbols[i]}, over 15`);
  return { fast, maxcode, valoffset, symbols };
}

// Annex K.3 tables, used when a scan names a table the file never defined (libjpeg-turbo's jstdhuff.c).
const STD_AC_LUMA =
  '01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9fa';
const STD_AC_CHROMA =
  '000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9fa';
const hex = (s: string) => Uint8Array.from(s.match(/../g) as string[], (x) => Number.parseInt(x, 16));
const STD_DC_SYMBOLS = Uint8Array.from({ length: 12 }, (_, i) => i);
let standard: Huffman[] | null = null;
function standardTable(isDC: boolean, index: number): Huffman | null {
  if (index > 1) return null;
  if (!standard) {
    standard = [
      buildHuffman([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], STD_DC_SYMBOLS, true),
      buildHuffman([0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], STD_DC_SYMBOLS, true),
      buildHuffman([0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125], hex(STD_AC_LUMA), false),
      buildHuffman([0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119], hex(STD_AC_CHROMA), false),
    ];
  }
  return standard[(isDC ? 0 : 2) + index];
}

function readFrame(b: Uint8Array, at: number, end: number, progressive: boolean): Frame {
  if (end - at < 6) throw new LastraError('bad-marker', 'the frame header is too short');
  const precision = b[at];
  const height = u16(b, at + 1);
  const width = u16(b, at + 3);
  const nf = b[at + 5];
  if (end - at !== 6 + 3 * nf) throw new LastraError('bad-marker', `the frame header length does not fit ${nf} components`);
  if (precision !== 8) throw new LastraError('unsupported', `${precision}-bit samples`);
  if (height === 0) throw new LastraError('unsupported', 'a frame height of 0 (set by a DNL marker)');
  if (width === 0) throw new LastraError('corrupt', 'a frame width of 0');
  if (nf === 0) throw new LastraError('corrupt', 'a frame with no components');
  if (nf === 2 || nf > 4) throw new LastraError('unsupported', `${nf} components`);
  const comps: Component[] = [];
  let hmax = 1;
  let vmax = 1;
  for (let i = 0; i < nf; i++) {
    const o = at + 6 + 3 * i;
    const id = b[o];
    const h = b[o + 1] >> 4;
    const v = b[o + 1] & 15;
    const tq = b[o + 2];
    if (h < 1 || h > 4 || v < 1 || v > 4) throw new LastraError('corrupt', `component ${id} sampling ${h}x${v}`);
    if (tq > 3) throw new LastraError('corrupt', `component ${id} names quantization table ${tq}`);
    if (comps.some((c) => c.id === id)) throw new LastraError('corrupt', `component id ${id} appears twice`);
    hmax = Math.max(hmax, h);
    vmax = Math.max(vmax, v);
    comps.push({ id, h, v, tq, dw: 0, dh: 0, bw: 0, bh: 0, stride: 0, coefs: new Int16Array(0), quant: null, coefBits: new Int8Array(64).fill(-1), scanned: false, pred: 0, dc: null, ac: null });
  }
  for (const c of comps) {
    if (hmax % c.h !== 0 || vmax % c.v !== 0) throw new LastraError('unsupported', `component ${c.id} sampling ${c.h}x${c.v} is not a whole fraction of ${hmax}x${vmax}`);
  }
  return { progressive, width, height, hmax, vmax, mcusX: Math.ceil(width / (8 * hmax)), mcusY: Math.ceil(height / (8 * vmax)), comps };
}

function allocate(f: Frame): void {
  allocating(`the coefficients of a ${f.width}x${f.height} frame`, () => allocateStores(f));
}

function allocateStores(f: Frame): void {
  for (const c of f.comps) {
    c.dw = Math.ceil((f.width * c.h) / f.hmax);
    c.dh = Math.ceil((f.height * c.v) / f.vmax);
    c.bw = Math.ceil(c.dw / 8);
    c.bh = Math.ceil(c.dh / 8);
    c.stride = f.mcusX * c.h;
    c.coefs = new Int16Array(c.stride * f.mcusY * c.v * 64);
  }
}

/** The entropy-coded segment reader, with libjpeg's rules for markers, fill bytes and running out. */
class BitReader {
  buf = 0;
  cnt = 0;
  /** Zero bits appended after the data ran out; the lowest `pad` bits of `buf`. */
  pad = 0;
  /** Stopped at a marker: `pos` is the 0xFF before its code. */
  marker = false;
  /** Ran off the end of the file. */
  eof = false;
  /** A read used padding: the scan's data ran out (libjpeg's `insufficient_data`). */
  short = false;
  /** Progressive AC: blocks left in the current end-of-band run. */
  eobrun = 0;

  constructor(
    readonly data: Uint8Array,
    public pos: number,
  ) {}

  fill(): void {
    const d = this.data;
    const end = d.length;
    while (this.cnt <= 24) {
      let byte = 0;
      if (!this.marker && !this.eof) {
        if (this.pos >= end) this.eof = true;
        else if (d[this.pos] !== 0xff) byte = d[this.pos++];
        else {
          let p = this.pos + 1;
          while (p < end && d[p] === 0xff) p++;
          if (p >= end) {
            this.eof = true;
            this.pos = end;
          } else if (d[p] === 0) {
            byte = 0xff;
            this.pos = p + 1;
          } else {
            this.marker = true;
            this.pos = p - 1;
          }
        }
      }
      if (this.marker || this.eof) this.pad += 8;
      this.buf = (this.buf << 8) | byte;
      this.cnt += 8;
    }
  }

  private consume(n: number): void {
    this.cnt -= n;
    this.buf &= (1 << this.cnt) - 1;
    if (this.cnt < this.pad) {
      this.short = true;
      this.pad = this.cnt;
    }
  }

  bits(n: number): number {
    if (n === 0) return 0;
    if (this.cnt < n) this.fill();
    const v = (this.buf >>> (this.cnt - n)) & ((1 << n) - 1);
    this.consume(n);
    return v;
  }

  bit(): number {
    return this.bits(1);
  }

  decode(t: Huffman): number {
    if (this.cnt < 16) this.fill();
    const e = t.fast[(this.buf >>> (this.cnt - 9)) & 511];
    if (e !== 0) {
      this.consume(e >> 8);
      return e & 255;
    }
    let l = 10;
    let code = (this.buf >>> (this.cnt - l)) & ((1 << l) - 1);
    while (code > t.maxcode[l]) {
      l++;
      if (l > 16) {
        // libjpeg: "Corrupt JPEG data: bad Huffman code", decoded as symbol 0.
        this.consume(16);
        return 0;
      }
      code = (this.buf >>> (this.cnt - l)) & ((1 << l) - 1);
    }
    this.consume(l);
    const i = code + t.valoffset[l];
    return i >= 0 && i < t.symbols.length ? t.symbols[i] : 0;
  }

  /** Drop buffered bits and move to the next marker, skipping stray bytes as libjpeg's `next_marker` does. */
  toMarker(): void {
    this.buf = 0;
    this.cnt = 0;
    this.pad = 0;
    if (this.marker || this.eof) return;
    const d = this.data;
    let p = this.pos;
    for (;;) {
      while (p < d.length && d[p] !== 0xff) p++;
      let q = p + 1;
      while (q < d.length && d[q] === 0xff) q++;
      if (q >= d.length) {
        this.eof = true;
        this.pos = d.length;
        return;
      }
      if (d[q] !== 0) {
        this.marker = true;
        this.pos = q - 1;
        return;
      }
      p = q + 1;
    }
  }
}

const extend = (v: number, s: number) => (v < 1 << (s - 1) ? v - (1 << s) + 1 : v);

type BlockDecoder = (r: BitReader, c: Component, at: number) => void;

function readScan(
  b: Uint8Array,
  at: number,
  end: number,
  f: Frame,
  quant: (Uint16Array | null)[],
  dcTables: (Huffman | null)[],
  acTables: (Huffman | null)[],
  restartInterval: number,
  meter: WorkMeter,
): number {
  const ns = b[at];
  if (ns < 1 || ns > 4 || end - at !== 4 + 2 * ns) throw new LastraError('bad-marker', `a scan header for ${ns} components has the wrong length`);
  const comps: Component[] = [];
  let blocks = 0;
  for (let i = 0; i < ns; i++) {
    const id = b[at + 1 + 2 * i];
    const td = b[at + 2 + 2 * i] >> 4;
    const ta = b[at + 2 + 2 * i] & 15;
    const c = f.comps.find((x) => x.id === id);
    if (!c) throw new LastraError('corrupt', `a scan names component ${id}, not in the frame`);
    if (comps.includes(c)) throw new LastraError('corrupt', `a scan names component ${id} twice`);
    if (td > 3 || ta > 3) throw new LastraError('corrupt', `a scan names Huffman tables ${td} and ${ta}`);
    c.dc = dcTables[td] ?? standardTable(true, td);
    c.ac = acTables[ta] ?? standardTable(false, ta);
    comps.push(c);
    blocks += c.h * c.v;
  }
  if (ns > 1 && blocks > 10) throw new LastraError('corrupt', `an MCU of ${blocks} blocks, over 10`);
  const ss = b[at + 1 + 2 * ns];
  const se = b[at + 2 + 2 * ns];
  const ah = b[at + 3 + 2 * ns] >> 4;
  const al = b[at + 3 + 2 * ns] & 15;

  let decodeBlock: BlockDecoder;
  if (f.progressive) {
    let bad = ss === 0 ? se !== 0 : se < ss || se > 63 || ns !== 1;
    if (ah !== 0 && al !== ah - 1) bad = true;
    if (al > 13) bad = true;
    if (bad) throw new LastraError('corrupt', `progressive scan parameters Ss=${ss} Se=${se} Ah=${ah} Al=${al}`);
    for (const c of comps) {
      for (let k = ss; k <= se; k++) {
        const seen = c.coefBits[k];
        if (ah === 0 ? seen >= 0 : seen !== ah) throw new LastraError('corrupt', `progressive scan out of sequence for component ${c.id}, coefficient ${k}`);
        c.coefBits[k] = al;
      }
    }
    decodeBlock = progressiveDecoder(ss, se, ah, al);
  } else {
    for (const c of comps) {
      if (c.scanned) throw new LastraError('corrupt', `component ${c.id} is in two sequential scans`);
    }
    decodeBlock = decodeSequential;
  }
  for (const c of comps) {
    c.scanned = true;
    c.pred = 0;
    if (!c.quant) {
      const q = quant[c.tq];
      if (!q) throw new LastraError('corrupt', `component ${c.id} uses quantization table ${c.tq}, never defined`);
      c.quant = q.slice();
    }
    const needDC = !f.progressive || (ss === 0 && ah === 0);
    const needAC = !f.progressive || ss > 0;
    if ((needDC && !c.dc) || (needAC && !c.ac)) throw new LastraError('corrupt', `component ${c.id} uses a Huffman table never defined`);
  }

  const r = new BitReader(b, end);
  const single = ns === 1;
  const c0 = comps[0];
  const total = single ? c0.bw * c0.bh : f.mcusX * f.mcusY;
  for (let n = 0; n < total; n++) {
    if (restartInterval > 0 && n > 0 && n % restartInterval === 0) {
      tick(meter);
      r.toMarker();
      if (r.marker) {
        const code = b[r.pos + 1];
        if (code >= 0xd0 && code <= 0xd7) {
          r.pos += 2;
          r.marker = false;
          r.short = false;
        }
      }
      for (const c of comps) c.pred = 0;
      r.eobrun = 0;
    }
    if (r.short) {
      // The data ran out: libjpeg leaves the rest of the scan alone, up to the next restart marker.
      if (restartInterval === 0) break;
      tick(meter);
      n = Math.ceil((n + 1) / restartInterval) * restartInterval - 1;
      continue;
    }
    tick(meter);
    if (single) {
      const row = (n / c0.bw) | 0;
      decodeBlock(r, c0, (row * c0.stride + (n - row * c0.bw)) * 64);
    } else {
      const my = (n / f.mcusX) | 0;
      const mx = n - my * f.mcusX;
      for (const c of comps) {
        for (let y = 0; y < c.v; y++) {
          const base = (my * c.v + y) * c.stride + mx * c.h;
          for (let x = 0; x < c.h; x++) decodeBlock(r, c, (base + x) * 64);
        }
      }
    }
  }
  r.toMarker();
  if (r.eof) throw new LastraError('truncated', 'the file ends inside a scan');
  return r.pos;
}

function decodeSequential(r: BitReader, c: Component, at: number): void {
  const coefs = c.coefs;
  const t = r.decode(c.dc as Huffman);
  const diff = t === 0 ? 0 : extend(r.bits(t), t);
  c.pred += diff;
  coefs[at] = c.pred;
  const ac = c.ac as Huffman;
  for (let k = 1; k < 64; k++) {
    const rs = r.decode(ac);
    const s = rs & 15;
    const run = rs >> 4;
    if (s === 0) {
      if (run !== 15) break;
      k += 15;
      continue;
    }
    k += run;
    coefs[at + NATURAL[k]] = extend(r.bits(s), s);
  }
}

function progressiveDecoder(ss: number, se: number, ah: number, al: number): BlockDecoder {
  if (ss === 0) {
    if (ah === 0) {
      return (r, c, at) => {
        const t = r.decode(c.dc as Huffman);
        const diff = t === 0 ? 0 : extend(r.bits(t), t);
        c.pred += diff;
        c.coefs[at] = c.pred * (1 << al);
      };
    }
    return (r, c, at) => {
      if (r.bit()) c.coefs[at] |= 1 << al;
    };
  }
  if (ah === 0) {
    return (r, c, at) => {
      if (r.eobrun > 0) {
        r.eobrun--;
        return;
      }
      const ac = c.ac as Huffman;
      const coefs = c.coefs;
      for (let k = ss; k <= se; k++) {
        const rs = r.decode(ac);
        const s = rs & 15;
        const run = rs >> 4;
        if (s !== 0) {
          k += run;
          coefs[at + NATURAL[k]] = extend(r.bits(s), s) * (1 << al);
        } else if (run === 15) {
          k += 15;
        } else {
          r.eobrun = (1 << run) + r.bits(run) - 1;
          break;
        }
      }
    };
  }
  const p1 = 1 << al;
  const m1 = -1 << al;
  return (r, c, at) => {
    const coefs = c.coefs;
    let k = ss;
    if (r.eobrun === 0) {
      const ac = c.ac as Huffman;
      for (; k <= se; k++) {
        const rs = r.decode(ac);
        let s = rs & 15;
        let run = rs >> 4;
        if (s !== 0) {
          s = r.bit() ? p1 : m1;
        } else if (run !== 15) {
          r.eobrun = (1 << run) + r.bits(run);
          break;
        }
        // Step over coefficients already nonzero (refining each) and `run` zero ones.
        do {
          const i = at + NATURAL[k];
          if (coefs[i] !== 0) {
            if (r.bit() && (coefs[i] & p1) === 0) coefs[i] += coefs[i] >= 0 ? p1 : m1;
          } else if (--run < 0) break;
          k++;
        } while (k <= se);
        if (s !== 0) coefs[at + NATURAL[k]] = s;
      }
    }
    if (r.eobrun > 0) {
      for (; k <= se; k++) {
        const i = at + NATURAL[k];
        if (coefs[i] !== 0 && r.bit() && (coefs[i] & p1) === 0) coefs[i] += coefs[i] >= 0 ? p1 : m1;
      }
      r.eobrun--;
    }
  };
}

/** IDCT every component, upsample to full size, convert to RGBA. */
function assemble(f: Frame, jfif: boolean, adobeTransform: number, meter: WorkMeter): DecodedImage {
  const { width, height } = f;
  const ws = new Int32Array(64);
  const zero = new Uint16Array(64);
  const planes: Plane[] = [];
  for (const c of f.comps) {
    const pw = c.bw * 8;
    const data = new Uint8Array(pw * c.bh * 8);
    const q = c.quant ?? zero;
    for (let by = 0; by < c.bh; by++) {
      tick(meter);
      for (let bx = 0; bx < c.bw; bx++) idctIslow(c.coefs, (by * c.stride + bx) * 64, q, data, by * 8 * pw + bx * 8, pw, ws);
    }
    c.coefs = new Int16Array(0); // free the store before the next plane allocates
    planes.push(upsample({ data, stride: pw, width: c.dw, height: c.dh }, f.hmax / c.h, f.vmax / c.v, width, height));
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const n = f.comps.length;
  let transform: 'gray' | 'ycc' | 'rgb' | 'cmyk' | 'ycck';
  if (n === 1) transform = 'gray';
  else if (n === 3) {
    if (jfif) transform = 'ycc';
    else if (adobeTransform >= 0) transform = adobeTransform === 0 ? 'rgb' : 'ycc';
    else transform = f.comps[0].id === 82 && f.comps[1].id === 71 && f.comps[2].id === 66 ? 'rgb' : 'ycc';
  } else transform = adobeTransform === 0 ? 'cmyk' : adobeTransform >= 0 ? 'ycck' : 'cmyk';

  const [p0, p1, p2, p3] = planes;
  for (let y = 0; y < height; y++) {
    tick(meter);
    let o = y * width * 4;
    const r0 = y * p0.stride;
    if (transform === 'gray') {
      for (let x = 0; x < width; x++, o += 4) {
        const g = p0.data[r0 + x];
        out[o] = g;
        out[o + 1] = g;
        out[o + 2] = g;
        out[o + 3] = 255;
      }
      continue;
    }
    const r1 = y * p1.stride;
    const r2 = y * p2.stride;
    if (transform === 'rgb') {
      for (let x = 0; x < width; x++, o += 4) {
        out[o] = p0.data[r0 + x];
        out[o + 1] = p1.data[r1 + x];
        out[o + 2] = p2.data[r2 + x];
        out[o + 3] = 255;
      }
    } else if (transform === 'ycc') {
      for (let x = 0; x < width; x++, o += 4) {
        const yy = p0.data[r0 + x];
        const cb = p1.data[r1 + x];
        const cr = p2.data[r2 + x];
        out[o] = yy + CR_R[cr];
        out[o + 1] = yy + ((CB_G[cb] + CR_G[cr]) >> 16);
        out[o + 2] = yy + CB_B[cb];
        out[o + 3] = 255;
      }
    } else {
      const r3 = y * p3.stride;
      for (let x = 0; x < width; x++, o += 4) {
        let c = p0.data[r0 + x];
        let m = p1.data[r1 + x];
        let ye = p2.data[r2 + x];
        if (transform === 'ycck') {
          // libjpeg's ycck_cmyk_convert: YCC to RGB, then C = 255 - R, M = 255 - G, Y = 255 - B; K as stored.
          const yy = c;
          c = 255 - clamp8(yy + CR_R[ye]);
          const g = 255 - clamp8(yy + ((CB_G[m] + CR_G[ye]) >> 16));
          ye = 255 - clamp8(yy + CB_B[m]);
          m = g;
        }
        // Adobe-inverted CMYK to RGB, Pillow's cmyk2rgb on the un-inverted values: R = nk - nk*C/255.
        const nk = p3.data[r3 + x];
        out[o] = nk - muldiv255(255 - c, nk);
        out[o + 1] = nk - muldiv255(255 - m, nk);
        out[o + 2] = nk - muldiv255(255 - ye, nk);
        out[o + 3] = 255;
      }
    }
  }
  return { width, height, data: out };
}

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const muldiv255 = (a: number, b: number) => {
  const t = a * b + 128;
  return ((t >> 8) + t) >> 8;
};
