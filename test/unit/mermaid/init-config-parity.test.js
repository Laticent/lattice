/**
 * Unit: the two render paths send Mermaid the same NON-PALETTE config (#1347).
 *
 * THE GAP THIS CLOSES. #1332 unified the `themeVariables` half: one map, one kernel,
 * and `test/unit/core/diagram-theme-parity.test.js` failing on any value outside the
 * enumerated `DIVERGENT_KEYS`. The CONFIG half had no such gate — `DIVERGENT_KEYS`
 * governs `themeVariables` only — so eight keys diverged invisibly, and
 * `engineInitConfig`'s own docstring claimed to be "shared so the PDF path and the
 * runtime send Mermaid the same non-palette options, not just the same colors" while
 * the runtime did not call it at all.
 *
 * The one that bit was `flowchart.wrappingWidth`: 480 in the preview against Mermaid's
 * default 200 in the export. Wrapping width decides where a label breaks and a label
 * break decides the node's WIDTH, so the same deck laid its flowcharts out differently
 * on the two paths — a wider WYSIWYG gap than anything the theme map carried.
 *
 * This gate fails in BOTH directions, like its palette sibling: on an unlisted
 * divergence, and on a `DIVERGENT_CONFIG` entry that no longer diverges (a sanction
 * that stops being needed must be retired, not left as a standing licence for the next
 * one).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  engineInitConfig,
  DIVERGENT_CONFIG,
  DIAGRAM_NODE_PADDING,
  DIAGRAM_WRAPPING_WIDTH,
} = require('../../../lib/integrations/mermaid/init-directive');

const REPO = path.join(__dirname, '..', '..', '..');
const RUNTIME_SRC = fs.readFileSync(path.join(REPO, 'lib', 'runtime', 'index.js'), 'utf8');

const THEME_VARS = { primaryColor: '#111', fontFamily: 'X' };

/**
 * Run the REAL `previewInitConfig` out of the shipped runtime.
 *
 * The runtime is one big IIFE around a `document` guard, so requiring it in Node
 * yields nothing callable. Lift the source between its two sentinel comments and
 * evaluate it with the one thing it closes over — `engineInitConfig`, the shared half.
 * A paraphrase here would test the paraphrase, and this is precisely the file where a
 * paraphrase would agree with itself while the shipped code diverged.
 */
function previewConfig(themeVars = THEME_VARS) {
  const start = RUNTIME_SRC.indexOf('  // ── BEGIN PREVIEW INIT CONFIG');
  const end = RUNTIME_SRC.indexOf('  // ── END PREVIEW INIT CONFIG');
  assert.notEqual(start, -1, 'lib/runtime/index.js must bracket its init config with BEGIN PREVIEW INIT CONFIG');
  assert.notEqual(end, -1, 'lib/runtime/index.js must bracket its init config with END PREVIEW INIT CONFIG');
  const blockSrc = RUNTIME_SRC.slice(start, end);
  // biome-ignore lint/security/noGlobalEval: evaluating the SHIPPED source is the point.
  const factory = eval(`(function (engineInitConfig) {\n${blockSrc}\n  return previewInitConfig;\n})`);
  return factory(engineInitConfig)(themeVars);
}

/** Flatten to dotted paths, so a diff names the exact key (`flowchart.useMaxWidth`). */
function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

/** Config only — `themeVariables` is the palette half, gated by DIVERGENT_KEYS. */
function configOnly(cfg) {
  const flat = flatten(cfg);
  const out = {};
  for (const [k, v] of Object.entries(flat)) {
    if (!k.startsWith('themeVariables')) out[k] = v;
  }
  return out;
}

