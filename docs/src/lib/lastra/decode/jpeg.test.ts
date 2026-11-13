// @vitest-environment node
/**
 * decodeJpeg on hand-edited inputs: each refusal and its code, the limits checked before allocation,
 * and the hostile shapes from the design note §4 (a Huffman table that never decodes, a scan with no
 * data, a DNL marker, a huge declared size, a zero-length segment, a progressive scan replayed).
 */

import { describe, expect, test } from 'vitest';
import { decodeJpegSync, isLastraError, type LastraErrorCode, type WorkMeter } from './index.js';
import { concat, fixture, jpegSegments, replaceRange, scanStarts, sha256, workBudget } from './test-support.js';

const base = fixture('jpeg', 'odd-base-420.jpg');
const prog = fixture('jpeg', 'mid-prog-420-q75.jpg');
const restart = fixture('jpeg', 'mid-base-420-restart-mcu5.jpg');

function refusal(bytes: Uint8Array, opts?: Parameters<typeof decodeJpegSync>[1]): LastraErrorCode {
  try {
    decodeJpegSync(bytes, opts);
  } catch (e) {
    if (isLastraError(e)) return e.code;
    throw e;
  }
  throw new Error('decoded, expected a refusal');
}

/** Decode, or refuse with a LastraError; either way within the proven work budget. */
function bounded(bytes: Uint8Array, maxPixels = 1 << 20): { steps: number; code: LastraErrorCode | 'ok' } {
  const meter: WorkMeter = { steps: 0, limit: workBudget('jpeg', bytes.length, maxPixels) };
  try {
    decodeJpegSync(bytes, { maxPixels, meter });
    return { steps: meter.steps, code: 'ok' };
  } catch (e) {
    if (!isLastraError(e)) throw e;
    expect(e.message).not.toContain('work limit');
    return { steps: meter.steps, code: e.code };
  }
}

const seg = (b: Uint8Array, marker: number) => {
  const s = jpegSegments(b).find((x) => x.marker === marker);
  if (!s) throw new Error(`no 0x${marker.toString(16)} segment`);
  return s;
};

/** A copy of `b` with one byte at `at` set to `v`. */
const poke = (b: Uint8Array, at: number, v: number) => {
  const c = b.slice();
  c[at] = v;
  return c;
};

