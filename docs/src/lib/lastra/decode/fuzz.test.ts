// @vitest-environment node
/**
 * Seeded fuzzing over the committed corpus (engineering/decisions/2026-11-13-image-library.md §4): byte
 * and bit flips, truncations, deleted, duplicated and spliced ranges, interesting numbers written over
 * length and size fields, and inserted markers or chunks. PNG cases often get their CRCs recomputed, so
 * the mutation reaches the inflate and the filters instead of stopping at the first checksum.
 *
 * Every case must either decode inside its limits or refuse with a LastraError, and either way stay
 * under the work limit proven from the decoders' loops (test-support.ts `workLimit`) and under a ceiling
 * on steps per unit of declared work set from measurement (`RATIO_CEILING` below). Work is counted in
 * steps, never timed (HARD RULE #32). The seed prints; replay or deepen with
 *   LASTRA_FUZZ_SEED=<n> LASTRA_FUZZ_CASES=<n> npx vitest run src/lib/lastra/decode/fuzz.test.ts
 * Each case derives its own generator from SEED + its index, so a failure names the one case to replay.
 */

import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { decodeJpegSync, decodePng, isLastraError, type WorkMeter } from './index.js';
import { expected, fixture, rng, workLimit, workRatio } from './test-support.js';

const SEED = Number(process.env.LASTRA_FUZZ_SEED ?? 20261113);
const CASES = Number(process.env.LASTRA_FUZZ_CASES ?? 600);
const MAX_PIXELS = 1 << 20;
console.log(`lastra fuzz: seed ${SEED}, ${CASES} cases per format`);

const jpegs = Object.keys(expected.jpeg)
  .filter((n) => !n.startsWith('big-'))
  .map((n) => fixture('jpeg', n));
const pngs = Object.keys(expected.png).map((n) => fixture('png', n));

const INTERESTING = [0, 1, 2, 7, 8, 0x7f, 0x80, 0xff, 0x100, 0x7fff, 0x8000, 0xffff, 0x10000, 0x7fffffff, 0x80000000, 0xffffffff];

