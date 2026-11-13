/**
 * The JPEG inverse DCT and the YCbCr tables, transcribed from libjpeg-turbo 3.1's C code
 * (engineering/decisions/2026-11-13-image-library.md §4):
 *
 * - `idctIslow`: `jidctint.c` `jpeg_idct_islow`, the accurate integer IDCT (CONST_BITS 13, PASS1_BITS 2),
 *   libjpeg's default `dct_method`, which Chromium, Firefox, Linux WebKit and Pillow decode with.
 * - the post-IDCT range limit, indexed by `value & 1023` exactly as libjpeg's table.
 * - `jdcolor.c` `ycc_rgb_convert` tables (SCALEBITS 16).
 *
 * Arithmetic is on doubles holding integers (exact below 2^53) and follows the C types: products and
 * sums are 64-bit `JLONG` there, and each DESCALE result is cut to a 32-bit `int` after the shift.
 *
 * Where it is exact, and where it is not: on every file whose dequantized coefficients fit in 16 bits
 * (every file a real encoder writes) this equals libjpeg-turbo's C code and its SIMD code, which agree
 * there. Past 16 bits the SIMD builds browsers and Pillow ship multiply and pack in 16-bit lanes and
 * saturate, so they differ from the C reference and, on such a file, from lastra, which follows the C.
 *
 * Based in part on the work of the Independent JPEG Group. jidctint.c: Copyright (C) 1991-1998, Thomas G.
 * Lane; modification developed 2002-2018 by Guido Vollbeding; libjpeg-turbo modifications Copyright (C)
 * 2015, 2020, 2022, D. R. Commander. jdcolor.c: Copyright (C) 1991-1997, Thomas G. Lane; modified 2011 by
 * Guido Vollbeding; libjpeg-turbo modifications Copyright 2009 Pierre Ossman for Cendio AB, Copyright (C)
 * 2009, 2011-2012, 2014-2015, 2022, 2024, D. R. Commander, Copyright (C) 2013, Linaro Limited. Used under the IJG
 * license and libjpeg-turbo's Modified BSD license (README.ijg and LICENSE.libjpeg-turbo.md, copied unaltered beside this file); this file is a TypeScript
 * re-expression, not the original code.
 */

const F_0_298 = 2446;
const F_0_390 = 3196;
const F_0_541 = 4433;
const F_0_765 = 6270;
const F_0_899 = 7373;
const F_1_175 = 9633;
const F_1_501 = 12299;
const F_1_847 = 15137;
const F_1_961 = 16069;
const F_2_053 = 16819;
const F_2_562 = 20995;
const F_3_072 = 25172;

// DESCALE(x, n) cast to `int`, as libjpeg computes it: `x` is a 64-bit JLONG there, shifted, then cut to
// 32 bits. A plain `>>` would cut first and shift after, which differs once `x` passes 2^31 (a file whose
// quantization tables multiply its coefficients far past what any encoder writes). Written inline at
// each use below, because a helper call per sample cost 15% of a baseline decode.

