/**
 * lib/core/front-matter-fence.mjs
 *
 * WHERE A DECK'S FRONT MATTER ENDS, and nothing else: the half of the front-matter island
 * (lib/core/front-matter-island.mjs joins it with lib/core/front-matter-keys.mjs, the key reader) that a reader needs
 * when it only wants the block. The splitter, the boundary parser, the deck model and the plugin admission need nothing
 * else, so a page that ships only them (the docs home page) does not ship the key reader.
 * engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §5, §11.
 *
 * THE BLOCK IS READ BY THE REGISTER GRAMMAR (lib/core/front-matter-grammar.js, its `fence` rule, generated into
 * this file's region below): `---`, a line end, anything up to and including the first `\n---`, then an
 * optional line end, on S0 text. The rule is a stop, so the parse ends where the block does and never reads the body.
 *
 * Pure, fs-free and IMPORT-FREE, and it must stay so: CommonJS readers `require()` it, and a required ES module that
 * imports another fails to load under Playwright's loader (pinned in test/unit/core/front-matter-island.test.js). So
 * the fence parser is generated INTO this file, in the region below, not imported.
 */

// ── segno:generated ── from lib/core/front-matter-grammar.js; DO NOT EDIT this region: run `npm run segno-lib:build`.
// biome-ignore format: generated
const fenceGrammar = (() => {
const KINDS = ["fence", "yaml"];
let s = "";
let n = 0;
let i = 0;
let depth = 0;
let err = null;
let buf = new Int32Array(256);
let top = 0;
let uf_0 = 2147483647;
let uv_0 = -1;
function ux_0(from) {
  if (uf_0 <= from && (uv_0 < 0 || uv_0 >= from)) return uv_0;
  uf_0 = from;
  return uv_0 = s.indexOf("\n---", from);
}
let halted = false;
function grow() {
  const next = new Int32Array(buf.length * 2);
  next.set(buf);
  buf = next;
}
function fail(expected) {
  if (!err) err = { at: i, expected, found: i < n ? s[i] : null };
  return false;
}
function r_fence() {
  {
    const c0 = top;
    if (top + 4 > buf.length) grow();
    top += 4;
    buf[c0] = 0;
    buf[c0 + 1] = i;
    if (i + 4 > n || !s.startsWith("---\n", i)) return fail('"---\\n"');
    i += 4;
    {
      const c1 = top;
      if (top + 4 > buf.length) grow();
      top += 4;
      buf[c1] = 1;
      buf[c1 + 1] = i;
      {
        const c2 = ux_0(i);
        if (c2 >= 0 && c2 + 4 <= n) i = c2 + 4;
        else {
          i = n;
          return fail('"\\n---"');
        }
      }
      buf[c1 + 2] = i;
      buf[c1 + 3] = top;
    }
    {
      const c3 = i < n ? s.charCodeAt(i) : -1;
      if (c3 === 10) {
        i++;
      }
    }
    buf[c0 + 2] = i;
    buf[c0 + 3] = top;
    halted = true;
    n = i;
  }
  return true;
}
const RULES = { "fence": r_fence };
const OK = { ok: true, tree: { buf, top: 0, kinds: KINDS, end: 0 } };
function parse(input, rule = "fence", from = 0) {
  let start = r_fence;
  if (rule !== "fence") {
    const named = Object.hasOwn(RULES, rule) ? RULES[rule] : void 0;
    if (!named) throw new Error('segno: no rule "' + rule + '"');
    start = named;
  }
  if (input !== s) {
    uf_0 = 2147483647;
  }
  s = input;
  n = s.length;
  if (!(from >= 0 && from <= n && Number.isInteger(from))) throw new Error("segno: from must be a whole number from 0 to " + n + ", not " + from);
  i = from;
  halted = false;
  depth = 0;
  err = null;
  top = 0;
  if (buf.length > 65536) {
    buf = new Int32Array(256);
    OK.tree.buf = buf;
  }
  const ok = start();
  if (ok && i < n) fail("end of input");
  const e = err;
  if (!ok || e) return { ok: false, error: e ?? { at: i, expected: "a valid input", found: null } };
  OK.tree.buf = buf;
  OK.tree.top = top;
  OK.tree.end = n;
  return OK;
}
return { parse };
})();
// ── segno:generated:end ──

/**
 * Where the front matter ends, as a regex for the callers that hold one (the boundary parser's `FRONT_MATTER`, the deck
 * model's `frontMatter` option): the engine's fence with a lone `\r` also read as a line end, the literal the boundary
 * parser has always run. On S0 text it reads what the grammar reads. On raw bytes it has one quirk the island itself
 * does not share: a backtrack can split a `\r\n` in two, so `---\r\n---\r\n` matches as an empty block where the
 * engine, after S0, sees none. `frontMatterFence` and `frontMatterMatch` fold to S0 first, so they never split one.
 */
export const FRONT_MATTER_FENCE = /^---(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)---(?:\r\n|\r|\n)?/;

/** The fence on S0 text (`\n` line ends only), through the grammar; null when the text opens with no block. */
function s0Fence(text) {
  const r = fenceGrammar.parse(text, 'fence');
  if (!r.ok) return null;
  // The tree is always the same two nodes: `fence` (the whole block) at 0, and inside it `yaml` at 4, which runs from
  // after the opening line to just past the closing `---`.
  const { buf } = r.tree;
  const closeEnd = buf[6];
  return { end: buf[2], closeEnd, yamlFrom: 4, yamlTo: Math.max(4, closeEnd - 4) };
}

/**
 * Where the block, its closing `---` and its YAML sit in `text`, or null: the fence alone, no keys read. The block is
 * the one the engine finds after S0: the grammar runs on `text` with every `\r\n` and lone `\r` folded to `\n`, and each
 * offset maps back to `text`. A text with no `\r` (every S0 text) is read as it is.
 */
export function frontMatterFence(text) {
  if (!text.startsWith('---')) return null;
  if (!text.includes('\r')) return s0Fence(text);
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
  const f = s0Fence(folded);
  return f && { end: at[f.end], closeEnd: at[f.closeEnd], yamlFrom: at[f.yamlFrom], yamlTo: at[f.yamlTo] };
}

/**
 * `source.match(fence)` in the shape the readers that used their own fence held: `[block, yaml]`, or null. `block` is
 * the whole front matter, closing line end included; `yaml` the body between the fences. For a reader that only needs
 * the two strings, so it reads the engine's block and not a fence of its own.
 *
 * @param {string} source
 * @returns {[string, string] | null}
 */
export function frontMatterMatch(source) {
  const text = String(source ?? '');
  const f = frontMatterFence(text);
  return f ? [text.slice(0, f.end), text.slice(f.yamlFrom, f.yamlTo)] : null;
}

