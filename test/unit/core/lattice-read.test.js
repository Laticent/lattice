/**
 * The shared `.lattice` reader (lib/packages/lattice-read.mjs), which the Studio's import and the
 * CLI's `.lattice` input both call. A `.lattice` is a file from anyone, so these arms pin the
 * refusals: too large on disk, a deck or manifest missing, a manifest that is not one, an entry
 * that DECLARES a bomb, an entry that LIES about its size, and photos whose row or bytes are wrong.
 *
 * The Studio's round trips through its Blob wrapper are docs/src/components/studio/lattice-file.test.ts.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const reopenable = require('../../../lib/core/reopenable');
const limits = require('../../../lib/packages/limits');

const load = () => import('../../../lib/packages/lattice-read.mjs');

/** A 1 x 1 PNG, so a photo row has real bytes behind it. */
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3b2a7e60000000049454e44ae426082', 'hex');

async function lattice({ source = '# Deck\n\n![](asset:hero)\n', title = 'Deck', packages = [], media, extra = {} } = {}) {
  const bytes = await reopenable.buildLatticeZip(JSZip, { source, title, packages, media });
  if (!Object.keys(extra).length) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  for (const [p, v] of Object.entries(extra)) {
    if (v === null) zip.remove(p);
    else zip.file(p, v);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

const photoMedia = (rows, files) => ({ index: JSON.stringify(rows), files });
const row = (over = {}) => ({ name: 'hero', kind: 'image', scope: 'library', mime: 'image/png', bytes: PNG.length, width: 1, height: 1, sourceName: 'hero.png', original: true, addedAt: 0, file: 'hero.png', ...over });

/** Rewrite the uncompressed size the CENTRAL DIRECTORY declares for `name` (what JSZip reads as `_data.uncompressedSize`). */
function declareSize(bytes, name, size) {
  const b = Buffer.from(bytes);
  for (let i = 0; i + 46 <= b.length; i++) {
    if (b.readUInt32LE(i) !== 0x02014b50) continue;
    const nameLen = b.readUInt16LE(i + 28);
    if (b.toString('latin1', i + 46, i + 46 + nameLen) === name) {
      b.writeUInt32LE(size, i + 24);
      return b;
    }
  }
  throw new Error(`no central directory entry for ${name}`);
}

describe('readLatticeArchive', () => {
  test('reads the deck, the manifest and the package files, and says whether photos ride along', async () => {
    const { readLatticeArchive } = await load();
    const bytes = await lattice({ packages: [{ type: 'theme', name: 'probe', files: { 'probe.css': ':root{}', 'probe.manifest.json': '{}' } }], media: photoMedia([row()], { 'media/hero.png': PNG }) });
    const r = await readLatticeArchive(JSZip, bytes, bytes.length);
    assert.equal(r.source, '# Deck\n\n![](asset:hero)\n');
    assert.equal(r.manifest.title, 'Deck');
    assert.deepEqual(r.packageFiles.map(([p]) => p).sort(), ['theme/probe/probe.css', 'theme/probe/probe.manifest.json']);
    assert.equal(r.carriesPhotos, true);
  });

  test('refuses a file larger than any .lattice could be, before opening it', async () => {
    const { readLatticeArchive, TOO_LARGE } = await load();
    const bytes = await lattice();
    await assert.rejects(readLatticeArchive(JSZip, bytes, limits.MAX_ZIP_BYTES + limits.MAX_LATTICE_MEDIA_BYTES + 1), { message: TOO_LARGE });
  });

  test('refuses what is not a zip, a zip without its deck or manifest, and a manifest that is not one', async () => {
    const { readLatticeArchive } = await load();
    const text = Buffer.from('# just markdown\n');
    await assert.rejects(readLatticeArchive(JSZip, text, text.length), { message: 'That .lattice file is not a valid archive.' });
    const noDeck = await lattice({ extra: { 'deck.md': null } });
    await assert.rejects(readLatticeArchive(JSZip, noDeck, noDeck.length), { message: 'That .lattice file is missing its deck or manifest.' });
    const badManifest = await lattice({ extra: { 'manifest.json': '{"format":"zip"}' } });
    await assert.rejects(readLatticeArchive(JSZip, badManifest, badManifest.length), { message: 'Not a Lattice file — missing the Lattice manifest.' });
    const newer = await lattice({ extra: { 'manifest.json': JSON.stringify({ format: 'lattice', version: reopenable.LATTICE_VERSION + 1 }) } });
    await assert.rejects(readLatticeArchive(JSZip, newer, newer.length), { message: `This .lattice file needs a newer Lattice (format v${reopenable.LATTICE_VERSION + 1}).` });
  });

  test('refuses a deck that DECLARES more than a reader inflates, before inflating it', async () => {
    const { readLatticeArchive, TOO_LARGE } = await load();
    const bytes = declareSize(await lattice(), 'deck.md', limits.MAX_INFLATED_BYTES + 1);
    await assert.rejects(readLatticeArchive(JSZip, bytes, bytes.length), { message: TOO_LARGE });
  });

  test('stops a deck that LIES about its size at the cap, as it inflates', async () => {
    const { readLatticeArchive, TOO_LARGE } = await load();
    // Deflates to a few KB; declares 10 bytes; really inflates past the cap.
    const big = 'a'.repeat(limits.MAX_INFLATED_BYTES + 1024);
    const zip = new JSZip();
    zip.file('deck.md', big);
    zip.file('manifest.json', JSON.stringify(reopenable.buildLatticeManifest('Deck', [])));
    const bytes = declareSize(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), 'deck.md', 10);
    await assert.rejects(readLatticeArchive(JSZip, bytes, bytes.length), { message: TOO_LARGE });
  });

  test('photo bytes count against the photo cap, not the deck cap', async () => {
    const { readLatticeArchive, TOO_LARGE } = await load();
    const bytes = declareSize(await lattice({ media: photoMedia([row()], { 'media/hero.png': PNG }) }), 'media/hero.png', limits.MAX_LATTICE_MEDIA_BYTES + 1);
    await assert.rejects(readLatticeArchive(JSZip, bytes, bytes.length), { message: TOO_LARGE });
  });
});

describe('readLatticePhotos', () => {
  const open = async (media, names = ['hero']) => {
    const { readLatticeArchive, readLatticePhotos } = await load();
    const bytes = await lattice({ media });
    const { zip } = await readLatticeArchive(JSZip, bytes, bytes.length);
    return readLatticePhotos(zip, new Set(names));
  };

  test('reads a named photo as the bytes the file carries', async () => {
    const r = await open(photoMedia([row()], { 'media/hero.png': PNG }));
    assert.deepEqual(r.refused, []);
    assert.equal(r.photos.length, 1);
    assert.equal(r.photos[0].name, 'hero');
    assert.deepEqual(Buffer.from(r.photos[0].bytes), PNG);
  });

  test('a photo the deck names by an old name (an alias) is read under its row', async () => {
    const r = await open(photoMedia([row({ aliases: ['old-hero'] })], { 'media/hero.png': PNG }), ['old-hero']);
    assert.deepEqual(r.photos.map((p) => [p.name, p.aliases]), [['hero', ['old-hero']]]);
  });

  test('a photo the deck does not name is not read', async () => {
    const r = await open(photoMedia([row({ name: 'other', file: 'other.png' })], { 'media/other.png': PNG }));
    assert.deepEqual(r, { photos: [], refused: [] });
  });

  test('refuses bytes that are not the type the row claims, a clip, and a file name Lattice does not write', async () => {
    const jpegRow = row({ mime: 'image/jpeg', file: 'hero.jpg' });
    assert.match((await open(photoMedia([jpegRow], { 'media/hero.jpg': PNG }))).refused[0].why, /not the JPG its row says/);
    assert.match((await open(photoMedia([row({ kind: 'video', mime: 'video/mp4', file: 'hero.mp4' })], { 'media/hero.mp4': PNG }))).refused[0].why, /photos only/);
    assert.match((await open(photoMedia([row({ file: '../hero.png' })], { 'media/hero.png': PNG }))).refused[0].why, /not one Lattice writes/);
    assert.match((await open(photoMedia([row({ mime: 'image/svg+xml', file: 'hero.svg' })], { 'media/hero.svg': '<svg/>' }))).refused[0].why, /photos only/);
  });

  test('an index that is not a list refuses every photo with one reason', async () => {
    const r = await open({ index: '{"not":"rows"}', files: { 'media/hero.png': PNG } });
    assert.deepEqual(r, { photos: [], refused: [{ name: 'photos', why: 'the photo index is not readable' }] });
  });
});
