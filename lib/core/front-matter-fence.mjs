/**
 * lib/core/front-matter-fence.mjs
 *
 * WHERE A DECK'S FRONT MATTER ENDS, and nothing else: the half of the front-matter island
 * (lib/core/front-matter-island.mjs, which reads the keys) that a reader needs when it only wants the block. The
 * splitter, the boundary parser, the deck model and the register resolvers read this module alone, so a page that ships
 * them (the docs home page) does not ship the key reader. engineering/decisions/2026-11-13-squadra-replaces-lint-core.md
 * §11.
 *
 * Pure, fs-free and import-free.
 */

/**
 * Where the front matter ends, as a regex for the callers that hold one (the boundary parser's `FRONT_MATTER`): the
 * engine's fence with a lone `\r` also read as a line end, the literal the boundary parser has always run. On S0 text it
 * is the engine's fence exactly. On raw bytes it has one quirk the island itself does not share: a backtrack can split a
 * `\r\n` in two, so `---\r\n---\r\n` matches as an empty block where the engine, after S0, sees none. `frontMatterFence`
 * and `frontMatterMatch` find the block on the S0-folded text instead (`fence` below), so they never split one.
 */
export const FRONT_MATTER_FENCE = /^---(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)---(?:\r\n|\r|\n)?/;

/** The engine's own fence (lib/engine/directives.js read it so), on S0 text: `\n` line ends only. */
const S0_FENCE = /^---\n[\s\S]*?\n---\n?/;

/**
 * Where the block, its closing `---` and its YAML sit in `text`, or null: the fence alone, no keys read. The block is
 * the one the engine finds after S0: `S0_FENCE` runs on `text` with every `\r\n` and lone `\r` folded to `\n`, and each
 * offset maps back to `text`. A text with no `\r` (every S0 text) is read as it is.
 */
export function frontMatterFence(text) {
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
  const f = frontMatterFence(folded);
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

