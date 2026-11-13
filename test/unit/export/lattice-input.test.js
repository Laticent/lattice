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
 */
const { test, describe } = require('node:test');
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
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `li-unit-${p}-`));
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
