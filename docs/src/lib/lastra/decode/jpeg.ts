/**
 * JPEG to RGBA (engineering/decisions/2026-11-13-image-library.md §3, slice 4).
 *
 * Decodes: baseline and extended sequential (SOF0, SOF1) and progressive (SOF2) frames, 8-bit, Huffman
 * coded; spectral selection and successive approximation; restart intervals; one, three or four
 * components; any integer chroma sampling (4:4:4, 4:2:2, 4:2:0, 4:4:0, 4:1:1, ...) at any size; the
 * Adobe APP14 transform (RGB, YCbCr, CMYK, YCCK); the Annex K tables when a Huffman table is missing
 * (Motion-JPEG frames), as libjpeg-turbo does. The primary image only: an MPF second picture or an Ultra
 * HDR gain map after the first EOI is not read. The embedded ICC profile comes back as bytes, unapplied.
 *
 * Follows libjpeg-turbo 3.1's default decode (what Chromium, Firefox, Linux WebKit and Pillow run): the
 * accurate integer IDCT, fancy upsampling, the YCbCr tables, block smoothing for progressive files that
 * stop short of their last refinements, and its handling of damaged scans (jpeg-huffman.ts). Four-component
 * files decode as Adobe-inverted CMYK to RGB with no color management, the formula Pillow and Chromium
 * use when a file carries no ICC profile. EXIF orientation is not applied (the reader reports it).
 *
 * Where it departs from libjpeg, on purpose:
 * - bounded work. At most MAX_SCANS scans per frame (libjpeg-turbo's own fuzzer sets its scan limit to the
 *   same 500) and at most VISITS_PER_BLOCK block visits per coefficient block across all scans; past
 *   either, `too-large`. libjpeg has neither limit by default.
 * - a component in two sequential scans is refused (`corrupt`); libjpeg errors on it in a single-scan
 *   file and overwrites in place in a multi-scan one.
 * - a file that ends before EOI decodes only if at least one scan was read to its end; otherwise
 *   `truncated` (libjpeg decodes whatever it has; Pillow refuses every truncated file).
 *
 * Refuses, with a `LastraError`: `unsupported` (arithmetic, lossless, hierarchical, 12- or 16-bit, a height
 * set by DNL, two or more than four components, a fractional sampling ratio); `truncated` (above, or the
 * file ends before the first scan); `bad-marker` (no SOI, a segment length under 2 or past its contents,
 * an unknown marker, a scan before its frame, a second frame); `corrupt` (an impossible frame, table or
 * scan header, an over-full Huffman table a scan uses, EOI before any scan, a DC sum past 32 bits in a
 * progressive scan, as libjpeg-turbo refuses it); `too-large` (`maxPixels`, `maxBytes`, the two work caps).
 *
 * `decodeJpeg` yields to the event loop between slices of work and honors an `AbortSignal`;
 * `decodeJpegSync` runs the same steps to the end without yielding. `opts.meter` counts the work: one
 * step per segment, Huffman or quantization table, decoded block, restart, IDCT block and 64 output
 * pixels.
 */

import { LastraError } from './errors.js';
import {
  BitReader,
  type BlockDecoder,
  decodeSequential,
  derive,
  type Huffman,
  type HuffmanSpec,
  huffmanSpec,
  NATURAL,
  progressiveDecoder,
  standardSpec,
} from './jpeg-huffman.js';
import { CB_B, CB_G, CR_G, CR_R } from './jpeg-idct.js';
import { type Plane, upsample } from './jpeg-sample.js';
import { componentSamples, smoothingLatches } from './jpeg-smooth.js';
import { allocating, checkPixels, type Limits, resolveLimits, tick } from './limits.js';
import { runSteps, runStepsSync } from './steps.js';
import type { DecodedImage, DecodeOptions, WorkMeter } from './types.js';

/** Scans per frame. libjpeg's own progression writes 10 (6 for gray); libjpeg-turbo's fuzzer caps at 500. */
export const MAX_SCANS = 500;
/**
 * Block visits per coefficient block, summed over every scan. libjpeg's progression visits a luma block 6
 * times and a chroma block 4 times; a baseline file visits each once. 32 is five times the most a real
 * encoder needs and bounds a file of empty or end-of-band scans to 32 passes over its blocks.
 */
