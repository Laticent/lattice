/**
 * lastra — one image library: pure functions, bytes in and bytes out, the same in Node, a browser and a worker, with no
 * DOM and no dependencies. Design: engineering/decisions/2026-11-13-image-library.md.
 *
 *   read    format, size, alpha hint and orientation from the header alone
 *   clean   strip metadata by an allow-list of blocks, keeping an orientation-only EXIF
 *   resize  Lanczos-3 on RGBA pixels, streamed
 *   encode  the JPEG encoder and the PNG writer; a PNG's own IDAT for a PDF
 *   decide  whether a re-encode is worth planning, and worth keeping, from thresholds the caller passes
 *   errors  LastraError, the one refusal every lastra function throws
 *
 * The decoders are a subpath, `@laticent/lastra/decode` (decode/README.md): PNG and JPEG to RGBA, with typed
 * refusals, caller limits and an AbortSignal. They are kept out of this entry so a bundle that reads headers or
 * encodes pictures (Lattice's player core, the CLI) does not carry them: a CommonJS bundle cannot tree-shake.
 *
 * NAMING. A module-private helper here carries a name no other module is likely to use (`readU32be`, `chunkTag`,
 * `LANCZOS_LOBES`, not `u32`, `tag`, `A`). A bundler that scope-hoists this library (esbuild, for Lattice's player
 * core and PDF writer) renames every same-named local elsewhere in the bundle, and some of those functions ship into
 * an exported file as `toString()` source: a helper called `info` once turned a player's `info` into `info2`.
 */

export { cleanAsync, cleanerFor, cleanGif, cleanJpeg, cleanPng, cleanWebp } from './clean.js';
export { acceptRecode, planRecode, type RecodePlan, type RecodeThresholds } from './decide.js';
export { isLastraError, LastraError, type LastraErrorCode } from './errors.js';
export { createJpegEncoder, encodeJpeg, type JpegEncoder, type JpegOptions } from './jpeg.js';
export { crc32, encodePng, PNG_BAND, type PngRowReader, rgbPngIdat } from './png.js';
export { displaySize, IMAGE_MIME, type ImageFormat, type ImageInfo, imageFormat, orientationAgreed, readImage, tiffOrientation } from './read.js';
export { type LanczosTap, lanczosResize, lanczosWeights, type Pixels, type RowReader } from './resize.js';
