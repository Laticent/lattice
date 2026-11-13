/**
 * JPEG Huffman entropy decoding: the tables, the bit reader and the per-block decoders, sequential and
 * progressive. Transcribed from libjpeg-turbo 3.1's `jdhuff.c`, `jdphuff.c` and the restart handling in
 * `jdmarker.c`, so a damaged scan reads the way libjpeg reads it:
 *
 * - a Huffman code that matches nothing consumes 17 bits and decodes as symbol 0 (`jpeg_huff_decode`);
 * - past a marker or the end of the file the reader supplies zero bits, and a read that reaches into them
 *   marks the segment short (`insufficient_data`), after which the scan leaves its MCUs alone until a
 *   restart marker resynchronizes it;
 * - a restart expects RST0 to RST7 in turn and recovers from a missing or extra one by
 *   `jpeg_resync_to_restart`'s rules (keep a marker one or two ahead, skip one or two behind).
 *
 * Based in part on the work of the Independent JPEG Group: jdhuff.c, jdphuff.c and jdmarker.c are
 * Copyright (C) 1991-1998, Thomas G. Lane; lossless modifications Copyright (C) 1999, Ken Murchison;
 * libjpeg-turbo modifications Copyright (C) 2009-2011, 2012, 2015-2016, 2018-2019, 2022, 2024,
 * D. R. Commander, and Copyright (C) 2018, Matthias Räncker. Used under the IJG license and libjpeg-turbo's
 * Modified BSD license (README.ijg and LICENSE.libjpeg-turbo.md, copied unaltered beside this file); this file is a TypeScript re-expression, not the
 * original code.
 */

import { LastraError } from './errors.js';

/** Zigzag position to natural (row-major) position, with 16 extra entries for the decoder's overrun. */
export const NATURAL = new Int32Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63,
]);

/** A DHT table as the file defined it; `derive` builds the lookup the first time a scan uses it. */
export interface HuffmanSpec {
  counts: Uint8Array;
  /** 256 entries, zero past the defined symbols (libjpeg's `huffval`). */
  symbols: Uint8Array;
  derived: Huffman | null;
}

export interface Huffman {
  /** 9-bit lookahead: (length << 8) | symbol, or 0 when the code is longer than 9 bits. */
  fast: Uint16Array;
  /** Largest code of each length 1..16, or -1; index 17 is a sentinel. */
  maxcode: Int32Array;
  /** Symbol index of a code of each length: code + valoffset[length]. */
  valoffset: Int32Array;
  symbols: Uint8Array;
}

export function huffmanSpec(counts: Uint8Array, defined: Uint8Array): HuffmanSpec {
  const symbols = new Uint8Array(256);
  symbols.set(defined);
  return { counts: counts.slice(), symbols, derived: null };
}

