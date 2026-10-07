/**
 * Integration: `--reopenable` puts the deck's `.lattice` inside a CLI PDF / PPTX, the same
 * payload the Studio's "Re-openable in Lattice" switch embeds
 * (engineering/decisions/2026-10-05-reopenable-exports.md §8).
 *
 * The oracle is the payload's `deck.md`, compared byte for byte with the file the CLI read.
 * The Studio half — importing these files through the real Import deck — is
 * docs/e2e/deck-import-roundtrip.spec.ts; the kernel's own shapes are
 * test/unit/core/reopenable.test.js.
 *
 * Arms that can fail on a wrong implementation, not just a missing one:
 *   · the PDF and PPTX carry the SAME payload (one builder, not two);
 *   · `--strip-notes` scrubs the payload too (a privacy flag that skipped this copy would
 *     pass every other test in the tree);
 *   · two runs seconds apart write identical PDF bytes, and SOURCE_DATE_EPOCH sets the
 *     payload's zip dates and `generatedAt` (pinned like every other PDF date);
 *   · an installed component the deck uses rides along as a package folder;
 *   · a format with no home for it warns rather than dropping the flag silently;
 *   · `-p` warns when the deck re-opens in another theme, and is silent when it names that one.
 *
 * Slow tier: ten CLI renders.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const JSZip = require('jszip');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const TIMEOUT = 180000;
const NOTE = 'reopenable private note 4b1e';

// A speaker note, a non-ASCII heading and a front-matter title: the parts a lossy path drops first.
const DECK = [
  '---', 'title: Halcyon quarterly', '---', '',
  '# Halcyon quarterly — revue', '',
  '---', '',
  '## Retention held', '',
  `<!-- ${NOTE} -->`, '',
  '- 94% of accounts renewed.', '',
].join('\n');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-reopenable-'));

function exportDeck(out, extra = [], env = {}, deck = DECK) {
  const dir = path.dirname(out);
  const src = path.join(dir, 'deck.md');
  fs.writeFileSync(src, deck);
  const r = spawnSync(process.execPath, [EMULATOR, src, out, '--reopenable', ...extra], {
    cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, ...env },
  });
  assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
  return { ...r, bytes: fs.existsSync(out) ? fs.readFileSync(out) : null };
}

/** The `deck.lattice` attachment of a PDF, read the way the Studio reads it (by name). */
async function pdfPayload(bytes) {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream } = require('pdf-lib');
  const zlib = require('node:zlib');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const names = doc.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
  for (let i = 0; i + 1 < names.size(); i += 2) {
    const spec = names.lookup(i + 1, PDFDict);
    if (spec.lookup(PDFName.of('UF')).decodeText() !== 'deck.lattice') continue;
    assert.equal(spec.lookup(PDFName.of('AFRelationship')).decodeText(), 'Source');
    const stream = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'));
    assert.ok(stream instanceof PDFRawStream);
    return zlib.inflateSync(Buffer.from(stream.getContents()));
  }
  return null;
}

async function pptxPayload(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const part = zip.file('lattice/deck.lattice');
  return part ? Buffer.from(await part.async('uint8array')) : null;
}

async function readLattice(payload) {
  const zip = await JSZip.loadAsync(payload);
  return {
    source: await zip.file('deck.md').async('string'),
    manifest: JSON.parse(await zip.file('manifest.json').async('string')),
    paths: Object.keys(zip.files),
  };
}

