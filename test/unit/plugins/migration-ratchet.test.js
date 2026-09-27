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
    const { fenceWrappers, pluginTokenNames } = pluginMigrationCounts(tmp);
    assert.deepEqual({ fenceWrappers, pluginTokenNames }, { ...PLUGIN_MIGRATION_BUDGET });
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

  test('a token named only in a COMMENT does not count', () => {
    const planted = path.join(tmp, 'lib/core/planted.js');
    fs.writeFileSync(planted, '// the math_block token\n/* and math_inline */\nconst x = 1;\n');
    try {
      assert.equal(pluginMigrationCounts(tmp).pluginTokenNames, 0);
    } finally {
      fs.rmSync(planted);
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
