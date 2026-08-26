/**
 * Resolve the active palette name from the four-tier precedence chain
 * Lattice exposes:
 *
 *   1. Explicit CLI argument (`--palette` flag or 4th positional)
 *   2. `LATTICE_PALETTE` environment variable
 *   3. Deck front-matter `theme:` directive
 *   4. Default: 'cuoio'
 *
 * Higher tiers override lower. Empty/whitespace strings at any tier
 * are treated as "not specified" so an empty `LATTICE_PALETTE=`
 * environment doesn't accidentally win the chain.
 *
 * Front-matter parsing accepts `theme: indaco`, `theme: 'cuoio'`,
 * `theme: "cuoio"`, with optional surrounding whitespace. Anything
 * outside the leading `---\n…\n---\n` block is ignored.
 */

const { frontMatterValue } = require('./front-matter-key');

// THE default palette comes from `lib/core/default-palette.mjs` — the one declaration,
// readable from BOTH module systems (this file `require`s it; the docs site and the
// Studio export `import` it). Re-export it here so every existing consumer of
// `DEFAULT` keeps working unchanged.
const { DEFAULT_PALETTE: DEFAULT } = require('./default-palette.mjs');

// A palette name becomes a FILENAME (`themes/<name>.css`), so the value has to be
// constrained or a deck could path-traverse out of the themes directory. It used to be
// constrained implicitly, by the read pattern's own `([A-Za-z0-9_-]+)` capture. That
// conflated two jobs — reading the value and validating it — and the reading half was
// wrong: the pattern is anchored to `$`, so `theme: cuoio  # brand` matched NOTHING and
// the deck silently fell back to indaco while the engine's own parse read `cuoio`.
// Now the read is shared and the constraint is its own explicit, testable predicate.
const SAFE_PALETTE_NAME = /^[A-Za-z0-9_-]+$/;

function readFrontMatterTheme(md) {
  if (!md) return null;
  // NORMALIZE, don't pattern-match. This reader was the lone exception of ~55 whose regex
  // lacked `\r?`, and a Windows-authored deck lost its declared theme because of it (#1349).
  // The read boundaries now normalize, so this is belt-and-braces — but a `\r?\n` pattern is
  // belt-and-braces only for CRLF: it structurally cannot match a lone CR, because there is no
  // `\n` to anchor on. Normalizing the input instead makes the tolerance true for all three
  // conventions and keeps the pattern below simple, which is the whole argument of #1349.
  md = String(md).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  // The shared scalar rule — the same one the engine's own `parseFrontMatter` uses — so the
  // CLI/export path and the render path cannot disagree about which palette a deck declared.
  const value = frontMatterValue(m[1], 'theme');
  if (value === null) return null;
  return SAFE_PALETTE_NAME.test(value) ? value : null;
}

function clean(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * @param {Object} args
 * @param {string} [args.md]      Deck source (front matter included)
 * @param {string} [args.cliArg]  Palette name from CLI (positional or --palette)
 * @param {Object} [args.env]     Process environment (defaults to process.env)
 * @returns {{name: string, source: 'cli'|'env'|'front-matter'|'default'}}
 */
function resolvePalette({ md = '', cliArg = null, env = process.env } = {}) {
  const cli = clean(cliArg);
  if (cli) return { name: cli, source: 'cli' };

  const envName = clean(env?.LATTICE_PALETTE);
  if (envName) return { name: envName, source: 'env' };

  const fm = clean(readFrontMatterTheme(md));
  if (fm) return { name: fm, source: 'front-matter' };

  return { name: DEFAULT, source: 'default' };
}

module.exports = { resolvePalette, DEFAULT };