/** libjpeg's `jpeg_make_d_derived_tbl`, with its two refusals: an over-full code space and a DC symbol over 15. */
export function derive(spec: HuffmanSpec, isDC: boolean): Huffman {
  const { counts, symbols } = spec;
  const fast = new Uint16Array(512);
  const maxcode = new Int32Array(18).fill(-1);
  const valoffset = new Int32Array(18);
  let code = 0;
  let k = 0;
  for (let l = 1; l <= 16; l++) {
    const n = counts[l - 1];
    valoffset[l] = k - code;
    // A code of length l must fit in l bits and must not be all ones (libjpeg: JERR_BAD_HUFF_TABLE).
    if (n > 0 && code + n >= 1 << l) throw new LastraError('corrupt', 'a Huffman table has more codes than its lengths allow');
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
  maxcode[17] = 0xfffff;
  if (isDC) for (let i = 0; i < k; i++) if (symbols[i] > 15) throw new LastraError('corrupt', `a DC Huffman symbol is ${symbols[i]}, over 15`);
  return { fast, maxcode, valoffset, symbols };
}

// Annex K.3 tables, used when a scan names a table the file never defined (libjpeg-turbo's jstdhuff.c).
const STD_AC_LUMA =
  '01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9fa';
const STD_AC_CHROMA =
  '000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9fa';
const hex = (s: string) => Uint8Array.from(s.match(/../g) as string[], (x) => Number.parseInt(x, 16));
const STD_DC_SYMBOLS = Uint8Array.from({ length: 12 }, (_, i) => i);
let standard: HuffmanSpec[] | null = null;

/** The Annex K table for a DC or AC slot 0 or 1, or null for slots 2 and 3 (libjpeg: JERR_NO_HUFF_TABLE). */
export function standardSpec(isDC: boolean, index: number): HuffmanSpec | null {
  if (index > 1) return null;
  if (!standard) {
    const c = (a: number[]) => Uint8Array.from(a);
    standard = [
      huffmanSpec(c([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]), STD_DC_SYMBOLS),
      huffmanSpec(c([0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]), STD_DC_SYMBOLS),
      huffmanSpec(c([0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125]), hex(STD_AC_LUMA)),
      huffmanSpec(c([0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119]), hex(STD_AC_CHROMA)),
    ];
  }
  return standard[(isDC ? 0 : 2) + index];
}

/** The marker code an end of file stands for: libjpeg's source manager inserts a fake EOI there. */
const FAKE_EOI = 0xd9;

/** The entropy-coded segment reader, with libjpeg's rules for markers, fill bytes and running out. */
export class BitReader {
  buf = 0;
  cnt = 0;
  /** Zero bits appended after the data ran out; the lowest `pad` bits of `buf`. */
  pad = 0;
  /** Stopped at a marker: `pos` is the 0xFF before `markerCode`. */
  marker = false;
  markerCode = 0;
  /** Ran off the end of the file (which reads as a marker, EOI, as libjpeg's source manager makes it). */
  eof = false;
  /** A read used padding: the segment's data ran out (libjpeg's `insufficient_data`). */
  short = false;
  /** Progressive AC: blocks left in the current end-of-band run. */
  eobrun = 0;
  /** The RSTn expected next (libjpeg's `next_restart_num`). */
  nextRestart = 0;

  constructor(
    readonly data: Uint8Array,
    public pos: number,
  ) {}

  /** The marker the reader is stopped at, or -1; the end of the file counts as EOI. */
  pending(): number {
    if (this.marker) return this.markerCode;
    if (this.eof) return FAKE_EOI;
    return -1;
  }

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
            this.markerCode = d[p];
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
    if (this.cnt < 17) this.fill();
    const e = t.fast[(this.buf >>> (this.cnt - 9)) & 511];
    if (e !== 0) {
      this.consume(e >> 8);
      return e & 255;
    }
    let l = 10;
    let code = (this.buf >>> (this.cnt - l)) & ((1 << l) - 1);
    while (code > t.maxcode[l]) {
      l++;
      code = (this.buf >>> (this.cnt - l)) & ((1 << l) - 1);
    }
    this.consume(l);
    // libjpeg: "with garbage input we may reach the sentinel value l = 17": 17 bits gone, a zero faked.
    if (l > 16) return 0;
    return t.symbols[(code + t.valoffset[l]) & 0xff];
  }

  /** Drop buffered bits and stop at the next marker, skipping stray bytes as libjpeg's `next_marker` does. */
  toMarker(): void {
    this.buf = 0;
    this.cnt = 0;
    this.pad = 0;
    if (this.marker || this.eof) return;
    this.scanForward(this.pos);
  }

  private scanForward(from: number): void {
    const d = this.data;
    let p = from;
    for (;;) {
      while (p < d.length && d[p] !== 0xff) p++;
      let q = p + 1;
      while (q < d.length && d[q] === 0xff) q++;
      if (q >= d.length) {
        this.marker = false;
        this.eof = true;
        this.pos = d.length;
        return;
      }
      if (d[q] !== 0) {
        this.marker = true;
        this.markerCode = d[q];
        this.pos = q - 1;
        return;
      }
      p = q + 1;
    }
  }

  /**
   * libjpeg's `process_restart`: drop the buffered bits, read the restart marker (or recover by
   * `jpeg_resync_to_restart`), and clear the short flag unless a marker is still pending.
   */
  restart(): void {
    this.toMarker();
    const desired = this.nextRestart;
    if (this.marker && this.markerCode === 0xd0 + desired) this.swallow();
    else {
      for (;;) {
        const m = this.pending();
        let action: 1 | 2 | 3;
        if (m < 0xc0) action = 2;
        else if (m < 0xd0 || m > 0xd7) action = 3;
        else if (m === 0xd0 + ((desired + 1) & 7) || m === 0xd0 + ((desired + 2) & 7)) action = 3;
        else if (m === 0xd0 + ((desired - 1) & 7) || m === 0xd0 + ((desired - 2) & 7)) action = 2;
        else action = 1;
        if (action === 1) {
          this.swallow();
          break;
        }
        if (action === 3) break;
        // Action 2: skip this marker and look at the next one.
        this.scanForward(this.pos + 2);
      }
    }
    this.nextRestart = (desired + 1) & 7;
    this.eobrun = 0;
    if (this.pending() < 0) this.short = false;
  }

  private swallow(): void {
    this.pos += 2;
    this.marker = false;
  }
}

export const extend = (v: number, s: number) => (v < 1 << (s - 1) ? v - (1 << s) + 1 : v);

/** What a block decoder needs of its component. */
export interface BlockTarget {
  coefs: Int16Array;
  pred: number;
  dc: Huffman | null;
  ac: Huffman | null;
}

export type BlockDecoder = (r: BitReader, c: BlockTarget, at: number) => void;

/** `decode_mcu_slow` for one block. The DC predictor wraps at 32 bits, as libjpeg's `int` does. */
export function decodeSequential(r: BitReader, c: BlockTarget, at: number): void {
  const coefs = c.coefs;
  const t = r.decode(c.dc as Huffman);
  const diff = t === 0 ? 0 : extend(r.bits(t), t);
  c.pred = (c.pred + diff) | 0;
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

/** The four progressive block decoders of `jdphuff.c`, for one scan's parameters. */
export function progressiveDecoder(ss: number, se: number, ah: number, al: number): BlockDecoder {
  if (ss === 0) {
    if (ah === 0) {
      return (r, c, at) => {
        const t = r.decode(c.dc as Huffman);
        const diff = t === 0 ? 0 : extend(r.bits(t), t);
        const pred = c.pred + diff;
        // libjpeg-turbo refuses a DC sum past a 32-bit int here (JERR_BAD_DCT_COEF).
        if (pred > 0x7fffffff || pred < -0x80000000) throw new LastraError('corrupt', 'a DC coefficient overflows 32 bits');
        c.pred = pred;
        c.coefs[at] = pred * (1 << al);
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
