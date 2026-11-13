/**
 * From a component's coefficients to its samples: the IDCT of every block, and, for a progressive file
 * whose low-frequency coefficients are not all fully refined (a file cut short, or an encoder that
 * never sent them), libjpeg's block smoothing first.
 *
 * Block smoothing transcribes libjpeg-turbo 3.1's `jdcoefct.c` (`smoothing_ok` and
 * `decompress_smooth_data`): each block's first nine AC coefficients that are still zero and not known
 * to be exact are estimated from the DC values of its 5x5 neighborhood; when no AC data at all has
 * arrived for the component, its DC is interpolated too. It runs only when libjpeg's would: a
 * progressive frame, every component's quantization table latched with its DC and first nine AC entries
 * nonzero, every component's DC partly known, and some coefficient among the first nine not exact.
 * Rows past where the last scan's data ran out use the precision the scan before it left
 * (`last_good_iMCU_row`), as in libjpeg.
 *
 * Based in part on the work of the Independent JPEG Group. jdcoefct.c: Copyright (C) 1994-1997, Thomas G.
 * Lane; libjpeg-turbo modifications Copyright 2009 Pierre Ossman for Cendio AB, Copyright (C) 2010,
 * 2015-2016, 2019-2020, 2022-2023, D. R. Commander, Copyright (C) 2015, 2020, Google, Inc. Used under the
 * IJG license and libjpeg-turbo's Modified BSD license (README.ijg.txt and LICENSE.libjpeg-turbo.md, copied unaltered beside this file); this file is a
 * TypeScript re-expression, not the original code.
 */

import { idctIslow } from './jpeg-idct.js';
import { tick } from './limits.js';
import type { WorkMeter } from './types.js';

/** The coefficients a component holds and what the smoothing needs to know about them. */
export interface CoefComponent {
  coefs: Int16Array;
  /** Blocks per row and block rows in the store (whole MCUs, as libjpeg's virtual array). */
  stride: number;
  rows: number;
  /** Blocks covering the real samples (libjpeg's width_in_blocks, height_in_blocks). */
  bw: number;
  bh: number;
  v: number;
  /** Latched at the component's first scan: as stored (smoothing) and as 16-bit (IDCT). */
  quant: Uint16Array | null;
  quantIdct: Int16Array | null;
  coefBits: Int8Array;
  prevCoefBits: Int8Array;
}

/** The ten coefficient precisions smoothing reads (libjpeg's SAVED_COEFS), current and previous. */
export interface Latch {
  cur: Int32Array;
  prev: Int32Array;
}

const Q01 = 1;
const Q10 = 8;
const Q20 = 16;
const Q11 = 9;
const Q02 = 2;
const Q03 = 3;
const Q12 = 10;
const Q21 = 17;
const Q30 = 24;

/** `smoothing_ok`: the per-component latches when smoothing applies, else null. */
export function smoothingLatches(comps: CoefComponent[], progressive: boolean, scans: number): Latch[] | null {
  if (!progressive) return null;
  let useful = false;
  const out: Latch[] = [];
  for (const c of comps) {
    const q = c.quant;
    if (!q) return null;
    if (q[0] === 0 || q[Q01] === 0 || q[Q10] === 0 || q[Q20] === 0 || q[Q11] === 0 || q[Q02] === 0 || q[Q03] === 0 || q[Q12] === 0 || q[Q21] === 0 || q[Q30] === 0) return null;
    if (c.coefBits[0] < 0) return null;
    const cur = new Int32Array(10);
    const prev = new Int32Array(10);
    cur[0] = c.coefBits[0];
    for (let k = 1; k < 10; k++) {
      prev[k] = scans > 1 ? c.prevCoefBits[k] : -1;
      cur[k] = c.coefBits[k];
      if (c.coefBits[k] !== 0) useful = true;
    }
    out.push({ cur, prev });
  }
  return useful ? out : null;
}

/** Divide as libjpeg's estimate does: round half away from zero, clamp to what Al bits leave unknown. */
function estimate(num: number, q: number, al: number): number {
  const neg = num < 0;
  let pred = Math.floor((q * 128 + (neg ? -num : num)) / (q * 256));
  if (al > 0 && pred >= 1 << al) pred = (1 << al) - 1;
  return neg ? -pred : pred;
}

/**
 * The samples of one component: `bw * 8` wide, `bh * 8` tall. With `latch`, smoothed per libjpeg;
 * `lastGood` is the last iMCU row the final scan had data for.
 */
