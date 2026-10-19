/**
 * Unit: the npm-plugin LOADER (lib/packages/npm-plugin-loader.js; threat-model note
 * engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.1 G2, §6 decisions 7 to 9).
 * A local HTTP server stands in for the registry. Each refusal has a case that fails without it,
 * and the G5 case shows the loader never runs what it downloads.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-npm-loader-'));
process.env.LATTICE_HOME = home;
const loader = require('../../../lib/packages/npm-plugin-loader.js');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const GOOD = 'function render(f){ return "<p>drawn " + f.body.trim() + "</p>"; }\nexport { render as default };';

/** A ustar archive of `entries`, gzipped. `type` defaults to a regular file; `pax` adds a path record before it. */
function tgz(entries) {
  const blocks = [];
  const header = (name, size, type) => {
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 100), 0);
    h.write('0000644\0', 100);
    h.write('0000000\0', 108);
    h.write('0000000\0', 116);
    h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
    h.write('00000000000\0', 136);
    h.write('        ', 148);
    h.write(type, 156);
    h.write('ustar\0', 257);
    h.write('00', 263);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    return h;
  };
  const push = (name, body, type, sizeField) => {
    const b = Buffer.from(body);
    const h = header(name, b.length, type);
    if (sizeField) h.write(sizeField.padEnd(12, '\0'), 124);
    blocks.push(h, b, Buffer.alloc((512 - (b.length % 512)) % 512));
  };
  for (const e of entries) {
    if (e.paxRaw) push('PaxHeader', e.paxRaw, 'x');
    if (e.pax) {
      // `<len> path=<value>\n`, where <len> counts the whole record, its own digits included.
      const rec = ` path=${e.pax}\n`;
      let len = rec.length;
      while (String(len).length + rec.length !== len) len = String(len).length + rec.length;
      push('PaxHeader', `${len}${rec}`, 'x');
    }
    push(e.name, e.body ?? '', e.type ?? '0', e.sizeField);
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}

let server;
let REG;
const served = new Map(); // URL path → body (Buffer) or a function (req, res)
const requests = [];

