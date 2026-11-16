// @vitest-environment node
/**
 * decodeJpeg on hand-edited inputs: each refusal and its code, the limits checked before allocation,
 * and the hostile shapes from the design note §4 (a Huffman table that never decodes, a scan with no
 * data, a DNL marker, a huge declared size, a zero-length segment, a progressive scan replayed).
 */

import { describe, expect, test } from 'vitest';
import { COEF_WORK_FLOOR, COEF_WORK_PER_BLOCK, decodeJpeg, decodeJpegSync, isLastraError, type LastraErrorCode, MAX_SCANS, type WorkMeter } from './index.js';
import {
  bytesOf,
  concat,
  dhtOne,
  dqtAll,
  driSeg,
  EOI,
  fixture,
  jpegSegments,
  replaceRange,
  SOI,
  scanStarts,
  sha256,
  sofSeg,
  sosSeg,
  workLimit,
} from './test-support.js';

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

/** Decode, or refuse with a LastraError; either way within the proven work limit. */
function bounded(bytes: Uint8Array, maxPixels = 1 << 20): { steps: number; code: LastraErrorCode | 'ok' } {
  const meter: WorkMeter = { steps: 0, limit: workLimit('jpeg', bytes) };
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

  test('cut short: truncated inside a marker segment or before a scan is whole; decoded in scan data after one', () => {
    for (const file of [base, prog]) {
      // Where each marker segment (its header) lies, and where scan 1's data ends.
      const segs: [number, number][] = [];
      let p = 2;
      while (p + 4 <= file.length) {
        const m = file[p + 1];
        if (m === 0xd9) break;
        const e = p + 2 + ((file[p + 2] << 8) | file[p + 3]);
        segs.push([p, e]);
        p = e;
        if (m === 0xda) {
          while (p + 1 < file.length && !(file[p] === 0xff && file[p + 1] !== 0 && (file[p + 1] < 0xd0 || file[p + 1] > 0xd7))) p++;
        }
      }
      const starts = scanStarts(file);
      const firstWhole = starts.length > 1 ? starts[1] : file.length - 2;
      const step = Math.max(1, Math.floor(file.length / 97));
      for (let cut = 2; cut < file.length; cut += step) {
        const inSegment = segs.some(([a, e]) => cut > a && cut < e);
        if (cut < firstWhole || inSegment) expect(refusal(file.subarray(0, cut)), `cut at ${cut}`).toBe('truncated');
        else expect(decodeJpegSync(file.subarray(0, cut)).width, `cut at ${cut}`).toBeGreaterThan(0);
      }
      // At a scan boundary the early end reads exactly as EOI there would.
      for (const at of starts.slice(1)) expect(sha256(decodeJpegSync(file.subarray(0, at)).data)).toBe(sha256(decodeJpegSync(concat(file.subarray(0, at), Uint8Array.from(EOI))).data));
      // Inside a later scan header: truncated, as libjpeg refuses it.
      for (const at of starts.slice(1)) expect(refusal(file.subarray(0, at + 5))).toBe('truncated');
    }
    // A baseline file has one scan: cut anywhere in it, no scan is whole, so it is refused, not shown part gray.
    expect(refusal(base.subarray(0, scanStarts(base)[0] + 20))).toBe('truncated');
  });

  test('a progressive scan naming a Huffman table the file never defined is refused (no Annex K fallback)', () => {
    const file = bytesOf(SOI, dqtAll(), sofSeg(0xc2, 8, 8, [[1, 0x11, 0]]), sosSeg([1], 0, 0, 0, 0), [0], EOI);
    expect(refusal(file)).toBe('corrupt');
    // The same scan in a sequential frame reads Annex K's tables, as libjpeg-turbo does for Motion-JPEG.
    const seq = bytesOf(SOI, dqtAll(), sofSeg(0xc0, 8, 8, [[1, 0x11, 0]]), sosSeg([1], 0, 63, 0, 0), [0], EOI);
    expect(decodeJpegSync(seq).width).toBe(8);
  });

  test('a progressive DC sum past 32 bits is refused, as libjpeg-turbo refuses it', () => {
    // DC table: one 1-bit code ('0') for symbol 15, then 15 one-bits: every block adds +32767. 65,537 blocks
    // pass 2^31; 0xFF data bytes are stuffed with 0x00.
    const blocks = 257 * 256; // 2056 x 2048
    const data = Array.from({ length: blocks }, () => [0x7f, 0xff, 0x00]).flat();
    const file = bytesOf(SOI, dqtAll(), sofSeg(0xc2, 2056, 2048, [[1, 0x11, 0]]), dhtOne(0, 0, 15), sosSeg([1], 0, 0, 0, 0), data, EOI);
    expect(refusal(file)).toBe('corrupt');
  });

  test('a scan header whose length cannot fit its count is refused, even where the file then ends early', () => {
    const at = scanStarts(prog)[3];
    expect(refusal(poke(prog, at + 2, 0x99))).toBe('bad-marker');
  });

  test('a frame with no scan is refused, and costs no coefficient memory', () => {
    const noScan = bytesOf(SOI, dqtAll(), sofSeg(0xc2, 10000, 10000, [[1, 0x11, 0]]), EOI);
    const meter: WorkMeter = { steps: 0 };
    expect(refusal(noScan, { meter })).toBe('corrupt');
    expect(meter.steps).toBeLessThan(10);
    expect(refusal(bytesOf(SOI, dqtAll(), sofSeg(0xc0, 8, 8, [[1, 0x11, 0]])))).toBe('truncated');
  });

  test('progressive parameters libjpeg refuses: Al over 13, Al not Ah - 1, an AC band over two components', () => {
    const head = (scan: number[]) => bytesOf(SOI, dqtAll(), sofSeg(0xc2, 8, 8, [[1, 0x11, 0], [2, 0x11, 0], [3, 0x11, 0]]), dhtOne(0, 0), dhtOne(1, 0), scan, [0], EOI);
    expect(refusal(head(sosSeg([1], 0, 0, 0, 14)))).toBe('corrupt');
    expect(refusal(head(sosSeg([1], 0, 0, 3, 1)))).toBe('corrupt');
    expect(refusal(head(sosSeg([1, 2], 1, 5, 0, 0)))).toBe('corrupt');
    expect(refusal(head(sosSeg([1], 5, 3, 0, 0)))).toBe('corrupt');
    expect(decodeJpegSync(head(sosSeg([1], 0, 0, 0, 13))).width).toBe(8);
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

  test('a progressive scan replayed: decoded once more, as libjpeg does; replayed past the scan cap, refused', () => {
    const starts = scanStarts(prog);
    const eoi = prog.length - 2;
    const first = prog.subarray(starts[0], starts[1]);
    const once = bounded(concat(prog.subarray(0, eoi), first, prog.subarray(eoi)));
    expect(once.code).toBe('ok');
    const many = concat(prog.subarray(0, starts[1]), ...Array.from({ length: MAX_SCANS }, () => first), prog.subarray(starts[1]));
    expect(bounded(many).code).toBe('too-large');
    // Scans with no data visit no block, so only the scan cap stops them, after MAX_SCANS headers.
    const empty = sosSeg([1], 0, 0, 1, 0);
    const file = bytesOf(SOI, dqtAll(), sofSeg(0xc2, 64, 64, [[1, 0x11, 0]]), dhtOne(0, 0), sosSeg([1], 0, 0, 0, 1), [0], ...Array.from({ length: MAX_SCANS }, () => empty), EOI);
    try {
      decodeJpegSync(file);
      throw new Error('decoded');
    } catch (e) {
      expect(String(e)).toContain(`more than ${MAX_SCANS} scans`);
    }
  });

  test('end-of-band runs over zero blocks cost nothing per block; replayed refinements of real data stop at the work cap', () => {
    // A 2056 x 2048 gray frame: 65,792 blocks, just past the floor (2^16), so the per-block cap applies.
    // (4096 x 4096 tested the same with four times the work and ran past 20 s under load.)
    const w = 2056;
    const h = 2048;
    const blocks = (w / 8) * (h / 8);
    expect(COEF_WORK_PER_BLOCK * blocks).toBeGreaterThan(COEF_WORK_FLOOR);
    const bitsToBytes = (bits: number[]) => {
      const out: number[] = [];
      for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] ?? 1);
        out.push(v);
        if (v === 0xff) out.push(0);
      }
      return out;
    };
    // End-of-band runs: the 1-bit code for EOB14 (symbol 0xE0), 14 one-bits: 32,767 blocks a run.
    const eobRuns = (extraPerBlock: number) => {
      const bits: number[] = [];
      for (let left = blocks; left > 0; left -= 32767) {
        bits.push(0, ...Array.from({ length: 14 }, () => 1));
        for (let i = 0; i < Math.min(left, 32767) * extraPerBlock; i++) bits.push(0); // correction bits
      }
      return bitsToBytes(bits);
    };
    const sosTables = (ss: number, se: number, ah: number, al: number, ta: number) => [0xff, 0xda, 0, 8, 1, 1, ta, ss, se, (ah << 4) | al];
    const twoSymbols = [0xff, 0xc4, 0, 21, 0x10, 1, 1, ...Array.from({ length: 14 }, () => 0), 0x01, 0x00]; // AC 0: '0' -> (0,1), '10' -> EOB
    const head = [SOI, dqtAll(), sofSeg(0xc2, w, h, [[1, 0x11, 0]]), dhtOne(0, 0), twoSymbols, dhtOne(1, 1, 0xe0), sosSeg([1], 0, 0, 0, 1), [0, 0, 0, 0]];
    // Over zero blocks: a first pass of runs only, then 40 full-band refinements of runs only. Free.
    const zeroFirst = [...sosTables(1, 63, 0, 1, 1), ...eobRuns(0)];
    const zeroRefine = Array.from({ length: 40 }, () => [...sosTables(1, 63, 1, 0, 1), ...eobRuns(0)]);
    const free = bounded(bytesOf(...head, zeroFirst, ...zeroRefine, EOI), 1 << 24);
    expect(free.code).toBe('ok');
    // The scans cost a step per run and per 64 skipped blocks; the rest is the output (an IDCT step per
    // block and two per 64 pixels). Walking the runs block by block would add 8 steps a block per scan.
    expect(free.steps).toBeLessThan(blocks + 3 * ((w * h) / 64) + 41 * (blocks / 64) + 2000);
    // Over real data: coefficient 1 nonzero in every block (4 bits a block), then full-band refinements,
    // each reading a correction bit per block: 63 coefficients of work per block per scan, past 1,024.
    const dataFirst = [...sosTables(1, 63, 0, 1, 0), ...bitsToBytes(Array.from({ length: blocks }, () => [0, 1, 1, 0]).flat())];
    const dataRefine = Array.from({ length: 20 }, () => [...sosTables(1, 63, 1, 0, 1), ...eobRuns(1)]);
    const capped = bounded(bytesOf(...head, dataFirst, ...dataRefine, EOI), 1 << 24);
    expect(capped.code).toBe('too-large');
  });

  test('empty scans with a restart every MCU stop at the next marker: work in the scans, not the image', () => {
    const scans: number[][] = [];
    for (let a = 13; a >= 1; a--) scans.push(sosSeg([1], 0, 0, a, a - 1));
    const file = bytesOf(SOI, dqtAll(), sofSeg(0xc2, 4096, 4096, [[1, 0x11, 0]]), driSeg(1), dhtOne(0, 0), sosSeg([1], 0, 0, 0, 13), ...scans, EOI);
    const meter: WorkMeter = { steps: 0 };
    decodeJpegSync(file, { meter });
    // 14 scans of one MCU each, then the output (262,144 blocks, 16 MP): nothing per scan per block.
    expect(meter.steps).toBeLessThan(2 * 262_144 + 3 * (16_777_216 / 64));
    const scanWork = meter.steps;
    const twice = bytesOf(SOI, dqtAll(), sofSeg(0xc2, 4096, 4096, [[1, 0x11, 0]]), driSeg(1), dhtOne(0, 0), sosSeg([1], 0, 0, 0, 13), ...scans, ...scans, EOI);
    const m2: WorkMeter = { steps: 0 };
    decodeJpegSync(twice, { meter: m2 });
    expect(m2.steps - scanWork).toBeLessThan(100); // 13 more empty scans cost a handful of steps
  });

  test('a file of unused Huffman tables costs a step a table and no lookup is built for them', () => {
    const table = [0x10, 1, ...Array.from({ length: 15 }, () => 0), 0];
    const perSeg = 3000;
    const body = Array.from({ length: perSeg }, () => table).flat();
    const dht = [0xff, 0xc4, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
    const file = bytesOf(SOI, dqtAll(), ...Array.from({ length: 20 }, () => dht), sofSeg(0xc0, 8, 8, [[1, 0x11, 0]]), sosSeg([1], 0, 63, 0, 0), [0], EOI);
    const meter: WorkMeter = { steps: 0 };
    decodeJpegSync(file, { meter });
    expect(meter.steps).toBeGreaterThanOrEqual(20 * perSeg);
    expect(meter.steps).toBeLessThan(20 * perSeg + 200);
  });
});

