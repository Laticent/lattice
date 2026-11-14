import type { AbortSignalLike } from './steps.js';

/**
 * The shapes the decoders share: what a caller passes in and what comes back.
 */

/** Pixels in row-major order, four bytes a pixel (red, green, blue, alpha), alpha not premultiplied. */
export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * A running count of the work a decode did, in loop steps (a scanline, a block, a chunk, a marker, a
 * pixel row). A test or a fuzzer passes one in to prove a decode ends in work proportional to its input
 * and its pixels, without reading a clock (HARD RULE #32). Production callers leave it out.
 */
export interface WorkMeter {
  steps: number;
  /** Refuse (`too-large`) once `steps` passes this. A fuzzer sets it to prove no input runs away. */
  limit?: number;
}

export interface DecodeOptions {
  /** Refuse an image with more pixels than this, before allocating it. Default 100,000,000 (100 MP). */
  maxPixels?: number;
  /** Refuse an input longer than this many bytes. Default 268,435,456 (256 MiB). */
  maxBytes?: number;
  /** Optional work counter (see `WorkMeter`). */
  meter?: WorkMeter;
  /** Abort an async decode: it rejects with the signal's reason at its next yield. Ignored by `decodeJpegSync`. */
  signal?: AbortSignalLike;
}

export const DEFAULT_MAX_PIXELS = 100_000_000;
export const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
