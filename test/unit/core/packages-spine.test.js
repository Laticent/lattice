/**
 * The package spine (lib/packages/) — engineering/decisions/2026-09-23-portable-packages.md §3.
 *
 * The contract, in the order a package meets it:
 *   - kinds.js names four types and their role files;
 *   - read.js finds each file's role by SUFFIX and checks every projection (folder
 *     name, file prefix, a theme's `@theme`) against the manifest's `name` —
 *     strictly for the repo, leniently for an import;
 *   - write.js puts the manifest back in charge of every projection;
 *   - the registry reserves shipped names (§3.7);
 *   - the build's walk + `checkPackageIdentity` fail a RENAMED FOLDER (the failing arm).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const spine = require('../../../lib/packages/index.js');
const { discoverPackages, listComponentFolders } = require('../../../lib/packages/fs.js');
const { checkPackageIdentity } = require('../../../tools/check-ownership.js');

const { readPackage, writePackage, createRegistry, buildIndex, KINDS, TYPES } = spine;

const componentFiles = (name = 'probe-card', prefix = name) => ({
  [`${prefix}.manifest.json`]: JSON.stringify({ name, function: 'statement' }),
  [`${prefix}.styles.css`]: `section.${name} { display: grid; }`,
  [`${prefix}.gallery.md`]: `<!-- _class: ${name} -->\n\n## Probe`,
  [`${prefix}.gallery.light.pdf`]: null,
  'portrait.svg': '<svg/>',
});

const themeFiles = (name = 'harbor', directive = name) => ({
  [`${name}.manifest.json`]: JSON.stringify({ name, role: 'base', family: 'brand', modes: ['light'] }),
  [`${name}.css`]: `/* @theme ${directive} */\n@import 'lattice';\n:root { --accent: #123456; }`,
});

describe('kinds', () => {
  test('four types, each with a manifest role', () => {
    assert.deepEqual(TYPES, ['theme', 'component', 'finish', 'motion']);
    for (const t of TYPES) assert.ok(KINDS[t].required.includes('manifest.json'), t);
  });
  test('a transform.js is the one code role', () => {
    assert.deepEqual(KINDS.component.code, ['transform.js']);
  });
});

describe('readPackage — strict (the repo gate)', () => {
  test('a well-formed component reads, with its assets and outputs set apart', () => {
    const r = readPackage(componentFiles(), { type: 'component', folder: 'probe-card', strict: true });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.equal(r.pkg.name, 'probe-card');
    assert.deepEqual(r.pkg.assets, ['portrait.svg']);
    assert.deepEqual(r.pkg.outputs, ['probe-card.gallery.light.pdf']);
    assert.equal(r.pkg.code, false);
  });

  test('a RENAMED FOLDER fails: the folder is a projection of the manifest name', () => {
    const r = readPackage(componentFiles(), { type: 'component', folder: 'probe-cards', strict: true });
    assert.equal(r.ok, false);
    assert.match(r.errors.join('\n'), /folder "probe-cards" → "probe-card"/);
  });

  test('a file left behind by a rename fails', () => {
    const files = { ...componentFiles(), 'old-card.docs.md': '# old' };
    const r = readPackage(files, { type: 'component', folder: 'probe-card', strict: true });
    assert.match(r.errors.join('\n'), /old-card\.docs\.md should be probe-card\.docs\.md/);
  });

  test('a missing required role fails', () => {
    const files = componentFiles();
    delete files['probe-card.gallery.md'];
    assert.match(readPackage(files, { type: 'component', strict: true }).errors.join('\n'), /missing probe-card\.gallery\.md/);
  });

  test('a theme whose @theme disagrees with its manifest fails', () => {
    const r = readPackage(themeFiles('harbor', 'harbour'), { type: 'theme', strict: true });
    assert.match(r.errors.join('\n'), /declares `@theme harbour`/);
  });

  test('a manifest type that contradicts the location fails', () => {
    const files = componentFiles();
    files['probe-card.manifest.json'] = JSON.stringify({ name: 'probe-card', type: 'theme' });
    assert.match(readPackage(files, { type: 'component' }).errors.join('\n'), /sits where component packages live/);
  });

  test('a newer format is refused, not half-read', () => {
    const files = componentFiles();
    files['probe-card.manifest.json'] = JSON.stringify({ name: 'probe-card', type: 'component', format: 2 });
    assert.match(readPackage(files).errors.join('\n'), /made by a newer Lattice/);
  });

  test('a loose package with no type anywhere is refused', () => {
    assert.match(readPackage(componentFiles()).errors.join('\n'), /no "type"/);
  });

  test('a transform.js makes it a code package', () => {
    const r = readPackage({ ...componentFiles(), 'probe-card.transform.js': 'module.exports = {}' }, { type: 'component', strict: true });
    assert.equal(r.pkg.code, true);
  });
});

