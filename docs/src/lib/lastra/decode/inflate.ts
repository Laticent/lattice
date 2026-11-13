/**
 * zlib inflate (RFC 1950 around RFC 1951), in-tree, so a PNG's verdict is the same in Node, every browser
 * and a worker. The platform's `DecompressionStream` was tried first and gave different answers per
 * engine on the same bytes: on trailing data, a missing or bad Adler-32, Node decoded, Chromium decoded
 * only small streams and Firefox and WebKit refused, because a stream that errors discards the output it
 * had queued (engineering/decisions/2026-11-13-image-library.md §4).
 *
 * The policy is lastra's, one for every engine, and lenient: inflate stops as soon as the consumer has the
 * bytes the image needs. What follows (more inflated data, a second stream, bytes after the stream, the
 * Adler-32, which is never computed) is not read. Every engine displays extra data and trailing bytes;
 * on the checksum they split (Chromium ignores a bad one, Firefox and WebKit drop the last rows), and
 * lastra takes Chromium's answer.
 * Refused, as `corrupt`: a bad zlib header (method not 8, window over 32 KB, a check that is not a multiple
 * of 31, a preset dictionary), a block type of 3, a stored block whose length and its complement disagree,
 * an over-full or (apart from zlib's one-code exception) incomplete Huffman code, a code-length repeat with
 * nothing to repeat or past the end, a dynamic block with no end-of-block code, a length or distance
 * symbol that does not exist, a distance before the start of the output. Running out of input is
 * `truncated`. These are zlib's own refusals, so lastra's output matches zlib's byte for byte up to the
 * point either stops (the corpus test holds it to Python's zlib).
 *
 * Input comes from a `ByteSource`, so a PNG's IDAT chunks are read in place with no copy and no object
 * per chunk. Output goes through a 64 KB window to a consumer in slices. Work is counted per 4 KB of
 * output and per Huffman table, and the inflate yields between slices.
 */

import { LastraError } from '../errors.js';
import { tickWork } from './limits.js';
import type { WorkMeter } from './types.js';

/** Bytes in order, possibly spread over several ranges of a buffer; -1 at the end. */
export interface ByteSource {
  next(): number;
}

/** One contiguous range of `bytes` as a source. */
export function rangeSource(bytes: Uint8Array, start = 0, end = bytes.length): ByteSource {
  let at = start;
  return { next: () => (at < end ? bytes[at++] : -1) };
}

/** Takes each slice of output; returns true once it has all it wants. */
export type InflateSink = (bytes: Uint8Array, start: number, end: number) => boolean;

