// The media sources registry (lib/core/media-sources.js) — slice 1 of
// engineering/decisions/2026-10-16-media-plugins.md. Three things are pinned:
//   1. `isRemoteUrl` is DERIVED from the table, and the table has the six rows §4.1 names;
//   2. the derived predicate is equal-or-stricter than the one it replaced, over the §4.11 corpus
//      (a differential test: the OLD predicate is frozen here, logic unchanged);
//   3. a relative reference cannot leave the deck's folder.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const ms = require('../../../lib/core/media-sources');
const remoteRef = require('../../../lib/core/remote-ref');

// The predicate as it stood before the registry (remote-ref.js at 245632f): the same logic, with its
// helpers (`urlAsParsed`, `sampleName`, `assetName`) folded into one body. A frozen oracle: when this
// file is the only thing that knows the old answer, the new one cannot quietly loosen.
function oldIsRemoteUrl(raw) {
  const s = String(raw ?? '')
    .replace(/[\t\n\r]/g, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the URL parser strips them, so must we.
    .replace(/^[\u0000-\u0020]+/, '')
    .toLowerCase();
  if (/^[/\\]{2}/.test(s)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(s);
  const SAMPLE = /^sample:([A-Za-z0-9][A-Za-z0-9._-]*)$/i;
  const ASSET = /^asset:([a-z0-9][a-z0-9_-]*)$/i;
  if (scheme && scheme[1] === 'sample') { const m = SAMPLE.exec(s.trim()); return !(m && !m[1].includes('..')); }
  if (scheme && scheme[1] === 'asset') return !ASSET.exec(s.trim());
  return !!scheme && scheme[1] !== 'data';
}

// §4.11's corpus, plus the ordinary local forms the predicate must keep answering "local" for.
const CORPUS = [
  '//x', '\\\\x', '/\\x', '\\/x', '//x/a.png', 'HTTPS://x/a.png', 'https://x/a.png', 'http://x/a.png', 'HtTp://x',
  ' https://x', '\thttps://x', 'ht\ttps://x', '\u0001https://x',
  'file:///etc/hostname', 'file://h/share/x.png', 'FILE://h/x', 'file:/x.png',
  'blob:https://x/uuid', 'javascript:alert(1)', 'ftp://x/a', 'ws://x', 'mailto:a@b', 'about:blank', 'chrome://x', 'view-source:https://x',
  'sample:photo-pano.jpg', 'sample:../x', 'sample://host/x', 'sample:', 'sample:a/b', 'SAMPLE:photo-pano.jpg', `sample:photo.${'.'}x.jpg`, // built, so the repo-wide `sample:` scan does not read it as a shipped reference
  'asset:hero', 'asset:../x', 'asset://host/x', 'asset:Hero', 'asset:', 'asset:a.b', 'ASSET:team-photo',
  'data:image/png;base64,AAAA', 'DATA:image/svg+xml,<svg/>', 'data:,',
  'pic.jpg', './pic.jpg', '../pic.jpg', '/abs/pic.jpg', 'a/b/c.png', '#frag', '', '?q=1', 'a:b', 'C:\\x.png', 'x:y',
];

describe('media-sources — the table', () => {
  test('has the six rows of §4.1, each with a locality and an export treatment', () => {
    assert.deepEqual(ms.SOURCES.map((s) => s.id), ['data', 'relative', 'file', 'web', 'sample', 'asset']);
    for (const s of ms.SOURCES) {
      assert.ok(s.locality === 'local' || s.locality === 'remote', s.id);
      assert.ok(['inline', 'copy', 'link'].includes(s.exportAs), s.id);
      assert.equal(typeof s.parse, 'function', s.id);
    }
  });
  test('remote-ref.isRemoteUrl IS the table-derived predicate, not a second copy', () => {
    assert.equal(remoteRef.isRemoteUrl, ms.isRemoteRef);
    assert.equal(remoteRef.sampleName, ms.sampleName);
    assert.equal(remoteRef.assetName, ms.assetName);
  });
  test('a scheme no row claims is remote: the predicate fails closed', () => {
    for (const ref of ['blob:x', 'javascript:1', 'ftp://x', 'gopher://x', 'made-up-scheme:x']) {
      assert.equal(ms.classify(ref), null, ref);
      assert.equal(ms.isRemoteRef(ref), true, ref);
    }
  });
  test('`file:` is remote to the markup gates, whatever its host', () => {
    for (const ref of ['file:///etc/hostname', 'file://h/x', 'file:/x']) assert.equal(ms.isRemoteRef(ref), true, ref);
  });
});

describe('media-sources — differential test against the predicate it replaced', () => {
  test('equal or stricter on every corpus entry', () => {
    const rows = [];
    let looser = 0;
    for (const ref of CORPUS) {
      const was = oldIsRemoteUrl(ref);
      const now = ms.isRemoteRef(ref);
      const verdict = was === now ? 'same' : !was && now ? 'STRICTER' : 'LOOSER';
      if (verdict === 'LOOSER') looser++;
      rows.push({ ref: JSON.stringify(ref), old: was ? 'remote' : 'local', now: now ? 'remote' : 'local', verdict });
    }
    if (process.env.MEDIA_SOURCES_TABLE) console.table(rows);
    assert.equal(looser, 0, `looser than before: ${rows.filter((r) => r.verdict === 'LOOSER').map((r) => r.ref).join(' ')}`);
  });
  test('a fuzzed set of scheme/prefix mixes is never looser either', () => {
    const schemes = ['', 'http:', 'HTTPS:', 'file:', 'data:', 'sample:', 'asset:', 'blob:', 'javascript:', 'x-y.z+w:', '//', '\\\\', '/', './', '../'];
    const bodies = ['', 'a', 'a.png', '../a', 'host/a', '%2e%2e/a', 'a b', 'a\tb', '\u0000', 'Hero', 'photo-pano.jpg', '..', 'a/b'];
    const pads = ['', ' ', '\t', '\n', '\u0001', '\u00a0'];
    for (const p of pads) for (const s of schemes) for (const b of bodies) {
      const ref = p + s + b;
      assert.ok(!(oldIsRemoteUrl(ref) && !ms.isRemoteRef(ref)), `LOOSER: ${JSON.stringify(ref)}`);
    }
  });
});

describe('media-sources — a relative reference stays inside the deck folder', () => {
  const base = 'file:///work/deck/';
  test('resolves ordinary relative paths against the folder', () => {
    assert.equal(ms.resolveRelative('pic.jpg', base), 'file:///work/deck/pic.jpg');
    assert.equal(ms.resolveRelative('./img/a b.png', base), 'file:///work/deck/img/a%20b.png');
    assert.equal(ms.resolveRelative('img/../pic.jpg', base), 'file:///work/deck/pic.jpg');
  });
  test('refuses anything that resolves outside it', () => {
    for (const ref of ['../pic.jpg', 'a/../../pic.jpg', '/etc/hostname', '%2e%2e/pic.jpg', '..\\pic.jpg', 'file:///etc/hostname', '//host/x', '../deck-evil/x.png']) {
      assert.equal(ms.resolveRelative(ref, base), null, ref);
    }
  });
  test('a base that names a file (not a folder) confines to its folder', () => {
    assert.equal(ms.resolveRelative('pic.jpg', 'file:///work/deck/d.md'), 'file:///work/deck/pic.jpg');
    assert.equal(ms.resolveRelative('../pic.jpg', 'file:///work/deck/d.md'), null);
  });
});

describe('media-sources — a web base is not confined (the Studio and playground pass the site samples folder)', () => {
  const site = 'https://host/lattice/_astro/abc/samples/';
  test('root-absolute and parent references resolve as the URL parser says', () => {
    assert.equal(ms.resolveRelative('/images/x.jpg', site), 'https://host/images/x.jpg');
    assert.equal(ms.resolveRelative('../themes/indaco/logo.svg', site), 'https://host/lattice/_astro/abc/themes/indaco/logo.svg');
  });
  test('resolveAssetUrl keeps the Studio case: no placeholder on a web base, placeholder on a file base', () => {
    const bg = require('../../../lib/core/bg-image');
    const { WEB_IMAGE_PLACEHOLDER } = remoteRef;
    assert.equal(bg.resolveAssetUrl('/images/x.jpg', site), 'https://host/images/x.jpg');
    assert.equal(bg.resolveAssetUrl('../x.jpg', 'file:///work/deck/'), WEB_IMAGE_PLACEHOLDER);
    assert.equal(bg.resolveAssetUrl('pic.jpg', 'file:///work/deck/'), 'file:///work/deck/pic.jpg');
  });
});


// §4.1: each row carries `scheme` and `resolve`, and the code that resolves or scans reads the table.
test('every row has a scheme (or null for relative) and a resolve, and classify finds each by its scheme', () => {
  const ms = require('../../../lib/core/media-sources.js');
  for (const row of ms.SOURCES) {
    assert.equal(typeof row.resolve, 'function', row.id);
    assert.ok(row.scheme === null || typeof row.scheme === 'string' || Array.isArray(row.scheme), row.id);
  }
  assert.equal(ms.classify('https://x/y.png').id, 'web');
  assert.equal(ms.classify('HTTP://x/y.png').id, 'web');
  assert.equal(ms.classify('sample:photo-wide.jpg').id, 'sample');
  assert.equal(ms.classify('blob:x'), null);
  assert.equal(ms.NAMED_SCHEMES, '(?:sample|asset)');
});

test('resolve: pass-through, resolve against the host, or null for the stand-in', () => {
  const ms = require('../../../lib/core/media-sources.js');
  const by = Object.fromEntries(ms.SOURCES.map((r) => [r.id, r]));
  assert.equal(by.web.resolve('https://x/y.png', {}), 'https://x/y.png');
  assert.equal(by.relative.resolve('a.png', {}), 'a.png');
  assert.equal(by.relative.resolve('a.png', { baseUrl: 'file:///deck/' }), 'file:///deck/a.png');
  assert.equal(by.relative.resolve('../a.png', { baseUrl: 'file:///deck/' }), null);
  assert.equal(by.sample.resolve('sample:photo-wide.jpg', { samplesUrl: 'file:///s/' }), 'file:///s/photo-wide.jpg');
  assert.equal(by.sample.resolve('sample:photo-wide.jpg', {}), 'sample:photo-wide.jpg');
  assert.equal(by.asset.resolve('asset:hero', {}), 'asset:hero');
  assert.equal(by.asset.resolve('asset:hero', { assetUrls: { hero: 'blob:h' } }), 'blob:h');
  assert.equal(by.asset.resolve('asset:nope', { assetUrls: {} }), null);
});

test('no regex literal in lib/ spells the sample/asset scheme pair outside the table', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') walk(p); continue; }
      if (!/\.(js|mjs)$/.test(e.name) || /generated|\.min\./.test(e.name)) continue;
      if (/\(\?:sample\|asset\)|sample\|asset|asset\|sample/.test(fs.readFileSync(p, 'utf8')) && !p.endsWith(path.join('core', 'media-sources.js'))) hits.push(p);
    }
  };
  walk(path.join(__dirname, '../../../lib'));
  assert.deepEqual(hits, []);
});