describe('mermaid init-config parity — one non-palette config, both paths', () => {
  test('every key the preview sends is either SHARED or enumerated in DIVERGENT_CONFIG', () => {
    const pdf = configOnly(engineInitConfig(THEME_VARS));
    const preview = configOnly(previewConfig());
    const sanctioned = new Set(DIVERGENT_CONFIG);

    const unlisted = Object.keys(preview)
      .filter((k) => !sanctioned.has(k))
      .filter((k) => !(k in pdf) || pdf[k] !== preview[k])
      .map((k) => `${k}: pdf=${JSON.stringify(pdf[k])} preview=${JSON.stringify(preview[k])}`);
    assert.deepEqual(unlisted, [],
      'these config keys differ between the render paths and are not in DIVERGENT_CONFIG — '
      + 'either move them into engineInitConfig so both paths send them, or add them to '
      + 'DIVERGENT_CONFIG with the reason they cannot be shared');

    // …and nothing the PDF path sends is missing from the preview. The C4 keys were
    // export-only for exactly this reason, and nothing noticed.
    const pdfOnly = Object.keys(pdf)
      .filter((k) => !sanctioned.has(k))
      .filter((k) => !(k in preview));
    assert.deepEqual(pdfOnly, [],
      'the PDF path sends these and the preview does not — a one-sided config key is the '
      + 'gap #1347 measured, in the other direction');
  });

  test('DIVERGENT_CONFIG is exactly the sanctioned list, and each entry really does differ', () => {
    assert.deepEqual([...DIVERGENT_CONFIG], [
      'securityLevel',
      'startOnLoad',
      'suppressErrorRendering',
      'flowchart.useMaxWidth',
    ]);

    const pdf = configOnly(engineInitConfig(THEME_VARS));
    const preview = configOnly(previewConfig());
    for (const key of DIVERGENT_CONFIG) {
      assert.notEqual(pdf[key], preview[key],
        `${key} is sanctioned as divergent but the two paths now agree — retire the sanction`);
    }
  });

  test("the three secure keys are undeliverable by directive — that is why they diverge", () => {
    // Not a preference: Mermaid's default config carries
    //   secure: ['secure','securityLevel','startOnLoad','maxTextSize','suppressErrorRendering','maxEdges']
    // and its `sanitize` DELETES those keys from anything that is not
    // `mermaid.initialize`. The PDF path's config can only travel in a `%%{init}%%`
    // directive, so it structurally cannot state them — putting them in
    // `engineInitConfig` would emit keys Mermaid silently drops and call it parity.
    //
    // Read from the INSTALLED Mermaid, so a version that changed the list fails here
    // instead of leaving a stale justification in a comment.
    const dist = path.join(REPO, 'node_modules', 'mermaid', 'dist', 'chunks', 'mermaid.esm');
    const files = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => f.endsWith('.mjs')) : [];
    let secure = null;
    for (const f of files) {
      const src = fs.readFileSync(path.join(dist, f), 'utf8');
      // Mermaid ships its default config as an ESCAPED JSON string literal inside the
      // bundle, so the key reads as `\\"secure\\":` in the file bytes. Match either
      // spelling rather than depending on how the bundler quoted it.
      const m = /(?:\\\\)?"secure(?:\\\\)?":\s*\[([^\]]*)\]/.exec(src);
      if (m) {
        secure = m[1].split(',').map((x) => x.replace(/[\\"'\s]/g, '')).filter(Boolean);
        break;
      }
    }
    assert.ok(secure, 'could not read Mermaid\'s secure-key list from the installed package');
    for (const key of ['securityLevel', 'startOnLoad', 'suppressErrorRendering']) {
      assert.ok(secure.includes(key),
        `Mermaid no longer treats \`${key}\` as a secure key, so it CAN now ride a directive — `
        + 'move it into engineInitConfig and out of DIVERGENT_CONFIG');
    }
    // `flowchart.useMaxWidth`, the fourth sanction, is NOT a secure key — it is a
    // deliberate behavior choice, and the comment on it says so. Assert the difference
    // so the two kinds of sanction cannot be confused for each other.
    assert.equal(secure.includes('useMaxWidth'), false);
  });

  test('the shared config states the keys #1347 measured, at the values it named', () => {
    const cfg = engineInitConfig(THEME_VARS);
    // The layout key. 480, not Mermaid's 200: wrapping decides node width.
    assert.equal(cfg.flowchart.wrappingWidth, DIAGRAM_WRAPPING_WIDTH);
    assert.equal(DIAGRAM_WRAPPING_WIDTH, 480);
    assert.equal(cfg.flowchart.padding, DIAGRAM_NODE_PADDING);
    assert.equal(cfg.flowchart.htmlLabels, true);
    // The reasoning for disabling markdown auto-wrap reads the same fence on both
    // paths, so it was never preview-only.
    assert.equal(cfg.markdownAutoWrap, false);
    // Preview-only until #1347, in opposite directions.
    assert.equal(cfg.quadrantChart.titleFontSize, 24);
    assert.equal(cfg.c4.c4ShapeInRow, 3);
  });

  test('the preview no longer hand-rolls the config it used to', () => {
    // The literal symptom: a second, private copy of the non-palette options. If this
    // block goes back to a literal object, `previewInitConfig` stops composing the
    // shared one and every assertion above quietly becomes a comparison of one object
    // with itself.
    assert.match(RUNTIME_SRC, /const shared = engineInitConfig\(themeVars\);/);
    assert.match(RUNTIME_SRC, /mermaid\.initialize\(previewInitConfig\(themeVars\)\)/);
    assert.equal(/wrappingWidth:\s*\d+/.test(RUNTIME_SRC), false,
      'the runtime states its own wrappingWidth again — that is the #1347 layout gap returning');
    assert.equal(/quadrantChart:\s*\{/.test(RUNTIME_SRC), false,
      'the runtime states its own quadrantChart block again');
  });

  test('a directive built from the shared config survives Mermaid\'s value filter', () => {
    // `engineInitDirective` prunes what `sanitizeDirective` would blank, so a newly
    // shared key must not arrive as a value the filter rejects. Numbers and booleans
    // are safe; this pins that the newly added keys actually SHIP rather than being
    // pruned away, which would look like sharing and deliver nothing.
    const { engineInitDirective } = require('../../../lib/integrations/mermaid/init-directive');
    const directive = engineInitDirective(engineInitConfig({ primaryColor: 'rgb(1, 2, 3)' }));
    const payload = JSON.parse(/%%\{init: ([\s\S]*)\}%%/.exec(directive)[1]);
    assert.equal(payload.flowchart.wrappingWidth, 480);
    assert.equal(payload.flowchart.htmlLabels, true);
    assert.equal(payload.markdownAutoWrap, false);
    assert.equal(payload.quadrantChart.titleFontSize, 24);
    assert.equal(payload.c4.c4ShapeInRow, 3);
  });
});
