/**
 * The one error every lastra decoder throws when it refuses an input
 * (engineering/decisions/2026-11-13-image-library.md §4).
 *
 * A caller branches on `code`, never on the message: the message names the detail for a human and may
 * change, the code is the contract. Any other exception escaping a decoder is a bug in lastra.
 */

/**
 * Why a decoder refused an input.
 *
 * - `truncated`: the bytes end before the image does (a cut download, a short read).
 * - `bad-marker`: a JPEG marker or a PNG chunk header is malformed (a bad length, a missing SOI or
 *   signature, a segment that runs past its declared end, a chunk out of order).
 * - `too-large`: the input or the image is over a caller's limit (`maxBytes`, `maxPixels`), checked before
 *   the pixels are allocated.
 * - `unsupported`: a valid file in a variant lastra does not decode (arithmetic-coded, lossless,
 *   hierarchical or 12-bit JPEG, a DNL-sized frame, two-component JPEG, an unknown critical PNG chunk).
 * - `crc`: a critical PNG chunk's CRC-32 does not match its bytes.
 * - `corrupt`: the structure parses but its content is impossible (an over-full Huffman table, a bad
 *   filter byte, a zlib stream that does not inflate, a progressive scan out of sequence).
 */
export type LastraErrorCode = 'truncated' | 'bad-marker' | 'too-large' | 'unsupported' | 'crc' | 'corrupt';

export class LastraError extends Error {
  readonly code: LastraErrorCode;

  constructor(code: LastraErrorCode, message: string) {
    super(`lastra: ${code}: ${message}`);
    this.name = 'LastraError';
    this.code = code;
  }
}

/** True when `e` is a refusal from lastra. Works across realms (a worker, an iframe), where `instanceof` may not. */
export function isLastraError(e: unknown): e is LastraError {
  if (e instanceof LastraError) return true;
  if (typeof e !== 'object' || e === null) return false;
  const o = e as { name?: unknown; code?: unknown };
  return o.name === 'LastraError' && typeof o.code === 'string';
}
