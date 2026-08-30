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
 * that stops being needed must be retired, not left as a standing license for the next
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
const EMULATOR_SRC = fs.readFileSync(path.join(REPO, 'lattice-emulator.js'), 'utf8');

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
    // ONE entry since #1674. The other three — `securityLevel`, `startOnLoad`,
    // `suppressErrorRendering` — were secure keys the export could not deliver while its
    // config rode in a `%%{init}%%` directive. It renders in an engine-owned page now and
    // calls `mermaid.initialize`, so all three moved into `engineInitConfig` and are sent
    // by both paths. A sanction that stops diverging is DELETED, never left standing.
    assert.deepEqual([...DIVERGENT_CONFIG], ['flowchart.useMaxWidth']);

    const pdf = configOnly(engineInitConfig(THEME_VARS));
    const preview = configOnly(previewConfig());
    for (const key of DIVERGENT_CONFIG) {
      assert.notEqual(pdf[key], preview[key],
        `${key} is sanctioned as divergent but the two paths now agree — retire the sanction`);
    }
  });

  test('the three secure keys are SHARED now, and are still secure keys', () => {
    // They used to sit in DIVERGENT_CONFIG, and not as a preference: Mermaid's default
    // config carries
    //   secure: ['secure','securityLevel','startOnLoad','maxTextSize','suppressErrorRendering','maxEdges']
    // and its `sanitize` DELETES those keys from anything that is not
    // `mermaid.initialize`. While the export's config could only travel in a `%%{init}%%`
    // directive it structurally could not state them — putting them in `engineInitConfig`
    // would have emitted keys Mermaid silently drops and called it parity.
    //
    // #1674 removed the premise rather than the rule: the export renders in a page the
    // engine owns and calls `initialize` like the preview, so all three are simply sent
    // by both paths now.
    const cfg = engineInitConfig(THEME_VARS);
    assert.equal(cfg.startOnLoad, false);
    assert.equal(cfg.securityLevel, 'strict');
    assert.equal(cfg.suppressErrorRendering, true);

    // Still read from the INSTALLED Mermaid, because the secure list is what makes this
    // reachable ONLY through `initialize`. A key leaving that list would mean a directive
    // could carry it too — which changes nothing here, but the day someone reintroduces a
    // directive transport it is the fact they need.
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
      assert.ok(secure.includes(key), `expected \`${key}\` to still be a Mermaid secure key`);
    }
    // `flowchart.useMaxWidth`, the surviving sanction, is NOT a secure key — it is a
    // deliberate behavior choice, and the comment on it says so. Assert the difference so
    // the two kinds of sanction cannot be confused for each other.
    assert.equal(secure.includes('useMaxWidth'), false);
  });

  test('the shared config states the keys #1347 measured, at the values it named', () => {
    const cfg = engineInitConfig(THEME_VARS);
    // The layout key. 480, not Mermaid's 200: wrapping decides node width.
    assert.equal(cfg.flowchart.wrappingWidth, DIAGRAM_WRAPPING_WIDTH);
    assert.equal(DIAGRAM_WRAPPING_WIDTH, 480);
    assert.equal(cfg.flowchart.padding, DIAGRAM_NODE_PADDING);
    // The TOP-LEVEL key, which is the one Mermaid honors:
    // `getEffectiveHtmlLabels` = `config.htmlLabels ?? config.flowchart?.htmlLabels ?? true`,
    // and setting the nested slot also raises FLOWCHART_HTML_LABELS_DEPRECATED. Sharing it
    // as `flowchart.htmlLabels` silently DEMOTED it, so an author's
    // `%%{init}%% flowchart.htmlLabels: false` would have won where it previously lost.
    assert.equal(cfg.htmlLabels, true);
    assert.equal(cfg.flowchart.htmlLabels, undefined,
      'the nested slot is deprecated and lower-precedence — setting it demotes the engine\'s '
      + 'own value below an author directive');
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
    assert.match(RUNTIME_SRC, /const shared = engineInitConfig\(themeVars[^)]*\);/);
    assert.match(RUNTIME_SRC, /mermaid\.initialize\(previewInitConfig\(themeVars[^)]*\)\)/);
    assert.equal(/wrappingWidth:\s*\d+/.test(RUNTIME_SRC), false,
      'the runtime states its own wrappingWidth again — that is the #1347 layout gap returning');
    assert.equal(/quadrantChart:\s*\{/.test(RUNTIME_SRC), false,
      'the runtime states its own quadrantChart block again');
  });

  test('nothing on either path serializes the engine config into a directive', () => {
    // RETIRED ASSERTION, replaced by its inverse (#1674). This used to build a
    // `%%{init}%%` from the shared config and check that Mermaid's value filter did not
    // blank the newly shared keys. There is no such directive any more: both paths call
    // `mermaid.initialize`, so the filter — and the apostrophe trap behind it, which cost
    // a diagram its entire palette — is out of the engine's path entirely.
    //
    // What is worth pinning is that it STAYS out. A path that goes back to emitting a
    // directive re-acquires the sanitizer constraint that made `fontFamily` diverge, and
    // it should not be able to do so without this test noticing.
    const initDirective = require('../../../lib/integrations/mermaid/init-directive');
    for (const gone of ['engineInitDirective', 'withEngineInit', 'DIRECTIVE_VALUE_OK', 'DIAGRAM_FONT_STACK']) {
      assert.equal(gone in initDirective, false,
        `${gone} was retired in #1674 — see engineering/decisions/2026-08-17-mermaid-render-worker.md `
        + 'before reintroducing a directive transport');
    }
    // A CALL, not a mention — the export keeps comments explaining what the directive
    // transport was and why it went, and that history is the useful part.
    assert.equal(/withEngineInit\(|engineInitDirective\(/.test(EMULATOR_SRC), false,
      'the export path builds a %%{init}%% directive again — that reintroduces the '
      + 'sanitizer allow-list that forced DIVERGENT_KEYS');
  });
});
