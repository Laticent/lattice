/**
 * The plugin migration ratchet (`checkPluginMigration` in tools/check-ownership.js): the old
 * mechanisms the plugin system replaces may only shrink. Each arm runs on a scratch copy of the
 * two places the ratchet reads — lib/plugins and lib/integrations/markdown-it — plus one planted
 * file, so the live tree is never touched.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkPluginMigration, pluginMigrationCounts, PLUGIN_MIGRATION_BUDGET } = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '../../..');

describe('checkPluginMigration', () => {
  let tmp;
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-ratchet-'));
    fs.cpSync(path.join(ROOT, 'lib/plugins'), path.join(tmp, 'lib/plugins'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'lib/integrations/markdown-it'), path.join(tmp, 'lib/integrations/markdown-it'), { recursive: true });
    // math.render.js reaches lib/core/tex-linebreak.js; the copy needs it to load the registry.
    fs.mkdirSync(path.join(tmp, 'lib/core'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'lib/core/tex-linebreak.js'), path.join(tmp, 'lib/core/tex-linebreak.js'));
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('the live tree sits exactly on its budget', () => {
    const errors = [];
    checkPluginMigration(errors);
    assert.deepEqual(errors, []);
  });

  test('the copy counts what the live tree counts', () => {
    // The counts the copy holds everything for; the three `drawn*` counts and the runtime and
    // bake-record arms read consumers the copy leaves out (lib/runtime, docs/src, the emulator), so
    // they have their own arms below.
    const { fenceWrappers, pluginTokenNames, pluginAssetsOutside } = pluginMigrationCounts(tmp);
    const { drawnFenceClasses: _live, drawnLibraryUrls: _urls, drawnSettleStates: _states, runtimePluginNames: _rt, bakeContextByName: _bk, drawnFigureClasses: _fig, ...expected } = PLUGIN_MIGRATION_BUDGET;
    assert.deepEqual({ fenceWrappers, pluginTokenNames, pluginAssetsOutside }, expected);
  });

  test('OVER budget: code outside lib/plugins that hand-names a plugin token fails, naming the file', () => {
    const planted = path.join(tmp, 'lib/core/planted.js');
    fs.writeFileSync(planted, "const t = 'math_block';\n");
    try {
      const errors = [];
      checkPluginMigration(errors, PLUGIN_MIGRATION_BUDGET, tmp);
      assert.ok(errors.some((e) => /pluginTokenNames is 1, over its budget of 0 — lib\/core\/planted\.js: math_block/.test(e)), errors.join('\n'));
    } finally {
      fs.rmSync(planted);
    }
  });

  test('OVER budget: a fence wrapper re-grown ANYWHERE, in either spelling, fails — the host\'s own table does not count', () => {
    for (const [rel, code] of [
      ['lib/engine/planted.js', 'md.renderer.rules.fence = (t, i) => wrapped(t, i);\n'],
      ['lib/core/planted.js', "const r = md.renderer.rules; r['fence'] = wrap(r['fence']);\n"],
    ]) {
      const planted = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(planted), { recursive: true });
      fs.writeFileSync(planted, code);
      try {
        const errors = [];
        checkPluginMigration(errors, PLUGIN_MIGRATION_BUDGET, tmp);
        assert.ok(errors.some((e) => /fenceWrappers is 1, over its budget of 0/.test(e)), `${rel}: ${errors.join('\n')}`);
      } finally {
        fs.rmSync(planted);
      }
    }
    assert.ok(fs.readFileSync(path.join(tmp, 'lib/plugins/host.js'), 'utf8').includes('md.renderer.rules.fence ='), 'the host still owns the one table');
  });

  test('a token named only in a COMMENT does not count', () => {
    const planted = path.join(tmp, 'lib/core/planted.js');
    fs.writeFileSync(planted, '// the math_block token\n/* and math_inline */\nconst x = 1;\n');
    try {
      assert.equal(pluginMigrationCounts(tmp).pluginTokenNames, 0);
    } finally {
      fs.rmSync(planted);
    }
  });

  test('a runtime-drawn fence named by its code class outside lib/plugins counts; a comment or a longer class does not', () => {
    // The copy holds no consumer, so its baseline is 0 whatever the live tree's budget is.
    assert.equal(pluginMigrationCounts(tmp).drawnFenceClasses, 0);
    const planted = path.join(tmp, 'lib/core/planted.js');
    fs.writeFileSync(planted, "const sel = 'code.language-mermaid';\n// language-mermaid in prose\nconst other = 'language-mermaid-source';\n");
    try {
      const { drawnFenceClasses, drawnHits } = pluginMigrationCounts(tmp);
      assert.equal(drawnFenceClasses, 1);
      assert.deepEqual(drawnHits, ['lib/core/planted.js: language-mermaid']);
      const errors = [];
      checkPluginMigration(errors, { ...PLUGIN_MIGRATION_BUDGET, drawnFenceClasses: 0 }, tmp);
      assert.ok(errors.some((e) => /drawnFenceClasses is 1, over its budget of 0/.test(e)), errors.join('\n'));
    } finally {
      fs.rmSync(planted);
    }
  });

  test('a runtime-drawn plugin\'s hand-threaded library URL and private settle state count, in code and CSS; comments and tests do not', () => {
    assert.equal(pluginMigrationCounts(tmp).drawnLibraryUrls, 0);
    assert.equal(pluginMigrationCounts(tmp).drawnSettleStates, 0);
    const js = path.join(tmp, 'lib/core/planted.js');
    const css = path.join(tmp, 'lib/core/planted.css');
    const test_ = path.join(tmp, 'lib/core/planted.test.js');
    fs.writeFileSync(js, "const mermaidUrl = 'x';\npre.dataset.mermaidState = 'pending';\n// mermaidUrl in prose\n/* data-mermaid-state */\nconst mermaidUrlish = 1;\n");
    fs.writeFileSync(css, 'pre[data-mermaid-state="rendered"] + .mermaid { display: block; }\npre[data-mermaid-final] { color: red; }\n');
    fs.writeFileSync(test_, "const mermaidUrl = 'a test may name it';\n");
    try {
      const { drawnLibraryUrls, urlHits, drawnSettleStates, stateHits } = pluginMigrationCounts(tmp);
      assert.equal(drawnLibraryUrls, 1);
      assert.deepEqual(urlHits, ['lib/core/planted.js: mermaidUrl']);
      assert.equal(drawnSettleStates, 3);
      assert.deepEqual(stateHits.sort(), ['lib/core/planted.css: data-mermaid-final', 'lib/core/planted.css: data-mermaid-state', 'lib/core/planted.js: mermaidState']);
      const errors = [];
      checkPluginMigration(errors, { ...PLUGIN_MIGRATION_BUDGET, drawnLibraryUrls: 0, drawnSettleStates: 0 }, tmp);
      assert.ok(errors.some((e) => /drawnLibraryUrls is 1, over its budget of 0/.test(e)), errors.join('\n'));
      assert.ok(errors.some((e) => /drawnSettleStates is 3, over its budget of 0/.test(e)), errors.join('\n'));
    } finally {
      for (const f of [js, css, test_]) fs.rmSync(f);
    }
  });

  test('a drawn plugin\'s own figure class used as a selector counts, in code, CSS and a component manifest; a property read, a comment and a test do not', () => {
    assert.equal(pluginMigrationCounts(tmp).drawnFigureClasses, 0);
    const dir = path.join(tmp, 'lib/components/planted');
    fs.mkdirSync(dir, { recursive: true });
    const js = path.join(tmp, 'lib/core/planted.js');
    const css = path.join(dir, 'planted.styles.css');
    const json = path.join(dir, 'planted.manifest.json');
    const test_ = path.join(tmp, 'lib/core/planted.test.js');
    fs.writeFileSync(js, "doc.querySelectorAll('.mermaid-svg > svg');\nel.classList.contains('mermaid');\nq('[class~=mermaid]');\nconst lib = window.mermaid;\nconst p = s.props.mermaid;\n// '.mermaid' in prose\n/* section .mermaid */\nconst x = '.mermaid-error';\n");
    fs.writeFileSync(css, '/* a comment\n * .mermaid in a block\n */\nsection.diagram > .mermaid { flex: 1; }\n');
    fs.writeFileSync(json, '{ "slots": { "figure": { "selector": "div.mermaid, svg" } } }\n');
    fs.writeFileSync(test_, "document.querySelector('.mermaid');\n");
    try {
      const { drawnFigureClasses, figureHits } = pluginMigrationCounts(tmp);
      assert.equal(drawnFigureClasses, 5, figureHits.join('\n'));
      assert.deepEqual(figureHits.map((h) => h.split(':')[0]).sort(), ['lib/components/planted/planted.manifest.json', 'lib/components/planted/planted.styles.css', 'lib/core/planted.js', 'lib/core/planted.js', 'lib/core/planted.js']);
      const errors = [];
      checkPluginMigration(errors, PLUGIN_MIGRATION_BUDGET, tmp);
      assert.ok(errors.some((e) => /drawnFigureClasses is 5, over its budget of 0 — /.test(e)), errors.join('\n'));
    } finally {
      fs.rmSync(dir, { recursive: true });
      for (const f of [js, test_]) fs.rmSync(f);
    }
  });

  test('a browser plugin named in lib/runtime CODE counts, in any spelling; a comment does not', () => {
    const dir = path.join(tmp, 'lib/runtime');
    fs.mkdirSync(dir, { recursive: true });
    const js = path.join(dir, 'planted.js');
    fs.writeFileSync(js, "const lib = window.mermaid;\nconst FP = 'functionPlot';\n// mermaid in prose\n/* function-plot too */\nconst m = Math.round(1);\n");
    try {
      const { runtimePluginNames, runtimeHits } = pluginMigrationCounts(tmp);
      assert.equal(runtimePluginNames, 2, runtimeHits.join('\n'));
      assert.deepEqual(runtimeHits.sort(), ['lib/runtime/planted.js: functionPlot', 'lib/runtime/planted.js: mermaid']);
      const errors = [];
      checkPluginMigration(errors, PLUGIN_MIGRATION_BUDGET, tmp);
      assert.ok(errors.some((e) => /runtimePluginNames is 2, over its budget of 0 — lib\/runtime\/planted\.js/.test(e)), errors.join('\n'));
    } finally {
      fs.rmSync(js);
    }
  });

  test('a plugin stylesheet or grammar left in lib/integrations/<plugin> counts; another file there does not', () => {
    const dir = path.join(tmp, 'lib/integrations/mermaid');
    fs.mkdirSync(dir, { recursive: true });
    const files = ['mermaid.css', 'mermaid.hljs.js', 'reorient.js'].map((f) => path.join(dir, f));
    for (const f of files) fs.writeFileSync(f, '/* x */\n');
    try {
      const { pluginAssetsOutside, assetHits } = pluginMigrationCounts(tmp);
      assert.equal(pluginAssetsOutside, 2);
      assert.deepEqual(assetHits.sort(), ['lib/integrations/mermaid/mermaid.css', 'lib/integrations/mermaid/mermaid.hljs.js']);
      const errors = [];
      checkPluginMigration(errors, PLUGIN_MIGRATION_BUDGET, tmp);
      assert.ok(errors.some((e) => /pluginAssetsOutside is 2, over its budget of 0/.test(e)), errors.join('\n'));
    } finally {
      for (const f of files) fs.rmSync(f);
    }
  });

  test('a plugin\'s bake record read by NAME off a contexts map outside lib/plugins counts; another receiver, a test or lib/plugins does not', () => {
    const js = path.join(tmp, 'lib/core/planted.js');
    const inPlugins = path.join(tmp, 'lib/plugins/mermaid/planted.js');
    fs.writeFileSync(js, "const s = BAKE_CONTEXTS.get('mermaid').state;\nconst t = bakeContexts.get(\"math\");\nconst u = contexts.get('mermaid-ish');\nconst q = searchParams.get('math');\n");
    fs.writeFileSync(inPlugins, "contexts.get('mermaid');\n");
    try {
      const { bakeContextByName, bakeHits } = pluginMigrationCounts(tmp);
      assert.equal(bakeContextByName, 2, bakeHits.join('\n'));
      const errors = [];
      checkPluginMigration(errors, PLUGIN_MIGRATION_BUDGET, tmp);
      assert.ok(errors.some((e) => /bakeContextByName is 2, over its budget of 0/.test(e)), errors.join('\n'));
    } finally {
      for (const f of [js, inPlugins]) fs.rmSync(f);
    }
  });

  test('UNDER budget: a budget left above the real count fails, naming the new count', () => {
    const errors = [];
    checkPluginMigration(errors, { ...PLUGIN_MIGRATION_BUDGET, fenceWrappers: PLUGIN_MIGRATION_BUDGET.fenceWrappers + 1 }, tmp);
    assert.ok(errors.some((e) => /fenceWrappers is \d+, under its budget/.test(e)), errors.join('\n'));
  });

  test('a registry that yields no token names while plugins declare syntax fails, never passes empty', () => {
    // A fresh copy at a NEW path: an ES module is cached by URL, so rewriting the first copy's
    // grammar in place would still read the cached module.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-ratchet-empty-'));
    try {
      fs.cpSync(path.join(tmp, 'lib'), path.join(empty, 'lib'), { recursive: true });
      fs.writeFileSync(path.join(empty, 'lib/plugins/grammar.generated.mjs'), 'export const PLUGIN_GRAMMAR = [];\n');
      const errors = [];
      checkPluginMigration(errors, PLUGIN_MIGRATION_BUDGET, empty);
      assert.ok(errors.some((e) => /yields no token names/.test(e)), errors.join('\n'));
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
