/**
 * tools/build-plugin-registry.js on a SYNTHETIC tree: several plugins that mix `before` and
 * `after` anchors on one host rule, and a plugin that ships a syntax module but declares no
 * syntax. The in-tree set has one block rule, so it cannot show that the generated block
 * installer (`blocks.generated.mjs`, what the boundary parser uses) and the host
 * (`host-grammar.mjs`, what the engine uses) agree on ORDER — this does.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '../../..');

/** A block rule that claims nothing, so installing it changes no parse — only the rule list. */
const syntaxModule = (tokens, { detect = true } = {}) =>
  `${tokens.map((t) => `export function ${t}() { return false; }`).join('\n')}\n${detect ? 'export function detect() { return false; }\n' : ''}`;

const renderModule = (tokens) => `module.exports = { renderers: { ${tokens.map((t) => `${t}: () => ''`).join(', ')} } };\n`;

function writePlugin(root, name, { syntax = {}, requires } = {}, { detect = true } = {}) {
  const dir = path.join(root, 'lib/plugins', name);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    type: 'plugin', format: 1, name, api: 1, title: name, description: name,
    ...(requires ? { requires } : {}),
    contributes: { ...(Object.keys(syntax).length ? { syntax } : {}) },
  };
  fs.writeFileSync(path.join(dir, `${name}.manifest.json`), JSON.stringify(manifest));
  const tokens = Object.keys(syntax);
  fs.writeFileSync(path.join(dir, `${name}.syntax.mjs`), syntaxModule(tokens, { detect }));
  if (tokens.length) fs.writeFileSync(path.join(dir, `${name}.render.js`), renderModule(tokens));
}

describe('the generated registries on a multi-plugin tree', () => {
  let root;
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-plugin-tree-'));
    // What the build's component walk loads, and the host whose order the test compares against.
    fs.cpSync(path.join(ROOT, 'lib/packages'), path.join(root, 'lib/packages'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'lib/theme'), path.join(root, 'lib/theme'), { recursive: true });
    fs.mkdirSync(path.join(root, 'lib/components'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'lib/components/manifest.schema.json'), path.join(root, 'lib/components/manifest.schema.json'));
    fs.mkdirSync(path.join(root, 'lib/plugins'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'lib/plugins/host-grammar.mjs'), path.join(root, 'lib/plugins/host-grammar.mjs'));
    // host-grammar.mjs reads the deck's `plugins:` list and slide classes through this (admitPlugins).
    fs.copyFileSync(path.join(ROOT, 'lib/plugins/deck-plugins.mjs'), path.join(root, 'lib/plugins/deck-plugins.mjs'));

    // Dependency order a → b → c. Two plugins after `fence`, two before it, one after `table`.
    writePlugin(root, 'a', { syntax: {
      a_before: { kind: 'block', anchor: { before: 'fence' }, triggers: ['%'], opaque: true },
      a_after: { kind: 'block', anchor: { after: 'fence' }, triggers: ['&'] },
    } });
    writePlugin(root, 'b', { requires: ['a'], syntax: {
      b_before: { kind: 'block', anchor: { before: 'fence' }, triggers: ['@'] },
      b_after: { kind: 'block', anchor: { after: 'fence' }, triggers: ['~'], opaque: true },
    } });
    writePlugin(root, 'c', { requires: ['b'], syntax: {
      c_table: { kind: 'block', anchor: { after: 'table' }, triggers: ['^'] },
    } });
    // A syntax module with no declared syntax and no `detect`: legal, and it must still link.
    writePlugin(root, 'e', {}, { detect: false });

    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-plugin-registry.js'), '--root', root, '--silent']);
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  test('the block installer and the host install the same rules in the same order', async () => {
    const url = (f) => pathToFileURL(path.join(root, 'lib/plugins', f)).href;
    const blocks = await import(url('blocks.generated.mjs'));
    const host = await import(url('host-grammar.mjs'));
    const viaHost = new MarkdownIt('commonmark');
    host.installGrammar(viaHost, { kinds: ['block'] });
    const viaGenerated = new MarkdownIt('commonmark');
    blocks.installPluginBlocks(viaGenerated);
    const rules = (md) => md.block.ruler.__rules__.map((r) => [r.name, r.fn]);
    assert.deepEqual(rules(viaGenerated), rules(viaHost));
    // And the order is the promised one: dependency order around each anchor.
    const names = viaHost.block.ruler.__rules__.map((r) => r.name);
    assert.deepEqual(names.slice(names.indexOf('a_before'), names.indexOf('fence') + 3), ['a_before', 'b_before', 'fence', 'a_after', 'b_after']);
    assert.equal(names[names.indexOf('table') + 1], 'c_table');
    assert.deepEqual([...blocks.OPAQUE_BLOCK_TOKENS], ['a_before', 'b_after']);
  });

  test('a plugin with a syntax module but no syntax and no detect still links', async () => {
    const { PLUGIN_GRAMMAR } = await import(pathToFileURL(path.join(root, 'lib/plugins/grammar.generated.mjs')).href);
    const e = PLUGIN_GRAMMAR.find((p) => p.name === 'e');
    assert.ok(e, 'plugin e is in the grammar');
    assert.equal(e.detect, null);
    assert.deepEqual(PLUGIN_GRAMMAR.map((p) => p.name), ['a', 'b', 'c', 'e']);
  });
});

// The resolver's reserved-name arm is tested with a synthetic set; this proves the BUILD hands it
// the real one (highlight.js's names), so a plugin that claims ```json fails `npm run build`.
describe('the build refuses a fence a code language owns', () => {
  test('a plugin claiming ```json fails the registry build, naming it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-plugin-reserved-'));
    try {
      fs.cpSync(path.join(ROOT, 'lib/packages'), path.join(root, 'lib/packages'), { recursive: true });
      fs.cpSync(path.join(ROOT, 'lib/theme'), path.join(root, 'lib/theme'), { recursive: true });
      fs.mkdirSync(path.join(root, 'lib/components'), { recursive: true });
      fs.copyFileSync(path.join(ROOT, 'lib/components/manifest.schema.json'), path.join(root, 'lib/components/manifest.schema.json'));
      const dir = path.join(root, 'lib/plugins/jsonish');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'jsonish.manifest.json'), JSON.stringify({
        type: 'plugin', format: 1, name: 'jsonish', api: 1, title: 'x', description: 'x',
        contributes: { fences: { json: { body: 'json' } } },
      }));
      fs.writeFileSync(path.join(dir, 'jsonish.render.js'), "module.exports = { fences: { json: () => '' } };\n");
      let stderr = '';
      try {
        execFileSync(process.execPath, [path.join(ROOT, 'tools/build-plugin-registry.js'), '--root', root, '--silent'], { stdio: 'pipe' });
      } catch (e) {
        stderr = String(e.stderr);
      }
      assert.match(stderr, /claims fence "json", which a code language already owns/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
