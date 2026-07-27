const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');

// ── Drift guard: readable text sizes its font through the typography manifest,
// never a raw `cqi` literal.
//
// A raw `cqi` font-size (e.g. `font-size: 0.86cqi`) bypasses the curated
// landscape/square/portrait scales (lib/typography/scale.js): it renders at the
// SAME coefficient on a tall portrait box as on a wide landscape one, so it
// collapses to fine print the moment the deck goes portrait/square — the exact
// "corner tags can't be read" class of bug the categories were built to kill.
//
// THREE ways to satisfy it:
//
//   1. `var(--fs-<role>)` (or `var(--pill-fs)`) — orientation-aware. The default.
//   2. A FLOORED cqi — `max(var(--chart-text-min), <n>cqi)` or a `clamp()`. For a
//      mark that genuinely must track its own geometry (a label riding a
//      cqi-sized arrow, a tag pinned to a cqi-proportional grid cell), where the
//      hazard is not the cqi but the fact that cqi has no BOTTOM. #1213.
//   3. An ALLOWLIST entry below — for text that is decorative, or fitted inside a
//      cqi-sized shape where flooring the glyph without flooring the shape would
//      overflow it (initials in a disc, an index numeral in a diagram node).
//
// Option 3 used to be a bare `cqi-ok:` comment anywhere on the line. That was a
// SELF-GRANTED exemption: any author could write one, nothing checked it, and it
// accumulated silently to 22 sites. It is now an entry here with a per-file
// count, so adding one is a reviewable diff — and an entry that over-counts
// fails as STALE, so the list cannot rot as sites are fixed.
//
// See engineering/decisions/2026-06-20-typography-categories.md and #1213.

const SANCTIONED = [
  {
    file: 'lib/base/base.variants.css',
    count: 11,
    why: 'decorative status-marker stamps (DRAFT / CONFIDENTIAL / …) — shape-fitted to the '
       + 'slide, read as texture rather than text, and several are watermark-scale (16cqi).',
  },
  {
    file: 'lib/components/statement/split-panel/split-panel.styles.css',
    count: 4,
    why: 'oversized decorative open-quote glyph (17.2cqi) and a counter numeral inside a '
       + 'fixed accent disc.',
  },
  {
    file: 'lib/components/chart/state-chart/state-chart.styles.css',
    count: 3,
    why: 'index numerals set inside cqi-sized nodes and badges — flooring the numeral without '
       + 'flooring the node would overflow the disc. Note state-chart also self-scales '
       + '(2026-07-16-state-chart-self-scale.md), so a CSS floor cannot pin an EFFECTIVE size '
       + 'here regardless; see the .state-edge-label comment.',
  },
  {
    file: 'lib/components/chart/journey/journey.styles.css',
    count: 2,
    why: 'actor initials fitted inside a fixed 1.45cqi disc. Measured legible as-is: 15.2px '
       + 'landscape, 47.0px portrait, 23.3px square.',
  },
  {
    file: 'lib/forms/tile/watermark/watermark.css',
    count: 1,
    why: 'full-tile decorative watermark glyph (44cqi) — the tile IS the glyph.',
  },
  {
    file: 'lib/components/evidence/kpi/kpi.styles.css',
    count: 1,
    why: 'decorative, shape-fitted per the rule comment.',
  },
  {
    file: 'lib/components/comparison/verdict-grid/verdict-grid.styles.css',
    count: 1,
    why: 'decorative ✧ glyph at 0.35 opacity — not read.',
  },
];

// A `font-size:` (or `font:` shorthand) declaration whose value mentions `cqi`
// (raw or inside calc()). `font\b` (not `font-`) so it skips font-family /
// font-variant / font-feature-settings, which legitimately carry no size.
const FS_CQI_RE = /(?:font-size|font)\s*:\s*[^;{}]*cqi/i;
// A floor: max() or clamp() wrapping the value. min() is NOT a floor — it caps.
const FLOORED_RE = /(?:font-size|font)\s*:\s*[^;{}]*\b(?:max|clamp)\s*\(/i;

function collectCssFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectCssFiles(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

/** Unfloored raw-cqi font-size sites, grouped by repo-relative file. */
function findUnfloored() {
  const byFile = new Map();
  for (const file of collectCssFiles(path.join(ROOT, 'lib'))) {
    const rel = path.relative(ROOT, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!FS_CQI_RE.test(line)) return;
      if (FLOORED_RE.test(line)) return;              // way 2 — floored
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel).push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return byFile;
}

test('no unfloored raw cqi font-sizes in bundled CSS (--fs-* token, a floor, or an allowlist entry)', () => {
  const byFile = findUnfloored();
  const budget = new Map(SANCTIONED.map((s) => [s.file, s.count]));
  const offenders = [];

  for (const [rel, sites] of byFile) {
    const allowed = budget.get(rel) || 0;
    if (sites.length > allowed) offenders.push(...sites.slice(allowed));
    budget.set(rel, Math.max(0, allowed - sites.length));
  }

  assert.deepStrictEqual(
    offenders,
    [],
    'raw cqi font-sizes have no BOTTOM — they collapse to fine print on a narrow box. '
      + 'Route through a var(--fs-*) token, floor it with max(var(--chart-text-min), …), or '
      + `add a SANCTIONED entry with its justification:\n${offenders.join('\n')}`,
  );
  assert.ok(collectCssFiles(path.join(ROOT, 'lib')).length > 0, 'expected to scan some CSS files');
});

test('no stale allowlist entries — a sanction that over-counts must be lowered', () => {
  const byFile = findUnfloored();
  const stale = SANCTIONED
    .map((s) => ({ ...s, actual: (byFile.get(s.file) || []).length }))
    .filter((s) => s.actual < s.count);

  assert.deepStrictEqual(
    stale.map((s) => `${s.file}: sanctioned ${s.count}, found ${s.actual}`),
    [],
    'an allowlist entry documents sites that no longer exist — lower the count (or drop the '
      + 'entry) so the list keeps telling the truth as sites get fixed',
  );
});