export const VISITS_PER_BLOCK = 32;

/** A decoded JPEG: the pixels, and the ICC profile the file carries (not applied), or null. */
export interface JpegImage extends DecodedImage {
  icc: Uint8Array | null;
}

interface Component {
  id: number;
  h: number;
  v: number;
  tq: number;
  /** Real samples (libjpeg's downsampled_width, _height), the blocks covering them, the store's grid. */
  dw: number;
  dh: number;
  bw: number;
  bh: number;
  stride: number;
  rows: number;
  coefs: Int16Array;
  quant: Uint16Array | null;
  quantIdct: Int16Array | null;
  coefBits: Int8Array;
  prevCoefBits: Int8Array;
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
  allocated: boolean;
  /** Blocks in all stores, and block visits so far. */
  blocks: number;
  visits: number;
  scans: number;
  completeScans: number;
  /** libjpeg's last_good_iMCU_row, for the smoothing. */
  lastGood: number;
}

interface State {
  quant: (Uint16Array | null)[];
  /** Where each DHT slot's latest definition starts in the file (-1: never defined); built on first use. */
  dcAt: number[];
  acAt: number[];
  specs: Map<number, HuffmanSpec>;
  frame: Frame | null;
  restartInterval: number;
  jfif: boolean;
  adobeTransform: number;
  icc: { seq: number; count: number; data: Uint8Array }[];
}

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

/** Decode a JPEG to RGBA, yielding to the event loop as it goes; `opts.signal` aborts it. */
export function decodeJpeg(bytes: Uint8Array, opts?: DecodeOptions): Promise<JpegImage> {
  return runSteps(() => jpegSteps(bytes, opts), opts?.signal);
}

/** The same decode, start to finish, without yielding. */
export function decodeJpegSync(bytes: Uint8Array, opts?: DecodeOptions): JpegImage {
  return runStepsSync(jpegSteps(bytes, opts));
}