function mutate(src: Uint8Array, pool: Uint8Array[], r: () => number, kind: 'png' | 'jpeg'): Uint8Array {
  const pick = (n: number) => Math.floor(r() * n);
  // Half the PNG cases mutate inside the compressed data or the header fields and stay well-formed
  // around them, so they reach the inflate, the filters and the pixel writers.
  if (kind === 'png' && r() < 0.5) return mutatePngInside(src, r);
  let b: Uint8Array = src.slice();
  const ops = 1 + pick(3);
  for (let o = 0; o < ops; o++) {
    if (b.length < 2) break;
    switch (pick(8)) {
      case 0: // bytes
        for (let k = 1 + pick(16); k > 0; k--) b[pick(b.length)] = pick(256);
        break;
      case 1: // bits
        for (let k = 1 + pick(8); k > 0; k--) b[pick(b.length)] ^= 1 << pick(8);
        break;
      case 2: // truncate
        b = b.slice(0, pick(b.length));
        break;
      case 3: {
        // delete a range
        const a = pick(b.length);
        const e = Math.min(b.length, a + 1 + pick(64));
        b = concatBytes(b.subarray(0, a), b.subarray(e));
        break;
      }
      case 4: {
        // duplicate a range
        const a = pick(b.length);
        const e = Math.min(b.length, a + 1 + pick(512));
        const at = pick(b.length);
        b = concatBytes(b.subarray(0, at), b.subarray(a, e), b.subarray(at));
        break;
      }
      case 5: {
        // splice in a range from another file of the same format
        const other = pool[pick(pool.length)];
        const a = pick(other.length);
        const e = Math.min(other.length, a + 1 + pick(1024));
        const at = pick(b.length);
        b = concatBytes(b.subarray(0, at), other.subarray(a, e), b.subarray(at));
        break;
      }
      case 6: {
        // an interesting number over 2 or 4 bytes (lengths, sizes, counts)
        const v = INTERESTING[pick(INTERESTING.length)];
        const at = pick(Math.max(1, b.length - 4));
        if (r() < 0.5) b.set([(v >>> 8) & 255, v & 255], at);
        else b.set([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].slice(0, Math.min(4, b.length - at)), at);
        break;
      }
      default: {
        // insert a marker segment or a chunk
        const at = pick(b.length);
        const body = Array.from({ length: pick(24) }, () => pick(256));
        let ins: number[];
        if (kind === 'jpeg') {
          const markers = [0xc0, 0xc2, 0xc4, 0xda, 0xdb, 0xdc, 0xdd, 0xd9, 0xd0, 0xe0, 0xee, 0xfe, 0x01, 0x00];
          ins = [0xff, markers[pick(markers.length)], 0, body.length + 2, ...body];
        } else {
          const types = ['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'ZZZZ'];
          ins = chunkBytes(types[pick(types.length)], body);
        }
        b = concatBytes(b.subarray(0, at), Uint8Array.from(ins), b.subarray(at));
      }
    }
  }
  if (kind === 'png' && r() < 0.7) fixCrcs(b);
  return b;
}

/** Re-encode a PNG with its scanlines (or its header fields) changed and every CRC right. */
function mutatePngInside(src: Uint8Array, r: () => number): Uint8Array {
  const pick = (n: number) => Math.floor(r() * n);
  const chunks: { type: string; body: Uint8Array }[] = [];
  for (let at = 8; at + 12 <= src.length; ) {
    const n = ((src[at] << 24) | (src[at + 1] << 16) | (src[at + 2] << 8) | src[at + 3]) >>> 0;
    chunks.push({ type: String.fromCharCode(...src.subarray(at + 4, at + 8)), body: src.slice(at + 8, at + 8 + n) });
    at += 12 + n;
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  const idats = chunks.filter((c) => c.type === 'IDAT');
  if (!ihdr || idats.length === 0) return src;
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(concatBytes(...idats.map((c) => c.body))));
  } catch {
    return src; // a fixture whose zlib stream Node's strict inflate refuses (a bad or missing Adler-32)
  }
  switch (pick(4)) {
    case 0: // scanline bytes, filter bytes included
      for (let k = 1 + pick(32); k > 0; k--) raw[pick(raw.length)] = pick(256);
      break;
    case 1: // too little or too much image data
      raw = r() < 0.5 ? raw.slice(0, pick(raw.length)) : concatBytes(raw, new Uint8Array(1 + pick(64)));
      break;
    case 2: // a header field: depth, color type, interlace, or a size
      ihdr.body[[8, 9, 12][pick(3)]] = [0, 1, 2, 3, 4, 6, 7, 8, 16][pick(9)];
      break;
    default:
      ihdr.body.set([0, 0, pick(4), pick(256)], pick(2) * 4);
  }
  const out = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  let wroteIdat = false;
  for (const c of chunks) {
    if (c.type === 'IDAT') {
      if (!wroteIdat) out.push(Uint8Array.from(chunkBytes('IDAT', Array.from(deflateSync(raw)))));
      wroteIdat = true;
    } else out.push(Uint8Array.from(chunkBytes(c.type, Array.from(c.body))));
  }
  return concatBytes(...out);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function chunkBytes(type: string, body: number[]): number[] {
  const t = Array.from(type, (c) => c.charCodeAt(0));
  const crc = crc32(Uint8Array.from([...t, ...body])) >>> 0;
  const n = body.length;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...t, ...body, crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
}

/** Recompute every PNG chunk CRC that fits, so mutations get past the checksum. */
function fixCrcs(b: Uint8Array): void {
  let at = 8;
  while (at + 12 <= b.length) {
    const n = ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
    if (at + 12 + n > b.length) return;
    const crc = crc32(b.subarray(at + 4, at + 8 + n)) >>> 0;
    b.set([crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255], at + 8 + n);
    at += 12 + n;
  }
}

type Outcome = { code: string; steps: number; ratio: number };

/** A case passes when it decoded inside its limits or refused with a LastraError, under its work budget. */
function check(kind: 'png' | 'jpeg', i: number, input: Uint8Array, result: unknown, meter: WorkMeter): Outcome {
  const ratio = workRatio(kind, input, meter.steps);
  const replay = `${kind} case ${i} (seed ${SEED + i})`;
  if (isLastraError(result)) {
    expect(result.message, `${replay} ran past its work budget`).not.toContain('work limit');
    // Under a 1 MP limit no allocation can be too big for the platform; one that is means a size
    // reached an allocation without passing the limit check first.
    expect(result.message, `${replay} allocated past maxPixels`).not.toContain('cannot allocate');
    return { code: result.code, steps: meter.steps, ratio };
  }
  if (result instanceof Error) throw new Error(`${replay} threw a non-lastra error: ${result.stack}`);
  const img = result as { width: number; height: number; data: Uint8ClampedArray };
  expect(img.width * img.height, replay).toBeLessThanOrEqual(MAX_PIXELS);
  expect(img.data.length, replay).toBe(img.width * img.height * 4);
  return { code: 'ok', steps: meter.steps, ratio };
}

function tally(outcomes: Outcome[]): string {
  const by = new Map<string, number>();
  for (const o of outcomes) by.set(o.code, (by.get(o.code) ?? 0) + 1);
  const most = Math.max(...outcomes.map((o) => o.steps));
  const ratio = Math.max(...outcomes.map((o) => o.ratio));
  return `${[...by].map(([k, v]) => `${k} ${v}`).join(', ')}; most steps ${most}; highest steps per unit of declared work ${ratio.toFixed(2)}`;
}

/**
 * Cases run in batches of BATCH, one test each, so no single test holds the worker long: the suite's
 * per-test timeout is there to catch a hang, and a hang here is caught first, and deterministically, by
 * the work budget. 600 JPEG cases in one test took 1.2 s idle and crossed 20 s with four copies of the
 * suite beside other sessions' runs on four cores (load average 25), which made the verdict depend on
 * the machine (HARD RULE #32). A batch is a twelfth of that.
 */
const BATCH = 50;

/**
 * The highest steps per unit of declared work (test-support.ts `workRatio`) any case may reach: twice the
 * measured maximum, rounded up (JPEG 15.59, PNG 2.26; seeds 20261113, 1 and 2 at 10,000 cases each,
 * 2026-11-13, with the meter counting a step per block plus one per 8 coefficients of the scan's band, and
 * the in-tree inflate's steps per 4 KB of output and per Huffman table build, charged for the symbols it
 * walks: the fixed tables cost 126 steps, which is most of a tiny PNG's count). The proven limit
 * above stops a runaway; this one fails a change that makes ordinary decoding do several times the work
 * per block or per scanline, which the proven limit is too loose to see.
 */
const RATIO_CEILING = { jpeg: 31.2, png: 4.6 };

// Each case is computed once, on first use, whichever test asks: a batch or the summary, run together or
// alone (`-t 'reach every outcome'`), in any order.
const jpegCases = new Map<number, Outcome>();
const pngCases = new Map<number, Promise<Outcome>>();

function caseJpeg(i: number): Outcome {
  let o = jpegCases.get(i);
  if (o) return o;
  const r = rng(SEED + i);
  const input = mutate(jpegs[Math.floor(r() * jpegs.length)], jpegs, r, 'jpeg');
  const meter: WorkMeter = { steps: 0, limit: workLimit('jpeg', input) };
  let result: unknown;
  try {
    result = decodeJpegSync(input, { maxPixels: MAX_PIXELS, meter });
  } catch (e) {
    result = e;
  }
  o = check('jpeg', i, input, result, meter);
  expect(o.ratio, `jpeg case ${i} (seed ${SEED + i}): ${o.steps} steps`).toBeLessThanOrEqual(RATIO_CEILING.jpeg);
  jpegCases.set(i, o);
  return o;
}

function casePng(i: number): Promise<Outcome> {
  let o = pngCases.get(i);
  if (o) return o;
  o = (async () => {
    const r = rng(SEED + i);
    const input = mutate(pngs[Math.floor(r() * pngs.length)], pngs, r, 'png');
    const meter: WorkMeter = { steps: 0, limit: workLimit('png', input) };
    let result: unknown;
    try {
      result = await decodePng(input, { maxPixels: MAX_PIXELS, meter });
    } catch (e) {
      result = e;
    }
    const out = check('png', i, input, result, meter);
    expect(out.ratio, `png case ${i} (seed ${SEED + i}): ${out.steps} steps`).toBeLessThanOrEqual(RATIO_CEILING.png);
    return out;
  })();
  pngCases.set(i, o);
  return o;
}

describe(`fuzz JPEG (seed ${SEED})`, () => {
  for (let from = 0; from < CASES; from += BATCH) {
    const to = Math.min(CASES, from + BATCH);
    test(`cases ${from} to ${to - 1} decode or refuse, inside the work budget`, () => {
      for (let i = from; i < to; i++) caseJpeg(i);
    });
  }
  // Run alone, this test decodes every case itself (600 at about 2 ms idle), so it carries a budget that
  // allows for a loaded machine; run with the batches it reads their cached outcomes.
  test('the mutations reach every outcome: some decode, some refuse for each reason', { timeout: 120_000 }, () => {
    const outcomes = Array.from({ length: CASES }, (_, i) => caseJpeg(i));
    console.log(`lastra fuzz JPEG: ${tally(outcomes)}`);
    const codes = new Set(outcomes.map((o) => o.code));
    // Every outcome shows up in 600 cases; a short run (LASTRA_FUZZ_CASES under 600) may miss one, so it
    // reports instead of failing.
    for (const c of ['ok', 'truncated', 'bad-marker', 'corrupt']) {
      if (CASES >= 600) expect(codes, `no JPEG case ended '${c}' in ${CASES} cases`).toContain(c);
      else if (!codes.has(c)) console.log(`lastra fuzz JPEG: no case ended '${c}' in only ${CASES} cases`);
    }
  });
});

describe(`fuzz PNG (seed ${SEED} + 1,000,000)`, () => {
  for (let from = 0; from < CASES; from += BATCH) {
    const to = Math.min(CASES, from + BATCH);
    test(`cases ${from} to ${to - 1} decode or refuse, inside the work budget`, async () => {
      for (let i = from; i < to; i++) await casePng(1_000_000 + i);
    });
  }
  test('the mutations reach every outcome: some decode, some refuse for each reason', { timeout: 120_000 }, async () => {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < CASES; i++) outcomes.push(await casePng(1_000_000 + i));
    console.log(`lastra fuzz PNG: ${tally(outcomes)}`);
    const codes = new Set(outcomes.map((o) => o.code));
    for (const c of ['ok', 'truncated', 'crc', 'corrupt', 'bad-marker']) {
      if (CASES >= 600) expect(codes, `no PNG case ended '${c}' in ${CASES} cases`).toContain(c);
      else if (!codes.has(c)) console.log(`lastra fuzz PNG: no case ended '${c}' in only ${CASES} cases`);
    }
  });
});