before(async () => {
  server = http.createServer((req, res) => {
    requests.push(req.url);
    const body = served.get(req.url);
    if (typeof body === 'function') return body(req, res);
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  REG = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(home, { recursive: true, force: true });
});

const entry = (over = {}) => ({ name: 'gantt', package: '@acme/lattice-gantt', version: '1.4.2', fence: 'gantt', sha256: sha(GOOD), bundle: 'lattice-plugin.js', ...over });
const freshDir = () => fs.mkdtempSync(path.join(home, 'cache-'));

describe('the plugin list', () => {
  const write = (doc) => {
    const dir = fs.mkdtempSync(path.join(home, 'proj-'));
    fs.writeFileSync(path.join(dir, loader.LIST_FILE), typeof doc === 'string' ? doc : JSON.stringify(doc));
    return dir;
  };

  test('is found in the deck’s folder or the nearest folder above it', () => {
    const dir = write({ plugins: [] });
    const deep = path.join(dir, 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });
    assert.equal(loader.findPluginList(deep), path.join(dir, loader.LIST_FILE));
  });

  test('an exact entry loads; a range, a tag, a bad hash, a parent path and a duplicate are each refused by line', () => {
    const good = entry();
    const list = loader.readPluginList(
      path.join(
        write({
          plugins: [good, { ...good, name: 'b', version: '^1.4.2' }, { ...good, name: 'c', version: 'latest' }, { ...good, name: 'd', sha256: 'abc' }, { ...good, name: 'e', bundle: '../x.js' }, good],
        }),
        loader.LIST_FILE,
      ),
    );
    assert.deepEqual(list.entries.map((e) => e.name), ['gantt']);
    assert.equal(list.problems.length, 5, list.problems.join('\n'));
    assert.match(list.problems.join('\n'), /exact version/);
    assert.match(list.problems.join('\n'), /SHA-256/);
    assert.match(list.problems.join('\n'), /relative path/);
    assert.match(list.problems.join('\n'), /listed twice/);
  });

  test('a plain-http registry off loopback refuses the whole list; https and loopback http are allowed', () => {
    assert.match(loader.readPluginList(path.join(write({ registry: 'http://registry.example', plugins: [entry()] }), loader.LIST_FILE)).problems[0], /not https/);
    assert.equal(loader.registryRefusal('https://registry.example'), null);
    assert.equal(loader.registryRefusal('http://127.0.0.1:9'), null);
    assert.match(loader.registryRefusal('file:///etc'), /not https/);
  });

  test('a file that is not JSON is a problem, not a throw', () => {
    assert.match(loader.readPluginList(path.join(write('{nope'), loader.LIST_FILE)).problems[0], /cannot be read/);
  });

  test('the tarball URL follows npm’s layout, scoped and not', () => {
    assert.equal(loader.tarballUrl('https://r', '@acme/x', '1.0.0'), 'https://r/@acme/x/-/x-1.0.0.tgz');
    assert.equal(loader.tarballUrl('https://r', 'x', '1.0.0'), 'https://r/x/-/x-1.0.0.tgz');
  });
});

describe('reading one file out of a tarball', () => {
  test('below the top folder, whatever it is called', () => {
    assert.equal(loader.readTarFile(tgz([{ name: 'package/package.json', body: '{}' }, { name: 'package/lattice-plugin.js', body: GOOD }]), 'lattice-plugin.js').toString(), GOOD);
    assert.equal(loader.readTarFile(tgz([{ name: 'other/lattice-plugin.js', body: GOOD }]), 'lattice-plugin.js').toString(), GOOD);
  });

  test('a missing bundle is null', () => {
    assert.equal(loader.readTarFile(tgz([{ name: 'package/x.js', body: GOOD }]), 'lattice-plugin.js'), null);
  });

  // `tar` and the loader must read the same file, or a reviewer reads one thing and the pin another (the red team).
  for (const [type, what] of [['2', 'a symlink'], ['1', 'a hard link'], ['L', 'a GNU long name'], ['K', 'a GNU long link'], ['7', 'a contiguous file'], ['3', 'a device']]) {
    test(`a tarball holding ${what} is refused whole`, () => {
      assert.throws(() => loader.readTarFile(tgz([{ name: 'package/a', body: 'x', type }, { name: 'package/lattice-plugin.js', body: GOOD }]), 'lattice-plugin.js'), /entry of type/);
    });
  }

  test('two entries at the bundle’s path are refused, also when ./ or // tell them apart, because tar keeps the last', () => {
    assert.throws(() => loader.readTarFile(tgz([{ name: 'package/lattice-plugin.js', body: GOOD }, { name: 'package/lattice-plugin.js', body: 'evil' }]), 'lattice-plugin.js'), /twice/);
    assert.throws(() => loader.readTarFile(tgz([{ name: 'package/lattice-plugin.js', body: GOOD }, { name: 'package/./lattice-plugin.js', body: 'evil' }]), 'lattice-plugin.js'), /twice/);
    assert.throws(() => loader.readTarFile(tgz([{ name: 'package/lattice-plugin.js', body: GOOD }, { name: 'package//lattice-plugin.js', body: 'evil' }]), 'lattice-plugin.js'), /twice/);
  });

  test('a .. segment, a size with junk after the digits and a malformed pax record are refused', () => {
    assert.throws(() => loader.readTarFile(tgz([{ name: 'package/../x', body: 'x' }]), 'lattice-plugin.js'), /\.\./);
    assert.throws(() => loader.readTarFile(tgz([{ name: 'package/lattice-plugin.js', body: GOOD, sizeField: '0000000012ab' }]), 'lattice-plugin.js'), /malformed header/);
    assert.throws(() => loader.readTarFile(tgz([{ name: 'package/x.js', body: GOOD, paxRaw: '99 path=package/lattice-plugin.js\n' }]), 'lattice-plugin.js'), /malformed pax/);
  });

  test('pax records are read by length, so a `path=` inside another record’s value is not a path', () => {
    const rec = (k, v) => {
      const body = ` ${k}=${v}\n`;
      let n = body.length;
      while (String(n).length + body.length !== n) n = String(n).length + body.length;
      return `${n}${body}`;
    };
    const t = tgz([{ name: 'package/lattice-plugin.js', body: GOOD, paxRaw: rec('comment', 'x\n9 path=package/decoy.js\n') }]);
    assert.equal(loader.readTarFile(t, 'lattice-plugin.js')?.toString(), GOOD);
    assert.throws(() => loader.readTarFile(tgz([{ name: 'package/x', body: GOOD, paxRaw: rec('path', 'package/a.js') + rec('path', 'package/lattice-plugin.js') }]), 'lattice-plugin.js'), /twice in a pax/);
  });

  test('a bundle over the cap is refused (the unpack cap alone is larger)', () => {
    assert.throws(() => loader.readTarFile(tgz([{ name: 'package/lattice-plugin.js', body: Buffer.alloc(loader.MAX_BUNDLE + 1, 0x20) }]), 'lattice-plugin.js'), /over 4 MB/);
  });

  test('a pax path record renames the next entry, as tar reads it', () => {
    const t = tgz([{ name: 'package/decoy.js', body: GOOD, pax: 'package/lattice-plugin.js' }]);
    assert.equal(loader.readTarFile(t, 'lattice-plugin.js')?.toString(), GOOD);
    assert.equal(loader.readTarFile(t, 'decoy.js'), null);
  });

  test('a gzip bomb stops at the unpacked cap', () => {
    assert.throws(() => loader.readTarFile(zlib.gzipSync(Buffer.alloc(40 * 1024 * 1024)), 'lattice-plugin.js'), /buffer|length|larger/i);
  });
});

describe('fetching into the cache', () => {
  const serve = (e, body, files = {}) => {
    const url = new URL(loader.tarballUrl(REG, e.package, e.version)).pathname;
    served.set(url, tgz([{ name: 'package/package.json', body: '{}' }, { name: `package/${e.bundle}`, body }, ...Object.entries(files).map(([name, b]) => ({ name, body: b }))]));
    return url;
  };

  test('the pinned bundle is fetched once and then read from the cache with no request', async () => {
    const e = entry({ package: 'lattice-gantt-a' });
    serve(e, GOOD);
    const dir = freshDir();
    const r = await loader.fetchOne(e, { registry: REG, dir });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.cached, false);
    const before = requests.length;
    const again = await loader.fetchOne(e, { registry: REG, dir });
    assert.equal(again.cached, true);
    assert.equal(requests.length, before, 'a cached bundle was downloaded again');
    assert.equal(loader.readCached(e.sha256, dir).toString(), GOOD);
  });

  test('bytes that are not the pinned ones are refused and never cached (a silent update)', async () => {
    const e = entry({ package: 'lattice-gantt-b' });
    serve(e, `${GOOD}\n// changed`);
    const dir = freshDir();
    const r = await loader.fetchOne(e, { registry: REG, dir });
    assert.equal(r.ok, false);
    assert.match(r.reason, /not the pinned/);
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  test('a bundle that leaves a dependency external is refused even at its pin', async () => {
    const code = 'import x from "lodash";\nfunction render(){return x}\nexport { render as default };';
    const e = entry({ package: 'lattice-gantt-c', sha256: sha(code) });
    serve(e, code);
    const r = await loader.fetchOne(e, { registry: REG, dir: freshDir() });
    assert.match(r.reason, /not a self-contained bundle/);
  });

  test('a missing version, a missing bundle and an oversized download are refused with a reason', async () => {
    assert.match((await loader.fetchOne(entry({ package: 'nowhere' }), { registry: REG, dir: freshDir() })).reason, /nowhere@1\.4\.2 from http:\/\/127\.0\.0\.1:\d+: it could not be downloaded/);
    const e = entry({ package: 'lattice-gantt-d' });
    served.set(new URL(loader.tarballUrl(REG, e.package, e.version)).pathname, tgz([{ name: 'package/x.js', body: GOOD }]));
    assert.match((await loader.fetchOne(e, { registry: REG, dir: freshDir() })).reason, /holds no lattice-plugin\.js/);
    const big = entry({ package: 'lattice-gantt-e' });
    served.set(new URL(loader.tarballUrl(REG, big.package, big.version)).pathname, (_req, res) => {
      res.writeHead(200);
      const chunk = Buffer.alloc(1024 * 1024);
      let n = 0;
      const more = () => {
        while (n++ < 12) if (!res.write(chunk)) return res.once('drain', more);
        res.end();
      };
      more();
    });
    assert.match((await loader.fetchOne(big, { registry: REG, dir: freshDir() })).reason, /over 8 MB/);
  });

  test('a refused registry is refused by fetchOne itself, not only by the list reader', async () => {
    assert.match((await loader.fetchOne(entry(), { registry: 'http://registry.example', dir: freshDir() })).reason, /not https/);
  });

  test('a redirect is followed on the same scheme to an allowed registry, and refused to plain http or a non-loopback http host', async () => {
    const e = entry({ package: 'lattice-gantt-redir' });
    const real = '/elsewhere.tgz';
    served.set(real, tgz([{ name: 'package/lattice-plugin.js', body: GOOD }]));
    served.set(new URL(loader.tarballUrl(REG, e.package, e.version)).pathname, (_req, res) => res.writeHead(302, { location: real }).end());
    assert.equal((await loader.fetchOne(e, { registry: REG, dir: freshDir() })).ok, true);
    const off = entry({ package: 'lattice-gantt-redir-off' });
    served.set(new URL(loader.tarballUrl(REG, off.package, off.version)).pathname, (_req, res) => res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end());
    const before = requests.length;
    const r = await loader.fetchOne(off, { registry: REG, dir: freshDir() });
    assert.match(r.reason, /could not be downloaded/);
    assert.equal(requests.length, before + 1, 'the loader followed the redirect');
  });

  test('a list that is not a regular file is refused without reading it (a FIFO hung a render, /dev/zero ran it out of memory)', () => {
    const dir = fs.mkdtempSync(path.join(home, 'special-'));
    fs.symlinkSync('/dev/zero', path.join(dir, loader.LIST_FILE));
    const t = Date.now();
    assert.match(loader.readPluginList(path.join(dir, loader.LIST_FILE)).problems[0], /not a regular file/);
    const fifoDir = fs.mkdtempSync(path.join(home, 'fifo-'));
    require('node:child_process').execFileSync('mkfifo', [path.join(fifoDir, loader.LIST_FILE)]);
    assert.match(loader.readPluginList(path.join(fifoDir, loader.LIST_FILE)).problems[0], /not a regular file/);
    assert.ok(Date.now() - t < 2000);
  });

  test('the search for the list stops at a .git folder and at the home folder', () => {
    const root = fs.mkdtempSync(path.join(home, 'walk-'));
    fs.writeFileSync(path.join(root, loader.LIST_FILE), '{"plugins":[]}');
    const repo = path.join(root, 'repo');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'decks'));
    assert.equal(loader.findPluginList(path.join(repo, 'decks')), null, 'the search left the project');
    const user = path.join(root, 'home');
    fs.mkdirSync(path.join(user, 'decks'), { recursive: true });
    assert.equal(loader.findPluginList(path.join(user, 'decks'), { home: user }), null, 'the search left the home folder');
    assert.equal(loader.findPluginList(path.join(user, 'decks'), { home: '/nonexistent' }), path.join(root, loader.LIST_FILE));
  });

  test('a list of more than the cap is refused whole, and a forged name is echoed only as JSON', () => {
    const dir = fs.mkdtempSync(path.join(home, 'many-'));
    fs.writeFileSync(path.join(dir, loader.LIST_FILE), JSON.stringify({ plugins: Array.from({ length: loader.MAX_ENTRIES + 1 }, (_, i) => entry({ name: `p${i}` })) }));
    assert.match(loader.readPluginList(path.join(dir, loader.LIST_FILE)).problems[0], /more than 64/);
    fs.writeFileSync(path.join(dir, loader.LIST_FILE), JSON.stringify({ plugins: [entry({ name: 'x\nfetched  plugin/gantt' })] }));
    const [line] = loader.readPluginList(path.join(dir, loader.LIST_FILE)).problems;
    assert.doesNotMatch(line, /\n/);
    assert.match(line, /"x\\nfetched {2}plugin\/gantt"/);
  });

  test('a cache file that no longer hashes to its name is dropped, not used', () => {
    const dir = freshDir();
    fs.writeFileSync(path.join(dir, `${sha(GOOD)}.js`), 'tampered');
    assert.equal(loader.readCached(sha(GOOD), dir), null);
    assert.equal(fs.existsSync(path.join(dir, `${sha(GOOD)}.js`)), false);
  });

  test('G5: fetching, caching, gating and building the door entry never run the bundle in Node (the control does)', async () => {
    const marker = path.join(home, 'g5-loaded');
    const writer = `process.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(marker)}, "loaded");\nfunction render(){ return "<p>x</p>"; }\nexport { render as default };`;
    const e = entry({ package: 'lattice-gantt-g5', sha256: sha(writer) });
    serve(e, writer);
    const proj = fs.mkdtempSync(path.join(home, 'g5-'));
    fs.writeFileSync(path.join(proj, loader.LIST_FILE), JSON.stringify({ registry: REG, plugins: [e] }));
    const dir = freshDir();
    assert.equal((await loader.fetchOne(e, { registry: REG, dir })).ok, true);
    const { entries } = loader.npmPluginEntries(proj, ['gantt'], { dir });
    assert.equal(entries.length, 1);
    require('../../../lib/packages/gate.js').refusePackage(loader.npmPluginPkg(e, entries[0].code));
    assert.equal(fs.existsSync(marker), false, 'the loader ran the bundle');
    // CONTROL: the same bytes loaded in Node write the marker, so the probe can see a load.
    const f = path.join(home, 'g5-control.mjs');
    fs.writeFileSync(f, writer);
    await import(pathToFileURL(f).href);
    assert.equal(fs.existsSync(marker), true, 'the control did not load the bundle, so the probe proves nothing');
  });
});

