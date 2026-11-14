/**
 * The CLI's `.lattice` unpacker (lib/export/lattice-input.js), run as the CLI runs it: `unpackSync`, which starts
 * the shipped file as a child. No browser.
 *
 *   ENTRY     the child is the shipped file by its package path, never `__filename` (inside the bundled CLI that is
 *             the CLI itself, which then started itself forever; the integration tier runs the bundle)
 *   ALIASES   a photo the deck names by its old names is written ONCE; the old names come back as a map
 *   CAP       a row listing more old names than a photo keeps (limits.js MAX_PHOTO_ALIASES) is refused
 *   CLASH     two rows claiming one name, or a row's old name that is another photo's name, are refused by name
 *   ROW       only the fields a Studio row has survive, each cleaned and bounded
 *   SIGNALS   the private folder is removed when the CLI is stopped by SIGINT, SIGTERM or SIGHUP
 *   NESTED    an unpack asked for inside an unpack child is refused at once, with a typed error and no folder:
 *             if the child path ever resolved to the CLI again, that is one error, never a chain of processes
 *   ALIAS MAP `buildAssetUrls` resolves an old name like `constructor` by own keys, not through Object.prototype
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const JSZip = require('jszip');
const reopenable = require('../../../lib/core/reopenable');
const limits = require('../../../lib/packages/limits');
const li = require('../../../lib/export/lattice-input');

const ROOT = path.join(__dirname, '..', '..', '..');
/** A 1 x 1 PNG. */
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3b2a7e60000000049454e44ae426082', 'hex');
// Every folder a test makes is removed when the file ends, so runs do not pile up in the system temp folder.
const made = [];
const tmp = (p) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `li-unit-${p}-`));
  made.push(d);
  return d;
};
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
const row = (over = {}) => ({ name: 'hero', kind: 'image', scope: 'library', mime: 'image/png', bytes: PNG.length, width: 1, height: 1, sourceName: 'hero.png', original: true, addedAt: 0, file: 'hero.png', ...over });

async function latticeFile(source, rows, files) {
  const dir = tmp('file');
  const file = path.join(dir, 'deck.lattice');
  fs.writeFileSync(file, await reopenable.buildLatticeZip(JSZip, { source, title: 'Probe', media: { index: JSON.stringify(rows), files } }));
  return file;
}

