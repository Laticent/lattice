/**
 * `lattice packages new plugin <name>` (lib/packages/new-plugin.js, lib/packages/cli.js): the
 * scaffold passes the RESOLVER beside every shipped plugin, its own fixtures hold against its own
 * renderer, and the command refuses a name that would collide. The end-to-end proof — scaffold
 * into a clean checkout, `npm run build`, `npm run build:check`, `npm run test:plugins` — is a
 * transcript in the PR that added this, because it needs a full build.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const { scaffoldPlugin, nameRefusal } = require('../../../lib/packages/new-plugin');
const { resolvePlugins } = require('../../../lib/plugins/resolve');
const { PLUGINS } = require('../../../lib/plugins/host');
const { main } = require('../../../lib/packages/cli');

// A name no real plugin takes, so an author's own scaffold (the docs use `sparkline`) never collides.
const NAME = 'zz-scaffold-probe';
const { files } = scaffoldPlugin(NAME);
const manifest = JSON.parse(files[`${NAME}.manifest.json`]);

/** The scaffold's render module, loaded from its own text. */
function renderModule() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-new-plugin-'));
  try {
    const file = path.join(dir, `${NAME}.render.js`);
    fs.writeFileSync(file, files[`${NAME}.render.js`]);
    return require(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('the plugin scaffold', () => {
  test('writes exactly the roles the plugin kind admits', () => {
    const { KINDS } = require('../../../lib/packages/kinds');
    const roles = Object.keys(files).map((f) => f.slice(NAME.length + 1));
    for (const r of roles) assert.ok([...KINDS.plugin.required, ...KINDS.plugin.optional].includes(r), `${r} is not a plugin role`);
    for (const r of KINDS.plugin.required) assert.ok(roles.includes(r), `missing required role ${r}`);
  });

  test('resolves cleanly beside every shipped plugin', () => {
    const mod = renderModule();
    const shipped = PLUGINS.map((p) => ({
      manifest: JSON.parse(fs.readFileSync(path.join(__dirname, `../../../lib/plugins/${p.name}/${p.name}.manifest.json`), 'utf8')),
      exports: {
        rules: Object.keys(p.syntax), renderers: Object.keys(p.renderers), fences: Object.keys(p.fenceRenderers),
        detect: Boolean(p.detect), hasHydrate: p.hydrate, hasBake: fs.existsSync(path.join(__dirname, `../../../lib/plugins/${p.name}/${p.name}.bake.js`)), hasStyles: fs.existsSync(path.join(__dirname, `../../../lib/plugins/${p.name}/${p.name}.styles.css`)),
        stylesSource: fs.existsSync(path.join(__dirname, `../../../lib/plugins/${p.name}/${p.name}.styles.css`)) ? fs.readFileSync(path.join(__dirname, `../../../lib/plugins/${p.name}/${p.name}.styles.css`), 'utf8') : '',
      },
    }));
    // Shipped hydrate modules carry their source for the require/import check.
    for (const s of shipped) if (s.exports.hasHydrate) s.exports.hydrateSource = fs.readFileSync(path.join(__dirname, `../../../lib/plugins/${s.manifest.name}/${s.manifest.name}.hydrate.js`), 'utf8');
    const scaffold = {
      folder: NAME,
      manifest,
      exports: { fences: Object.keys(mod.fences), hasStyles: true, stylesSource: files[`${NAME}.styles.css`] },
    };
    const { errors, order } = resolvePlugins([...shipped, scaffold], { reservedFences: new Set(['json', 'text']) });
    assert.deepEqual(errors, []);
    assert.ok(order.includes(NAME));
  });

  test('its own fixtures hold against its own renderer', () => {
    const mod = renderModule();
    const md = new MarkdownIt('commonmark');
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const previous = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, idx, o, env, self) =>
      tokens[idx].info.trim() === NAME ? mod.fences[NAME](tokens[idx], { escape: esc }, env) : previous(tokens, idx, o, env, self);
    const cases = files[`${NAME}.fixtures.md`].split('\n## ').slice(1);
    assert.equal(cases.length, 2);
    for (const c of cases) {
      const input = c.match(/````markdown\n([\s\S]*?)\n````/)[1];
      const html = md.render(input);
      for (const [, op, value] of c.matchAll(/^- (renders|omits) `(.+)`$/gm)) {
        assert.equal(html.includes(value), op === 'renders', `${op} ${value}\n${html}`);
      }
    }
  });
});

describe('packages new plugin — the command', () => {
  const taken = { plugins: ['math'], fences: ['functionplot', 'latticeplot'], languages: new Set(['json', 'tex']) };
  test('refuses a name that collides, and names the collision', () => {
    assert.match(nameRefusal('Bad_Name', taken), /not a plugin name/);
    assert.match(nameRefusal('math', taken), /already exists/);
    assert.match(nameRefusal('latticeplot', taken), /already a fence/);
    assert.match(nameRefusal('json', taken), /code language/);
    // `mermaid` is the mermaid plugin's own fence since phase D, so the real command refuses it as one.
    assert.match(nameRefusal('mermaid', { ...taken, plugins: [...taken.plugins, 'mermaid'], fences: [...taken.fences, 'mermaid'] }), /already exists/);
    assert.match(nameRefusal(`a${'b'.repeat(64)}`, taken), /at most 64 characters/);
    assert.equal(nameRefusal('zz-scaffold-probe', taken), null);
  });

  test('writes the folder with --dir, and refuses to overwrite it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-new-plugin-cli-'));
    try {
      const out = [];
      const log = (s) => out.push(s);
      assert.equal(await main(['new', 'plugin', NAME, '--dir', dir], { log, err: log }), 0, out.join('\n'));
      assert.deepEqual(fs.readdirSync(path.join(dir, NAME)).sort(), Object.keys(files).sort());
      assert.equal(await main(['new', 'plugin', NAME, '--dir', dir], { log, err: log }), 1);
      assert.match(out.join('\n'), /already exists/);
      assert.equal(await main(['new', 'plugin', 'json', '--dir', dir], { log, err: log }), 1);
      assert.equal(await main(['new', 'theme', 'x', '--dir', dir], { log, err: log }), 1);
      assert.equal(await main(['new', 'plugin', 'a', 'b', '--dir', dir], { log, err: log }), 1, 'a stray second name is refused, not ignored');
      assert.equal(fs.existsSync(path.join(dir, 'a')), false, 'and nothing is written');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