function* jpegSteps(bytes: Uint8Array, opts: DecodeOptions | undefined): Generator<void, JpegImage> {
  const limits = resolveLimits(bytes, opts);
  const meter = limits.meter;
  const len = bytes.length;
  if (len < 2) throw new LastraError('truncated', 'the file ends before SOI');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new LastraError('bad-marker', 'not a JPEG: no SOI marker');
  const s: State = { quant: [null, null, null, null], dcAt: [-1, -1, -1, -1], acAt: [-1, -1, -1, -1], specs: new Map(), frame: null, restartInterval: 0, jfif: false, adobeTransform: -1, icc: [] };

  let pos = 2;
  for (;;) {
    tick(meter);
    // Find the next marker. libjpeg skips stray bytes before one (with a warning); so does this.
    const from = pos;
    while (pos < len && bytes[pos] !== 0xff) pos++;
    while (pos < len && bytes[pos] === 0xff) pos++;
    tick(meter, (pos - from) >> 6);
    if (pos >= len) {
      if (endsEarly(s.frame)) break;
      throw new LastraError('truncated', 'the file ends before EOI');
    }
    const marker = bytes[pos++];
    if (marker === 0) continue; // FF 00 between segments is stray data; libjpeg's next_marker skips it too
    if (marker === 0xd9) break; // EOI
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue; // RSTn, TEM: no length
    if (marker === 0xd8) throw new LastraError('bad-marker', 'a second SOI');
    if (pos + 2 > len) {
      if (endsEarly(s.frame)) break;
      throw new LastraError('truncated', `the file ends inside the 0x${marker.toString(16)} marker's length`);
    }
    const length = u16(bytes, pos);
    if (length < 2) throw new LastraError('bad-marker', `marker 0x${marker.toString(16)} has length ${length}`);
    const start = pos + 2;
    const end = pos + length;
    // libjpeg reads a scan or frame header's count before it checks the file has the bytes, so a length
    // that cannot fit its count is refused even when the file also ends early.
    if (start < len && ((marker === 0xda && length !== 6 + 2 * bytes[start]) || ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && start + 5 < len && length !== 8 + 3 * bytes[start + 5]))) {
      throw new LastraError('bad-marker', `the 0x${marker.toString(16)} header length ${length} does not fit its component count`);
    }
    if (end > len) {
      if (endsEarly(s.frame)) break;
      throw new LastraError('truncated', `the file ends inside the 0x${marker.toString(16)} segment`);
    }
    pos = end;

    if (marker === 0xdb) {
      readQuant(bytes, start, end, s.quant, meter);
    } else if (marker === 0xc4) {
      readHuffman(bytes, start, end, s, meter);
    } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (s.frame) throw new LastraError('bad-marker', 'a second frame header');
      s.frame = readFrame(bytes, start, end, marker === 0xc2);
      checkPixels(s.frame.width, s.frame.height, limits);
    } else if (marker === 0xc3 || (marker >= 0xc5 && marker <= 0xc7)) {
      throw new LastraError('unsupported', `lossless or hierarchical JPEG (SOF 0x${marker.toString(16)})`);
    } else if (marker === 0xc8 || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      throw new LastraError('unsupported', `arithmetic-coded JPEG (SOF 0x${marker.toString(16)})`);
    } else if (marker === 0xdd) {
      if (length !== 4) throw new LastraError('bad-marker', `DRI has length ${length}, not 4`);
      s.restartInterval = u16(bytes, start);
    } else if (marker === 0xda) {
      if (!s.frame) throw new LastraError('bad-marker', 'a scan before the frame header');
      pos = yield* readScan(bytes, start, end, s, s.frame, limits);
      if (pos >= len && endsEarly(s.frame)) break;
    } else if (marker === 0xe0) {
      // JFIF: libjpeg needs the 14-byte header to count it.
      if (end - start >= 14 && bytes[start] === 0x4a && bytes[start + 1] === 0x46 && bytes[start + 2] === 0x49 && bytes[start + 3] === 0x46 && bytes[start + 4] === 0) s.jfif = true;
    } else if (marker === 0xee) {
      // Adobe: "Adobe", version, flags0, flags1, transform: 12 bytes.
      if (end - start >= 12 && bytes[start] === 0x41 && bytes[start + 1] === 0x64 && bytes[start + 2] === 0x6f && bytes[start + 3] === 0x62 && bytes[start + 4] === 0x65) s.adobeTransform = bytes[start + 11];
    } else if (marker === 0xe2) {
      readIccChunk(bytes, start, end, s);
    } else if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe || marker === 0xcc || marker === 0xdc) {
      // Other APPn (EXIF, XMP, MPF), COM, DAC (arithmetic conditioning, unused by a Huffman frame), DNL.
    } else {
      throw new LastraError('bad-marker', `unknown marker 0x${marker.toString(16)}`);
    }
  }

  const f = s.frame;
  if (!f) throw new LastraError('corrupt', 'EOI before any frame header');
  if (!f.allocated) throw new LastraError('corrupt', 'the frame has no scan');
  const pixels = yield* assemble(f, s, meter);
  return { ...pixels, icc: iccProfile(s.icc) };
}

/** A file that ends early decodes when at least one scan was read to its end. */
function endsEarly(f: Frame | null): boolean {
  return f !== null && f.completeScans > 0;
}

