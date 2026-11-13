/**
 * Integration: the CLI writes a `.lattice` project file (`lattice deck.md deck.lattice`), and `--reopenable` carries
 * the deck's photos, through the REAL CLI: as the source runs it and as npm ships it (dist/lattice.js).
 *
 * Which photos a CLI-written `.lattice` carries is ONE decision (lib/export/lattice-input.js `photosToCarry`):
 *
 *   FROM A .lattice   the photos the input carried pass through as their bytes: the Studio removed their location
 *                     and camera data when they were added, so they are what a Studio export would carry
 *   FROM assets/      left out, and the CLI says how many and why: a camera original can carry its location, and
 *                     the CLI has no metadata scrubber yet (owner, 2026-11-13). The deck and its packages still go
 *
 * A `.lattice` OUTPUT is the deck, not a render: no browser starts (the arms run with a browser path that does not
 * exist) and no package code runs, so an unapproved code package is carried as its files, not refused. From a
 * `.lattice` input, its title and review comments go back out with it.
 *
 * And a round trip: a `.md` deck with an installed theme becomes a `.lattice`, which renders on a machine whose
 * package store is EMPTY, with that theme.
 *
 * Slow tier: three CLI renders per CLI; the `.lattice` writes need no browser.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const JSZip = require('jszip');
const reopenable = require('../../../lib/core/reopenable');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLIS = [['source', path.join(ROOT, 'lattice.js')], ['shipped bin', path.join(ROOT, 'dist', 'lattice.js')]];
const TIMEOUT = 300000;
const PHOTO = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'lattice-input', 'photo.jpg'));
// Not the product's `lattice-input-` / `lattice-write-` prefixes: a test folder must never look like one the CLI left.
const made = [];
const tmp = (p) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `lo-int-${p}-`));
  made.push(d);
  return d;
};
// Every folder a test makes is removed when the file ends, so runs do not pile up in the system temp folder.
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
const DECK = '---\ntheme: indaco\n---\n\n## A photo\n\n![A gradient](asset:pic)\n';
const ROW = { name: 'pic', kind: 'image', scope: 'library', mime: 'image/jpeg', bytes: PHOTO.length, width: 320, height: 200, sourceName: 'pic.jpg', original: true, addedAt: 0, file: 'pic.jpg', caption: 'A gradient' };
const COMMENTS = [{ id: 'c1', slide: 1, text: 'Tighten the title', author: 'Ann', ts: 5 }];
/** No browser can start at this path: an arm that launches one fails. */
const NO_BROWSER = { CHROME_PATH: '/nonexistent/chrome', PUPPETEER_EXECUTABLE_PATH: '/nonexistent/chrome' };

