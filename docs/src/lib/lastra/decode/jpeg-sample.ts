/**
 * Chroma upsampling, transcribed from libjpeg-turbo's `jdsample.c` with `do_fancy_upsampling` on (its
 * default, and what Chromium, Firefox and Pillow decode with), so subsampled JPEGs come out as
 * libjpeg-turbo's bytes:
 *
 * - 2x1 (4:2:2) and 2x2 (4:2:0): "fancy" triangular interpolation (`h2v1_fancy_upsample`,
 *   `h2v2_fancy_upsample`) when the component is more than two samples wide, plain replication otherwise.
 * - 1x2 (4:4:0): `h1v2_fancy_upsample`.
 * - any other integer ratio (4:1:1 and the rest): replication (`int_upsample`).
 *
 * Vertical context at the image edges repeats the first or last real row, as libjpeg's main buffer
 * controller does (`make_funny_pointers`, `set_bottom_pointers`).
 *
 * Based in part on the work of the Independent JPEG Group. jdsample.c: Copyright (C) 1991-1996, Thomas G.
 * Lane; libjpeg-turbo modifications Copyright 2009 Pierre Ossman for Cendio AB, Copyright (C) 2010,
 * 2015-2016, 2022, 2024, D. R. Commander, Copyright (C) 2014, MIPS Technologies, Inc., California,
 * Copyright (C) 2015, Google, Inc., Copyright (C) 2019-2020, Arm Limited. jdmainct.c: Copyright (C)
 * 1994-1996, Thomas G. Lane. Used under the IJG license and libjpeg-turbo's Modified BSD license (README.ijg.txt and
 * LICENSE.libjpeg-turbo.md in this folder); this file is a TypeScript re-expression, not the original code.
 */

/** A component's samples after the IDCT: `width` x `height` real samples inside rows of `stride`. */
export interface Plane {
  data: Uint8Array;
  stride: number;
  width: number;
  height: number;
}

/**
 * Upsample `src` by integer factors (`hr`, `vr`) to `outW` x `outH`. Returns `src` itself when both are 1.
 */
export function upsample(src: Plane, hr: number, vr: number, outW: number, outH: number): Plane {
  if (hr === 1 && vr === 1) return src;
  const out = new Uint8Array(outW * outH);
  const s = src.data;
  const ss = src.stride;
  const dw = src.width;
  const lastRow = src.height - 1;
  const row = (r: number) => (r < 0 ? 0 : r > lastRow ? lastRow : r) * ss;
  // One output row at a time, built in `line` and cropped to the output width.
  const wide = dw * hr;
  const line = new Uint8Array(wide);

  for (let ir = 0; ir * vr < outH; ir++) {
    for (let v = 0; v < vr; v++) {
      const oy = ir * vr + v;
      if (oy >= outH) break;
      const p0 = row(ir);
      if (hr === 2 && vr === 2 && dw > 2) {
        const p1 = v === 0 ? row(ir - 1) : row(ir + 1);
        let thiscol = s[p0] * 3 + s[p1];
        let nextcol = s[p0 + 1] * 3 + s[p1 + 1];
        line[0] = (thiscol * 4 + 8) >> 4;
        line[1] = (thiscol * 3 + nextcol + 7) >> 4;
        let lastcol = thiscol;
        thiscol = nextcol;
        let o = 2;
        for (let c = 2; c < dw; c++) {
          nextcol = s[p0 + c] * 3 + s[p1 + c];
          line[o++] = (thiscol * 3 + lastcol + 8) >> 4;
          line[o++] = (thiscol * 3 + nextcol + 7) >> 4;
          lastcol = thiscol;
          thiscol = nextcol;
        }
        line[o++] = (thiscol * 3 + lastcol + 8) >> 4;
        line[o] = (thiscol * 4 + 7) >> 4;
      } else if (hr === 2 && vr === 1 && dw > 2) {
        let invalue = s[p0];
        line[0] = invalue;
        line[1] = (invalue * 3 + s[p0 + 1] + 2) >> 2;
        let o = 2;
        for (let c = 1; c < dw - 1; c++) {
          invalue = s[p0 + c] * 3;
          line[o++] = (invalue + s[p0 + c - 1] + 1) >> 2;
          line[o++] = (invalue + s[p0 + c + 1] + 2) >> 2;
        }
        invalue = s[p0 + dw - 1];
        line[o++] = (invalue * 3 + s[p0 + dw - 2] + 1) >> 2;
        line[o] = invalue;
      } else if (hr === 1 && vr === 2) {
        const p1 = v === 0 ? row(ir - 1) : row(ir + 1);
        const bias = v === 0 ? 1 : 2;
        for (let c = 0; c < dw; c++) line[c] = (s[p0 + c] * 3 + s[p1 + c] + bias) >> 2;
      } else {
        // Replication: each input sample fills hr outputs; each input row serves vr output rows.
        let o = 0;
        for (let c = 0; c < dw; c++) {
          const val = s[p0 + c];
          for (let k = 0; k < hr; k++) line[o++] = val;
        }
      }
      out.set(wide > outW ? line.subarray(0, outW) : line, oy * outW);
    }
  }
  return { data: out, stride: outW, width: outW, height: outH };
}
