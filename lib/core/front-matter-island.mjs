/**
 * lib/core/front-matter-island.mjs
 *
 * THE FRONT-MATTER ISLAND: S3 of the Segno deck pipeline for a deck's leading YAML block
 * (engineering/decisions/2026-10-22-segno-deck-pipeline.md §The design; 2026-11-13-squadra-replaces-lint-core.md §5).
 * Two answers, each given once, for every reader:
 *
 *   1. WHERE THE FRONT MATTER ENDS (`FRONT_MATTER_FENCE`, `frontMatterIsland().end`). It is the engine's answer:
 *      lib/engine/directives.js `parseFrontMatter` matched `^---\r?\n…\r?\n---\r?\n?` on the S0 text the engine's
 *      door hands it (no BOM, `\n` line ends). This pattern is that one with a lone `\r` also read as a line end, so a
 *      reader handed raw bytes (the splitter, the boundary callers) finds the block the engine will find after S0.
 *      On S0 text the two are the same pattern. The closing `---` need not end its line (`---x` closes the block and
 *      `x` starts the body), as it never had to for the engine.
 *
 *   2. ITS KEYS (`frontMatterKeys`). One pass over the block's lines, each key line read once: its indent, its name,
 *      its raw value and the spans of both. A block scalar's body (the lines under `style: |`, by YAML's rule: every
 *      following line that is blank or indented deeper than the header) is CSS or prose, not keys, so its lines are
 *      skipped. Each reader then applies its own selection to the one list, and that selection is the only thing
 *      that differs between them:
 *        - the engine's directives: column 0, a name of `[A-Za-z_]\w*`, every line in order (the last one wins);
 *        - `topLevelFrontMatterValue`: column 0, the last line for the name;
 *        - `frontMatterValue`: the last column-0 line, else the first line at any indent;
 *        - `lattice-deck`'s `fm-key` nodes: every key, with its spans, for a rule to report on.
 *
 * LINES. A line ends at `\n`, `\r\n` or a lone `\r`, the S0 line-end set. U+2028 and U+2029 are text, as they are to
 * markdown-it and to YAML 1.2. (Two readers this replaces used `^…$` under the `m` flag, which breaks on them; the
 * engine's used `(.*)$` without it, which dropped such a line. Both are gone.)
 *
 * NAMES. `[\w$][\w$.-]*` followed by optional blanks and `:`: wider than any reader asked for (the loose register
 * reader read a digit-first key like `1x:`, `keyGroups` in lib/core/front-matter-groups.js a `$` or `.`), so no reader
 * loses a key; a reader that wants a narrower name filters on it, as the engine's directives do. A line whose head
 * is not a name (`- item`, `"quoted": x`, a comment) carries no key.
 *
 * Pure, fs-free and import-free, so the CJS readers require it and the docs dev server serves it as it is
 * (docs/src/plugins/vite-cjs-lib-dev.mjs hoists a `require('./x.mjs')` of a sibling).
 */

/**
 * Where the front matter ends, as a regex for the callers that hold one (the boundary parser's `FRONT_MATTER`): the
 * engine's fence with a lone `\r` also read as a line end, the literal the boundary parser has always run. On S0 text it
 * is the engine's fence exactly. On raw bytes it has one quirk the island itself does not share: a backtrack can split a
 * `\r\n` in two, so `---\r\n---\r\n` matches as an empty block where the engine, after S0, sees none. `frontMatterIsland`
 * and `frontMatterMatch` find the block on the S0-folded text instead (`fence` below), so they never split one.
 */
export const FRONT_MATTER_FENCE = /^---(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)---(?:\r\n|\r|\n)?/;

/** The engine's own fence (lib/engine/directives.js read it so), on S0 text: `\n` line ends only. */
const S0_FENCE = /^---\n[\s\S]*?\n---\n?/;

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

/**
 * @typedef {object} FrontMatterIsland  a deck's front matter, read
 * @property {number} end        where the body starts: the block's length, closing line end included
 * @property {number} closeEnd   where the closing `---` ends, before its line end (`end` less that line end)
 * @property {number} yamlFrom   the YAML body's span in the source (between the fences)
 * @property {number} yamlTo
 * @property {string} yaml       the YAML body
 * @property {FrontMatterKey[]} keys  its key lines, with source offsets
 */

/**
 * The front matter at the start of `source`, or null when it opens with none. `source` is read as given: the engine
 * and the deck model hand S0 text, a raw-bytes reader its bytes (a leading BOM then means no front matter, as it does
 * to every reader that has not run S0).
 *
 * @param {string} source
 * @returns {FrontMatterIsland|null}
 */
export function frontMatterIsland(source) {
  const text = String(source ?? '');
  const f = fence(text);
  if (!f) return null;
  const yaml = text.slice(f.yamlFrom, f.yamlTo);
  return { ...f, yaml, keys: frontMatterKeys(yaml, f.yamlFrom) };
}

/**
 * Where the block, its closing `---` and its YAML sit in `text`, or null: the fence alone, no keys read. The block is
 * the one the engine finds after S0: `S0_FENCE` runs on `text` with every `\r\n` and lone `\r` folded to `\n`, and each
 * offset maps back to `text`. A text with no `\r` (every S0 text) is read as it is.
 */
function fence(text) {
  if (!text.startsWith('---')) return null;
  if (!text.includes('\r')) {
    const m = S0_FENCE.exec(text);
    if (!m) return null;
    const end = m[0].length;
    const closeEnd = text[end - 1] === '\n' ? end - 1 : end;
    return { end, closeEnd, yamlFrom: 4, yamlTo: Math.max(4, closeEnd - 4) };
  }
  // Fold, keeping where each folded character sits in `text` (`at[k]`, and `at[folded.length]` is its length).
  let folded = '';
  const at = [];
  for (let i = 0; i < text.length; i++) {
    at.push(i);
    if (text[i] === '\r') {
      folded += '\n';
      if (text[i + 1] === '\n') i++;
    } else folded += text[i];
  }
  at.push(text.length);
  const f = fence(folded);
  return f && { end: at[f.end], closeEnd: at[f.closeEnd], yamlFrom: at[f.yamlFrom], yamlTo: at[f.yamlTo] };
}

/**
 * `source.match(fence)` in the shape the readers that used their own fence held: `[block, yaml]`, or null. `block` is
 * the whole front matter, closing line end included; `yaml` the body between the fences. For a reader that only needs
 * the two strings, so it reads the island's block and not a fence of its own.
 *
 * @param {string} source
 * @returns {[string, string] | null}
 */
export function frontMatterMatch(source) {
  const text = String(source ?? '');
  const f = fence(text);
  return f ? [text.slice(0, f.end), text.slice(f.yamlFrom, f.yamlTo)] : null;
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
