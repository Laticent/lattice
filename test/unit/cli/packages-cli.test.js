/**
 * `lattice packages list | add | check | export | remove` (lib/packages/cli.js) and the render
 * path's lookup of an installed theme (engineering/decisions/2026-09-23-portable-packages.md §6).
 *
 * Driven in-process through `main()` with `--packages <tmp>`, so no test touches a real home
 * directory. The one render-path arm spawns the emulator, and exits before any browser starts:
 * a missing theme fails at palette resolution.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const JSZip = require('jszip');
const { main } = require('../../../lib/packages/cli.js');

const ROOT = path.resolve(__dirname, '../../..');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `lattice-pkgcli-${p}-`));

async function run(argv) {
  const out = [];
  // No browser here: the consent text's OS-sandbox line is stubbed, and nobody answers the prompt.
  const code = await main(argv, { log: (s) => out.push(s), err: (s) => out.push(s), ask: async () => false, probe: async () => 'probe skipped' });
  return { code, text: out.join('\n') };
}

async function zipOf(folder, files) {
  const zip = new JSZip();
  for (const [f, body] of Object.entries(files)) zip.file(`${folder}/${f}`, body);
  const p = path.join(tmp('zip'), `${folder}.zip`);
  fs.writeFileSync(p, await zip.generateAsync({ type: 'nodebuffer' }));
  return p;
}

const theme = (name, css = `/* @theme ${name} */\n@import 'lattice';\n:root { --accent: #2d4ed8; }\n`) => ({
  [`${name}.manifest.json`]: JSON.stringify({ name, type: 'theme', format: 1, label: 'Probe' }),
  [`${name}.css`]: css,
});