describe('the door entries a render gets', () => {
  test('a listed, cached plugin becomes an npm entry pinned to its hash; unlisted, unfetched and taken ones do not', async () => {
    const proj = fs.mkdtempSync(path.join(home, 'entries-'));
    const dir = freshDir();
    fs.writeFileSync(path.join(dir, `${sha(GOOD)}.js`), GOOD);
    const list = { plugins: [entry(), entry({ name: 'unfetched', sha256: sha('other') }), entry({ name: 'mermaid', sha256: sha(GOOD) }), entry({ name: 'unlisted' })] };
    fs.writeFileSync(path.join(proj, loader.LIST_FILE), JSON.stringify(list));
    const r = loader.npmPluginEntries(proj, ['gantt', 'unfetched', 'mermaid'], { dir, taken: new Set(['mermaid']), approvals: { 'plugin/gantt': { layer: 'on' } } });
    assert.deepEqual(
      r.entries.map((e) => ({ ...e, code: Buffer.from(e.code).toString() })),
      [{ name: 'gantt', fence: 'gantt', kinds: [], returns: [], code: GOOD, source: 'npm', pin: sha(GOOD), layer: 'on' }],
    );
    assert.match(r.warnings.join('\n'), /unfetched .* is not fetched.*lattice packages fetch/);
    assert.match(r.warnings.join('\n'), /mermaid has the name of a plugin Lattice ships/);
  });
});