describe('decodeJpeg yields and can be aborted', () => {
  test('the async decode gives the event loop turns while it works', async () => {
    // A check-phase callback that re-queues itself runs once per event-loop turn the decode gives back.
    let turns = 0;
    let done = false;
    const tick = () => {
      if (!done) {
        turns++;
        setImmediate(tick);
      }
    };
    setImmediate(tick);
    const img = await decodeJpeg(fixture('jpeg', 'big-prog-444-q90.jpg'));
    done = true;
    expect(img.width).toBe(1001);
    expect(turns).toBeGreaterThan(2);
  });

  test('an aborted signal rejects with its reason, before or during the decode', async () => {
    const before = new AbortController();
    before.abort(new Error('stop before'));
    await expect(decodeJpeg(prog, { signal: before.signal })).rejects.toThrow('stop before');
    // decodeJpeg runs to its first yield before it returns, so an abort right after it is an abort during.
    const during = new AbortController();
    const meter: WorkMeter = { steps: 0 };
    const pending = decodeJpeg(fixture('jpeg', 'big-prog-444-q90.jpg'), { signal: during.signal, meter });
    during.abort(new Error('stop during'));
    await expect(pending).rejects.toThrow('stop during');
    const whole: WorkMeter = { steps: 0 };
    decodeJpegSync(fixture('jpeg', 'big-prog-444-q90.jpg'), { meter: whole });
    expect(meter.steps).toBeGreaterThan(0);
    expect(meter.steps).toBeLessThan(whole.steps);
  });

  test('decodeJpegSync and decodeJpeg give the same pixels', async () => {
    expect(sha256((await decodeJpeg(prog)).data)).toBe(sha256(decodeJpegSync(prog).data));
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
    // Segments, one MCU, then the output (about 1.5 blocks and 3 64-pixel chunks per 64 pixels): the scan
    // stops at EOI instead of walking every MCU.
    expect(r.steps).toBeLessThan(100 + 6 * Math.ceil((257 * 193) / 64));
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

describe('decodeJpeg on files of many tiny segments, and scans under every other cap', () => {
  const one = fixture('jpeg', 'one-base-420.jpg');
  /** `segments` laid between SOI and the rest of a 1x1 JPEG. */
  const behind = (...segments: Uint8Array[]) => concat(Uint8Array.from(SOI), ...segments, one.subarray(2));
  const iccSeg = (seq: number, count: number, data: number[]) => bytesOf([0xff, 0xe2, 0, 16 + data.length], Array.from('ICC_PROFILE\0', (c) => c.charCodeAt(0)), [seq, count], data);
  const repeat = (unit: Uint8Array, n: number) => {
    const out = new Uint8Array(unit.length * n);
    for (let i = 0; i < n; i++) out.set(unit, i * unit.length);
    return out;
  };
  /** Event-loop turns `decodeJpeg` gives back while it decodes `bytes`. */
  async function turnsDuring(bytes: Uint8Array): Promise<number> {
    let turns = 0;
    let done = false;
    const tick = () => {
      if (!done) {
        turns++;
        setImmediate(tick);
      }
    };
    setImmediate(tick);
    await decodeJpeg(bytes);
    done = true;
    return turns;
  }

  test('ICC chunks join in sequence order; a duplicate, a second count or a sequence of 0 or past the count drops the profile', () => {
    expect(Array.from(decodeJpegSync(behind(iccSeg(2, 2, [3, 4]), iccSeg(1, 2, [1, 2]))).icc ?? [])).toEqual([1, 2, 3, 4]);
    expect(decodeJpegSync(behind(iccSeg(1, 2, [1]), iccSeg(1, 2, [1]), iccSeg(2, 2, [2]))).icc).toBeNull();
    expect(decodeJpegSync(behind(iccSeg(1, 2, [1]), iccSeg(2, 3, [2]))).icc).toBeNull();
    expect(decodeJpegSync(behind(iccSeg(0, 1, [1]))).icc).toBeNull();
    expect(decodeJpegSync(behind(iccSeg(2, 1, [1]))).icc).toBeNull();
    expect(decodeJpegSync(behind(iccSeg(1, 2, [1]))).icc).toBeNull();
  });

  test('2^17 ICC segments keep no view per segment: the profile breaks at the second and the rest are skipped', () => {
    // red team R3-1: 255 MB of these ran Node out of memory, an object kept per segment. Count the views
    // the decode makes: a handful, not one per segment.
    const file = behind(repeat(iccSeg(1, 1, []), 1 << 17));
    const subarray = Uint8Array.prototype.subarray;
    let views = 0;
    Uint8Array.prototype.subarray = function (this: Uint8Array, ...args: [number?, number?]) {
      views++;
      return subarray.apply(this, args);
    };
    let icc: Uint8Array | null | undefined;
    try {
      icc = decodeJpegSync(file).icc;
    } finally {
      Uint8Array.prototype.subarray = subarray;
    }
    expect(icc).toBeNull();
    expect(views).toBeLessThan(1000);
  });

  test('2^17 comment segments, or 3 MB of stray bytes between segments, give the event loop turns', async () => {
    // red team R3-1: 255 MB of COM segments held the thread for 1.1 s in one stretch. The 1x1 picture's
    // own decode gives a turn or two; the segments (a yield per 2^14) and the junk (per 1 MB) add theirs.
    const own = await turnsDuring(behind());
    expect(await turnsDuring(behind(repeat(Uint8Array.from([0xff, 0xfe, 0, 2]), 1 << 17)))).toBeGreaterThanOrEqual(own + 7);
    expect(await turnsDuring(behind(new Uint8Array(3 << 20)))).toBeGreaterThanOrEqual(own + 2);
  });

  test('a block costs at least 8 coefficients a scan: 128 one-coefficient scans of 2^16 blocks decode, 129 are refused', () => {
    // red team R3-3: 500 scans of one-coefficient bands, every block a one-bit EOB0, stayed under the scan
    // cap and the coefficient cap (charged 1 a block) and ran 23 s at 100 MP. At 8 a block, the cap of
    // 1024 a block allows 128 such scans. 2048 x 2048 gray is 2^16 blocks, where the per-block cap
    // (2^26) meets the floor.
    const w = 2048;
    const data = new Uint8Array((w / 8) ** 2 / 8); // zero bits: an EOB0 per block
    const file = (scans: number) => {
      const parts: Uint8Array[] = [bytesOf(SOI, dqtAll(), dhtOne(1, 0, 0x00), sofSeg(0xc2, w, w, [[1, 0x11, 0]]))];
      for (let i = 0; i < scans; i++) {
        const k = 1 + (i % 63);
        const a = Math.floor(i / 63);
        parts.push(bytesOf(a === 0 ? sosSeg([1], k, k, 0, 13) : sosSeg([1], k, k, 14 - a, 13 - a)), data);
      }
      parts.push(Uint8Array.from(EOI));
      return concat(...parts);
    };
    expect(COEF_WORK_PER_BLOCK * (w / 8) ** 2).toBe(COEF_WORK_FLOOR);
    expect(decodeJpegSync(file(128), { maxPixels: w * w }).width).toBe(w);
    let message = '';
    try {
      decodeJpegSync(file(129), { maxPixels: w * w });
    } catch (e) {
      message = String(e);
    }
    expect(message).toContain('too-large');
    expect(message).toContain('coefficients decoded per block');
  });

  test('the components share the budget: four components of 32 one-coefficient scans each decode, a 129th scan is refused', () => {
    // red team R4-1: four components x 125 one-coefficient scans stayed under a per-block cap (1000 of 1024
    // a block) and ran 18.8 s at 100 MP, four times the one-component worst case. The cap is per block of
    // the frame over its components, so four 2048 x 2048 components share what one would get.
    const w = 2048;
    const data = new Uint8Array((w / 8) ** 2 / 8); // zero bits: an EOB0 per block
    const comps: [number, number, number][] = [1, 2, 3, 4].map((id) => [id, 0x11, 0]);
    const file = (scans: number) => {
      const parts: Uint8Array[] = [bytesOf(SOI, dqtAll(), dhtOne(1, 0, 0x00), sofSeg(0xc2, w, w, comps))];
      for (let i = 0; i < scans; i++) {
        const k = 1 + ((i >> 2) % 63);
        parts.push(bytesOf(sosSeg([1 + (i & 3)], k, k, 0, 13)), data);
      }
      parts.push(Uint8Array.from(EOI));
      return concat(...parts);
    };
    expect(COEF_WORK_PER_BLOCK * (w / 8) ** 2).toBe(COEF_WORK_FLOOR);
    expect(decodeJpegSync(file(128), { maxPixels: w * w }).width).toBe(w);
    let message = '';
    try {
      decodeJpegSync(file(129), { maxPixels: w * w });
    } catch (e) {
      message = String(e);
    }
    expect(message).toContain('too-large');
    expect(message).toContain('coefficients decoded per block');
  });
});
