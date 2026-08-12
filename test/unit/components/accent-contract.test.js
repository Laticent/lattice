/**
 * Unit: the accent-container ink contract.
 *
 * Lattice fills two accent "containers" (see design/theming.md "Accent
 * containers"):
 *
 *   BOLD  background:var(--accent)       → ink from the --on-accent ramp
 *   SOFT  background:var(--accent-soft)  → ink/border from --on-accent-soft
 *
 * The bug this guard prevents: a BOLD accent fill that paints its text with a
 * fixed light ink (--on-dark* or a hardcoded white). That reads fine while the
 * accent is dark (e.g. carbone's lime) but collapses to light-on-light the
 * moment a palette flips --accent to a pale value — which every palette does in
 * dark mode, and achromatic palettes (concrete/atelier/ardesia) do outright.
 *
 * The rule: any declaration block that fills with var(--accent) must not also
 * use --on-dark* or a bare white as a color. Decorative fills (hairlines,
 * connector lines, dots) carry no text and pass trivially; text-bearing fills
 * must reach for the --on-accent pair, which adapts per theme. A
 * `var(--on-accent, …)` fallback chain is fine — only --on-dark or a bare white
 * as the PRIMARY `color:` value trips the guard (a `var(--on-accent,
 * var(--on-dark-primary))` chain reads --on-accent first and passes).
 *
 * If this fails: swap the offending color for --on-accent — for ALL text on the rail,
 * eyebrows and captions included — or --on-accent-ghost for chrome. Do NOT reach for
 * --on-accent-secondary to quiet a label: it is a 70% derivation of a rung already
 * curated tight, so it is sub-AA on seven of the 14 palettes (that binding is exactly
 * what engineering/decisions/2026-08-11-on-dark-ink-tiers.md removed from
 * split-panel.watermark). Step a label down with size or weight instead. And do NOT
 * paper over it by darkening the accent — the whole point is palette-blind.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

// Source CSS that fills with accent: every component, the base layer, and the
// two hand-authored docs-site stylesheets (the generated token file carries no
// rules). dist/* and *.min.css are build outputs — scan source only.
const SCAN_DIRS = [path.join(ROOT, 'lib')];
const SCAN_FILES = [
  path.join(ROOT, 'docs', 'src', 'styles', 'landing.css'),
  path.join(ROOT, 'docs', 'src', 'styles', 'playground.css'),
];
const SKIP_DIRS = new Set(['node_modules', '.git', '.scratch', 'dist']);

function walkCss(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkCss(p, out);
    else if (ent.isFile() && p.endsWith('.css') && !p.endsWith('.min.css')) out.push(p);
  }
  return out;
}

function cssFiles() {
  const all = [...SCAN_FILES];
  for (const d of SCAN_DIRS) walkCss(d, all);
  return all.filter(fs.existsSync);
}

// Strip /* … */ comments so commented-out examples never false-positive.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

// Innermost declaration blocks only — `[^{}]+` never spans a nested brace, so
// an @media wrapper is skipped and its inner rules are matched individually.
const BLOCK_RE = /\{([^{}]+)\}/g;

// Fills with either accent container — bold (--accent) or soft (--accent-soft).
// A light-only ink (--on-dark* / bare white) is wrong on EITHER, because both
// flip pale in some mode. Body on the soft tint is canvas --text-body /
// --accent-soft-body, which is correct and not flagged.
const ACCENT_FILL_RE = /background(?:-color)?\s*:\s*var\(\s*--accent(?:-soft)?\s*\)/;

// Light-only inks that break on a pale accent — only when they are the PRIMARY
// `color:` value. The lookbehind excludes `background-color` and custom
// `--*-color` props; a `color:var(--on-accent, var(--on-dark-primary))` chain
// reads --on-accent first, so its nested --on-dark is not flagged.
const ON_DARK_INK_RE = /(?<![-\w])color\s*:\s*var\(\s*--on-dark/;
const BARE_WHITE_COLOR_RE = /(?<![-\w])color\s*:\s*(?:#fff(?:fff)?\b|white\b)/i;

describe('accent-container ink contract', () => {
  for (const file of cssFiles()) {
    const rel = path.relative(ROOT, file);
    const css = stripComments(fs.readFileSync(file, 'utf8'));

    test(rel, () => {
      const offenders = [];
      for (const m of css.matchAll(BLOCK_RE)) {
        const body = m[1];
        if (!ACCENT_FILL_RE.test(body)) continue;
        if (ON_DARK_INK_RE.test(body) || BARE_WHITE_COLOR_RE.test(body)) {
          offenders.push(body.replace(/\s+/g, ' ').trim().slice(0, 160));
        }
      }
      assert.deepEqual(
        offenders,
        [],
        `${rel}: background:var(--accent) paired with a light-only ink ` +
          `(--on-dark* or bare white). Use the --on-accent pair instead:\n  ` +
          offenders.join('\n  '),
      );
    });
  }
});
