/**
 * lib/core/meta-memo.mjs
 *
 * The bounded memo the slide-metadata readers share (`readRecord` in meta-door.mjs, `readMetaField` in meta-edit.mjs).
 * Two rules from the red team on record note step 3:
 *
 *   - Bounded by CHARACTERS held, not entries: one slide can carry a pasted data-URI image.
 *   - Each key is a FLAT COPY of its text. A slide sliced out of the deck is, in V8, a view that keeps the whole deck
 *     alive; a memo keyed by the view kept one deck per keystroke (573 MB after 600 reads of a deck with a 1 MB image).
 *
 * Least recently used goes first: a hit moves its entry to the end (see `memoGet`).
 *
 * A key LONGER THAN THE CAP is never remembered, and never looked up. It could not stay: the next write evicts it. So
 * remembering it bought nothing and cost two things. Each write flat-copied the key (a slide holding a phone photo is
 * about 5 MB of data URI, so one JSON round trip of 5 MB per read), and storing it evicted every other slide's entry,
 * so the slides around it missed too. The Studio asks for every slide on every render, and a deck of three phone photos
 * held Firefox's main thread for up to 29 s at a time (docs/e2e/export-photo-size.spec.ts; engineering/gotchas/studio.md).
 * Such a slide is read uncached, which is one linear scan, the same work a miss does before it copies.
 *
 * Pure, fs-free (HARD RULE #7).
 */

const held = new WeakMap();

/** Work counters, for the unit tier and the bench (HARD RULE #32: count work, never time it). */
export const memoStats = { copiedChars: 0 };

/** A flat copy of `s`, sharing no storage with the string it came from. */
export function flatCopy(s) {
  const text = String(s);
  memoStats.copiedChars += text.length;
  return JSON.parse(JSON.stringify(text));
}

/** The memo's value for `key`, moved to most recently used; undefined on a miss, and for a key over `maxChars`
 *  (never stored, so not hashed for nothing). */
export function memoGet(map, key, maxChars = Number.POSITIVE_INFINITY) {
  if (key.length > maxChars) return undefined;
  const hit = map.get(key);
  if (hit === undefined) return undefined;
  map.delete(key);
  map.set(key, hit);
  return hit;
}

/** Remember `value` under a flat copy of `key`, dropping the least recently used entries past `maxChars`. A key longer
 *  than `maxChars` is not remembered (see the header). */
export function memoSet(map, key, value, maxChars) {
  if (String(key).length > maxChars) return;
  const k = flatCopy(key);
  let size = (held.get(map) ?? 0) + k.length;
  map.set(k, value);
  for (const old of map.keys()) {
    if (size <= maxChars || old === k) break;
    size -= old.length;
    map.delete(old);
  }
  held.set(map, size);
}