/** libjpeg's post-IDCT range-limit table: index `(v & 1023)` for a centered result `v`. */
const RANGE = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) {
  const v = (i < 512 ? i : i - 1024) + 128;
  RANGE[i] = v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Inverse-transform one 8x8 block of coefficients (natural order, at `coefs[at..at+64)`) with the
 * dequantization table `q` (natural order, as 16-bit signed values: a SIMD build of libjpeg-turbo, which
 * is what browsers and Pillow ship, stores `ISLOW_MULT_TYPE` as `short`), writing 8x8 samples to `out` at `outAt` with row `stride`.
 */
export function idctIslow(coefs: Int16Array, at: number, q: Int16Array, out: Uint8Array, outAt: number, stride: number, ws: Int32Array): void {
  let t: number;
  // Pass 1: columns from the input into the work array, scaled up by 2^PASS1_BITS.
  for (let c = 0; c < 8; c++) {
    const i = at + c;
    if (coefs[i + 8] === 0 && coefs[i + 16] === 0 && coefs[i + 24] === 0 && coefs[i + 32] === 0 && coefs[i + 40] === 0 && coefs[i + 48] === 0 && coefs[i + 56] === 0) {
      const dc = (coefs[i] * q[c]) << 2; // LEFT_SHIFT into an int: the low 32 bits
      ws[c] = dc;
      ws[c + 8] = dc;
      ws[c + 16] = dc;
      ws[c + 24] = dc;
      ws[c + 32] = dc;
      ws[c + 40] = dc;
      ws[c + 48] = dc;
      ws[c + 56] = dc;
      continue;
    }
    let z2 = coefs[i + 16] * q[c + 16];
    let z3 = coefs[i + 48] * q[c + 48];
    let z1 = (z2 + z3) * F_0_541;
    let tmp2 = z1 + z3 * -F_1_847;
    let tmp3 = z1 + z2 * F_0_765;
    z2 = coefs[i] * q[c];
    z3 = coefs[i + 32] * q[c + 32];
    let tmp0 = (z2 + z3) * 8192;
    let tmp1 = (z2 - z3) * 8192;
    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;

    tmp0 = coefs[i + 56] * q[c + 56];
    tmp1 = coefs[i + 40] * q[c + 40];
    tmp2 = coefs[i + 24] * q[c + 24];
    tmp3 = coefs[i + 8] * q[c + 8];
    z1 = tmp0 + tmp3;
    z2 = tmp1 + tmp2;
    z3 = tmp0 + tmp2;
    let z4 = tmp1 + tmp3;
    const z5 = (z3 + z4) * F_1_175;
    tmp0 *= F_0_298;
    tmp1 *= F_2_053;
    tmp2 *= F_3_072;
    tmp3 *= F_1_501;
    z1 *= -F_0_899;
    z2 *= -F_2_562;
    z3 = z3 * -F_1_961 + z5;
    z4 = z4 * -F_0_390 + z5;
    tmp0 += z1 + z3;
    tmp1 += z2 + z4;
    tmp2 += z2 + z3;
    tmp3 += z1 + z4;

    // DESCALE(x, CONST_BITS - PASS1_BITS) = (x + 2^10) >> 11
    ws[c] = (t = tmp10 + tmp3 + 1024) <= 2147483647 && t >= -2147483648 ? t >> 11 : Math.floor(t / 2048) | 0;
    ws[c + 56] = (t = tmp10 - tmp3 + 1024) <= 2147483647 && t >= -2147483648 ? t >> 11 : Math.floor(t / 2048) | 0;
    ws[c + 8] = (t = tmp11 + tmp2 + 1024) <= 2147483647 && t >= -2147483648 ? t >> 11 : Math.floor(t / 2048) | 0;
    ws[c + 48] = (t = tmp11 - tmp2 + 1024) <= 2147483647 && t >= -2147483648 ? t >> 11 : Math.floor(t / 2048) | 0;
    ws[c + 16] = (t = tmp12 + tmp1 + 1024) <= 2147483647 && t >= -2147483648 ? t >> 11 : Math.floor(t / 2048) | 0;
    ws[c + 40] = (t = tmp12 - tmp1 + 1024) <= 2147483647 && t >= -2147483648 ? t >> 11 : Math.floor(t / 2048) | 0;
    ws[c + 24] = (t = tmp13 + tmp0 + 1024) <= 2147483647 && t >= -2147483648 ? t >> 11 : Math.floor(t / 2048) | 0;
    ws[c + 32] = (t = tmp13 - tmp0 + 1024) <= 2147483647 && t >= -2147483648 ? t >> 11 : Math.floor(t / 2048) | 0;
  }

  // Pass 2: rows from the work array to samples, descaled by 2^(CONST_BITS + PASS1_BITS + 3).
  for (let r = 0; r < 8; r++) {
    const w = r * 8;
    let o = outAt + r * stride;
    if (ws[w + 1] === 0 && ws[w + 2] === 0 && ws[w + 3] === 0 && ws[w + 4] === 0 && ws[w + 5] === 0 && ws[w + 6] === 0 && ws[w + 7] === 0) {
      const d = ws[w] + 16;
      const v = RANGE[(d <= 2147483647 ? d >> 5 : Math.floor(d / 32)) & 1023];
      for (let k = 0; k < 8; k++) out[o++] = v;
      continue;
    }
    let z2 = ws[w + 2];
    let z3 = ws[w + 6];
    let z1 = (z2 + z3) * F_0_541;
    let tmp2 = z1 + z3 * -F_1_847;
    let tmp3 = z1 + z2 * F_0_765;
    let tmp0 = (ws[w] + ws[w + 4]) * 8192;
    let tmp1 = (ws[w] - ws[w + 4]) * 8192;
    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;

    tmp0 = ws[w + 7];
    tmp1 = ws[w + 5];
    tmp2 = ws[w + 3];
    tmp3 = ws[w + 1];
    z1 = tmp0 + tmp3;
    z2 = tmp1 + tmp2;
    z3 = tmp0 + tmp2;
    let z4 = tmp1 + tmp3;
    const z5 = (z3 + z4) * F_1_175;
    tmp0 *= F_0_298;
    tmp1 *= F_2_053;
    tmp2 *= F_3_072;
    tmp3 *= F_1_501;
    z1 *= -F_0_899;
    z2 *= -F_2_562;
    z3 = z3 * -F_1_961 + z5;
    z4 = z4 * -F_0_390 + z5;
    tmp0 += z1 + z3;
    tmp1 += z2 + z4;
    tmp2 += z2 + z3;
    tmp3 += z1 + z4;

    // DESCALE(x, 18) = (x + 2^17) >> 18
    out[o] = RANGE[((t = tmp10 + tmp3 + 131072) <= 2147483647 && t >= -2147483648 ? t >> 18 : Math.floor(t / 262144)) & 1023];
    out[o + 7] = RANGE[((t = tmp10 - tmp3 + 131072) <= 2147483647 && t >= -2147483648 ? t >> 18 : Math.floor(t / 262144)) & 1023];
    out[o + 1] = RANGE[((t = tmp11 + tmp2 + 131072) <= 2147483647 && t >= -2147483648 ? t >> 18 : Math.floor(t / 262144)) & 1023];
    out[o + 6] = RANGE[((t = tmp11 - tmp2 + 131072) <= 2147483647 && t >= -2147483648 ? t >> 18 : Math.floor(t / 262144)) & 1023];
    out[o + 2] = RANGE[((t = tmp12 + tmp1 + 131072) <= 2147483647 && t >= -2147483648 ? t >> 18 : Math.floor(t / 262144)) & 1023];
    out[o + 5] = RANGE[((t = tmp12 - tmp1 + 131072) <= 2147483647 && t >= -2147483648 ? t >> 18 : Math.floor(t / 262144)) & 1023];
    out[o + 3] = RANGE[((t = tmp13 + tmp0 + 131072) <= 2147483647 && t >= -2147483648 ? t >> 18 : Math.floor(t / 262144)) & 1023];
    out[o + 4] = RANGE[((t = tmp13 - tmp0 + 131072) <= 2147483647 && t >= -2147483648 ? t >> 18 : Math.floor(t / 262144)) & 1023];
  }
}

/** `jdcolor.c` `build_ycc_rgb_table`: Cr to R, Cb to B, and the two green terms, indexed by sample. */
export const CR_R = new Int32Array(256);
export const CB_B = new Int32Array(256);
export const CR_G = new Int32Array(256);
export const CB_G = new Int32Array(256);
{
  const FIX = (x: number) => Math.floor(x * 65536 + 0.5);
  const HALF = 1 << 15;
  for (let i = 0; i < 256; i++) {
    const x = i - 128;
    CR_R[i] = (FIX(1.402) * x + HALF) >> 16;
    CB_B[i] = (FIX(1.772) * x + HALF) >> 16;
    CR_G[i] = -FIX(0.71414) * x;
    CB_G[i] = -FIX(0.34414) * x + HALF;
  }
}