describe('unpackSync', () => {
  test('the child is the shipped file, by its path in the package', () => {
    assert.equal(li.ENTRY, path.join(ROOT, 'lib', 'export', 'lattice-input.js'));
    assert.ok(fs.existsSync(li.ENTRY));
  });

  test('an unpack asked for inside an unpack child is refused at once, and makes no folder', async () => {
    const file = await latticeFile('# D\n', [], {});
    const root = tmp('nested');
    const was = process.env[li.CHILD_MARK];
    process.env[li.CHILD_MARK] = '1';
    try {
      assert.throws(() => li.unpackSync(file, { tmpRoot: root }), { code: 'LATTICE_NESTED_UNPACK' });
    } finally {
      if (was === undefined) delete process.env[li.CHILD_MARK];
      else process.env[li.CHILD_MARK] = was;
    }
    assert.deepEqual(fs.readdirSync(root), [], 'no private folder was made');
  });

  test('the CLI started as an unpack child refuses a .lattice input with that error', async () => {
    const file = await latticeFile('# D\n', [], {});
    const r = require('node:child_process').spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), file, path.join(tmp('nested-cli'), 'x.pdf')], { encoding: 'utf8', env: { ...process.env, [li.CHILD_MARK]: '1' } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /started the CLI again on a \.lattice, so it stopped/);
  });

  test('an old name that is also an Object.prototype key resolves to its photo', () => {
    const deck = tmp('alias-map');
    fs.mkdirSync(path.join(deck, 'assets'));
    fs.writeFileSync(path.join(deck, 'assets', 'hero.png'), PNG);
    const { buildAssetUrls } = require('../../../lib/export/deck-assets');
    const { urls } = buildAssetUrls(deck, undefined, { constructor: 'hero', tostring: 'hero' });
    assert.ok(Object.hasOwn(urls, 'constructor'), 'an own entry');
    assert.equal(urls.constructor, urls.hero);
    assert.equal(urls.tostring, urls.hero);
  });

  test('a photo the deck names by every one of its old names is written once', async () => {
    const aliases = Array.from({ length: limits.MAX_PHOTO_ALIASES }, (_, i) => `old-${i}`);
    const source = `# Deck\n\n${aliases.map((a) => `![](asset:${a})`).join('\n\n')}\n`;
    const out = li.unpackSync(await latticeFile(source, [row({ aliases })], { 'media/hero.png': PNG }), { tmpRoot: tmp('root') });
    assert.deepEqual(out.refused, []);
    assert.deepEqual(fs.readdirSync(path.join(out.dir, 'assets')), ['hero.png'], 'one file, however many names');
    assert.deepEqual(out.aliases, Object.fromEntries(aliases.map((a) => [a, 'hero'])));
  });

  test('a row listing more old names than a photo keeps is refused', async () => {
    const aliases = Array.from({ length: limits.MAX_PHOTO_ALIASES + 1 }, (_, i) => `old-${i}`);
    const out = li.unpackSync(await latticeFile('# Deck\n\n![](asset:hero)\n', [row({ aliases })], { 'media/hero.png': PNG }), { tmpRoot: tmp('root') });
    assert.deepEqual(out.photos, []);
    assert.match(out.refused[0].why, new RegExp(`more than the ${limits.MAX_PHOTO_ALIASES} old names`));
    assert.deepEqual(fs.readdirSync(path.join(out.dir, 'assets')), []);
  });

  test('two photos claiming one name are refused by name, never merged', async () => {
    const jpegLike = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    const rows = [row(), row({ mime: 'image/jpeg', file: 'hero.jpg' }), row({ name: 'other', file: 'other.png', aliases: ['hero'] })];
    const out = li.unpackSync(await latticeFile('# D\n\n![](asset:hero)\n\n![](asset:other)\n', rows, { 'media/hero.png': PNG, 'media/hero.jpg': jpegLike, 'media/other.png': PNG }), { tmpRoot: tmp('root') });
    assert.deepEqual(out.photos.map((p) => p.name), ['hero']);
    assert.deepEqual(out.refused.map((r) => [r.name, r.why]), [
      ['hero', 'the name hero already belongs to another photo in this file'],
      ['other', 'the name hero already belongs to another photo in this file'],
    ]);
  });

  test("only a Studio row's fields survive, cleaned and bounded", async () => {
    const dirty = row({ caption: `Hello\u0007‮there ${'x'.repeat(400)}`, evil: '<script>', bytes: 999999, width: -5, sourceName: 42 });
    const out = li.unpackSync(await latticeFile('# D\n\n![](asset:hero)\n', [dirty], { 'media/hero.png': PNG }), { tmpRoot: tmp('root') });
    const kept = out.photos[0].row;
    assert.equal(kept.evil, undefined, 'an invented field is dropped');
    assert.equal(kept.bytes, PNG.length, 'the size is the real one');
    assert.equal(kept.width, 0);
    assert.equal(kept.sourceName, 'hero');
    assert.ok(kept.caption.startsWith('Hello there'), kept.caption);
    assert.equal(Array.from(kept.caption).length, 140);
  });

  test("assets/ photos past the cap: what fits goes, the rest is named, a refused one is named with its reason", () => {
    const deck = tmp('cap');
    fs.mkdirSync(path.join(deck, 'assets'));
    const F = path.join(ROOT, 'test', 'fixtures', 'lattice-input');
    fs.copyFileSync(path.join(F, 'gps.jpg'), path.join(deck, 'assets', 'a.jpg'));
    fs.copyFileSync(path.join(F, 'text.png'), path.join(deck, 'assets', 'b.png'));
    fs.copyFileSync(path.join(F, 'garbage.jpg'), path.join(deck, 'assets', 'c.jpg'));
    const first = li.cleanAssetPhoto(path.join(deck, 'assets', 'a.jpg'));
    // Room for the first cleaned photo and not the second.
    const carry = li.photosToCarry({ assetsDir: path.join(deck, 'assets'), names: new Set(['a', 'b', 'c', 'absent']), maxBytes: first.bytes.length + 10 });
    assert.deepEqual(carry.included, ['a']);
    assert.deepEqual(carry.omitted, ['b']);
    assert.deepEqual(carry.refused, [{ name: 'c', why: 'it does not read as a whole JPEG file, so its metadata cannot be removed' }]);
    assert.deepEqual(Object.keys(carry.paths), ['media/a.jpg']);
  });

  for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
    test(`the private folder is removed when the CLI is stopped by ${sig}`, async () => {
      const file = await latticeFile('# D\n\n![](asset:hero)\n', [row()], { 'media/hero.png': PNG });
      const root = tmp('sig');
      // A CLI-shaped process: unpack, say so, then wait to be stopped.
      const script = `const li = require(${JSON.stringify(path.join(ROOT, 'lib', 'export', 'lattice-input.js'))}); const o = li.unpackSync(${JSON.stringify(file)}, { tmpRoot: ${JSON.stringify(root)} }); console.log(o.dir); setInterval(() => {}, 1 << 30);`;
      const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
      const dir = await new Promise((resolve) => child.stdout.once('data', (d) => resolve(String(d).trim())));
      assert.ok(fs.existsSync(dir), 'unpacked');
      const [code, signal] = await new Promise((resolve) => {
        child.once('exit', (c, s) => resolve([c, s]));
        child.kill(sig);
      });
      assert.deepEqual([code, signal], [128 + n, null], 'it exits with the shell code for the signal');
      assert.equal(fs.existsSync(dir), false, 'the deck and photos are gone');
    });
  }
});
