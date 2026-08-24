/**
 * Unit: a palette never overrides one of the base's `light-dark()` PAIRS with a
 * FLAT value.
 *
 * The trap this closes (engineering/decisions/2026-08-16-flat-palette-dark-companions.md):
 * `lib/base/base.tokens.css` declares many defaults as pairs — sometimes through an
 * indirection, e.g. `--seq-500: var(--accent)` — while a palette may override the same
 * token with a single light-tuned value. Whichever sheet wins the cascade decides which
 * of the two ships, so a flat override is not merely "less adaptive": it is a dark-mode
 * value that nobody chose. It was invisible while the base won the export cascade, which
 * quietly lent its own dark arm back; #1527 flipped that, so a flat override now ships.
 * Two P1 regressions were found that way rather than by anyone reading a
 * palette: `word-cloud spectrum` fell from 14.50:1 to 1.16:1 on ardesia's dark canvas,
 * and `redline`'s struck clause to 1.25:1 on a11y-achromatopsia's dark slides.
 *
 * The check resolves BOTH sides through the merged map rather than comparing the
 * literal text, because the literal text misses exactly the family that caused the
 * worst regression — base's value there is `var(--accent)`, which reads flat and
 * resolves to a pair.
 *
 * Exempt: a palette with only a dark face (carbone) — see the note at the exemption
 * itself, which is a narrower call than it looks. A palette with only a LIGHT face is
 * NOT exempt: the a11y palettes pin `color-scheme: light` at `:root`, but that pin
 * reaches neither a per-slide `_class: dark`, which sets color-scheme on the SECTION
 * (#1323), nor the status-marker pseudo, which base.variants.css pins to
 * `color-scheme: dark` on every title / closing / non-light divider. Those two seams
 * are what the a11y status trio's dark arms exist for.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { splitLightDark, themeActualModes, listThemeManifests } = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '../../..');
const THEMES = path.join(ROOT, 'themes');
const BASE_TOKENS = path.join(ROOT, 'lib/base/base.tokens.css');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `--token: value` declared in any `:root` block, later wins. */
function rootVars(css) {
  const out = {};
  for (const block of stripComments(css).match(/:root[^{}]*\{[^}]*\}/g) || []) {
    for (const decl of block.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || []) {
      const m = decl.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (m) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

/** A palette plus everything it @imports, imports first (later wins). */
function paletteVars(name, seen = new Set()) {
  if (seen.has(name)) return {};
  seen.add(name);
  const file = path.join(THEMES, `${name}.css`);
  const css = fs.readFileSync(file, 'utf8');
  let out = {};
  for (const m of stripComments(css).matchAll(/@import\s+["']?([A-Za-z0-9_-]+)["']?\s*;/g)) {
    if (m[1] === 'lattice') continue; // the layout bundle; base tokens are added separately
    out = { ...out, ...paletteVars(m[1], seen) };
  }
  return { ...out, ...rootVars(css) };
}

/**
 * Collapse `light-dark()` to one arm, then substitute `var()` references until
 * the value stops changing.
 *
 * Substitution is TEXTUAL and happens ANYWHERE in the value, not only when the
 * whole value is a bare `var(--x)`. That matters for the false-POSITIVE
 * direction: `color-mix(in oklab, var(--accent) 92%, black)`,
 * `var(--accent, #006FA8)` and `oklch(from var(--accent) l c h)` are all
 * genuinely adaptive — each resolves through a pair — and a whole-value-only
 * matcher reads every one of them as flat and tells the author to add an arm it
 * already has. `color-mix()` derivation is the house idiom for the `-bg` family
 * and the nine derived `--seq-*` stops, so making it un-declarable would be a
 * gate that fails valid code.
 *
 * The arms are compared as STRINGS afterwards, so an expression that still
 * contains unresolved function syntax is fine: what decides the verdict is
 * whether the two schemes produce different text, which they do exactly when
 * some `light-dark()` in the chain contributed.
 */
function resolve(vars, mode) {
  const out = {};
  for (const [k, v] of Object.entries(vars)) {
    const arms = splitLightDark(v);
    out[k] = arms ? arms[mode === 'dark' ? 1 : 0] : v;
  }
  const REF = /var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/i;
  // Substituting ANYWHERE in the value (rather than only whole-value `var(--x)`)
  // makes a self-referential declaration expandable, and therefore explosive:
  // `--accent: color-mix(in oklab, var(--accent) 92%, black)` doubles in length
  // every pass and dies with `RangeError: Invalid string length` — which reports
  // nothing useful about which token is at fault. A cycle is invalid CSS and no
  // palette has one, so this is a guard, not a feature: stop expanding a value
  // that is running away and leave it as-is. It then compares equal across the
  // two schemes and the token is reported as flat — a loud, locatable failure
  // instead of a crash.
  const RUNAWAY = 4096;
  for (let pass = 0; pass < 24; pass += 1) {
    let changed = false;
    for (const k of Object.keys(out)) {
      const m = String(out[k]).match(REF);
      if (!m) continue;
      // An undeclared reference falls back to its own fallback arm, as CSS does.
      const sub = out[m[1]] !== undefined ? out[m[1]] : m[2];
      if (sub === undefined) continue;
      // Function replacer: a literal `$&` / `$'` in a substituted value would
      // otherwise be read as a replacement pattern rather than as text.
      const next = String(out[k]).replace(m[0], () => sub);
      if (next === out[k] || next.length > RUNAWAY) continue;
      out[k] = next;
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

const baseVars = rootVars(fs.readFileSync(BASE_TOKENS, 'utf8'));
const manifests = listThemeManifests(THEMES);
// name -> css, the shape themeActualModes expects (listThemeFiles is not exported).
const themeFiles = new Map(
  fs.readdirSync(THEMES).filter((f) => f.endsWith('.css')).sort()
    .map((f) => [f.replace(/\.css$/, ''), fs.readFileSync(path.join(THEMES, f), 'utf8')]),
);
// a11y-base is an import target, never picked directly; its overrides are audited
// through each a11y-<type> that imports it.
const PALETTES = [...manifests.keys()].filter((n) => themeFiles.has(n) && n !== 'a11y-base').sort();

describe('paired-token parity: no flat override of a base light-dark() pair', () => {
  assert.ok(PALETTES.length >= 15, `expected the shipped palette set, got ${PALETTES.length}`);

  for (const name of PALETTES) {
    test(name, () => {
      const modes = themeActualModes(name, themeFiles, manifests);
      // Exempt a GENUINELY single-canvas palette (carbone): no second canvas for an
      // arm to describe. NOT a `-dark` wrapper — it pins color-scheme over a
      // two-face parent, so it reads as dark-only here while a flat light-tuned
      // override in the parent is exactly the defect, on exactly that canvas.
      //
      // The exemption is NOT free and is not symmetric with the light-only case
      // above. `section.light` / `section.print` DO reach past carbone's `:where(:root)`
      // pin — not because that pin is specificity 0, but for the same reason
      // `section.dark` reaches past the a11y HARD pin three lines up: an element's
      // own `color-scheme` governs its subtree whatever the root said. And carbone
      // does carry one flat override of a base pair — `--on-accent:
      // var(--surface-inverse)`, which moves 4 tokens (itself plus the three
      // `--on-accent-*` tiers derived from it; `--on-accent-soft` reads --accent and
      // does not move). That one is deliberate and already adjudicated: #1640 item 3
      // measured it as an IMPROVEMENT under the #1527 flip — carbone's curated
      // near-black on its bright lime is 12.15:1 where base's white was 1.59:1.
      // The cost of the exemption is that a FUTURE flat override in carbone is
      // invisible here; revisit if carbone ever grows a real light face.
      if (modes.length === 1 && modes[0] === 'dark' && !manifests.get(name)?.extends) return;

      const own = paletteVars(name);
      const merged = { ...baseVars, ...own };
      const light = resolve(merged, 'light');
      const dark = resolve(merged, 'dark');

      const flat = [];
      for (const token of Object.keys(own)) {
        if (!(token in baseVars)) continue;                                  // palette-only token
        if (light[token] !== dark[token]) continue;                          // palette pairs it
        // Is the DEFAULT this override replaces a pair? Resolve base's declaration
        // through the palette's own leaves — base's value is often an indirection
        // (`--seq-500: var(--accent)`) whose pair-ness lives in the palette, so
        // resolving base alone reads it as flat and misses the whole family.
        const asBase = { ...merged, [token]: baseVars[token] };
        if (resolve(asBase, 'light')[token] === resolve(asBase, 'dark')[token]) continue;
        flat.push(`--${token}: ${own[token]}`);
      }

      assert.deepEqual(
        flat,
        [],
        `${name} overrides a base light-dark() pair with a flat value — dark mode gets a value ` +
        `nobody chose, on every path since #1527 gave the palette the cascade. Give it a dark arm:\n  ` +
        flat.join('\n  '),
      );
    });
  }
});