describe('--reopenable (CLI)', () => {
  test('PDF and PPTX carry the same .lattice, and its deck.md is the source byte for byte', { timeout: TIMEOUT }, async () => {
    const dir = tmp();
    const pdf = exportDeck(path.join(dir, 'deck.pdf'));
    const pptx = exportDeck(path.join(dir, 'deck.pptx'));
    assert.match(pdf.stdout, /re-openable in Lattice/);
    assert.match(pptx.stdout, /re-openable in Lattice/);

    const fromPdf = await pdfPayload(pdf.bytes);
    const fromPptx = await pptxPayload(pptx.bytes);
    assert.ok(fromPdf, 'the PDF carries deck.lattice');
    assert.ok(fromPptx, 'the PPTX carries lattice/deck.lattice');
    assert.ok(fromPdf.equals(fromPptx), 'one builder: the two payloads are the same bytes');

    const { source, manifest, paths } = await readLattice(fromPdf);
    assert.equal(source, DECK, 'deck.md is the source as written');
    assert.deepEqual(manifest, { format: 'lattice', version: 1, title: 'Halcyon quarterly', engine: 'lattice', generatedAt: 0, comments: [] });
    assert.deepEqual(paths.sort(), ['deck.md', 'manifest.json'], 'no packages, no folder entries');

    // The PPTX package declares the part, so PowerPoint opens it without offering a repair.
    const zip = await JSZip.loadAsync(pptx.bytes);
    assert.match(await zip.file('[Content_Types].xml').async('string'), /<Default Extension="lattice" ContentType="application\/vnd\.lattice\+zip"\/>/);
    assert.match(await zip.file('_rels/.rels').async('string'), /Type="https:\/\/github\.com\/Laticent\/lattice\/relationships\/deck-source" Target="lattice\/deck\.lattice"/);
  });

  test('the --editable PPTX carries the same .lattice beside its embedded fonts', { timeout: TIMEOUT }, async () => {
    const dir = tmp();
    const plain = exportDeck(path.join(dir, 'plain.pptx'));
    const edited = exportDeck(path.join(dir, 'edited.pptx'), ['--editable']);
    assert.match(edited.stdout, /editable: .*re-openable in Lattice/);
    const payload = await pptxPayload(edited.bytes);
    assert.ok(payload, 'the editable PPTX carries lattice/deck.lattice');
    assert.ok(payload.equals(await pptxPayload(plain.bytes)), 'the same payload as the picture PPTX');
    const zip = await JSZip.loadAsync(edited.bytes);
    assert.ok(Object.keys(zip.files).some((n) => n.startsWith('ppt/fonts/')), 'the fonts survive the embed');
  });

  test('--strip-notes scrubs the embedded deck too', { timeout: TIMEOUT }, async () => {
    const dir = tmp();
    const { bytes } = exportDeck(path.join(dir, 'deck.pdf'), ['--strip-notes']);
    const { source } = await readLattice(await pdfPayload(bytes));
    assert.ok(!source.includes(NOTE), 'the note is gone from the payload');
    assert.match(source, /94% of accounts renewed/, 'the slide text is not');
  });

  test('the payload clock is pinned: two runs match, and SOURCE_DATE_EPOCH sets it', { timeout: TIMEOUT }, async () => {
    const a = exportDeck(path.join(tmp(), 'deck.pdf'), ['-q']);
    await new Promise((r) => setTimeout(r, 2100)); // a wall-clock zip date (2 s DOS resolution) would now differ
    const b = exportDeck(path.join(tmp(), 'deck.pdf'), ['-q']);
    assert.ok(a.bytes.equals(b.bytes), 'two renders of one deck must write the same bytes');
    const at = 1767225600; // 2026-01-01T00:00:00Z
    const c = exportDeck(path.join(tmp(), 'deck.pdf'), ['-q'], { SOURCE_DATE_EPOCH: String(at) });
    const zip = await JSZip.loadAsync(await pdfPayload(c.bytes));
    assert.equal(zip.file('deck.md').date.getTime(), at * 1000);
    assert.equal(JSON.parse(await zip.file('manifest.json').async('string')).generatedAt, at * 1000);
  });

  test('PPTX: --strip-notes --strip-say scrub the embedded deck', { timeout: TIMEOUT }, async () => {
    const deck = DECK.replace('- 94%', '<!-- say: private narration 7c2a -->\n\n- 94%');
    const { bytes } = exportDeck(path.join(tmp(), 'deck.pptx'), ['-q', '--strip-notes', '--strip-say'], {}, deck);
    const { source } = await readLattice(await pptxPayload(bytes));
    assert.ok(!source.includes(NOTE) && !source.includes('private narration 7c2a'), source);
  });

  test('an installed component the deck uses rides along as a package folder', { timeout: TIMEOUT }, async () => {
    const home = tmp();
    const dir = path.join(home, 'packages', 'component', 'probe-box');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'probe-box.manifest.json'), JSON.stringify({ name: 'probe-box', type: 'component', format: 1 }));
    fs.writeFileSync(path.join(dir, 'probe-box.styles.css'), 'section.probe-box { outline: 7px solid var(--accent); }');
    fs.writeFileSync(path.join(dir, 'probe-box.gallery.md'), '<!-- _class: probe-box -->\n\n## probe-box\n');
    const deck = '<!-- _class: probe-box -->\n\n## Boxed\n';
    const { bytes } = exportDeck(path.join(tmp(), 'deck.pdf'), ['-q'], { LATTICE_HOME: home }, deck);
    const { source, paths } = await readLattice(await pdfPayload(bytes));
    assert.equal(source, deck);
    assert.deepEqual(paths.filter((p) => p.startsWith('packages/')).sort(), [
      'packages/component/probe-box/probe-box.gallery.md',
      'packages/component/probe-box/probe-box.manifest.json',
      'packages/component/probe-box/probe-box.styles.css',
    ]);
  });

  // `-p` themes the render, not the deck, so the `.lattice` re-opens in another theme. Both
  // arms run: a warning that fired on every `-p` would pass the first and fail the second.
  test('-p on a deck that names another theme warns, naming both themes and the fix', { timeout: TIMEOUT }, () => {
    const r = exportDeck(path.join(tmp(), 'deck.pdf'), ['-q', '-p', 'cuoio']);
    assert.match(r.stderr, /--reopenable: this export is themed cuoio by -p cuoio, but the embedded deck re-opens in the default theme, indaco/);
    assert.match(r.stderr, /put `theme: cuoio` in the deck's front matter/);
  });

  test('-p is silent when the deck already names that theme', { timeout: TIMEOUT }, () => {
    const deck = DECK.replace('title: Halcyon quarterly', 'title: Halcyon quarterly\ntheme: cuoio');
    const r = exportDeck(path.join(tmp(), 'deck.pptx'), ['-q', '-p', 'cuoio'], {}, deck);
    assert.doesNotMatch(r.stderr, /--reopenable:/);
  });

  test('a format with no home for the deck says so instead of dropping the flag', { timeout: TIMEOUT }, () => {
    const out = path.join(tmp(), 'deck.png');
    const r = exportDeck(out, ['-q']);
    assert.match(r.stderr, /--reopenable embeds the deck in a \.pdf or \.pptx — ignoring for this output/);
  });
});
