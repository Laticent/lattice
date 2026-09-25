/**
 * A cap on what `JSON.parse` builds from text read out of someone else's archive — ONE copy,
 * read by the Studio (docs/src/components/studio/zip-limits.ts re-exports it) and by the package
 * reader the CLI shares (lib/packages/read.js, gate.js).
 *
 * The read budgets bound how many BYTES an entry inflates to, not how many VALUES the parser
 * then builds, and a value can be two bytes: `1,` is one number, `{},` one object. 64 MiB of
 * `{},` is 22 million objects (1.4 GB of Node heap); 256 MiB of `1,` is 134 million numbers,
 * which real Chromium parsed in 4 s at the edge of a tab crash (followups.d/2336 items 17, 18).
 *
 * So the text is scanned first: one pass that counts every object, array and separating comma
 * outside a string, and stops one past the cap. That is an upper bound on the values the parse
 * will build, within one per container. A dependency-free CommonJS leaf, so the docs dev server
 * can default-import it (docs/src/plugins/vite-cjs-lib-dev.mjs).
 */

/**
 * Most values one JSON text may hold. A legitimate file is far below it: a workspace's state
 * comes out of localStorage (5–10 MB, 60 chat messages per deck), a reference doc is one flat
 * record, and a package manifest is a few dozen fields.
 */
const MAX_JSON_VALUES = 1_000_000;

/**
 * Count the objects, arrays and commas in `text` that sit outside a string. Stops at
 * `limit + 1`. No allocation.
 * @param {string} text
 * @param {number} [limit]
 */
function countJsonValues(text, limit = MAX_JSON_VALUES) {
  let count = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 92) i++; // a backslash escapes the next character
      else if (c === 34) inString = false;
    }
    else if (c === 34) inString = true;
    else if (c === 123 || c === 91 || c === 44) {
      if (++count > limit) return count;
    }
  }
  return count;
}

/**
 * `JSON.parse`, after refusing a text with more than `MAX_JSON_VALUES` values.
 * @param {string} text
 * @param {string} message  what the refusal says
 */
function parseJsonCapped(text, message) {
  if (countJsonValues(text) > MAX_JSON_VALUES) throw new Error(message);
  return JSON.parse(text);
}

module.exports = { MAX_JSON_VALUES, countJsonValues, parseJsonCapped };
