/**
 * zlib inflate through the platform's `DecompressionStream('deflate')`: Node 18+, every target browser
 * and workers all have it, so lastra needs no inflate of its own and no dependency
 * (engineering/decisions/2026-11-13-image-library.md §3).
 *
 * The output is capped at the size the caller expects. A stream that would inflate past it is cancelled
 * as soon as it crosses, so a decompression bomb costs at most one input chunk's worth of extra output
 * (deflate's ratio tops out near 1032:1, so 1032 x INPUT_CHUNK bytes) before it is refused.
 *
 * The policy is strict, so the answer is the same in every engine: the stream must end cleanly and give
 * exactly `expected` bytes. libpng is laxer (it warns and keeps going on extra data after the image);
 * engines disagree on whether trailing bytes after the zlib stream are an error, and on whether they
 * deliver the last block before reporting a bad Adler-32, so lastra refuses all three the same way.
 */

import { LastraError } from './errors.js';
import { tick } from './limits.js';
import type { WorkMeter } from './types.js';

/** Bytes handed to the stream per write. Bounds the output one write can produce (see the header). */
const INPUT_CHUNK = 16 * 1024;

export async function inflateExact(input: Uint8Array, expected: number, meter: WorkMeter): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') throw new LastraError('unsupported', 'this platform has no DecompressionStream');
  let out: Uint8Array;
  try {
    out = new Uint8Array(expected);
  } catch {
    throw new LastraError('too-large', `the platform cannot allocate ${expected} bytes of image data`);
  }
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  // The writer runs beside the reader; awaiting each write before reading would deadlock on backpressure.
  // It never throws on its own (no work is counted there), so the reader below cannot wait on a dead writer.
  const writing = (async () => {
    for (let at = 0; at < input.length; at += INPUT_CHUNK) {
      const part = input.subarray(at, Math.min(input.length, at + INPUT_CHUNK));
      // The stream takes no view of a SharedArrayBuffer; copy such a part rather than fail on it.
      await writer.write((part.buffer instanceof ArrayBuffer ? part : part.slice()) as Uint8Array<ArrayBuffer>);
    }
    await writer.close();
  })();
  // A failed write surfaces through the reader too; this keeps the rejection from going unhandled.
  writing.catch(() => {});
  let filled = 0;
  let failure: LastraError | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      tick(meter, 1 + (value.length >> 12));
      if (filled + value.length > expected) {
        failure = new LastraError('corrupt', `image data inflates past the ${expected} bytes the header declares`);
        break;
      }
      out.set(value, filled);
      filled += value.length;
    }
  } catch (e) {
    failure = e instanceof LastraError ? e : new LastraError('corrupt', 'the zlib stream does not inflate (bad data, bad checksum, or bytes after its end)');
  }
  if (failure) {
    await reader.cancel().catch(() => {});
    await writer.abort().catch(() => {});
    throw failure;
  }
  const wrote = await writing.then(
    () => true,
    () => false,
  );
  if (!wrote) throw new LastraError('corrupt', 'the zlib stream does not inflate');
  if (filled < expected) throw new LastraError('truncated', `image data inflates to ${filled} of ${expected} bytes`);
  return out;
}