describe('readPackage — lenient (import) and writePackage', () => {
  test('a renamed zip reads, reports the renames, and writes back under the manifest name', () => {
    // A browser saved `brand (1)`: every file prefix is wrong, the manifest is right.
    const files = themeFiles('harbor', 'brand (1)');
    const renamed = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.replace('harbor', 'brand (1)'), v]));
    const r = readPackage(renamed, { type: 'theme' });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.ok(r.renames.some((x) => x.includes('brand (1).css → harbor.css')));
    const out = writePackage(r.pkg);
    assert.deepEqual(Object.keys(out).sort(), ['harbor.css', 'harbor.manifest.json']);
    const m = JSON.parse(out['harbor.manifest.json']);
    assert.deepEqual([m.name, m.type, m.format], ['harbor', 'theme', 1]);
    // …and what it wrote passes the STRICT read the repo gate runs.
    assert.equal(readPackage(out, { strict: true }).ok, true);
  });

  test('a theme imported as BYTES round-trips too (a zip hands over bytes)', () => {
    const enc = (t) => new TextEncoder().encode(t);
    const r = readPackage({ 'x.manifest.json': enc(JSON.stringify({ name: 'brand' })), 'x.css': enc('/* @theme x */\n:root{}') }, { type: 'theme' });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.equal(readPackage(writePackage(r.pkg), { strict: true }).ok, true);
  });

  test('an asset that merely ends in a role suffix stays an asset beside the real role file', () => {
    const files = { ...componentFiles(), 'probe-card.docs.md': '# docs', 'logo.docs.md': 'a caption' };
    const r = readPackage(files, { type: 'component' });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.equal(r.pkg.roles['docs.md'], 'probe-card.docs.md');
    assert.ok(r.pkg.assets.includes('logo.docs.md'));
    assert.ok('logo.docs.md' in writePackage(r.pkg));
  });

  test('an import leaves a stray README behind instead of failing', () => {
    const r = readPackage({ ...themeFiles('harbor'), 'README.md': '# hi' }, { type: 'theme' });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.deepEqual(r.pkg.dropped, ['README.md']);
    assert.ok(!('README.md' in writePackage(r.pkg)));
    // …while the repo gate still refuses it.
    assert.equal(readPackage({ ...themeFiles('harbor'), 'README.md': '# hi' }, { type: 'theme', strict: true }).ok, false);
  });

  test('write drops build outputs and keeps assets', () => {
    const r = readPackage(componentFiles(), { type: 'component' });
    const out = writePackage(r.pkg);
    assert.ok(!('probe-card.gallery.light.pdf' in out));
    assert.ok('portrait.svg' in out);
  });

  test('the manifest keeps every field, with name, type and format first', () => {
    const r = readPackage(componentFiles(), { type: 'component' });
    const m = JSON.parse(writePackage(r.pkg)['probe-card.manifest.json']);
    assert.deepEqual(Object.keys(m), ['name', 'type', 'format', 'function']);
  });
});

describe('registry', () => {
  const index = buildIndex([{ pkg: readPackage(themeFiles('indaco'), { type: 'theme' }).pkg, path: 'themes/indaco' }]);

  test('a user package under a shipped name is registered as <name>-custom (§3.7)', () => {
    const reg = createRegistry(index);
    const e = reg.add(readPackage(themeFiles('indaco'), { type: 'theme' }).pkg);
    assert.equal(e.name, 'indaco-custom');
    assert.equal(e.renamedFrom, 'indaco');
    assert.equal(e.pkg.manifest.name, 'indaco-custom');
    assert.ok('indaco-custom.css' in writePackage(e.pkg));
    assert.equal(reg.add(readPackage(themeFiles('indaco'), { type: 'theme' }).pkg).replaced, true);
    assert.equal(reg.get('theme', 'indaco').source, 'shipped');
  });

  test('names are reserved PER TYPE', () => {
    assert.equal(createRegistry(index).unreservedName('finish', 'indaco'), 'indaco');
  });

  test('a shipped package cannot be removed; a user one can', () => {
    const reg = createRegistry(index);
    assert.throws(() => reg.remove('theme', 'indaco'), /shipped with Lattice/);
    reg.add(readPackage(themeFiles('harbor'), { type: 'theme' }).pkg);
    assert.equal(reg.remove('theme', 'harbor'), true);
    assert.deepEqual(reg.list({ type: 'theme' }).map((p) => p.name), ['indaco']);
  });
});

