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
 *
 * Refused, as `corrupt`, each with zlib's own reason (the corpus test pairs them): a bad zlib header
 * (method not 8, window over 32 KB, a check that is not a multiple of 31, a preset dictionary), a block
 * type of 3, a stored block whose length and its complement disagree, more than 286 length or 30 distance
 * codes, an over-full or (apart from zlib's one-code exception) incomplete Huffman code, a code-length
 * repeat with nothing to repeat or past the end, a dynamic block with no end-of-block code, a code that
 * matches no symbol, a length symbol of 286 or 287 or a distance symbol of 30 or 31, a distance before the
 * start of the output. Running out of input is `truncated`. Before either refusal the consumer gets every
 * byte inflated so far, as zlib hands it out, so lastra's output equals zlib's byte for byte up to the
 * point both stop (the corpus test holds it to zlib itself), and a consumer that already has the image
 * ends the inflate there.
 *
 * Input comes from a `ByteSource`, so a PNG's IDAT chunks are read in place with no copy and no object
 * per chunk. Output goes through a 64 KB window to a consumer in slices. Work is counted per block, per
 * Huffman table, per 64 code lengths and per 4 KB of output; the inflate yields after each 32 KB of output
 * and after every INFLATE_YIELD_STEPS steps of work, so a stream of millions of empty blocks yields too.
 * The three Huffman tables of a dynamic block are rebuilt in place, so a block allocates nothing.
 */

import { LastraError } from '@laticent/lastra';
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

/** Steps of work between yields when a stream makes little or no output: a few milliseconds. */
const INFLATE_YIELD_STEPS = 1 << 14;

/** A canonical Huffman code: a FAST_BITS lookup, plus counts and sorted symbols for longer codes. */
interface InflateCode {
  /** (length << 9) | symbol for codes up to FAST_BITS long, else 0. Codes are stored bit-reversed. */
  fast: Uint16Array;
  counts: Uint16Array;
  offs: Uint16Array;
  symbols: Uint16Array;
  /** The longest code length in use; a canonical walk past it matches no symbol. */
  maxLen: number;
}

function newInflateCode(symbols: number): InflateCode {
  return { fast: new Uint16Array(1 << INFLATE_FAST_BITS), counts: new Uint16Array(16), offs: new Uint16Array(16), symbols: new Uint16Array(symbols), maxLen: 0 };
}

function inflateCorrupt(why: string): never {
  throw new LastraError('corrupt', `the zlib stream does not inflate: ${why}`);
}

/**
 * Build `c` in place from `lengths[0..n)`, by zlib's `inflate_table` rules: over-full is an error;
 * incomplete is an error unless the code has a single code of length 1 (`allowOne`, for literal/length
 * and distance codes). `what` names the code in the refusal, as zlib does.
 */
function buildInflateCode(c: InflateCode, lengths: Uint8Array, n: number, allowOne: boolean, what: string, meter: WorkMeter): void {
  const { counts, offs, symbols, fast } = c;
  counts.fill(0);
  for (let i = 0; i < n; i++) counts[lengths[i]]++;
  counts[0] = 0;
  let left = 1;
  let max = 0;
  for (let len = 1; len <= 15; len++) {
    left <<= 1;
    left -= counts[len];
    if (left < 0) inflateCorrupt(`an over-full ${what} code`);
    if (counts[len]) max = len;
  }
  if (left > 0 && max !== 0 && (!allowOne || max !== 1)) inflateCorrupt(`an incomplete ${what} code`);
  c.maxLen = max;
  offs[1] = 0;
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + counts[len];
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  // The fast table: walk codes in canonical order, store each short one bit-reversed (deflate sends codes
  // most significant bit first, and the reader takes bits least significant first).
  fast.fill(0);
  // A build walks its n lengths three times and fills the 512-entry table: charge for both.
  tickWork(meter, 1 + ((3 * n + (1 << INFLATE_FAST_BITS)) >> 4));
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
}

const INFLATE_WINDOW = 1 << 15;

/**
 * Inflate a zlib stream from `src` into `sink`. Returns true when the sink was satisfied, false when the
 * stream's last block ended first. A generator: it yields after each 32 KB of output and every
 * INFLATE_YIELD_STEPS steps of work.
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
  const decodeSym = (c: InflateCode, what: string): number => {
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
    // Canonical decode, one bit at a time (puff's decode), up to the code's longest length: past it no
    // symbol can match (the missing code of a one-code table), which zlib refuses at once.
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= c.maxLen; len++) {
      code |= bits(1);
      const count = c.counts[len];
      if (code - count < first) return c.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    return inflateCorrupt(`an invalid ${what} code`);
  };

  // The window: 32 KB of history plus room to write; flushed to the sink as it fills.
  const win = new Uint8Array(INFLATE_WINDOW * 2);
  let wpos = 0;
  let flushed = 0;
  let total = 0;
  let satisfied = false;
  let inSink = false;
  const deliver = (): boolean => {
    if (wpos > flushed) {
      tickWork(meter, 1 + ((wpos - flushed) >> 12));
      inSink = true;
      satisfied = sink(win, flushed, wpos);
      inSink = false;
      flushed = wpos;
    }
    return satisfied;
  };
  const flush = (): boolean => {
    deliver();
    if (wpos >= INFLATE_WINDOW * 2 - 258) {
      win.copyWithin(0, wpos - INFLATE_WINDOW, wpos);
      wpos = INFLATE_WINDOW;
      flushed = INFLATE_WINDOW;
    }
    return satisfied;
  };

  try {
    // RFC 1950 header.
    const cmf = bits(8);
    const flg = bits(8);
    if ((cmf & 15) !== 8) inflateCorrupt(`compression method ${cmf & 15}`);
    if (cmf >> 4 > 7) inflateCorrupt('a window over 32 KB');
    if ((cmf * 256 + flg) % 31 !== 0) inflateCorrupt('the header check');
    if (flg & 32) inflateCorrupt('a preset dictionary');

    // The fixed codes are complete: 288 literal/length codes and 32 distance codes, of which 286, 287, 30
    // and 31 exist only to be refused (RFC 1951 3.2.6), as zlib refuses them.
    let fixedLit: InflateCode | null = null;
    let fixedDist: InflateCode | null = null;
    const dynLit = newInflateCode(288);
    const dynDist = newInflateCode(32);
    const dynCl = newInflateCode(19);
    const lengths = new Uint8Array(320);
    const clens = new Uint8Array(19);
    let yieldMark = meter.steps;
    for (;;) {
      tickWork(meter, 1);
      if (meter.steps - yieldMark >= INFLATE_YIELD_STEPS) {
        yieldMark = meter.steps;
        yield;
      }
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
            yieldMark = meter.steps;
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
            fixedLit = newInflateCode(288);
            fixedDist = newInflateCode(32);
            for (let i = 0; i < 288; i++) lengths[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
            buildInflateCode(fixedLit, lengths, 288, true, 'literal/length', meter);
            lengths.fill(5, 0, 32);
            buildInflateCode(fixedDist, lengths, 32, true, 'distance', meter);
          }
          lit = fixedLit;
          dist = fixedDist;
        } else {
          const nlen = bits(5) + 257;
          const ndist = bits(5) + 1;
          const ncode = bits(4) + 4;
          if (nlen > 286 || ndist > 30) inflateCorrupt('too many length or distance symbols');
          clens.fill(0);
          for (let i = 0; i < ncode; i++) clens[INFLATE_CODE_LENGTH_ORDER[i]] = bits(3);
          buildInflateCode(dynCl, clens, 19, false, 'code-length', meter);
          lengths.fill(0);
          tickWork(meter, (nlen + ndist) >> 6);
          let i = 0;
          while (i < nlen + ndist) {
            const sym = decodeSym(dynCl, 'code-length');
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
              if (i + rep > nlen + ndist) inflateCorrupt('code lengths that repeat past the end');
              while (rep--) lengths[i++] = len;
            }
          }
          if (lengths[256] === 0) inflateCorrupt('no end-of-block code');
          buildInflateCode(dynLit, lengths, nlen, true, 'literal/length', meter);
          buildInflateCode(dynDist, lengths.subarray(nlen), ndist, true, 'distance', meter);
          lit = dynLit;
          dist = dynDist;
        }
        for (;;) {
          const sym = decodeSym(lit, 'literal/length');
          if (sym < 256) {
            win[wpos++] = sym;
            total++;
          } else if (sym === 256) break;
          else {
            const li = sym - 257;
            if (li >= 29) inflateCorrupt(`length symbol ${sym}`);
            const len = INFLATE_LENGTH_BASE[li] + bits(INFLATE_LENGTH_EXTRA[li]);
            const ds = decodeSym(dist, 'distance');
            if (ds >= 30) inflateCorrupt(`distance symbol ${ds}`);
            const d = INFLATE_DIST_BASE[ds] + bits(INFLATE_DIST_EXTRA[ds]);
            if (d > total) inflateCorrupt('a distance before the start of the output');
            for (let k = 0; k < len; k++, wpos++) win[wpos] = win[wpos - d];
            total += len;
          }
          if (wpos >= INFLATE_WINDOW * 2 - 258 || wpos - flushed >= 1 << 15) {
            if (flush()) return true;
            yieldMark = meter.steps;
            yield;
          }
        }
      }
      if (flush()) return true;
      if (final) return false;
    }
  } catch (e) {
    // The stream failed: hand over what was inflated before it, as zlib does. A consumer that now has all
    // it needs (the image ended before the damage) is satisfied, and the inflate ends there.
    if (!(e instanceof LastraError) || inSink) throw e;
    if (deliver()) return true;
    throw e;
  }
}

/**
 * Inflate a whole small stream (an ICC profile), or null if it is refused or passes `cap` bytes. A
 * generator, so a hostile profile yields and can be aborted like the image data.
 */
export function* inflateWhole(bytes: Uint8Array, cap: number, meter: WorkMeter): Generator<void, Uint8Array | null> {
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
    yield* inflateTo(rangeSource(bytes), sink, meter);
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
