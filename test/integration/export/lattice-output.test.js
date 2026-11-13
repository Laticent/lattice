/**
 * Integration: the CLI writes a `.lattice` project file (`lattice deck.md deck.lattice`), and `--reopenable` carries
 * the deck's photos, through the REAL CLI.
 *
 * Which photos a CLI-written `.lattice` carries is ONE decision (lib/export/lattice-input.js `photosToCarry`):
 *
 *   FROM A .lattice   the photos the input carried pass through as their bytes: the Studio removed their location
 *                     and camera data when they were added, so they are what a Studio export would carry
 *   FROM assets/      left out, and the CLI says how many and why: a camera original can carry its location, and
 *                     the CLI has no metadata scrubber yet (owner, 2026-11-13). The deck and its packages still go
 *
 * And a round trip: a `.md` deck with an installed theme becomes a `.lattice`, which renders on a machine whose
 * package store is EMPTY, with that theme.
 *
 * Slow tier: three CLI renders; the `.lattice` writes need no browser.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const JSZip = require('jszip');
const reopenable = require('../../../lib/core/reopenable');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const TIMEOUT = 300000;
const PHOTO = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'lattice-input', 'photo.jpg'));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `lattice-output-${p}-`));
const DECK = '---\ntheme: indaco\n---\n\n## A photo\n\n![A gradient](asset:pic)\n';
const ROW = { name: 'pic', kind: 'image', scope: 'library', mime: 'image/jpeg', bytes: PHOTO.length, width: 320, height: 200, sourceName: 'pic.jpg', original: true, addedAt: 0, file: 'pic.jpg', caption: 'A gradient' };

function cli(args, home) {
  return spawnSync(process.execPath, [EMULATOR, ...args], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: home } });
}
async function studioLattice(dir) {
  const file = path.join(dir, 'in.lattice');
  fs.writeFileSync(file, await reopenable.buildLatticeZip(JSZip, { source: DECK, title: 'Probe', media: { index: JSON.stringify([ROW]), files: { 'media/pic.jpg': new Uint8Array(PHOTO) } } }));
  return file;
}
/** The `.lattice` a PDF carries as its `deck.lattice` attachment, opened. */
async function attachedLattice(pdfFile) {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } = require('pdf-lib');
  const doc = await PDFDocument.load(fs.readFileSync(pdfFile));
  const names = doc.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
  const spec = names.lookup(1, PDFDict);
  const stream = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'), PDFRawStream);
  return JSZip.loadAsync(decodePDFRawStream(stream).decode());
}

describe('the CLI writes a .lattice', () => {
  test('a .lattice in, a .lattice out: the photo passes through as its bytes, and renders again', { timeout: TIMEOUT }, async () => {
    const dir = tmp('pass');
    const home = tmp('home');
    const out = path.join(dir, 'out.lattice');
    const r = cli([await studioLattice(dir), out], home);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Lattice project: .*out\.lattice \(1 photo\)/);
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    assert.equal(await zip.file('deck.md').async('string'), DECK);
    assert.deepEqual(Buffer.from(await zip.file('media/pic.jpg').async('uint8array')), PHOTO, 'the photo is the bytes the input carried');
    const rows = JSON.parse(await zip.file('media.json').async('string'));
    assert.deepEqual(rows.map((x) => [x.name, x.file, x.caption]), [['pic', 'pic.jpg', 'A gradient']], 'the row keeps what the Studio wrote');
    const pdf = path.join(dir, 'again.pdf');
    const again = cli([out, pdf], home);
    assert.equal(again.status, 0, again.stderr);
    assert.ok(fs.readFileSync(pdf).includes(PHOTO), 'the written .lattice renders with its photo');
    assert.deepEqual(fs.readdirSync(home), [], 'nothing is written to the user home');
  });

  test('a .md with assets/: the deck and its theme go, the camera originals are left out and named', { timeout: TIMEOUT }, async () => {
    const dir = tmp('md');
    const home = tmp('home');
    const theme = path.join(home, 'packages', 'theme', 'probe-brand');
    fs.mkdirSync(theme, { recursive: true });
    fs.writeFileSync(path.join(theme, 'probe-brand.manifest.json'), JSON.stringify({ name: 'probe-brand', type: 'theme', format: 1, label: 'probe-brand' }));
    fs.writeFileSync(path.join(theme, 'probe-brand.css'), "/* @theme probe-brand */\n@import 'lattice';\n:root { --accent: #2d4ed8; }\n");
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', 'pic.jpg'), PHOTO);
    fs.writeFileSync(path.join(dir, 'deck.md'), DECK.replace('theme: indaco', 'theme: probe-brand'));
    const out = path.join(dir, 'deck.lattice');
    const r = cli([path.join(dir, 'deck.md'), out], home);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 photo from assets\/ left out: a camera original can carry where it was taken, and the CLI cannot remove that yet/);
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    assert.equal(zip.file('media.json'), null, 'no photo index');
    assert.deepEqual(Object.keys(zip.files).filter((p) => p.startsWith('media/')), [], 'no photo bytes');
    assert.ok(zip.file('packages/theme/probe-brand/probe-brand.css'), 'the installed theme travels');
    // The round trip: on a machine with an EMPTY store, the file renders with the theme it carries.
    const html = path.join(dir, 'elsewhere.html');
    const elsewhere = cli([out, html], tmp('empty-home'));
    assert.equal(elsewhere.status, 0, elsewhere.stderr);
    assert.match(fs.readFileSync(html, 'utf8'), /--accent:\s*#2d4ed8/i);
  });

  test('--reopenable carries the photos a .lattice input carried, inside the PDF', { timeout: TIMEOUT }, async () => {
    const dir = tmp('reopen');
    const pdf = path.join(dir, 'deck.pdf');
    const r = cli([await studioLattice(dir), pdf, '--reopenable'], tmp('home'));
    assert.equal(r.status, 0, r.stderr);
    const zip = await attachedLattice(pdf);
    assert.deepEqual(Buffer.from(await zip.file('media/pic.jpg').async('uint8array')), PHOTO, 'the re-openable PDF carries the photo');
    assert.ok(zip.file('media.json'));
  });
});