export function* componentSamples(c: CoefComponent, latch: Latch | null, lastGood: number, meter: WorkMeter): Generator<void, Uint8Array> {
  const pw = c.bw * 8;
  const out = new Uint8Array(pw * c.bh * 8);
  const ws = new Int32Array(64);
  const q = c.quantIdct ?? new Int16Array(64);
  const coefs = c.coefs;
  if (!latch) {
    for (let by = 0; by < c.bh; by++) {
      tick(meter, c.bw);
      for (let bx = 0; bx < c.bw; bx++) idctIslow(coefs, (by * c.stride + bx) * 64, q, out, by * 8 * pw + bx * 8, pw, ws);
      if ((by & 63) === 63) yield;
    }
    return out;
  }

  const qt = c.quant as Uint16Array;
  const work = new Int16Array(64);
  const v = c.v;
  const totalRows = c.rows / v; // total_iMCU_rows
  const lastIMcu = totalRows - 1;
  const lastCol = c.bw - 1;
  const dcAt = (row: number, col: number) => coefs[(row * c.stride + col) * 64];
  for (let imcu = 0; imcu < totalRows; imcu++) {
    const blockRows = imcu < lastIMcu ? v : c.bh % v || v;
    const bits = imcu > lastGood ? latch.prev : latch.cur;
    const changeDc = bits[1] === -1 && bits[2] === -1 && bits[3] === -1 && bits[4] === -1 && bits[5] === -1 && bits[6] === -1 && bits[7] === -1 && bits[8] === -1 && bits[9] === -1;
    const Q00 = qt[0];
    const imageBlockRows = blockRows * totalRows;
    for (let br = 0; br < blockRows; br++) {
      const row = imcu * v + br;
      if (row >= c.bh) break;
      tick(meter, c.bw);
      // libjpeg's neighbor rows, with its own row arithmetic (image_block_row uses this iMCU row's count).
      const ibr = imcu * blockRows + br;
      const prevRow = ibr > 0 ? row - 1 : row;
      const prevPrevRow = ibr > 1 ? row - 2 : prevRow;
      const nextRow = ibr < imageBlockRows - 1 ? row + 1 : row;
      const nextNextRow = ibr < imageBlockRows - 2 ? row + 2 : nextRow;
      let DC01: number, DC02: number, DC03: number, DC04: number, DC05: number;
      let DC06: number, DC07: number, DC08: number, DC09: number, DC10: number;
      let DC11: number, DC12: number, DC13: number, DC14: number, DC15: number;
      let DC16: number, DC17: number, DC18: number, DC19: number, DC20: number;
      let DC21: number, DC22: number, DC23: number, DC24: number, DC25: number;
      DC01 = DC02 = DC03 = DC04 = DC05 = dcAt(prevPrevRow, 0);
      DC06 = DC07 = DC08 = DC09 = DC10 = dcAt(prevRow, 0);
      DC11 = DC12 = DC13 = DC14 = DC15 = dcAt(row, 0);
      DC16 = DC17 = DC18 = DC19 = DC20 = dcAt(nextRow, 0);
      DC21 = DC22 = DC23 = DC24 = DC25 = dcAt(nextNextRow, 0);
      for (let col = 0; col <= lastCol; col++) {
        const at = (row * c.stride + col) * 64;
        for (let k = 0; k < 64; k++) work[k] = coefs[at + k];
        if (col === 0 && col < lastCol) {
          DC04 = DC05 = dcAt(prevPrevRow, 1);
          DC09 = DC10 = dcAt(prevRow, 1);
          DC14 = DC15 = dcAt(row, 1);
          DC19 = DC20 = dcAt(nextRow, 1);
          DC24 = DC25 = dcAt(nextNextRow, 1);
        }
        if (col + 1 < lastCol) {
          DC05 = dcAt(prevPrevRow, col + 2);
          DC10 = dcAt(prevRow, col + 2);
          DC15 = dcAt(row, col + 2);
          DC20 = dcAt(nextRow, col + 2);
          DC25 = dcAt(nextNextRow, col + 2);
        }
        let al: number;
        if ((al = bits[1]) !== 0 && work[1] === 0) {
          const num =
            Q00 *
            (changeDc
              ? -DC01 - DC02 + DC04 + DC05 - 3 * DC06 + 13 * DC07 - 13 * DC09 + 3 * DC10 - 3 * DC11 + 38 * DC12 - 38 * DC14 + 3 * DC15 - 3 * DC16 + 13 * DC17 - 13 * DC19 + 3 * DC20 - DC21 - DC22 + DC24 + DC25
              : -7 * DC11 + 50 * DC12 - 50 * DC14 + 7 * DC15);
          work[1] = estimate(num, qt[Q01], al);
        }
        if ((al = bits[2]) !== 0 && work[8] === 0) {
          const num =
            Q00 *
            (changeDc
              ? -DC01 - 3 * DC02 - 3 * DC03 - 3 * DC04 - DC05 - DC06 + 13 * DC07 + 38 * DC08 + 13 * DC09 - DC10 + DC16 - 13 * DC17 - 38 * DC18 - 13 * DC19 + DC20 + DC21 + 3 * DC22 + 3 * DC23 + 3 * DC24 + DC25
              : -7 * DC03 + 50 * DC08 - 50 * DC18 + 7 * DC23);
          work[8] = estimate(num, qt[Q10], al);
        }
        if ((al = bits[3]) !== 0 && work[16] === 0) {
          const num = Q00 * (changeDc ? DC03 + 2 * DC07 + 7 * DC08 + 2 * DC09 - 5 * DC12 - 14 * DC13 - 5 * DC14 + 2 * DC17 + 7 * DC18 + 2 * DC19 + DC23 : -DC03 + 13 * DC08 - 24 * DC13 + 13 * DC18 - DC23);
          work[16] = estimate(num, qt[Q20], al);
        }
        if ((al = bits[4]) !== 0 && work[9] === 0) {
          const num =
            Q00 * (changeDc ? -DC01 + DC05 + 9 * DC07 - 9 * DC09 - 9 * DC17 + 9 * DC19 + DC21 - DC25 : DC10 + DC16 - 10 * DC17 + 10 * DC19 - DC02 - DC20 + DC22 - DC24 + DC04 - DC06 + 10 * DC07 - 10 * DC09);
          work[9] = estimate(num, qt[Q11], al);
        }
        if ((al = bits[5]) !== 0 && work[2] === 0) {
          const num = Q00 * (changeDc ? 2 * DC07 - 5 * DC08 + 2 * DC09 + DC11 + 7 * DC12 - 14 * DC13 + 7 * DC14 + DC15 + 2 * DC17 - 5 * DC18 + 2 * DC19 : -DC11 + 13 * DC12 - 24 * DC13 + 13 * DC14 - DC15);
          work[2] = estimate(num, qt[Q02], al);
        }
        if (changeDc) {
          if ((al = bits[6]) !== 0 && work[3] === 0) work[3] = estimate(Q00 * (DC07 - DC09 + 2 * DC12 - 2 * DC14 + DC17 - DC19), qt[Q03], al);
          if ((al = bits[7]) !== 0 && work[10] === 0) work[10] = estimate(Q00 * (DC07 - 3 * DC08 + DC09 - DC17 + 3 * DC18 - DC19), qt[Q12], al);
          if ((al = bits[8]) !== 0 && work[17] === 0) work[17] = estimate(Q00 * (DC07 - DC09 - 3 * DC12 + 3 * DC14 + DC17 - DC19), qt[Q21], al);
          if ((al = bits[9]) !== 0 && work[24] === 0) work[24] = estimate(Q00 * (DC07 + 2 * DC08 + DC09 - DC17 - 2 * DC18 - DC19), qt[Q30], al);
          const num =
            Q00 *
            (-2 * DC01 -
              6 * DC02 -
              8 * DC03 -
              6 * DC04 -
              2 * DC05 -
              6 * DC06 +
              6 * DC07 +
              42 * DC08 +
              6 * DC09 -
              6 * DC10 -
              8 * DC11 +
              42 * DC12 +
              152 * DC13 +
              42 * DC14 -
              8 * DC15 -
              6 * DC16 +
              6 * DC17 +
              42 * DC18 +
              6 * DC19 -
              6 * DC20 -
              2 * DC21 -
              6 * DC22 -
              8 * DC23 -
              6 * DC24 -
              2 * DC25);
          work[0] = estimate(num, Q00, 0);
        }
        idctIslow(work, 0, q, out, row * 8 * pw + col * 8, pw, ws);
        DC01 = DC02;
        DC02 = DC03;
        DC03 = DC04;
        DC04 = DC05;
        DC06 = DC07;
        DC07 = DC08;
        DC08 = DC09;
        DC09 = DC10;
        DC11 = DC12;
        DC12 = DC13;
        DC13 = DC14;
        DC14 = DC15;
        DC16 = DC17;
        DC17 = DC18;
        DC18 = DC19;
        DC19 = DC20;
        DC21 = DC22;
        DC22 = DC23;
        DC23 = DC24;
        DC24 = DC25;
      }
      if ((row & 63) === 63) yield;
    }
  }
  return out;
}
