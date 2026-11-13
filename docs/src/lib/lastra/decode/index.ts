/**
 * lastra decode: PNG and JPEG bytes to RGBA pixels, in pure JavaScript, the same in Node, a browser and
 * a worker (engineering/decisions/2026-11-13-image-library.md §3 and §4). See README.md beside this file.
 */

export type { LastraErrorCode } from './errors.js';
export { isLastraError, LastraError } from './errors.js';
export type { JpegImage } from './jpeg.js';
export { decodeJpeg, decodeJpegSync, MAX_SCANS, VISITS_PER_BLOCK } from './jpeg.js';
export { applyOrientation } from './orientation.js';
export type { PngColorTags, PngImage } from './png.js';
export { decodePng } from './png.js';
export type { DecodedImage, DecodeOptions, WorkMeter } from './types.js';
export { DEFAULT_MAX_BYTES, DEFAULT_MAX_PIXELS } from './types.js';
