/**
 * The register grammar (lib/core/front-matter-grammar.js, generated into the regions of lib/core/front-matter-keys.mjs
 * and lib/core/front-matter-fence.mjs) held to the hand-written island it replaced (PR #3228, main at b93e27ea):
 * `frontMatterKeys` and the fence, on seeded inputs built to reach every branch the grammar draws (wide names, a gap
 * before the colon, every indicator shape, junk and comment tails, U+2028 in a comment, tabs and Unicode spaces, block
 * scalar bodies at every depth). The old reader is copied below verbatim, comments dropped. Seeded (HARD RULE #32).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { frontMatterKeys, keyWork } = require('../../../lib/core/front-matter-keys.mjs');
const { frontMatterFence } = require('../../../lib/core/front-matter-fence.mjs');

const OLD_BLOCK_SCALAR_HEAD = /^([ \t]*)[A-Za-z][\w-]*:[ \t]+[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#.*|[ \t]*)\r?$/;

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
function oldFrontMatterKeys(yaml, base = 0) {
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
    const scalar = OLD_BLOCK_SCALAR_HEAD.exec(line);
    if (scalar) {
      // Its body: every later line that is blank or indented deeper than the header.
      const depth = scalar[1].length;
      let j = i + 1;
      while (j < lines.length) {
        const next = text.slice(lines[j][0], lines[j][1]);
        if (next.trim() && /^[ \t]*/.exec(next)[0].length <= depth) break;
        j++;
      }
      keys.push(oldKeyOf(line, from, i, base, j));
      i = j - 1;
      continue;
    }
    const k = oldKeyOf(line, from, i, base, 0);
    if (k) keys.push(k);
  }
  // Frozen: a reader keeps one list for many reads (lib/core/front-matter-key.js `keysOf`), so none may change it.
  return Object.freeze(keys);
}

function oldKeyOf(line, from, index, base, bodyEnd) {
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


const OLD_S0_FENCE = /^---\n[\s\S]*?\n---\n?/;
function oldFence(text) {
  const m = OLD_S0_FENCE.exec(text);
  if (!m) return null;
  const end = m[0].length;
  const closeEnd = text[end - 1] === '\n' ? end - 1 : end;
  return { end, closeEnd, yamlFrom: 4, yamlTo: Math.max(4, closeEnd - 4) };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['theme', 'style', 'a-b', 'a.b', '$x', '1x', '_k', 'A9', 'x$', 'é', '-n', '.n'];
const GAPS = ['', '', '', ' ', '\t', '  '];
const LEADS = ['', ' ', ' ', '\t', '  ', ' \t'];
const INDS = ['|', '>', '|-', '>+', '|2', '>9-', '|+3', '|0', '|2x', '||', '| x', '|#', '| #c', '|\t# c', '| # a b', '|  ', '> -', '|-2', '|+-'];
const PLAINS = ['', 'cuoio', 'dark  ', "'q # x'", '#fff', ': y', '|x'];
const INDENTS = ['', '', ' ', '  ', '   ', '    ', '\t', ' \t', ' '];

function line(r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  switch (Math.floor(r() * 8)) {
    case 0: return '';
    case 1: return pick(['   ', '\t', '　', '# c', '- item', '"k": v', '  text', ' ']);
    case 2: return `${pick(INDENTS)}${pick(NAMES)}${pick(GAPS)}`;
    case 3:
    case 4: return `${pick(INDENTS)}${pick(NAMES)}${pick(GAPS)}:${pick(LEADS)}${pick(INDS)}`;
    default: return `${pick(INDENTS)}${pick(NAMES)}${pick(GAPS)}:${pick(LEADS)}${pick(PLAINS)}`;
  }
}

test('the grammar reads every key line as the hand-written reader did (4,000 seeded front matters, seed 0x3263)', () => {
  const SEED = 0x3263;
  const r = rng(SEED);
  let headers = 0;
  for (let n = 0; n < 4000; n++) {
    const eol = ['\n', '\n', '\r\n', '\r'][Math.floor(r() * 4)];
    const yaml = Array.from({ length: Math.floor(r() * 14) }, () => line(r)).join(eol);
    const base = Math.floor(r() * 9);
    const want = oldFrontMatterKeys(yaml, base);
    assert.deepEqual(frontMatterKeys(yaml, base), want, `seed ${SEED}, case ${n}: ${JSON.stringify(yaml)}`);
    headers += want.filter((k) => k.blockScalar).length;
  }
  // The walk reached the header branch, not only plain keys.
  assert.ok(headers > 300, `${headers} block-scalar headers`);
});

test('the grammar finds the block where the engine fence did (4,000 seeded sources, seed 0x3264)', () => {
  const SEED = 0x3264;
  const r = rng(SEED);
  const PARTS = ['---', '\n', 'a: b', '\n---', '---x', '\n\n', '-', ' ', '#'];
  for (let n = 0; n < 4000; n++) {
    let src = r() < 0.8 ? '---\n' : '';
    for (let k = Math.floor(r() * 10); k > 0; k--) src += PARTS[Math.floor(r() * PARTS.length)];
    assert.deepEqual(frontMatterFence(src), oldFence(src), `seed ${SEED}, case ${n}: ${JSON.stringify(src)}`);
  }
});

test('the reader is linear: each line outside a block-scalar body parsed once, body lines never parsed, each line visited at most twice', () => {
  // Counted, not timed (HARD RULE #32). A header indented 200 columns, then 3,000 body lines each indented one deeper
  // than the last and each shaped like a header itself, then 20,000 key lines at every depth. A reader that read a body
  // line as a header again would scan the rest of the body from each one: about n x n / 2 visits.
  const deep = ' '.repeat(200);
  const yaml = [`${deep}style: |`, ...Array.from({ length: 3000 }, (_, i) => `${deep} ${' '.repeat(i)}x${i}: |`), ...Array.from({ length: 20000 }, (_, i) => `${' '.repeat(i % 300)}k${i}: v`)].join('\n');
  const before = { ...keyWork };
  const keys = frontMatterKeys(yaml);
  const lines = 23001;
  // The header and the 20,000 keys go through the grammar; the 3,000 body lines only have their indent measured.
  assert.equal(keyWork.lines - before.lines, lines - 3000);
  // At most one visit by the outer loop and one by the body loop for each line.
  assert.ok(keyWork.visits - before.visits <= 2 * lines, `${keyWork.visits - before.visits} visits for ${lines} lines`);
  assert.equal(keys[0].bodyEnd, 3001);
});
