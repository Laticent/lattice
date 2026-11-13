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
 * Pure, fs-free (HARD RULE #7).
 */

const held = new WeakMap();

/** A flat copy of `s`, sharing no storage with the string it came from. */
export function flatCopy(s) {
  return JSON.parse(JSON.stringify(String(s)));
}

/** The memo's value for `key`, moved to most recently used; undefined on a miss. */
export function memoGet(map, key) {
  const hit = map.get(key);
  if (hit === undefined) return undefined;
  map.delete(key);
  map.set(key, hit);
  return hit;
}

/** Remember `value` under a flat copy of `key`, dropping the least recently used entries past `maxChars`. */
export function memoSet(map, key, value, maxChars) {
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
