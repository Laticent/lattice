// #1528 — a droppable THEME token must never ride in a `background:` SHORTHAND that
// also carries the canvas or a panel surface.
//
// CSS invalidates the WHOLE declaration when any var() in it is undefined, and the
// property then takes its INITIAL value — it does NOT fall back to an earlier rule that
// set the same property. So `background: var(--spectrum) …, var(--bg)` on `section.dark`
// did not degrade to "dark slide, no ribbon" for a theme short of --spectrum; it degraded
// to `transparent`, and the slide rendered white with its near-white headline invisible on
// it (measured in Chromium 131 on the real export path).
//
// The fix is longhands — `background-color: var(--bg); background-image: var(--spectrum);`
// — so a miss invalidates the image alone. This test keeps it that way, because
// checkNoSafeDefaultTokens catches a MISSING token and nothing catches the shorthand
// fragility that turns a missing token into a lost canvas.
//
// Scope is deliberately narrow: only a shorthand pairing a SPECTRUM read with a
// CANVAS/SURFACE read. A single-layer `background: var(--spectrum-structure)` (thead
// rails, `hr`, the list-steps spine, matrix-grid) is fine — an invalid declaration there
// costs exactly the decoration, which is already the correct degradation.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LIB = path.join(__dirname, '..', '..', '..', 'lib');

// Reads that can carry a MISSING THEME TOKEN into the declaration.
//
// Wider than just `--spectrum`, because the hazard is the TOKEN BEING ABSENT, not its
// name. A custom property that is invalid at computed-value time poisons every
// declaration that reads it, so an ALIAS is exactly as dangerous as the token:
//   · `--spectrum-structure` — engine-declared, but it derives from `--accent`/`--border`
//     by default AND `section.spectrum-trim` points it straight at `--spectrum`;
//   · `--sp-fill-*` — `base.variants.css` declares `--sp-fill-rainbow-h: var(--spectrum)`
//     at `:root`, and `base.accent-finish.css` routes it into the card rail;
//   · `--accent` — has NO engine `:root` default (only the print remap), and it is what
//     `section.accent.dark` paints its stripe from.
// A checker proved the alias gap was real by writing a passing offender through
// `--sp-fill-rainbow-h`; one alternation closes it.
const DROPPABLE_READ = /var\(\s*--(spectrum(-vertical|-structure|-solid|-end)?|sp-fill-[\w-]+|sp-card-[\w-]+|accent)\b/;

// The layers whose loss is a DEFECT rather than a missing decoration: the slide canvas
// and the panel surfaces painted behind text.
const SURFACE_READ = /var\(\s*--(bg|bg-alt|surface|surface-inverse|code-bg)\b/;

/**
 * Blank comments in place, keeping offsets and newlines. Every scan here runs on this,
 * not on the raw text: engine comments in this area quote CSS at length — the note on
 * `section.dark` contains the literal `section { background: var(--bg) }` — so a rule
 * matcher run over raw source truncates its block at a brace inside prose.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function cssFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) cssFiles(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

/**
 * Split a `background:` value on its TOP-LEVEL commas — the layer separators — leaving
 * commas inside `color-mix(…)` / `linear-gradient(…)` alone.
 *
 * The hazard is specifically a droppable token in ONE layer taking a load-bearing token
 * in a DIFFERENT layer down with it. A single layer that happens to mention both — e.g.
 * roadmap's `color-mix(in srgb, var(--accent) 6%, var(--bg-alt))` — is not that: if the
 * token is missing, the whole declaration goes, but all it was painting was a row tint,
 * which is the correct degradation. Matching on the raw string flagged those two rules
 * as offenders; layers are the honest unit.
 */
function layers(value) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(value.slice(start, i)); start = i + 1; }
  }
  out.push(value.slice(start));
  return out;
}

/** Every `background: …;` SHORTHAND declaration in `css`, with its 1-based line. */
function backgroundShorthands(css) {
  const s = stripComments(css);
  const out = [];
  for (const m of s.matchAll(/(^|[;{])\s*background\s*:([^;}]*)/g)) {
    const value = m[2];
    const line = s.slice(0, m.index).split('\n').length;
    out.push({ value, line });
  }
  return out;
}

describe('spectrum tokens stay out of the background shorthand (#1528)', () => {
  const files = cssFiles(LIB);

  test('the scan actually reads the engine CSS', () => {
    assert.ok(files.length > 50, `expected the lib CSS tree, got ${files.length} files`);
    const totals = files.reduce((n, f) => n + backgroundShorthands(fs.readFileSync(f, 'utf8')).length, 0);
    assert.ok(totals > 20, `expected many background shorthands to scan, found ${totals}`);
  });

  test('no `background:` shorthand pairs a droppable-token read with a canvas/surface read', () => {
    const offenders = [];
    for (const file of files) {
      const rel = path.relative(path.join(LIB, '..'), file);
      for (const decl of backgroundShorthands(fs.readFileSync(file, 'utf8'))) {
        const parts = layers(decl.value);
        const droppableAt = parts.findIndex((l) => DROPPABLE_READ.test(l));
        const surfaceAt = parts.findIndex((l) => SURFACE_READ.test(l));
        if (droppableAt !== -1 && surfaceAt !== -1 && droppableAt !== surfaceAt) {
          offenders.push(`${rel}:${decl.line} — background:${decl.value.trim().slice(0, 90)}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'A missing --spectrum invalidates the WHOLE declaration and the canvas goes with it ' +
        '(#1528). Split into `background-color:` + `background-image:` longhands so the miss ' +
        `costs the ribbon alone:\n  ${offenders.join('\n  ')}`,
    );
  });

  test('the hoisted sites still paint their surface as background-color', () => {
    const want = [
      ['base/base.modifiers.css', 'section.dark', '--bg'],
      ['shared/shared.styles.css', 'section.accent.dark', '--bg'],
      ['components/anchor/divider/divider.styles.css', 'section.divider', '--surface-inverse'],
      ['components/code/code/code.styles.css', 'section.code pre', '--code-bg'],
      ['components/code/compare-code/compare-code.styles.css', 'section.compare-code pre', '--code-bg'],
    ];
    for (const [rel, selector, surface] of want) {
      const css = stripComments(fs.readFileSync(path.join(LIB, rel), 'utf8'));
      const block = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`));
      assert.ok(block, `${rel}: could not find the \`${selector}\` rule`);
      assert.match(block[0], new RegExp(`background-color\\s*:\\s*var\\(${surface}`), `${rel}: \`${selector}\` must paint ${surface} as background-color`);
      assert.match(block[0], /background-image\s*:/, `${rel}: \`${selector}\` must carry the decoration on background-image`);
    }
  });
});
