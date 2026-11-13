/**
 * Caller limits, resolved once per decode and checked before any allocation that scales with the image.
 */

import { LastraError } from './errors.js';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_PIXELS, type DecodeOptions, type WorkMeter } from './types.js';

export interface Limits {
  maxPixels: number;
  maxBytes: number;
  meter: WorkMeter;
}

function positive(v: number | undefined, fallback: number, name: string): number {
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !(v > 0)) throw new TypeError(`lastra: ${name} must be a positive number`);
  return v;
}

export function resolveLimits(bytes: Uint8Array, opts: DecodeOptions | undefined): Limits {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('lastra: bytes must be a Uint8Array');
  const maxBytes = positive(opts?.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
  const maxPixels = positive(opts?.maxPixels, DEFAULT_MAX_PIXELS, 'maxPixels');
  if (bytes.length > maxBytes) throw new LastraError('too-large', `input is ${bytes.length} bytes, over maxBytes ${maxBytes}`);
  return { maxBytes, maxPixels, meter: opts?.meter ?? { steps: 0 } };
}

/** Refuse a frame over the pixel limit, or one whose RGBA buffer could not exist in any engine. */
export function checkPixels(width: number, height: number, limits: Limits): void {
  const pixels = width * height;
  if (pixels > limits.maxPixels) throw new LastraError('too-large', `${width}x${height} is ${pixels} pixels, over maxPixels ${limits.maxPixels}`);
  // Engines cap a typed array near 2^31 bytes; four bytes a pixel must stay under it.
  if (pixels * 4 > 0x7fffffff) throw new LastraError('too-large', `${width}x${height} does not fit one RGBA buffer`);
}

/** Count `n` steps of work (default 1), and refuse once a caller's work limit is passed. */
export function tick(meter: WorkMeter, n = 1): void {
  meter.steps += n;
  if (meter.steps > (meter.limit ?? Number.POSITIVE_INFINITY)) throw new LastraError('too-large', `over the work limit of ${meter.limit} steps`);
}

/**
 * Run an allocation, turning the platform's out-of-memory `RangeError` into a `too-large` refusal: an
 * image under `maxPixels` can still be more than a constrained engine will hand out.
 */
export function allocating<T>(what: string, make: () => T): T {
  try {
    return make();
  } catch (e) {
    if (e instanceof RangeError) throw new LastraError('too-large', `the platform cannot allocate ${what}`);
    throw e;
  }
}