describe('the build walk and the identity gate', () => {
  function fixtureRepo() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-packages-'));
    const write = (rel, files) => {
      fs.mkdirSync(path.join(root, rel), { recursive: true });
      for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(root, rel, f), v ?? '');
    };
    write('lib/components/statement/probe-card', componentFiles());
    write('themes', { ...themeFiles('harbor'), 'README.md': '# not a package file' });
    return root;
  }

  test('discovers themes and components through the spine, reading each strictly', () => {
    const root = fixtureRepo();
    const found = discoverPackages({ root });
    assert.deepEqual(found.map((f) => [f.type, f.path, f.result.ok]), [
      ['theme', 'themes/harbor', true],
      ['component', 'lib/components/statement/probe-card', true],
    ]);
  });

  test('THE FAILING ARM: a renamed component folder fails checkPackageIdentity', () => {
    const root = fixtureRepo();
    const clean = [];
    checkPackageIdentity(clean, { root });
    assert.deepEqual(clean, []);
    fs.renameSync(path.join(root, 'lib/components/statement/probe-card'), path.join(root, 'lib/components/statement/probe-cards'));
    const errors = [];
    checkPackageIdentity(errors, { root });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /lib\/components\/statement\/probe-cards: folder "probe-cards" → "probe-card"/);
  });

  test('one stray manifest in a bucket does not hide the bucket’s components', () => {
    const root = fixtureRepo();
    fs.writeFileSync(path.join(root, 'lib/components/statement/notes.manifest.json'), '{}');
    const got = listComponentFolders(path.join(root, 'lib/components')).map((f) => f.label);
    assert.deepEqual(got, ['statement/probe-card/probe-card.manifest.json']);
  });

  test('listComponentFolders keeps loadAll’s legacy shapes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-components-'));
    fs.mkdirSync(path.join(root, 'legacy'));
    fs.writeFileSync(path.join(root, 'legacy', 'manifest.json'), '{}');
    fs.writeFileSync(path.join(root, 'flat.json'), '{}');
    fs.writeFileSync(path.join(root, 'manifest.schema.json'), '{}');
    fs.mkdirSync(path.join(root, '_private'));
    const got = listComponentFolders(root, { isBucket: () => false }).map((f) => f.label).sort();
    assert.deepEqual(got, ['flat.json', 'legacy/manifest.json']);
  });
});

describe('the committed index', () => {
  const committed = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../lib/packages/packages.generated.json'), 'utf8'));
  test('carries every shipped component, and flags exactly the ones with a transform', () => {
    // Derived, not pinned: adding a component must not break this test, only a
    // disagreement between the index and the tree should.
    const { loadAll } = require('../../../lib/components/index.js');
    assert.equal(committed.counts.component, loadAll().length);
    const transforms = listComponentFolders(path.join(__dirname, '../../../lib/components')).filter((f) => f.dir && fs.existsSync(path.join(f.dir, `${f.folder}.transform.js`))).length;
    assert.equal(committed.packages.filter((p) => p.code).length, transforms);
  });
});

describe('finish packages', () => {
  const { checkFinishPackages } = require('../../../tools/check-ownership.js');
  const { FINISH_PRESETS } = require('../../../lib/finishes/presets.generated.js');
  const { FINISH_NAMES } = require('../../../lib/core/resolve-finish.js');

  test('the register is exactly `none` plus every finish package, in the packages’ order', () => {
    assert.deepEqual(FINISH_NAMES, ['none', ...FINISH_PRESETS.map((p) => p.name)]);
    assert.equal(FINISH_PRESETS.length, discoverPackages({ types: ['finish'] }).length);
  });

  function finishRepo(css) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-finishes-'));
    fs.mkdirSync(path.join(root, 'lib/finishes/velvet'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lib/finishes/velvet/velvet.manifest.json'), JSON.stringify({ name: 'velvet', type: 'finish', format: 1 }));
    fs.writeFileSync(path.join(root, 'lib/finishes/velvet/velvet.recipe.json'), '{}');
    fs.writeFileSync(path.join(root, 'base.finish.css'), css);
    return root;
  }

  test('a package with its rule passes', () => {
    const root = finishRepo('section.finish-velvet {\n  --fin-wash: none;\n}\n');
    const errors = [];
    checkFinishPackages(errors, { root, css: path.join(root, 'base.finish.css') });
    assert.deepEqual(errors, []);
  });

  test('THE FAILING ARMS: a package with no rule, and a rule with no package', () => {
    const root = finishRepo('/* section.finish-velvet { } is only a comment */\nsection.finish-ghost {\n}\n');
    const errors = [];
    checkFinishPackages(errors, { root, css: path.join(root, 'base.finish.css') });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /velvet\/ is a finish package, but .* has no `section\.finish-velvet \{` rule/);
    assert.match(errors[1], /`section\.finish-ghost` preset rule but no lib\/finishes\/ghost\/ package/);
  });
});
