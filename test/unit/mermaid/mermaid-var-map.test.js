/**
 * Unit: the shared Mermaid theme map and the palette files agree.
 *
 * `MERMAID_VAR_MAP` (lib/core/mermaid-theme-map.js) is the source of truth for
 * which CSS custom properties Mermaid needs. Every `{ var: '…' }` entry must
 * resolve against every shipped palette — if the map references a token a
 * palette doesn't define, Mermaid silently falls back to its own defaults and
 * the diagram drifts off-brand.
 *
 * The map used to live inside lattice-emulator.js, which is a top-level CLI that
 * renders on `require`, so this file had to reach it by regex over the source
 * text. Now that the map is a plain module the token list comes from
 * `diagramThemeTokens()` — an actual read of the actual object, so a map entry
 * this regex would have missed can no longer hide.
 *
 * VALUE parity between the two render paths is the subject of
 * test/unit/core/diagram-theme-parity.test.js. This file is about the map versus
 * the palettes; see the `#511` block at the bottom for why the key-set gate that
 * used to live here is now structural.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { loadPalette } = require('../../helpers/palette');
const { MERMAID_VAR_MAP, diagramThemeTokens } = require('../../../lib/core/mermaid-theme-map');

describe('mermaid-var-map', () => {
  const required = diagramThemeTokens().sort();

  test('extracts a non-trivial set of required vars', () => {
    assert.ok(required.length >= 20,
      `expected MERMAID_VAR_MAP to reference at least 20 distinct CSS vars, got ${required.length}`);
  });

  // Every palette that DECLARES a token set, not a two-theme sample: the map is
  // palette-blind by design, so "adding a palette needs no map edit" is only
  // worth anything if it holds across all of them.
  //
  // The `-dark` wrappers and the a11y family are thin `@import` shims that add a
  // color-scheme flip and little else; `loadPalette` does not follow an import,
  // so sweeping them here would report every token as missing. They are covered
  // through the base they import — and the second test below pins that they
  // really are shims, so one quietly growing into a standalone palette does not
  // slip out of the sweep unnoticed.
  const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
  const ALL_THEMES = fs.readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith('.css') && !f.includes('audit'))
    .map((f) => f.replace(/\.css$/, ''))
    .sort();
  // Every theme `@import 'lattice'` for the universal defaults; a SHIM is one
  // that additionally imports a sibling PALETTE (`@import 'indaco'`).
  const importsAnotherTheme = (name) => {
    const src = fs.readFileSync(path.join(THEMES_DIR, `${name}.css`), 'utf8');
    return [...src.matchAll(/@import\s+['"]([^'"]+)['"]/g)]
      .some((m) => m[1] !== name && ALL_THEMES.includes(m[1]));
  };
  const THEMES = ALL_THEMES.filter((n) => !importsAnotherTheme(n));

  test('the sweep covers every self-declaring palette, and the rest are shims', () => {
    assert.ok(THEMES.length >= 13, `expected the full base-palette set, got ${THEMES.length}`);
    for (const n of ['indaco', 'cuoio', 'onyx', 'concrete', 'carbone']) {
      assert.ok(THEMES.includes(n), `themes/${n}.css must be in the sweep`);
    }
    // Everything excluded must be excluded BECAUSE it imports a base — never
    // because it was forgotten.
    for (const n of ALL_THEMES.filter((x) => !THEMES.includes(x))) {
      assert.ok(importsAnotherTheme(n), `themes/${n}.css is not in the sweep and does not import a base`);
    }
  });

  for (const name of THEMES) {
    test(`mermaid-var-map: every required var is defined in themes/${name}.css`, () => {
      const p = loadPalette(name);
      const missing = required.filter(v => !p.vars[v]);
      assert.deepEqual(missing, [],
        `themes/${name}.css does not define: ${missing.join(', ')}\n` +
        `MERMAID_VAR_MAP references these but the palette is silent. ` +
        `Either define the variable in the palette or change the map entry.`);
    });
  }

  // ── #511, now structural ───────────────────────────────────────────────────
  // The build (PDF/PPTX/PNG export) and runtime (preview / HTML export) paths
  // once themed DIFFERENT sets of Mermaid keys: the runtime themed ER
  // attribute-row fills + xy-chart axes the emulator did not, so those rendered
  // off-brand in the exported PDF — the deliverable. The gate that caught it
  // compared the two source blocks by regex, and it could only ever compare KEY
  // NAMES; the comment it shipped with conceded that "a few keys intentionally
  // map to different tokens per path". Thirty-eight of them did.
  //
  // Both paths now build from one map (#1332 step 2), so a key-set difference is
  // no longer a thing that can be true. What replaces the gate is stronger: the
  // parity test asserts identical VALUES, and DIVERGENT_KEYS enumerates the one
  // exception. Keeping the anchor here so the #511 lesson stays findable.
  test('neither render path defines a private map — the #511 drift is unrepresentable', () => {
    const root = path.join(__dirname, '..', '..', '..');
    for (const rel of ['lattice-emulator.js', path.join('lib', 'runtime', 'index.js')]) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.equal(/const\s+MERMAID_VAR_MAP\s*=\s*\{/.test(src), false,
        `${rel} defines its own MERMAID_VAR_MAP — import lib/core/mermaid-theme-map instead`);
      assert.match(src, /buildDiagramTheme/,
        `${rel} must build its themeVariables from the shared map`);
    }
    assert.ok(Object.keys(MERMAID_VAR_MAP).length >= 40,
      `expected a substantial shared key set, got ${Object.keys(MERMAID_VAR_MAP).length}`);
  });
});
