/**
 * Resolve the active palette name from the four-tier precedence chain
 * Lattice exposes:
 *
 *   1. Explicit CLI argument (`--palette` flag or 4th positional)
 *   2. `LATTICE_PALETTE` environment variable
 *   3. Deck front-matter `theme:` directive
 *   4. Default: 'indaco'
 *
 * Higher tiers override lower. Empty/whitespace strings at any tier
 * are treated as "not specified" so an empty `LATTICE_PALETTE=`
 * environment doesn't accidentally win the chain.
 *
 * Front-matter parsing accepts `theme: indaco`, `theme: 'cuoio'`,
 * `theme: "cuoio"`, with optional surrounding whitespace. Anything
 * outside the leading `---\n…\n---\n` block is ignored.
 */

const DEFAULT = 'indaco';

function readFrontMatterTheme(md) {
  if (!md) return null;
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const t = m[1].match(/^[ \t]*theme:[ \t]*["']?([A-Za-z0-9_-]+)["']?[ \t]*$/m);
  return t ? t[1] : null;
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