function readQuant(b: Uint8Array, at: number, end: number, quant: (Uint16Array | null)[], meter: WorkMeter): void {
  while (at < end) {
    tick(meter);
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

/**
 * DHT: note where each table starts and move on; its lookup is built when a scan first uses it, as
 * libjpeg builds it at the start of the scan. A file of millions of unused tables costs one step each and
 * no allocation.
 */
function readHuffman(b: Uint8Array, at: number, end: number, s: State, meter: WorkMeter): void {
  while (at < end) {
    tick(meter);
    if (at + 17 > end) throw new LastraError('bad-marker', 'DHT runs past its segment');
    const tc = b[at] >> 4;
    const th = b[at] & 15;
    if (tc > 1 || th > 3) throw new LastraError('corrupt', `DHT class ${tc}, table ${th}`);
    let total = 0;
    for (let i = 1; i <= 16; i++) total += b[at + i];
    if (total > 256) throw new LastraError('corrupt', `DHT lists ${total} symbols, over 256`);
    if (at + 17 + total > end) throw new LastraError('bad-marker', 'DHT runs past its segment');
    if (tc === 0) s.dcAt[th] = at;
    else s.acAt[th] = at;
    at += 17 + total;
  }
}

/** APP2 "ICC_PROFILE\0", sequence number, count, data (ICC.1 Annex B.4). */
function readIccChunk(b: Uint8Array, at: number, end: number, s: State): void {
  const sig = 'ICC_PROFILE';
  if (end - at < 14) return;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig.charCodeAt(i)) return;
  if (b[at + 11] !== 0) return;
  s.icc.push({ seq: b[at + 12], count: b[at + 13], data: b.subarray(at + 14, end) });
}

/** libjpeg's `jpeg_read_icc_profile`: every chunk 1..count present once, one count, or no profile. */
function iccProfile(chunks: State['icc']): Uint8Array | null {
  if (chunks.length === 0) return null;
  const count = chunks[0].count;
  if (count === 0 || chunks.length !== count) return null;
  const bySeq: (Uint8Array | null)[] = new Array(count + 1).fill(null);
  for (const c of chunks) {
    if (c.count !== count || c.seq === 0 || c.seq > count || bySeq[c.seq]) return null;
    bySeq[c.seq] = c.data;
  }
  let total = 0;
  for (let i = 1; i <= count; i++) total += (bySeq[i] as Uint8Array).length;
  if (total === 0) return null;
  const out = new Uint8Array(total);
  let o = 0;
  for (let i = 1; i <= count; i++) {
    out.set(bySeq[i] as Uint8Array, o);
    o += (bySeq[i] as Uint8Array).length;
  }
  return out;
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
    comps.push({
      id,
      h,
      v,
      tq,
      dw: 0,
      dh: 0,
      bw: 0,
      bh: 0,
      stride: 0,
      rows: 0,
      coefs: new Int16Array(0),
      quant: null,
      quantIdct: null,
      coefBits: new Int8Array(64).fill(-1),
      prevCoefBits: new Int8Array(64).fill(-1),
      scanned: false,
      pred: 0,
      dc: null,
      ac: null,
    });
  }
  for (const c of comps) {
    if (hmax % c.h !== 0 || vmax % c.v !== 0) throw new LastraError('unsupported', `component ${c.id} sampling ${c.h}x${c.v} is not a whole fraction of ${hmax}x${vmax}`);
  }
  const mcusX = Math.ceil(width / (8 * hmax));
  const mcusY = Math.ceil(height / (8 * vmax));
  let blocks = 0;
  for (const c of comps) {
    c.dw = Math.ceil((width * c.h) / hmax);
    c.dh = Math.ceil((height * c.v) / vmax);
    c.bw = Math.ceil(c.dw / 8);
    c.bh = Math.ceil(c.dh / 8);
    c.stride = mcusX * c.h;
    c.rows = mcusY * c.v;
    blocks += c.stride * c.rows;
  }
  return { progressive, width, height, hmax, vmax, mcusX, mcusY, comps, allocated: false, blocks, visits: 0, scans: 0, completeScans: 0, lastGood: 0 };
}

/** The coefficient stores, allocated at the first scan: a header with no scan costs no memory. */
function allocate(f: Frame): void {
  allocating(`the coefficients of a ${f.width}x${f.height} frame`, () => {
    for (const c of f.comps) c.coefs = new Int16Array(c.stride * c.rows * 64);
  });
  f.allocated = true;
}

function tableFor(b: Uint8Array, s: State, index: number, isDC: boolean, meter: WorkMeter): Huffman | null {
  const at = (isDC ? s.dcAt : s.acAt)[index];
  let spec: HuffmanSpec | null;
  if (at < 0) spec = standardSpec(isDC, index);
  else {
    spec = s.specs.get(at) ?? null;
    if (!spec) {
      let total = 0;
      for (let i = 1; i <= 16; i++) total += b[at + i];
      spec = huffmanSpec(b.subarray(at + 1, at + 17), b.subarray(at + 17, at + 17 + total));
      s.specs.set(at, spec);
    }
  }
  if (!spec) return null;
  if (!spec.derived) {
    tick(meter, 4);
    spec.derived = derive(spec, isDC);
  }
  return spec.derived;
}

