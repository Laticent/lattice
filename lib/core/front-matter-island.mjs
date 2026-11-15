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
 * NAMES. `[A-Za-z_$][\w$.-]*` followed by optional blanks and `:`. That is the widest name any reader asked for
 * (lib/core/front-matter-groups.js `keyGroups`); a reader that wants a narrower one filters on it. A line whose head
 * is not a name (`- item`, `"quoted": x`, a comment) carries no key.
 *
 * Pure, fs-free and import-free, so the CJS readers require it and the docs dev server serves it as it is
 * (docs/src/plugins/vite-cjs-lib-dev.mjs hoists a `require('./x.mjs')` of a sibling).
 */

/**
 * Where the front matter ends: the engine's fence, with a lone `\r` read as a line end too. No capture group, so it is
 * the very literal the boundary parser always ran (recheck's verdict on it stands); `frontMatterIsland` finds the YAML
 * span from the match's ends.
 */
export const FRONT_MATTER_FENCE = /^---(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)---(?:\r\n|\r|\n)?/;

/**
 * A block-scalar header line: `key: |`, `key: >-`, `key: |2+`, optionally with a trailing comment. Group 1 is the
 * indent. The Studio's `BLOCK_SCALAR_RE` (docs/src/lib/front-matter.ts) is the same pattern. The tail is an
 * alternation, not `(?:[ \t]+#.*)?[ \t]*`: there `.*` and `[ \t]*` both take spaces, and a long run of them before a
 * character `.` cannot cross took quadratic time (about 50 s per render at 40K spaces).
 */
export const BLOCK_SCALAR_HEAD = /^([ \t]*)[A-Za-z][\w-]*:[ \t]+[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#.*|[ \t]*)\r?$/;

/** A key line's head: indent, name, the blanks before the colon. Linear: each run stops where the next cannot start. */
const KEY_HEAD = /^([ \t]*)([A-Za-z_$][\w$.-]*)([ \t]*):/;

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
      keys.push(keyOf(line, from, i, base, true));
      i = j - 1;
      continue;
    }
    const k = keyOf(line, from, i, base, false);
    if (k) keys.push(k);
  }
  return keys;
}

function keyOf(line, from, index, base, blockScalar) {
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
  return {
    name: head[2], indent: head[1], raw, line: index, from: at, to: at + line.length,
    nameFrom: at + nameFrom, nameTo: at + nameTo, valueFrom: at + vFrom, valueTo: at + vTo, blockScalar,
  };
}

/**
 * @typedef {object} FrontMatterIsland  a deck's front matter, read
 * @property {number} end        where the body starts: the block's length, closing line end included
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
  const m = FRONT_MATTER_FENCE.exec(text);
  if (!m) return null;
  const end = m[0].length;
  // The YAML starts after `---` and its line end, and stops at the line end before the closing `---`. The lazy body
  // stops at the first place the closer fits, so a `\r\n` there is one line end, read as the regex read it.
  const yamlFrom = text[3] === '\r' && text[4] === '\n' ? 5 : 4;
  let yamlTo = end;
  if (text[yamlTo - 1] === '\n') yamlTo -= text[yamlTo - 2] === '\r' ? 2 : 1;
  else if (text[yamlTo - 1] === '\r') yamlTo -= 1;
  yamlTo -= 3;
  yamlTo -= text[yamlTo - 1] === '\n' && text[yamlTo - 2] === '\r' && yamlTo - 2 >= yamlFrom ? 2 : 1;
  const yaml = text.slice(yamlFrom, yamlTo);
  return { end, yamlFrom, yamlTo, yaml, keys: frontMatterKeys(yaml, yamlFrom) };
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