describe('lattice packages', () => {
  test('add a Studio-shaped zip, list it, export it back as the same files', async () => {
    const store = tmp('store');
    const files = theme('probe-brand');
    const added = await run(['add', await zipOf('probe-brand', files), '--packages', store]);
    assert.equal(added.code, 0, added.text);
    assert.ok(fs.existsSync(path.join(store, 'theme/probe-brand/probe-brand.css')));
    const listed = await run(['list', '--type', 'theme', '--packages', store]);
    assert.match(listed.text, /theme\s+probe-brand\s+installed/);
    assert.match(listed.text, /theme\s+indaco\s+shipped/);
    const out = path.join(tmp('out'), 'x.zip');
    assert.equal((await run(['export', 'theme/probe-brand', '-o', out, '--packages', store])).code, 0);
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const back = {};
    for (const p of Object.keys(zip.files)) if (!zip.files[p].dir) back[p.replace(/^probe-brand\//, '')] = await zip.file(p).async('string');
    assert.equal(back['probe-brand.css'], files['probe-brand.css']);
    assert.equal(JSON.parse(back['probe-brand.manifest.json']).name, 'probe-brand');
  });

  test('a shipped name installs as <name>-custom, its @theme rewritten', async () => {
    const store = tmp('store');
    const r = await run(['add', await zipOf('indaco', theme('indaco')), '--packages', store]);
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /"indaco" is a name Lattice uses for a theme, so it installs as "indaco-custom"/);
    assert.match(fs.readFileSync(path.join(store, 'theme/indaco-custom/indaco-custom.css'), 'utf8'), /@theme indaco-custom/);
  });

  test('a shipped component name renames the selectors and the gallery too', async () => {
    const store = tmp('store');
    const r = await run(['add', await zipOf('kpi', {
      'kpi.manifest.json': JSON.stringify({ name: 'kpi', type: 'component', format: 1 }),
      'kpi.styles.css': 'section.kpi { display: grid; }\nsection.kpi .kpi-row { gap: 1rem; }',
      'kpi.gallery.md': '<!-- _class: kpi -->\n\n## kpi',
    }), '--packages', store]);
    assert.equal(r.code, 0, r.text);
    const dir = path.join(store, 'component/kpi-custom');
    assert.equal(fs.readFileSync(path.join(dir, 'kpi-custom.styles.css'), 'utf8'), 'section.kpi-custom { display: grid; }\nsection.kpi-custom .kpi-row { gap: 1rem; }');
    assert.equal(fs.readFileSync(path.join(dir, 'kpi-custom.gallery.md'), 'utf8'), '<!-- _class: kpi-custom -->\n\n## kpi');
  });

  describe('code packages (contract note §9)', () => {
    const transform = 'function t(s){return s.html}export{t as default};';
    const comp = (name, extra = {}, manifest = { facts: 1 }) => ({
      [`${name}.manifest.json`]: JSON.stringify({ name, type: 'component', format: 1, ...manifest }),
      [`${name}.styles.css`]: `section.${name} {}`,
      [`${name}.gallery.md`]: `<!-- _class: ${name} -->`,
      [`${name}.transform.js`]: transform,
      ...extra,
    });
    // Consent lives in $LATTICE_HOME/trust.json; point it at a fresh folder for each case.
    const withHome = async (fn) => {
      const before = process.env.LATTICE_HOME;
      process.env.LATTICE_HOME = tmp('home');
      try {
        return await fn(path.join(process.env.LATTICE_HOME, 'packages'));
      } finally {
        if (before === undefined) delete process.env.LATTICE_HOME;
        else process.env.LATTICE_HOME = before;
      }
    };

    test('installs after the gate, shows its code and digest, and is NOT approved without an answer', () =>
      withHome(async (store) => {
        const r = await run(['add', await zipOf('bars', comp('bars'))]);
        assert.equal(r.code, 0, r.text);
        assert.match(r.text, /bars\.transform\.js \(\d+ bytes, sha256 [0-9a-f]{64}\)/);
        assert.match(r.text, /the OS sandbox on this machine: probe skipped/);
        assert.match(r.text, /not approved: a render that uses component\/bars fails until you run `lattice packages trust component\/bars`/);
        assert.ok(fs.existsSync(path.join(store, 'component/bars/bars.transform.js')));
        assert.match((await run(['list', '--type', 'component'])).text, /bars\s+installed {2}\(code, NOT approved/);
      }));

    test('--trust approves at the digest; trust, untrust and changed code', () =>
      withHome(async (store) => {
        const r = await run(['add', await zipOf('bars', comp('bars')), '--trust']);
        assert.equal(r.code, 0, r.text);
        assert.match(r.text, /approved component\/bars \(sha256 [0-9a-f]{64}\)/);
        assert.match((await run(['list', '--type', 'component'])).text, /bars\s+installed {2}\(code, approved\)/);
        const trust = JSON.parse(fs.readFileSync(path.join(process.env.LATTICE_HOME, 'trust.json'), 'utf8'));
        assert.match(trust.trusted['component/bars'].sha256, /^[0-9a-f]{64}$/);
        fs.appendFileSync(path.join(store, 'component/bars/bars.transform.js'), ' ');
        assert.match((await run(['list', '--type', 'component'])).text, /code, NOT approved/, 'changed code is not the approved code');
        assert.equal((await run(['trust', 'component/bars', '--yes'])).code, 0);
        assert.match((await run(['list', '--type', 'component'])).text, /code, approved/);
        assert.match((await run(['untrust', 'component/bars'])).text, /withdrew the approval of component\/bars/);
        assert.match((await run(['list', '--type', 'component'])).text, /code, NOT approved/);
        const no = await run(['trust', 'component/bars']);
        assert.equal(no.code, 1, 'no answer is no');
      }));

    test('refused shapes: not the export form, a second script, a reserved name; a theme script is left out', () =>
      withHome(async (store) => {
        const cases = [
          ['commonjs', comp('commonjs', { 'commonjs.transform.js': 'module.exports = () => ""' }), /does not end in `export \{ name as default \}`/],
          ['twoscripts', comp('twoscripts', { 'helper.mjs': 'export const x = 1;' }), /a script other than twoscripts\.transform\.js \(helper\.mjs\)/],
          ['kpi', comp('kpi'), /"kpi" is a name Lattice uses, and a code package can't be renamed/],
          ['undeclared', comp('undeclared', {}, {}), /does not say which slide facts it reads: add "facts": 1 to undeclared\.manifest\.json/],
          ['future', comp('future', {}, { facts: 2 }), /reads slide facts version 2, and this Lattice hands packages version 1/],
        ];
        for (const [name, files, why] of cases) {
          const r = await run(['add', await zipOf(name, files)]);
          assert.equal(r.code, 1, `${name}: ${r.text}`);
          assert.match(r.text, why, name);
          assert.equal(fs.existsSync(path.join(store, 'component', name)), false, `${name} must not install`);
          assert.equal(fs.existsSync(path.join(store, 'component', `${name}-custom`)), false, `${name} must not install renamed`);
        }
        // A theme has no code role: the spine leaves the script out, so it never reaches the store.
        const themed = await run(['add', await zipOf('probe-brand', { ...theme('probe-brand'), 'probe-brand.transform.js': transform })]);
        assert.match(themed.text, /left out probe-brand\.transform\.js/);
        assert.equal(fs.existsSync(path.join(store, 'theme/probe-brand/probe-brand.transform.js')), false);
      }));

    test('an installed code package exports as it is, so its digest survives the round trip', () =>
      withHome(async () => {
        await run(['add', await zipOf('bars', comp('bars')), '--trust']);
        const out = path.join(tmp('out'), 'bars.zip');
        const r = await run(['export', 'component/bars', '-o', out]);
        assert.equal(r.code, 0, r.text);
        const zip = await JSZip.loadAsync(fs.readFileSync(out));
        assert.equal(await zip.file('bars/bars.transform.js').async('string'), transform);
      }));
  });

  test('CSS that reaches off the device is refused, by the same rules as the Studio', async () => {
    const store = tmp('store');
    const r = await run(['add', await zipOf('beacon', theme('beacon', "/* @theme beacon */\n:root { --x: url(https://evil.test/b.png); }\n")), '--packages', store]);
    assert.equal(r.code, 1);
    assert.match(r.text, /refused {2}beacon/);
  });

  test('a component whose sample slide loads a remote image is refused; a relative one installs', async () => {
    const comp = (gallery) => ({
      'probe.manifest.json': JSON.stringify({ name: 'probe', type: 'component', format: 1 }),
      'probe.styles.css': 'section.probe { display: grid; }',
      'probe.gallery.md': gallery,
    });
    const store = tmp('store');
    const bad = await run(['add', await zipOf('probe', comp('<!-- _class: probe -->\n\n<img src="https://evil.test/b.png">')), '--packages', store]);
    assert.equal(bad.code, 1, bad.text);
    assert.match(bad.text, /refused {2}probe: its sample slide loads https:\/\/evil\.test\/b\.png/);
    assert.equal(fs.existsSync(path.join(store, 'component/probe')), false);
    const ok = await run(['add', await zipOf('probe', comp('<!-- _class: probe -->\n\n![logo](logo.png)\n\n[site](https://ok.test)')), '--packages', store]);
    assert.equal(ok.code, 0, ok.text);
  });

  test('add refuses to overwrite without --replace, and replaces with it', async () => {
    const store = tmp('store');
    const zip = await zipOf('probe-brand', theme('probe-brand'));
    assert.equal((await run(['add', zip, '--packages', store])).code, 0);
    const again = await run(['add', zip, '--packages', store]);
    assert.equal(again.code, 1);
    assert.match(again.text, /already installed — pass --replace/);
    assert.equal((await run(['add', zip, '--replace', '--packages', store])).code, 0);
  });

  test('remove: installed packages only', async () => {
    const store = tmp('store');
    await run(['add', await zipOf('probe-brand', theme('probe-brand')), '--packages', store]);
    assert.equal((await run(['remove', 'theme/probe-brand', '--packages', store])).code, 0);
    const shipped = await run(['remove', 'theme/indaco', '--packages', store]);
    assert.equal(shipped.code, 1);
    assert.match(shipped.text, /shipped with Lattice/);
  });

  test('export refuses a shipped code package', async () => {
    const r = await run(['export', 'component/state-chart', '--packages', tmp('store')]);
    assert.equal(r.code, 1);
    assert.match(r.text, /shipped components are not exported as code packages/);
  });

  test('check gates without installing', async () => {
    const store = tmp('store');
    const r = await run(['check', await zipOf('probe-brand', theme('probe-brand')), '--packages', store]);
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /ok {7}theme\/probe-brand/);
    assert.equal(fs.existsSync(path.join(store, 'theme')), false);
  });

  test('a bad reference or command prints usage and fails', async () => {
    assert.equal((await run(['export', 'nope'])).code, 1);
    assert.equal((await run(['frobnicate'])).code, 1);
    assert.equal((await run(['--help'])).code, 0);
  });

  test('a theme may import the base and nothing else — the Studio\'s rule, so both doors refuse the same packages', async () => {
    const store = tmp('store');
    await run(['add', await zipOf('probe-brand', theme('probe-brand')), '--packages', store]);
    for (const parent of ['probe-brand', 'indaco']) {
      const r = await run(['add', await zipOf('child-brand', theme('child-brand', `/* @theme child-brand */\n@import '${parent}';\n:root { --accent: #123456; }\n`)), '--packages', store]);
      assert.equal(r.code, 1, `${parent}: ${r.text}`);
      assert.match(r.text, /refused {2}child-brand/);
    }
    // The arm: the base import every Studio theme carries is accepted.
    assert.equal((await run(['add', await zipOf('child-base', theme('child-base')), '--packages', store])).code, 0);
  });

  test('`lattice` is reserved as a theme name, as the Studio reserves it', async () => {
    const store = tmp('store');
    const r = await run(['add', await zipOf('lattice', theme('lattice')), '--packages', store]);
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /installs as "lattice-custom"/);
    assert.equal(fs.existsSync(path.join(store, 'theme/lattice')), false);
  });

  test('a zip that DECLARES more than the inflate cap is refused before anything is inflated', async () => {
    const zip = new JSZip();
    const { MAX_INFLATED_BYTES } = require('../../../lib/packages/limits.js');
    zip.file('bomb/bomb.manifest.json', JSON.stringify({ name: 'bomb', type: 'theme', format: 1 }));
    zip.file('bomb/bomb.css', Buffer.alloc(MAX_INFLATED_BYTES + 1, 32));
    const p = path.join(tmp('zip'), 'bomb.zip');
    fs.writeFileSync(p, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    const before = process.memoryUsage().rss;
    const r = await run(['add', p, '--packages', tmp('store')]);
    assert.equal(r.code, 1);
    assert.match(r.text, /inflates past 64 MB/);
    // Refused on the declaration: nothing near the cap was held in memory to decide it.
    assert.ok(process.memoryUsage().rss - before < MAX_INFLATED_BYTES / 2, 'the entry was not inflated');
  });

  test('a zip that UNDERSTATES an entry is stopped at the cap while inflating, not after', async () => {
    const { MAX_INFLATED_BYTES } = require('../../../lib/packages/limits.js');
    const zip = new JSZip();
    zip.file('liar/liar.manifest.json', JSON.stringify({ name: 'liar', type: 'theme', format: 1 }));
    zip.file('liar/liar.css', 'a'.repeat(MAX_INFLATED_BYTES + 1024 * 1024));
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    // Rewrite both copies of liar.css's declared size to 10 bytes.
    for (let at = buf.indexOf('PK\x03\x04'); at >= 0; at = buf.indexOf('PK\x03\x04', at + 4)) {
      if (buf.toString('utf8', at + 30, at + 30 + buf.readUInt16LE(at + 26)).endsWith('.css')) buf.writeUInt32LE(10, at + 22);
    }
    for (let at = buf.indexOf('PK\x01\x02'); at >= 0; at = buf.indexOf('PK\x01\x02', at + 4)) {
      if (buf.toString('utf8', at + 46, at + 46 + buf.readUInt16LE(at + 28)).endsWith('.css')) buf.writeUInt32LE(10, at + 24);
    }
    const file = path.join(tmp('zip'), 'liar.zip');
    fs.writeFileSync(file, buf);
    const r = await run(['add', file, '--packages', tmp('store')]);
    assert.equal(r.code, 1, r.text);
    // The cap's own words. Inflating the entry whole first ends in JSZip's "uncompressed data
    // size mismatch" instead, after all 65 MB are in memory.
    assert.match(r.text, /inflates past 64 MB/);
  });

  test('a hand-broken install still needs --replace to be overwritten', async () => {
    const store = tmp('store');
    fs.mkdirSync(path.join(store, 'theme/probe-brand'), { recursive: true });
    fs.writeFileSync(path.join(store, 'theme/probe-brand/probe-brand.manifest.json'), '{ not json');
    const r = await run(['add', await zipOf('probe-brand', theme('probe-brand')), '--packages', store]);
    assert.equal(r.code, 1);
    assert.match(r.text, /already installed/);
  });
});

describe('installed components in a deck (lib/packages/render.js)', () => {
  const { embedInstalledComponents } = require('../../../lib/packages/render.js');
  const { embedComponentsInMarkdown } = require('../../../lib/layout/bridge.js');
  const deck = '---\ntheme: indaco\n---\n\n<!-- _class: zeta -->\n\n## Z\n\n---\n\n<!-- _class: yota -->\n\n## Y\n';

  test('embeds the installed component the deck uses', () => {
    const r = embedInstalledComponents(deck, [{ name: 'zeta', css: 'section.zeta { outline: 7px solid lime; }' }], []);
    assert.deepEqual(r.used, ['zeta']);
    assert.match(r.source, /7px solid lime/);
  });

  test('keeps CSS the deck already carries, and the deck\'s copy of a component wins', () => {
    const exported = embedComponentsInMarkdown(deck, [{ name: 'yota', css: 'section.yota { outline: 9px dashed red; }' }]);
    const r = embedInstalledComponents(exported, [
      { name: 'zeta', css: 'section.zeta { outline: 7px solid lime; }' },
      { name: 'yota', css: 'section.yota { outline: 1px solid blue; }' },
    ], []);
    assert.deepEqual(r.used, ['zeta']);
    assert.match(r.source, /9px dashed red/, 'the carried block survives');
    assert.match(r.source, /7px solid lime/);
    assert.doesNotMatch(r.source, /1px solid blue/, 'the store does not override the deck');
  });

  test('a shipped name is never taken from the store', () => {
    const r = embedInstalledComponents('<!-- _class: kpi -->\n\n## K\n', [{ name: 'kpi', css: 'section.kpi { outline: 1px solid red; }' }], ['kpi']);
    assert.deepEqual(r.used, []);
    assert.doesNotMatch(r.source, /outline/);
  });
});

describe('the render path', () => {
  test('a deck naming a theme that is neither shipped nor installed fails with its name and the install command', () => {
    const dir = tmp('deck');
    fs.writeFileSync(path.join(dir, 'deck.md'), '---\ntheme: probe-missing\n---\n\n# Hi\n');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), path.join(dir, 'deck.md'), path.join(dir, 'out.pdf'), '--packages', tmp('store')], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /palette not found: probe-missing/);
    assert.match(r.stderr, /lattice packages add probe-missing\.lattice-theme\.zip/);
  });

  test('a shipped name that hides an installed package is said out loud, at render and in list', async () => {
    // A release that starts shipping a name hides the package a user installed under it
    // (followups.d/2336 item 1). Placed by hand, as a package installed before the release was.
    const store = tmp('store');
    const dir = path.join(store, 'theme/indaco');
    fs.mkdirSync(dir, { recursive: true });
    for (const [f, body] of Object.entries(theme('indaco'))) fs.writeFileSync(path.join(dir, f), body);
    const listed = await run(['list', '--type', 'theme', '--packages', store]);
    assert.match(listed.text, /theme\s+indaco\s+installed {2}\(hidden by the shipped theme of this name; re-add it to install as indaco-custom\)/);
    const deck = path.join(tmp('deck'), 'deck.md');
    fs.writeFileSync(deck, '---\ntheme: indaco\n---\n\n# Hi\n');
    // A browser that isn't there ends the run right after the theme is resolved.
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), deck, deck.replace(/md$/, 'pdf'), '--packages', store], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: '/nonexistent/chrome', PUPPETEER_EXECUTABLE_PATH: '/nonexistent/chrome' } });
    assert.match(r.stderr, /warning: "indaco" is a theme Lattice ships, so the installed package of that name is not used/);
  });

  test('`lattice packages` is dispatched before the render arguments are parsed', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), 'packages', 'list', '--type', 'finish', '--packages', tmp('store')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /finish\s+halo\s+shipped/);
  });
});