describe('decodeJpeg refuses with a typed code', () => {
  test('empty, one byte, no SOI', () => {
    expect(refusal(new Uint8Array(0))).toBe('truncated');
    expect(refusal(Uint8Array.from([0xff]))).toBe('truncated');
    expect(refusal(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe('bad-marker');
  });

  test('every cut short of EOI is truncated: in a header, a table, a scan, between progressive scans', () => {
    for (const file of [base, prog]) {
      const step = Math.max(1, Math.floor(file.length / 97));
      for (let cut = 2; cut < file.length; cut += step) expect(refusal(file.subarray(0, cut)), `cut at ${cut}`).toBe('truncated');
      expect(refusal(file.subarray(0, file.length - 2))).toBe('truncated'); // no EOI at all
      for (const at of scanStarts(file)) expect(refusal(file.subarray(0, at))).toBe('truncated');
    }
  });

  test('unsupported frames: 12-bit, arithmetic, lossless, hierarchical, DNL height, two components', () => {
    const sof = seg(base, 0xc0);
    expect(refusal(poke(base, sof.start + 4, 12))).toBe('unsupported');
    for (const m of [0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) expect(refusal(poke(base, sof.start + 1, m)), m.toString(16)).toBe('unsupported');
    const noHeight = base.slice();
    noHeight.set([0, 0], sof.start + 5);
    expect(refusal(noHeight)).toBe('unsupported');
    const twoComps = replaceRange(base, sof.start, sof.end, [0xff, 0xc0, 0, 14, 8, 0, 8, 0, 8, 2, 1, 0x11, 0, 2, 0x11, 1]);
    expect(refusal(twoComps)).toBe('unsupported');
    const third = base.slice();
    third[sof.start + 11] = 0x31; // luma 3x1
    third[sof.start + 14] = 0x21; // Cb 2x1: 3 is not a whole multiple of 2
    expect(refusal(third)).toBe('unsupported');
  });

  test('impossible frames: zero width, zero sampling, no components, a duplicate id, a bad length', () => {
    const sof = seg(base, 0xc0);
    const noWidth = base.slice();
    noWidth.set([0, 0], sof.start + 7);
    expect(refusal(noWidth)).toBe('corrupt');
    expect(refusal(poke(base, sof.start + 11, 0x01))).toBe('corrupt');
    expect(refusal(poke(base, sof.start + 13, base[sof.start + 10]))).toBe('corrupt');
    expect(refusal(replaceRange(base, sof.start, sof.end, [0xff, 0xc0, 0, 8, 8, 0, 8, 0, 8, 0]))).toBe('corrupt');
    expect(refusal(poke(base, sof.start + 9, 4))).toBe('bad-marker');
  });

  test('a segment shorter than its length field, or running past the file', () => {
    const dqt = seg(base, 0xdb);
    for (const len of [0, 1]) {
      const b = base.slice();
      b.set([0, len], dqt.start + 2);
      expect(refusal(b)).toBe('bad-marker');
    }
    const long = base.slice();
    long.set([0xff, 0xf0], dqt.start + 2);
    expect(refusal(long)).toBe('truncated');
  });

  test('a huge declared size is refused on the frame header, before any allocation', () => {
    const sof = seg(base, 0xc0);
    const huge = base.slice();
    huge.set([0xff, 0xff, 0xff, 0xff], sof.start + 5);
    const meter: WorkMeter = { steps: 0 };
    expect(refusal(huge, { meter })).toBe('too-large');
    expect(meter.steps).toBeLessThan(10);
    expect(refusal(base, { maxPixels: 7 * 13 - 1 })).toBe('too-large');
    expect(decodeJpegSync(base, { maxPixels: 7 * 13 }).width).toBe(7);
    expect(refusal(base, { maxBytes: base.length - 1 })).toBe('too-large');
  });

  test('over-full Huffman tables, a DC symbol over 15, more than 256 symbols', () => {
    const dht = seg(base, 0xc4);
    const table = (counts: number[], symbols: number[], tc = 0) => [0xff, 0xc4, 0, 2 + 17 + symbols.length, tc << 4, ...counts, ...symbols];
    const counts = (at: Record<number, number>) => Array.from({ length: 16 }, (_, i) => at[i + 1] ?? 0);
    expect(refusal(replaceRange(base, dht.start, dht.end, table(counts({ 1: 3 }), [0, 1, 2])))).toBe('corrupt');
    expect(refusal(replaceRange(base, dht.start, dht.end, table(counts({ 1: 2 }), [0, 1])))).toBe('corrupt'); // all-ones code
    expect(refusal(replaceRange(base, dht.start, dht.end, table(counts({ 2: 1 }), [16])))).toBe('corrupt');
    const many = [0xff, 0xc4, 0x01, 0x13, 0x10, ...counts({ 16: 255, 15: 2 })];
    expect(refusal(replaceRange(base, dht.start, dht.end, many))).toBe('corrupt');
  });

  test('tables the scan needs but the file never defined', () => {
    const noDqt = jpegSegments(base)
      .filter((s) => s.marker === 0xdb)
      .reverse()
      .reduce((b, s) => replaceRange(b, s.start, s.end, []), base);
    expect(refusal(noDqt)).toBe('corrupt');
    const sos = seg(base, 0xda);
    expect(refusal(poke(base, sos.start + 6, 0x22))).toBe('corrupt'); // Huffman tables 2 and 2: never defined, no Annex K
  });

  test('marker order: a second SOI, a scan before its frame, a second frame, an unknown marker', () => {
    expect(refusal(concat(base.subarray(0, 2), Uint8Array.from([0xff, 0xd8]), base.subarray(2)))).toBe('bad-marker');
    const sof = seg(base, 0xc0);
    const sos = seg(base, 0xda);
    expect(refusal(concat(base.subarray(0, sof.start), base.subarray(sos.start)))).toBe('bad-marker');
    expect(refusal(concat(base.subarray(0, sos.start), base.subarray(sof.start, sof.end), base.subarray(sos.start)))).toBe('bad-marker');
    expect(refusal(concat(base.subarray(0, 2), Uint8Array.from([0xff, 0x02, 0, 2]), base.subarray(2)))).toBe('bad-marker');
  });

  test('scan headers: a component not in the frame, the wrong length, an MCU over 10 blocks', () => {
    const sos = seg(base, 0xda);
    expect(refusal(poke(base, sos.start + 5, 99))).toBe('corrupt');
    expect(refusal(poke(base, sos.start + 3, 13))).toBe('bad-marker');
    const sof = seg(base, 0xc0);
    expect(refusal(poke(base, sof.start + 11, 0x43))).toBe('corrupt'); // 12 luma blocks + 2 chroma in one MCU
  });

  test('a component in two sequential scans', () => {
    const sos = seg(base, 0xda);
    const eoi = base.length - 2;
    const twice = concat(base.subarray(0, eoi), base.subarray(sos.start, eoi), base.subarray(eoi));
    expect(refusal(twice)).toBe('corrupt');
  });

  test('a progressive scan replayed out of sequence, once or two thousand times', () => {
    const starts = scanStarts(prog);
    const eoi = prog.length - 2;
    // The first scan is the DC first pass; sending it again would refine nothing and cost a full pass.
    const first = prog.subarray(starts[0], starts[1]);
    const meter: WorkMeter = { steps: 0 };
    expect(refusal(concat(prog.subarray(0, eoi), first, prog.subarray(eoi)), { meter })).toBe('corrupt');
    const many = concat(prog.subarray(0, starts[1]), ...Array.from({ length: 2000 }, () => first), prog.subarray(starts[1]));
    const r = bounded(many);
    expect(r.code).toBe('corrupt');
    expect(r.steps).toBeLessThan(5 * meter.steps);
  });
});

describe('decodeJpeg ends in bounded work on hostile shapes that are not refusals', () => {
  test('a Huffman table whose one code is 16 bits: every symbol is a bad code', () => {
    const dhts = jpegSegments(base).filter((s) => s.marker === 0xc4);
    const one16 = (tc: number, th: number) => [(tc << 4) | th, ...Array.from({ length: 15 }, () => 0), 1, 0];
    const tables = [0xff, 0xc4, 0, 2 + 4 * 18, ...one16(0, 0), ...one16(0, 1), ...one16(1, 0), ...one16(1, 1)];
    let b = base;
    for (const s of dhts.reverse()) b = replaceRange(b, s.start, s.end, []);
    const sos = seg(b, 0xda);
    b = concat(b.subarray(0, sos.start), Uint8Array.from(tables), b.subarray(sos.start));
    const r = bounded(b);
    expect(['ok', 'truncated']).toContain(r.code);
  });

  test('a scan with no entropy data at all: the first MCU reads zero bits, the rest stay mid-gray', () => {
    const mid = fixture('jpeg', 'mid-base-420-q75.jpg');
    const sos = seg(mid, 0xda);
    const empty = concat(mid.subarray(0, sos.end), Uint8Array.from([0xff, 0xd9]));
    const r = bounded(empty);
    expect(r.code).toBe('ok');
    expect(r.steps).toBeLessThan(2000); // segments, one MCU, block rows and output rows: no pass over every MCU
    const img = decodeJpegSync(empty);
    expect(Array.from(img.data.subarray(img.data.length - 4))).toEqual([128, 128, 128, 255]);
  });

  test('a DNL marker after the scan, stray bytes and FF 00 between segments: ignored, as libjpeg does', () => {
    const want = sha256(decodeJpegSync(base).data);
    const eoi = base.length - 2;
    const dnl = concat(base.subarray(0, eoi), Uint8Array.from([0xff, 0xdc, 0, 4, 0, 13]), base.subarray(eoi));
    expect(sha256(decodeJpegSync(dnl).data)).toBe(want);
    const dqt = seg(base, 0xdb);
    const stray = concat(base.subarray(0, dqt.start), Uint8Array.from([1, 2, 3, 0xff, 0x00, 0xff, 0xff]), base.subarray(dqt.start));
    expect(sha256(decodeJpegSync(stray).data)).toBe(want);
    expect(sha256(decodeJpegSync(concat(base, Uint8Array.from([0xde, 0xad]))).data)).toBe(want);
  });

  test('garbage between restart markers stays inside its interval', () => {
    const starts = scanStarts(restart);
    const hit = restart.slice();
    for (let i = starts[0] + 400; i < starts[0] + 420; i++) hit[i] = 0x55;
    const r = bounded(hit);
    expect(r.code).toBe('ok');
    const clean = decodeJpegSync(restart).data;
    const dirty = decodeJpegSync(hit).data;
    let differ = 0;
    for (let i = 0; i < clean.length; i += 4) if (clean[i] !== dirty[i] || clean[i + 1] !== dirty[i + 1] || clean[i + 2] !== dirty[i + 2]) differ++;
    // An interval is 5 MCUs of 16x16; the damage stays within a couple of intervals, not the image.
    expect(differ).toBeGreaterThan(0);
    expect(differ).toBeLessThan(4 * 5 * 256);
  });

  test('the work meter refuses once its limit is passed', () => {
    expect(refusal(prog, { meter: { steps: 0, limit: 50 } })).toBe('too-large');
  });
});
