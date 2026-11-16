/**
 * lib/core/front-matter-keys.mjs
 *
 * THE FRONT-MATTER ISLAND'S KEY READER: the key lines of a deck's YAML block, read once (indent, name, raw value, the
 * spans of the name and value; a block scalar's body lines are never keys). Where the block ends is
 * lib/core/front-matter-fence.mjs; lib/core/front-matter-island.mjs joins the two. The rules, the readers and why each
 * is what it is: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §11.
 *
 * NAMES. `[\w$][\w$.-]*` followed by optional blanks and `:`: wider than any reader asked for (the loose register
 * reader read a digit-first key like `1x:`, `keyGroups` in lib/core/front-matter-groups.js a `$` or `.`), so no reader
 * loses a key; a reader that wants a narrower name filters on it, as the engine's directives do.
 *
 * LINES. A line ends at `\n`, `\r\n` or a lone `\r`. U+2028 and U+2029 are text, as they are to markdown-it and YAML 1.2.
 *
 * Pure, fs-free and IMPORT-FREE, and it must stay so: CommonJS readers `require()` it (front-matter-key.js, the engine's
 * directives.js), and a required ES module that itself imports one fails to load under Playwright's loader ("request
 * for './x.mjs' is from a module not been linked"). The docs dev shim (docs/src/plugins/vite-cjs-lib-dev.mjs) hoists a
 * `require('./x.mjs')` of a sibling.
 */
/**
 * A block-scalar header line: `key: |`, `key: >-`, `key: |2+`, optionally with a trailing comment. Group 1 is the
 * indent. The Studio's `BLOCK_SCALAR_RE` (docs/src/lib/front-matter.ts) is the same pattern. The tail is an
 * alternation, not `(?:[ \t]+#.*)?[ \t]*`: there `.*` and `[ \t]*` both take spaces, and a long run of them before a
 * character `.` cannot cross took quadratic time (about 50 s per render at 40K spaces).
 */
export const BLOCK_SCALAR_HEAD = /^([ \t]*)[A-Za-z][\w-]*:[ \t]+[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#.*|[ \t]*)\r?$/;

/** A key line's head: indent, name, the blanks before the colon. Linear: each run stops where the next cannot start. */
const KEY_HEAD = /^([ \t]*)([\w$][\w$.-]*)([ \t]*):/;

/**
 * @typedef {object} FrontMatterKey  one key line of the front matter
 * @property {string} name        the key, as written
 * @property {string} indent      the blanks before it; '' at column 0
 * @property {string} raw         everything after the colon to the end of the line, untouched (a scalar reader cleans it)
 * @property {number} line        its line in the YAML body, 0-based
 * @property {number} from        where the line starts, as an offset into the text the keys were read from
 * @property {number} to          where it ends (before its line end)
 * @property {number} nameFrom    the name's span
 * @property {number} nameTo
 * @property {number} valueFrom   the value's span: `raw` less its leading and trailing blanks. Empty (`valueFrom ===
 *                                valueTo`) for `key:` with nothing after it
 * @property {number} valueTo
 * @property {boolean} blockScalar  whether the value is a block scalar header (`|`, `>-` …); its body lines are not keys
 * @property {number} bodyEnd     a block scalar's body is YAML lines `line + 1` to `bodyEnd` (exclusive); 0 on any other
 *                                key. (Spans and the key each nests under are `lattice-deck`'s, which alone reads them:
 *                                this module ships in every page that reads a register, so it carries only what they use.)
 */

/**
 * The key lines of a YAML body, in order. `base` is added to every offset, so a caller holding the whole source gets
 * source offsets. Every line of a block scalar's body is skipped.
 *
 * @param {string} yaml   the front matter's YAML body (no `---` fences)
 * @param {number} [base] the offset of `yaml` in the text the caller holds
 * @returns {FrontMatterKey[]}
 */
export function frontMatterKeys(yaml, base = 0) {
  const text = String(yaml ?? '');
  const keys = [];
  // Every line's [start, end), the end before its terminator.
  const lines = [];
  const TERM = /\r\n|\r|\n/g;
  let start = 0;
  for (let m = TERM.exec(text); m; m = TERM.exec(text)) {
    lines.push([start, m.index]);
    start = m.index + m[0].length;
  }
  lines.push([start, text.length]);
  for (let i = 0; i < lines.length; i++) {
    const [from, to] = lines[i];
    const line = text.slice(from, to);
    const scalar = BLOCK_SCALAR_HEAD.exec(line);
    if (scalar) {
      // Its body: every later line that is blank or indented deeper than the header.
      const depth = scalar[1].length;
      let j = i + 1;
      while (j < lines.length) {
        const next = text.slice(lines[j][0], lines[j][1]);
        if (next.trim() && /^[ \t]*/.exec(next)[0].length <= depth) break;
        j++;
      }
      keys.push(keyOf(line, from, i, base, j));
      i = j - 1;
      continue;
    }
    const k = keyOf(line, from, i, base, 0);
    if (k) keys.push(k);
  }
  // Frozen: a reader keeps one list for many reads (lib/core/front-matter-key.js `keysOf`), so none may change it.
  return Object.freeze(keys);
}

function keyOf(line, from, index, base, bodyEnd) {
  const head = KEY_HEAD.exec(line);
  if (!head) return null;
  const nameFrom = head[1].length;
  const nameTo = nameFrom + head[2].length;
  const rawFrom = head[0].length;
  const raw = line.slice(rawFrom);
  let vFrom = rawFrom;
  let vTo = line.length;
  while (vFrom < vTo && (line[vFrom] === ' ' || line[vFrom] === '\t')) vFrom++;
  while (vTo > vFrom && (line[vTo - 1] === ' ' || line[vTo - 1] === '\t')) vTo--;
  const at = base + from;
  return Object.freeze({
    name: head[2], indent: head[1], raw, line: index, from: at, to: at + line.length,
    nameFrom: at + nameFrom, nameTo: at + nameTo, valueFrom: at + vFrom, valueTo: at + vTo, blockScalar: bodyEnd > 0, bodyEnd,
  });
}

/** The last column-0 line for `name`, or null. */
export function topLevelKey(keys, name) {
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i].name === name && !keys[i].indent) return keys[i];
  return null;
}

/** The last column-0 line for `name`, else the first at any indent, else null: the loose read registers have. */
export function looseKey(keys, name) {
  return topLevelKey(keys, name) ?? keys.find((k) => k.name === name) ?? null;
}
