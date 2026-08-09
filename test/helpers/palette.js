/**
 * Palette CSS parser shared by tests.
 *
 * Reads a `themes/<name>.css` file plus `lattice.css` (which the theme
 * imports for the universal semantic palette defaults) and returns:
 *   - vars: { tokenName: resolvedValue } for every `--token` declaration
 *           across both files' `:root` blocks. Theme declarations
 *           override lattice.css defaults (themes loaded last).
 *           Chained `var(--other)` references are resolved iteratively
 *           to a fixed point.
 *   - raw: the theme file contents (for further checks).
 */

const fs   = require('fs');
const path = require('path');

function parsePaletteVars(content) {
  // Strip CSS comments first so doc blocks containing example strings
  // like `":root{color-scheme:dark}"` don't terminate the :root block
  // matcher's brace-balanced sweep prematurely. Real declarations never
  // have CSS comments mid-value, so this is safe.
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  const rootBlocks = stripped.match(/:root\s*\{[^}]*\}/g) || [];
  for (const block of rootBlocks) {
    const decls = block.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || [];
    for (const d of decls) {
      const m = d.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (m) vars[m[1]] = m[2].trim();
    }
  }
  // Iteratively resolve chained var() references (e.g. --diagram-band-text-1
  // → var(--text-heading) → var(--brand-leather-deep) → hex in cuoio).
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const k of Object.keys(vars)) {
      const ref = vars[k].match(/^var\(--([a-z0-9-]+)\)$/i);
      if (ref && vars[ref[1]] && vars[ref[1]] !== vars[k]) {
        vars[k] = vars[ref[1]];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return vars;
}

function loadPalette(name) {
  const root = path.join(__dirname, '..', '..');
  const themeFile = path.join(root, 'themes', `${name}.css`);
  const raw = fs.readFileSync(themeFile, 'utf8');
  // Universal palette defaults live in lattice.css :root. Parse it
  // first so theme declarations override (themes are loaded last in
  // the cascade — @import 'lattice' is at the top of each theme file).
  const latticeCSS = fs.readFileSync(path.join(root, 'dist', 'lattice.css'), 'utf8');
  const combined = latticeCSS + '\n' + raw;
  return { name, raw, vars: parsePaletteVars(combined) };
}

/**
 * Every base palette, read from the theme manifests.
 *
 * Four palette suites used to hardcode this list and they had drifted apart: three
 * carried 13 names and omitted `carta` — a shipped base palette — so
 * `token-parity`, `structural-text-contrast` and `chart-contrast` had never tested
 * it, while `containment-contrast` had 14 and did. A hardcoded list cannot report
 * what is missing from it; `themes/<name>.manifest.json` declares `role: "base"`,
 * and `checkThemeRoles` proves that declaration against the file's own imports and
 * token count. See engineering/decisions/2026-08-09-theme-token-contract.md.
 */
function baseThemeNames(themesDir = path.join(__dirname, '..', '..', 'themes')) {
  return fs.readdirSync(themesDir)
    .filter((f) => f.endsWith('.manifest.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(themesDir, f), 'utf8')))
    .filter((m) => m.role === 'base')
    .map((m) => m.name)
    .sort();
}

module.exports = { loadPalette, parsePaletteVars, baseThemeNames };
