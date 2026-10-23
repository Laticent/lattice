/**
 * Unit: every shipped palette curates every color the engine gives a default for.
 *
 * Lattice owns the VOCABULARY of color (base.tokens.css, chart-family.styles.css) and each theme curates the VALUES.
 * An engine literal is a fallback for a palette nobody has curated yet (a Studio draft, an author's own theme). A
 * shipped palette that leans on one is wearing the engine's brand, not its own, and nothing visible says so: the
 * status trio, the chart solids and the solid ink all used to fall back this way on some palettes.
 *
 * The test: for every color token the engine declares with a literal (`#...`), some file in each palette's theme chain
 * must declare it too. A token the engine only DERIVES from theme tokens (`--code-bg: var(--surface-inverse)`) is
 * theme-owned through what it reads and is not listed. The print band is a separate, universal contract.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { themeChain } = require('../../../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../../../lib/theme/edges.generated.mjs');

const ROOT = path.join(__dirname, '..', '..', '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (rel) => strip(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function engineColorTokens() {
  const out = new Set();
  for (const m of read('lib/base/base.tokens.css').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (!m[1].startsWith('--print-') && /#[0-9A-Fa-f]{3,8}\b/.test(m[2])) out.add(m[1]);
  }
  // The chart family names its seeds inside the consumer: `--chart-cat-1-hue: var(--chart-cat1, light-dark(#...))`.
  for (const m of read('lib/plugins/chart-family/chart-family.styles.css').matchAll(/var\((--[a-z0-9-]+),\s*light-dark\(#/g)) out.add(m[1]);
  return [...out].sort();
}

test('every shipped palette declares every color the engine has a default for', () => {
  const tokens = engineColorTokens();
  assert.ok(tokens.includes('--pass') && tokens.includes('--on-solid') && tokens.includes('--chart-cat1'), 'the scan sees the status trio, the solid ink and the chart seeds');
  const palettes = fs.readdirSync(path.join(ROOT, 'themes')).filter((d) => fs.existsSync(path.join(ROOT, 'themes', d, `${d}.css`)));
  const gaps = [];
  for (const p of palettes) {
    const declared = themeChain(p, THEME_EDGES).map((n) => read(`themes/${n}/${n}.css`)).join('\n');
    for (const t of tokens) if (!new RegExp(`${t.replace(/-/g, '\\-')}\\s*:`).test(declared)) gaps.push(`${p}: ${t}`);
  }
  assert.deepEqual(gaps, [], 'a palette leans on an engine color instead of curating its own');
});