async function studioLattice(dir, { source = DECK, packages = [] } = {}) {
  const file = path.join(dir, 'in.lattice');
  const zip = await reopenable.buildLatticeZip(JSZip, { source, title: 'Studio title', comments: COMMENTS, packages, media: { index: JSON.stringify([ROW]), files: { 'media/pic.jpg': new Uint8Array(PHOTO) } } });
  fs.writeFileSync(file, zip);
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

for (const [label, bin] of CLIS) {
  const cli = (args, home, env = {}) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: home, ...env } });

  describe(`the CLI writes a .lattice (${label})`, () => {
    test('a .lattice in, a .lattice out: photo, title and comments pass through, and it renders again', { timeout: TIMEOUT }, async () => {
      const dir = tmp('pass');
      const home = tmp('home');
      const out = path.join(dir, 'out.lattice');
      const r = cli([await studioLattice(dir), out], home, NO_BROWSER);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Lattice project: .*out\.lattice \(1 photo\)/);
      const zip = await JSZip.loadAsync(fs.readFileSync(out));
      assert.equal(await zip.file('deck.md').async('string'), DECK);
      assert.deepEqual(Buffer.from(await zip.file('media/pic.jpg').async('uint8array')), PHOTO, 'the photo is the bytes the input carried');
      const rows = JSON.parse(await zip.file('media.json').async('string'));
      assert.deepEqual(rows.map((x) => [x.name, x.file, x.caption]), [['pic', 'pic.jpg', 'A gradient']], 'the row keeps what the Studio wrote');
      const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
      assert.equal(manifest.title, 'Studio title', "the input's title");
      assert.deepEqual(manifest.comments, COMMENTS, "the input's review comments");
      const pdf = path.join(dir, 'again.pdf');
      const again = cli([out, pdf], home);
      assert.equal(again.status, 0, again.stderr);
      assert.ok(fs.readFileSync(pdf).includes(PHOTO), 'the written .lattice renders with its photo');
      assert.deepEqual(fs.readdirSync(home), [], 'nothing is written to the user home');
    });

    test('a .lattice copy loses no package: one the deck does not use, and a finish, come back byte for byte', { timeout: TIMEOUT }, async () => {
      const dir = tmp('keep');
      const spare = { 'probe-spare.manifest.json': JSON.stringify({ name: 'probe-spare', type: 'component', format: 1 }), 'probe-spare.styles.css': 'section.probe-spare { outline: 1px solid var(--accent); } /* é → ✓ */\n', 'probe-spare.gallery.md': '<!-- _class: probe-spare -->\n\n## Spare\n' };
      const finish = { 'probe-finish.manifest.json': JSON.stringify({ name: 'probe-finish', type: 'finish', format: 1 }), 'probe-finish.recipe.json': JSON.stringify({ layers: [{ kind: 'grain', amount: 0.3 }] }, null, 2) };
      const input = await studioLattice(dir, { packages: [{ type: 'component', name: 'probe-spare', files: spare }, { type: 'finish', name: 'probe-finish', files: finish }] });
      const out = path.join(dir, 'out.lattice');
      const r = cli([input, out], tmp('home'), NO_BROWSER);
      assert.equal(r.status, 0, r.stderr);
      const [a, b] = await Promise.all([JSZip.loadAsync(fs.readFileSync(input)), JSZip.loadAsync(fs.readFileSync(out))]);
      const pkgs = (z) => Object.keys(z.files).filter((p) => p.startsWith('packages/') && !z.files[p].dir).sort();
      assert.deepEqual(pkgs(b), pkgs(a), 'the same package files');
      assert.equal(pkgs(a).length, 5);
      for (const p of pkgs(a)) assert.deepEqual(Buffer.from(await b.file(p).async('uint8array')), Buffer.from(await a.file(p).async('uint8array')), `${p} is byte-identical`);
    });

    test('--strip-notes and --strip-say scrub a .lattice copy, and its review comments stay out', { timeout: TIMEOUT }, async () => {
      const dir = tmp('strip');
      const source = '---\ntheme: indaco\n---\n\n## A slide\n\nBody text.\n\n<!-- Private note 51f0 -->\n\n<!-- say: private narration 7c2a -->\n';
      const input = await studioLattice(dir, { source });
      const out = path.join(dir, 'out.lattice');
      const r = cli([input, out, '--strip-notes', '--strip-say'], tmp('home'), NO_BROWSER);
      assert.equal(r.status, 0, r.stderr);
      const zip = await JSZip.loadAsync(fs.readFileSync(out));
      const deck = await zip.file('deck.md').async('string');
      assert.notEqual(deck, source, 'a stripped copy is not the input byte for byte');
      assert.ok(!deck.includes('Private note 51f0') && !deck.includes('private narration 7c2a'), deck);
      assert.match(deck, /## A slide\n\nBody text\./, 'the slides stay');
      assert.deepEqual(JSON.parse(await zip.file('manifest.json').async('string')).comments, [], 'no review comments under a strip');
    });

    test('a .lattice output makes its folder, and says when -p themes it but the deck re-opens in another', { timeout: TIMEOUT }, async () => {
      const dir = tmp('nested');
      fs.writeFileSync(path.join(dir, 'deck.md'), '# No theme named\n');
      const out = path.join(dir, 'new', 'sub', 'deck.lattice');
      const r = cli([path.join(dir, 'deck.md'), out, '-p', 'cuoio'], tmp('home'), NO_BROWSER);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(fs.existsSync(out), 'written into a folder that did not exist');
      assert.match(r.stderr, /\.lattice: this \.lattice carries cuoio by -p cuoio, but the deck re-opens in the default theme, indaco/);
    });

    test('a .lattice output starts no browser and runs no package code: an unapproved code package is carried', { timeout: TIMEOUT }, async () => {
      const dir = tmp('nocode');
      const code = { 'ticker.manifest.json': JSON.stringify({ name: 'ticker', type: 'component', format: 1, facts: 1 }), 'ticker.styles.css': 'section.ticker h2 { color: red; }\n', 'ticker.gallery.md': '<!-- _class: ticker -->\n\n## T\n', 'ticker.transform.js': 'function t(s) { return s.html; }\nexport { t as default };\n' };
      const input = await studioLattice(dir, { source: '---\ntheme: indaco\n---\n\n<!-- _class: ticker -->\n\n## Ticker\n', packages: [{ type: 'component', name: 'ticker', files: code }] });
      const out = path.join(dir, 'out.lattice');
      const r = cli([input, out], tmp('home'), NO_BROWSER);
      assert.equal(r.status, 0, r.stderr);
      assert.doesNotMatch(r.stderr, /not approved|Browser was not found/);
      const zip = await JSZip.loadAsync(fs.readFileSync(out));
      assert.equal(await zip.file('packages/component/ticker/ticker.transform.js').async('string'), code['ticker.transform.js'], 'the code rides as its file');
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
      const r = cli([path.join(dir, 'deck.md'), out], home, NO_BROWSER);
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
}
