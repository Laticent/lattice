/**
 * zlib inflate through the platform's `DecompressionStream('deflate')`: Node 18+, every target browser
 * and workers all have it, so lastra needs no inflate of its own and no dependency
 * (engineering/decisions/2026-11-13-image-library.md §3).
 *
 * `inflateInto` streams the output to a consumer and stops as soon as the consumer has what it asked for:
 * it is canceled there, so a decompression bomb costs at most one input chunk's worth of extra output
 * (deflate's ratio tops out near 1032:1, so 1032 x INPUT_CHUNK bytes). What follows the wanted bytes
 * (more inflated data, bytes after the zlib stream, the Adler-32) is never examined, which is what libpng
 * and every browser engine do: they all display such files.
 */

import { LastraError } from './errors.js';
import { tick } from './limits.js';
import type { WorkMeter } from './types.js';

/** Bytes handed to the stream per write. Bounds the output one write can produce (see the header). */
const INPUT_CHUNK = 16 * 1024;

/**
 * Inflate `input`, handing each output chunk to `take`, which returns true once it has all it wants.
 * Resolves true when the consumer was satisfied (the rest of the stream is never read), false when the
 * stream ended first. Rejects `corrupt` when the stream fails before the consumer is satisfied.
 */
export async function inflateInto(input: Uint8Array, take: (chunk: Uint8Array) => boolean, meter: WorkMeter, signal?: AbortSignal): Promise<boolean> {
  if (typeof DecompressionStream !== 'function') throw new LastraError('unsupported', 'this platform has no DecompressionStream');
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
  let satisfied = false;
  try {
    for (;;) {
      // Only the stream's own rejection means bad data; anything else thrown below is lastra's (or the
      // consumer's) and must not be dressed up as a verdict on the input.
      const step = await reader.read().catch(() => {
        throw new LastraError('corrupt', 'the zlib stream does not inflate');
      });
      if (step.done) break;
      tick(meter, 1 + (step.value.length >> 12));
      signal?.throwIfAborted();
      satisfied = take(step.value);
      if (satisfied) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    await writer.abort().catch(() => {});
  }
  return satisfied;
}

/** Inflate a small ancillary stream (an ICC profile) whole, or null if it fails or passes `cap` bytes. */
export async function inflateSmall(input: Uint8Array, cap: number, meter: WorkMeter): Promise<Uint8Array | null> {
  const parts: Uint8Array[] = [];
  let size = 0;
  let over = false;
  try {
    await inflateInto(
      input,
      (chunk) => {
        size += chunk.length;
        over = size > cap;
        if (!over) parts.push(chunk.slice());
        return over;
      },
      meter,
    );
    if (over) return null;
  } catch (e) {
    if (e instanceof LastraError && e.code === 'corrupt') return null;
    throw e;
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