/** Steps of work between yields: about a few milliseconds of decoding. */
const SLICE = 1 << 15;

function* readScan(b: Uint8Array, at: number, end: number, s: State, f: Frame, limits: Limits): Generator<void, number> {
  const meter = limits.meter;
  if (++f.scans > MAX_SCANS) throw new LastraError('too-large', `more than ${MAX_SCANS} scans in one frame`);
  const ns = b[at];
  if (ns < 1 || ns > 4 || end - at !== 4 + 2 * ns) throw new LastraError('bad-marker', `a scan header for ${ns} components has the wrong length`);
  const comps: Component[] = [];
  const tables: [number, number][] = [];
  let blocksPerMcu = 0;
  for (let i = 0; i < ns; i++) {
    const id = b[at + 1 + 2 * i];
    const td = b[at + 2 + 2 * i] >> 4;
    const ta = b[at + 2 + 2 * i] & 15;
    const c = f.comps.find((x) => x.id === id);
    if (!c) throw new LastraError('corrupt', `a scan names component ${id}, not in the frame`);
    if (comps.includes(c)) throw new LastraError('corrupt', `a scan names component ${id} twice`);
    if (td > 3 || ta > 3) throw new LastraError('corrupt', `a scan names Huffman tables ${td} and ${ta}`);
    comps.push(c);
    tables.push([td, ta]);
    blocksPerMcu += c.h * c.v;
  }
  if (ns > 1 && blocksPerMcu > 10) throw new LastraError('corrupt', `an MCU of ${blocksPerMcu} blocks, over 10`);
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
    // jdphuff.c: remember each coefficient's precision before this scan, then record the new one. A scan
    // out of sequence is decoded anyway, as libjpeg decodes it (with a warning); the caps bound the work.
    for (const c of comps) {
      for (let k = Math.min(ss, 1); k <= Math.max(se, 9); k++) c.prevCoefBits[k] = f.scans > 1 ? c.coefBits[k] : 0;
      for (let k = ss; k <= se; k++) c.coefBits[k] = al;
    }
    decodeBlock = progressiveDecoder(ss, se, ah, al);
  } else {
    for (const c of comps) {
      if (c.scanned) throw new LastraError('corrupt', `component ${c.id} is in two sequential scans`);
    }
    decodeBlock = decodeSequential;
  }
  comps.forEach((c, i) => {
    c.scanned = true;
    c.pred = 0;
    if (!c.quant) {
      const q = s.quant[c.tq];
      if (!q) throw new LastraError('corrupt', `component ${c.id} uses quantization table ${c.tq}, never defined`);
      c.quant = q.slice();
      c.quantIdct = Int16Array.from(q);
    }
    const needDC = !f.progressive || (ss === 0 && ah === 0);
    const needAC = !f.progressive || ss > 0;
    c.dc = needDC ? tableFor(b, s, tables[i][0], true, meter) : null;
    c.ac = needAC ? tableFor(b, s, tables[i][1], false, meter) : null;
    if ((needDC && !c.dc) || (needAC && !c.ac)) throw new LastraError('corrupt', `component ${c.id} uses a Huffman table never defined`);
  });
  if (!f.allocated) allocate(f);

  const ri = s.restartInterval;
  const r = new BitReader(b, end);
  const single = ns === 1;
  const c0 = comps[0];
  const total = single ? c0.bw * c0.bh : f.mcusX * f.mcusY;
  const perMcu = single ? 1 : blocksPerMcu;
  const cap = VISITS_PER_BLOCK * f.blocks;
  const stepLimit = meter.limit ?? Number.POSITIVE_INFINITY;
  let work = 0;
  let stoppedEarly = false;
  for (let n = 0; n < total; n++) {
    if (ri > 0 && n > 0 && n % ri === 0) {
      tick(meter);
      r.restart();
      for (const c of comps) c.pred = 0;
    }
    if (r.short) {
      // The data ran out. libjpeg leaves the rest of the scan alone until a restart marker revives it;
      // with no restarts, or stopped at a marker no restart can ever accept (EOI, SOS, DHT, the end of
      // the file), nothing after this point can change, so stop here.
      const m = r.pending();
      if (ri === 0 || (m >= 0xc0 && (m < 0xd0 || m > 0xd7))) {
        stoppedEarly = true;
        break;
      }
      tick(meter);
      n = Math.ceil((n + 1) / ri) * ri - 1;
      continue;
    }
    f.visits += perMcu;
    if (f.visits > cap) throw new LastraError('too-large', `more than ${VISITS_PER_BLOCK} visits per coefficient block`);
    meter.steps += perMcu;
    if (meter.steps > stepLimit) tick(meter, 0); // throws the work-limit refusal
    if (single) {
      const row = (n / c0.bw) | 0;
      f.lastGood = (row / c0.v) | 0;
      decodeBlock(r, c0, (row * c0.stride + (n - row * c0.bw)) * 64);
    } else {
      const my = (n / f.mcusX) | 0;
      const mx = n - my * f.mcusX;
      f.lastGood = my;
      for (let ci = 0; ci < comps.length; ci++) {
        const c = comps[ci];
        for (let y = 0; y < c.v; y++) {
          const base = (my * c.v + y) * c.stride + mx * c.h;
          for (let x = 0; x < c.h; x++) decodeBlock(r, c, (base + x) * 64);
        }
      }
    }
    work += perMcu;
    if (work >= SLICE) {
      work = 0;
      yield;
    }
  }
  // Whole: every MCU decoded from real data (the end of the file, if it comes next, does not matter).
  const whole = !r.short && !stoppedEarly;
  r.toMarker();
  if (whole) f.completeScans++;
  if (r.eof) {
    // The file ends after or inside this scan. Decode what there is if a scan was read whole; the caller
    // sees `pos` at the end and stops.
    if (f.completeScans > 0) return b.length;
    throw new LastraError('truncated', 'the file ends inside a scan');
  }
  return r.pos;
}

