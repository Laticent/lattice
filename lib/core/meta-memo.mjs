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
 * A key larger than a quarter of the bound is never held, and never looked up. A slide that carries a pasted phone photo
 * is a key of about 4.5 MB: copying it (`flatCopy`), hashing it and comparing it cost more than the read it saved, and
 * holding it evicted every other entry, so the next slide missed too. Measured on a deck of three such photos: 6.7 s of
 * a 41 s profile of one paste in the Studio was this memo. The callers read such a slide from its text each time, which
 * `maskDataUris` (lib/core/data-uri-mask.mjs) keeps cheap where the slide is otherwise small.
 *
 * Pure, fs-free (HARD RULE #7).
 */

const held = new WeakMap();

/** A flat copy of `s`, sharing no storage with the string it came from. */
export function flatCopy(s) {
  return JSON.parse(JSON.stringify(String(s)));
}

/** Would `memoSet` hold a key this long under a bound of `maxChars`? */
export function memoHolds(key, maxChars) {
  return String(key).length <= maxChars / 4;
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
  if (!memoHolds(key, maxChars)) return;
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