const INFLATE_LENGTH_BASE = Uint16Array.from([3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]);
const INFLATE_LENGTH_EXTRA = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]);
const INFLATE_DIST_BASE = Uint16Array.from([1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]);
const INFLATE_DIST_EXTRA = Uint8Array.from([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]);
const INFLATE_CODE_LENGTH_ORDER = Uint8Array.from([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);

/** Bits a first-level lookup resolves; longer codes finish canonically, one length at a time. */
const INFLATE_FAST_BITS = 9;

/** A canonical Huffman code: a FAST_BITS lookup, plus counts and sorted symbols for longer codes. */
interface InflateCode {
  /** (length << 9) | symbol for codes up to FAST_BITS long, else 0. Codes are stored bit-reversed. */
  fast: Uint16Array;
  counts: Uint16Array;
  symbols: Uint16Array;
}

function inflateCorrupt(why: string): never {
  throw new LastraError('corrupt', `the zlib stream does not inflate: ${why}`);
}

/**
 * zlib's `inflate_table` rules: over-full is an error; incomplete is an error unless the code has a
 * single code of length 1 (`allowOne`, for literal/length and distance codes).
 */
function buildInflateCode(lengths: Uint8Array, n: number, allowOne: boolean, meter: WorkMeter, fixed = false): InflateCode {
  const counts = new Uint16Array(16);
  for (let i = 0; i < n; i++) counts[lengths[i]]++;
  counts[0] = 0;
  let left = 1;
  let max = 0;
  for (let len = 1; len <= 15; len++) {
    left <<= 1;
    left -= counts[len];
    if (left < 0) inflateCorrupt('an over-full Huffman code');
    if (counts[len]) max = len;
  }
  // The fixed distance code is incomplete by design (30 of 32 five-bit codes); zlib builds it apart.
  if (!fixed && left > 0 && (max === 0 ? false : !allowOne || max !== 1)) inflateCorrupt('an incomplete Huffman code');
  const offs = new Uint16Array(16);
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + counts[len];
  const symbols = new Uint16Array(n);
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  // The fast table: walk codes in canonical order, store each short one bit-reversed (deflate sends codes
  // most significant bit first, and the reader takes bits least significant first).
  const fast = new Uint16Array(1 << INFLATE_FAST_BITS);
  tickWork(meter, 1 + ((1 << INFLATE_FAST_BITS) >> 6));
  let code = 0;
  let k = 0;
  for (let len = 1; len <= INFLATE_FAST_BITS; len++) {
    for (let i = 0; i < counts[len]; i++, k++, code++) {
      let rev = 0;
      for (let b = 0; b < len; b++) rev |= ((code >> b) & 1) << (len - 1 - b);
      for (let f = rev; f < 1 << INFLATE_FAST_BITS; f += 1 << len) fast[f] = (len << 9) | symbols[k];
    }
    code <<= 1;
  }
  return { fast, counts, symbols };
}

const INFLATE_WINDOW = 1 << 15;

/**
 * Inflate a zlib stream from `src` into `sink`. Returns true when the sink was satisfied, false when the
 * stream's last block ended first. A generator: it yields after each 64 KB of output.
 */
export function* inflateTo(src: ByteSource, sink: InflateSink, meter: WorkMeter): Generator<void, boolean> {
  let bitBuf = 0;
  let bitCnt = 0;
  const need = (n: number) => {
    while (bitCnt < n) {
      const b = src.next();
      if (b < 0) throw new LastraError('truncated', 'the zlib stream ends before the image data does');
      bitBuf |= b << bitCnt;
      bitCnt += 8;
    }
  };
  const bits = (n: number): number => {
    if (n === 0) return 0;
    need(n);
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  };
  const decodeSym = (c: InflateCode): number => {
    // Fill as far as the input allows: near the end a short code needs fewer bits than FAST_BITS.
    while (bitCnt < INFLATE_FAST_BITS) {
      const b = src.next();
      if (b < 0) break;
      bitBuf |= b << bitCnt;
      bitCnt += 8;
    }
    const e = c.fast[bitBuf & ((1 << INFLATE_FAST_BITS) - 1)];
    if (e !== 0 && e >> 9 <= bitCnt) {
      const len = e >> 9;
      bitBuf >>>= len;
      bitCnt -= len;
      return e & 511;
    }
    // Canonical decode, one bit at a time (puff's decode): bounded by 15 lengths.
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= bits(1);
      const count = c.counts[len];
      if (code - count < first) return c.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    return inflateCorrupt('a code that matches no symbol');
  };

  // RFC 1950 header.
  const cmf = bits(8);
  const flg = bits(8);
  if ((cmf & 15) !== 8) inflateCorrupt(`compression method ${cmf & 15}`);
  if (cmf >> 4 > 7) inflateCorrupt('a window over 32 KB');
  if ((cmf * 256 + flg) % 31 !== 0) inflateCorrupt('the header check');
  if (flg & 32) inflateCorrupt('a preset dictionary');

  // The window: 32 KB of history plus room to write; flushed to the sink as it fills.
  const win = new Uint8Array(INFLATE_WINDOW * 2);
  let wpos = 0;
  let flushed = 0;
  let total = 0;
  let satisfied = false;
  const flush = (): boolean => {
    if (wpos > flushed) {
      tickWork(meter, 1 + ((wpos - flushed) >> 12));
      satisfied = sink(win, flushed, wpos);
      flushed = wpos;
    }
    if (wpos >= INFLATE_WINDOW * 2 - 258) {
      win.copyWithin(0, wpos - INFLATE_WINDOW, wpos);
      wpos = INFLATE_WINDOW;
      flushed = INFLATE_WINDOW;
    }
    return satisfied;
  };

  let fixedLit: InflateCode | null = null;
  let fixedDist: InflateCode | null = null;
  const lengths = new Uint8Array(320);
  for (;;) {
    tickWork(meter, 1);
    const final = bits(1);
    const type = bits(2);
    if (type === 0) {
      // Skip to a byte boundary; whole bytes already in the bit buffer are the block's first bytes.
      const drop = bitCnt & 7;
      bitBuf >>>= drop;
      bitCnt -= drop;
      const len = bits(16);
      const nlen = bits(16);
      if (len !== (~nlen & 0xffff)) inflateCorrupt('a stored block whose length and its complement disagree');
      for (let i = 0; i < len; i++) {
        let b: number;
        if (bitCnt >= 8) b = bits(8);
        else {
          b = src.next();
          if (b < 0) throw new LastraError('truncated', 'the zlib stream ends inside a stored block');
        }
        win[wpos++] = b;
        total++;
        if (wpos >= INFLATE_WINDOW * 2 - 258 || wpos - flushed >= 1 << 15) {
          if (flush()) return true;
          yield;
        }
      }
    } else if (type === 3) {
      inflateCorrupt('block type 3');
    } else {
      let lit: InflateCode;
      let dist: InflateCode;
      if (type === 1) {
        if (!fixedLit || !fixedDist) {
          for (let i = 0; i < 288; i++) lengths[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
          fixedLit = buildInflateCode(lengths, 288, true, meter, true);
          for (let i = 0; i < 30; i++) lengths[i] = 5;
          fixedDist = buildInflateCode(lengths, 30, true, meter, true);
        }
        lit = fixedLit;
        dist = fixedDist;
      } else {
        const nlen = bits(5) + 257;
        const ndist = bits(5) + 1;
        const ncode = bits(4) + 4;
        if (nlen > 286 || ndist > 30) inflateCorrupt('too many length or distance codes');
        const clens = new Uint8Array(19);
        for (let i = 0; i < ncode; i++) clens[INFLATE_CODE_LENGTH_ORDER[i]] = bits(3);
        const cl = buildInflateCode(clens, 19, false, meter);
        lengths.fill(0);
        let i = 0;
        while (i < nlen + ndist) {
          const sym = decodeSym(cl);
          if (sym < 16) lengths[i++] = sym;
          else {
            let len = 0;
            let rep: number;
            if (sym === 16) {
              if (i === 0) inflateCorrupt('a repeat with no length before it');
              len = lengths[i - 1];
              rep = 3 + bits(2);
            } else if (sym === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (i + rep > nlen + ndist) inflateCorrupt('code lengths past the end');
            while (rep--) lengths[i++] = len;
          }
        }
        if (lengths[256] === 0) inflateCorrupt('no end-of-block code');
        lit = buildInflateCode(lengths, nlen, true, meter);
        dist = buildInflateCode(lengths.subarray(nlen), ndist, true, meter);
      }
      for (;;) {
        const sym = decodeSym(lit);
        if (sym < 256) {
          win[wpos++] = sym;
          total++;
        } else if (sym === 256) break;
        else {
          const li = sym - 257;
          if (li >= 29) inflateCorrupt(`length symbol ${sym}`);
          const len = INFLATE_LENGTH_BASE[li] + bits(INFLATE_LENGTH_EXTRA[li]);
          const ds = decodeSym(dist);
          if (ds >= 30) inflateCorrupt(`distance symbol ${ds}`);
          const d = INFLATE_DIST_BASE[ds] + bits(INFLATE_DIST_EXTRA[ds]);
          if (d > total) inflateCorrupt('a distance before the start of the output');
          for (let k = 0; k < len; k++, wpos++) win[wpos] = win[wpos - d];
          total += len;
        }
        if (wpos >= INFLATE_WINDOW * 2 - 258 || wpos - flushed >= 1 << 15) {
          if (flush()) return true;
          yield;
        }
      }
    }
    if (flush()) return true;
    if (final) return false;
  }
}

/** Inflate a whole small stream (an ICC profile), or null if it is refused or passes `cap` bytes. */
export function inflateSmall(bytes: Uint8Array, cap: number, meter: WorkMeter): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let size = 0;
  let over = false;
  const sink: InflateSink = (b, s, e) => {
    size += e - s;
    over = size > cap;
    if (!over) parts.push(b.slice(s, e));
    return over;
  };
  try {
    const steps = inflateTo(rangeSource(bytes), sink, meter);
    while (!steps.next().done) {
      // Profiles are small; run to the end.
    }
  } catch (e) {
    if (e instanceof LastraError && (e.code === 'corrupt' || e.code === 'truncated')) return null;
    throw e;
  }
  if (over) return null;
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