describe('lattice packages fetch', () => {
  const { main } = require('../../../lib/packages/cli.js');
  const lines = () => {
    const out = [];
    return { out, log: (s) => out.push(s), err: (s) => out.push(s) };
  };
  const project = (e) => {
    const proj = fs.mkdtempSync(path.join(home, 'cli-'));
    served.set(new URL(loader.tarballUrl(REG, e.package, e.version)).pathname, tgz([{ name: 'package/lattice-plugin.js', body: GOOD }]));
    fs.writeFileSync(path.join(proj, loader.LIST_FILE), JSON.stringify({ registry: REG, plugins: [e] }));
    return proj;
  };

  test('fetches, gates and approves at an admissible layer', async () => {
    const e = entry({ name: 'gantt-cli-on', package: 'lattice-gantt-cli-on' });
    const l = lines();
    const code = await main(['fetch', project(e), '--trust'], { ...l, probe: async () => ({ summary: 'on', layer: { os: 'on' } }) });
    assert.equal(code, 0, l.out.join('\n'));
    assert.match(l.out.join('\n'), /fetched {2}plugin\/gantt-cli-on/);
    assert.match(l.out.join('\n'), /approved plugin\/gantt-cli-on/);
  });

  test('refuses the approval where the OS layer reads OFF or cannot be measured on Linux (decision 7), even with --trust', async () => {
    for (const [os_, n] of [['off', 'gantt-cli-off'], [undefined, 'gantt-cli-none']]) {
      const e = entry({ name: n, package: `lattice-${n}` });
      const l = lines();
      await main(['fetch', project(e), '--trust'], { ...l, probe: async () => ({ summary: 'x', layer: os_ ? { os: os_, summary: 'x' } : null }) });
      assert.match(l.out.join('\n'), new RegExp(`not approved: plugin/${n} is an npm plugin, and npm plugins do not run here`));
      assert.doesNotMatch(l.out.join('\n'), /^approved/m);
    }
  });

  test('names the list, the package, the version and the bundle hash in the consent text', async () => {
    const e = entry({ name: 'gantt-cli-text', package: 'lattice-gantt-cli-text' });
    const l = lines();
    const proj = project(e);
    await main(['fetch', proj, '--trust'], { ...l, probe: async () => ({ summary: 'on', layer: { os: 'on' } }) });
    const out = l.out.join('\n');
    assert.match(out, new RegExp(`using {4}${path.join(proj, loader.LIST_FILE).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`));
    assert.match(out, /It is an npm plugin: lattice-gantt-cli-text@1\.4\.2, file lattice-plugin\.js in its tarball, sha256 [0-9a-f]{64} \(the pin in the list\)/);
    assert.match(out, /which is not npm's/);
  });

  test('exits 1 when a plugin is fetched and not approved', async () => {
    const e = entry({ name: 'gantt-cli-declined', package: 'lattice-gantt-cli-declined' });
    const l = lines();
    assert.equal(await main(['fetch', project(e)], { ...l, probe: async () => ({ summary: 'on', layer: { os: 'on' } }), ask: async () => false }), 1);
    assert.match(l.out.join("\n"), /(fetched|cached ) {2}plugin\/gantt-cli-declined/);
  });

  test('refuses a fetched bundle the plugin gate refuses (a highlighted language as its fence), and never asks', async () => {
    const e = entry({ name: 'gantt-cli-python', package: 'lattice-gantt-cli-python', fence: 'python' });
    const l = lines();
    let asked = false;
    assert.equal(await main(['fetch', project(e), '--trust'], { ...l, probe: async () => 'x', ask: async () => (asked = true) }), 1);
    assert.match(l.out.join('\n'), /refused {2}plugin\/gantt-cli-python .*code language Lattice highlights/);
    assert.doesNotMatch(l.out.join('\n'), /fetched/);
    assert.equal(asked, false);
  });

  test('refuses a list entry with the name of a plugin installed in the store (one approval key)', async () => {
    const store = fs.mkdtempSync(path.join(home, 'store-'));
    const dir = path.join(store, 'plugin', 'gantt-zip');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'gantt-zip.manifest.json'), JSON.stringify({ name: 'gantt-zip', type: 'plugin', format: 1, contributes: { fences: { gz: {} } } }));
    fs.writeFileSync(path.join(dir, 'gantt-zip.render.js'), GOOD);
    fs.writeFileSync(path.join(dir, 'gantt-zip.docs.md'), '# x\n');
    fs.writeFileSync(path.join(dir, 'gantt-zip.fixtures.md'), '# x\n');
    const e = entry({ name: 'gantt-zip', package: 'lattice-gantt-zip' });
    const l = lines();
    assert.equal(await main(['fetch', project(e), '--packages', store], { ...l, probe: async () => 'x' }), 1);
    assert.match(l.out.join('\n'), /refused {2}plugin\/gantt-zip: "gantt-zip" is a plugin installed in the package store/);
  });

  test('trust plugin/<name> <dir> approves a fetched npm plugin from its list, and refuses one that is not fetched', async () => {
    const e = entry({ name: 'gantt-cli-trust', package: 'lattice-gantt-cli-trust' });
    const proj = project(e);
    const quiet = lines();
    await main(['fetch', proj], { ...quiet, probe: async () => ({ summary: 'on', layer: { os: 'on' } }), ask: async () => false });
    const l = lines();
    assert.equal(await main(['trust', 'plugin/gantt-cli-trust', proj, '--yes'], { ...l, probe: async () => ({ summary: 'on', layer: { os: 'on' } }) }), 0, l.out.join('\n'));
    assert.match(l.out.join('\n'), /approved plugin\/gantt-cli-trust/);
    const off = lines();
    assert.equal(await main(['trust', 'plugin/gantt-cli-trust', proj, '--yes'], { ...off, probe: async () => ({ summary: 'x', layer: { os: 'off', summary: 'x' } }) }), 1);
    const unfetched = entry({ name: 'gantt-cli-unfetched', package: 'lattice-gantt-cli-unfetched', sha256: sha('never served') });
    const p2 = fs.mkdtempSync(path.join(home, 'cli-'));
    fs.writeFileSync(path.join(p2, loader.LIST_FILE), JSON.stringify({ registry: REG, plugins: [unfetched] }));
    const u = lines();
    assert.equal(await main(['trust', 'plugin/gantt-cli-unfetched', p2, '--yes'], { ...u, probe: async () => 'x' }), 1);
    assert.match(u.out.join('\n'), /not fetched: run `lattice packages fetch` first/);
  });

  test('refuses a list entry that names a shipped plugin, and exits 1', async () => {
    const e = entry({ name: 'mermaid', package: 'lattice-mermaid-x' });
    const l = lines();
    assert.equal(await main(['fetch', project(e)], { ...l, probe: async () => 'x', ask: async () => false }), 1);
    assert.match(l.out.join('\n'), /refused {2}plugin\/mermaid: "mermaid" is a plugin Lattice ships/);
  });
});