/** IDCT every component (with smoothing where libjpeg would), upsample, convert to RGBA. */
function* assemble(f: Frame, s: State, meter: WorkMeter): Generator<void, DecodedImage> {
  const { width, height } = f;
  const latches = smoothingLatches(f.comps, f.progressive, f.scans);
  const planes: Plane[] = [];
  for (let ci = 0; ci < f.comps.length; ci++) {
    const c = f.comps[ci];
    const data = yield* componentSamples(c, latches ? latches[ci] : null, f.lastGood, meter);
    c.coefs = new Int16Array(0); // free the store before the next plane allocates
    tick(meter, Math.ceil((width * height) / 64));
    planes.push(allocating('an upsampled plane', () => upsample({ data, stride: c.bw * 8, width: c.dw, height: c.dh }, f.hmax / c.h, f.vmax / c.v, width, height)));
    yield;
  }

  const out = allocating(`the pixels of a ${width}x${height} frame`, () => new Uint8ClampedArray(width * height * 4));
  const n = f.comps.length;
  let transform: 'gray' | 'ycc' | 'rgb' | 'cmyk' | 'ycck';
  if (n === 1) transform = 'gray';
  else if (n === 3) {
    if (s.jfif) transform = 'ycc';
    else if (s.adobeTransform >= 0) transform = s.adobeTransform === 0 ? 'rgb' : 'ycc';
    else transform = f.comps[0].id === 82 && f.comps[1].id === 71 && f.comps[2].id === 66 ? 'rgb' : 'ycc';
  } else transform = s.adobeTransform === 0 ? 'cmyk' : s.adobeTransform >= 0 ? 'ycck' : 'cmyk';

  const [p0, p1, p2, p3] = planes;
  const perRow = Math.ceil(width / 64);
  for (let y = 0; y < height; y++) {
    tick(meter, perRow);
    if ((y & 255) === 255) yield;
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
