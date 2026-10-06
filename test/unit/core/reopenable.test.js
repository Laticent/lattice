/**
 * The re-openable kernel (lib/core/reopenable.js): the `.lattice` builder and the PDF / PPTX
 * embed that both the Studio's "Re-openable in Lattice" and the CLI's `--reopenable` call.
 *
 * The Studio's reader and its byte-exact round trips are pinned in
 * docs/src/components/studio/deck-import.test.ts, which now reaches this kernel through the
 * Studio's Blob wrapper. These arms pin the kernel's own promises, the ones the CLI relies on:
 * deterministic bytes, a pre-1980 clock that cannot corrupt a zip date, an idempotent PPTX
 * repack that leaves every other part alone, and a loud failure on a package it cannot extend.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const pdfLib = require('pdf-lib');
const k = require('../../../lib/core/reopenable');

const SOURCE = '# Halcyon — revue\n\n<!-- note: keep -->\n\n---\n\n## Two\n';

describe('buildLatticeZip', () => {
  test('writes deck.md verbatim, the manifest, and package folders with no folder entries', async () => {
    const bytes = await k.buildLatticeZip(JSZip, {
      source: SOURCE,
      title: 'Halcyon',
      now: 5,
      packages: [{ type: 'component', name: 'probe', files: { 'probe.styles.css': 'section.probe{}', 'probe.bin': Buffer.from([0, 1, 2]) } }],
    });
    const zip = await JSZip.loadAsync(bytes);
    assert.deepEqual(Object.keys(zip.files).sort(), ['deck.md', 'manifest.json', 'packages/component/probe/probe.bin', 'packages/component/probe/probe.styles.css']);
    assert.equal(await zip.file('deck.md').async('string'), SOURCE);
    assert.deepEqual(JSON.parse(await zip.file('manifest.json').async('string')), k.buildLatticeManifest('Halcyon', [], 5));
    assert.deepEqual([...(await zip.file('packages/component/probe/probe.bin').async('uint8array'))], [0, 1, 2]);
  });

  test('with a date, two builds are the same bytes; a pre-1980 date clamps to 1980', async () => {
    const at = new Date(0);
    const a = await k.buildLatticeZip(JSZip, { source: SOURCE, title: 't', date: at });
    await new Promise((r) => setTimeout(r, 1100)); // a wall-clock stamp would now differ
    const b = await k.buildLatticeZip(JSZip, { source: SOURCE, title: 't', date: at });
    assert.ok(Buffer.from(a).equals(Buffer.from(b)));
    const zip = await JSZip.loadAsync(a);
    assert.equal(zip.file('deck.md').date.getUTCFullYear(), 1980);
  });

  test('the manifest falls back to a title and an empty comment list', () => {
    assert.deepEqual(k.buildLatticeManifest('', null, 0), { format: 'lattice', version: k.LATTICE_VERSION, title: 'Untitled deck', engine: 'lattice', generatedAt: 0, comments: [] });
  });
});

describe('embedInPdfBytes', () => {
  async function plainPdf() {
    const doc = await pdfLib.PDFDocument.create();
    doc.addPage([100, 100]);
    doc.setTitle('Board pack');
    return doc.save();
  }

  test('attaches deck.lattice as the Source, keeps the title, and runs beforeSave', async () => {
    const payload = new Uint8Array([9, 8, 7]);
    let saw = null;
    const out = await k.embedInPdfBytes(pdfLib, await plainPdf(), payload, { beforeSave: (doc) => { saw = doc; } });
    assert.ok(saw, 'beforeSave ran on the document');
    const doc = await pdfLib.PDFDocument.load(out, { updateMetadata: false });
    assert.equal(doc.getTitle(), 'Board pack');
    const { PDFName, PDFDict, PDFArray } = pdfLib;
    const names = doc.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
    const spec = names.lookup(1, PDFDict);
    assert.equal(spec.lookup(PDFName.of('UF')).decodeText(), k.EMBED_FILENAME);
    assert.equal(spec.lookup(PDFName.of('AFRelationship')).decodeText(), 'Source');
  });
});

describe('embedInPptxBytes', () => {
  async function plainPptx(rels = '<Relationships xmlns="r"><Relationship Id="rId1" Type="t" Target="ppt/presentation.xml"/></Relationships>') {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="t"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('_rels/.rels', rels);
    zip.file('ppt/presentation.xml', '<p:presentation/>');
    return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  }

  test('adds the part, one content type and one relationship; other parts keep their bytes', async () => {
    const payload = new Uint8Array([1, 2, 3]);
    const out = await k.embedInPptxBytes(JSZip, await plainPptx(), payload);
    const zip = await JSZip.loadAsync(out);
    assert.deepEqual([...(await zip.file(k.PPTX_EMBED_PART).async('uint8array'))], [1, 2, 3]);
    assert.ok(!zip.files['lattice/'], 'no folder entry');
    assert.equal(await zip.file('ppt/presentation.xml').async('string'), '<p:presentation/>');
    // Idempotent: a second pass adds nothing twice.
    const again = await JSZip.loadAsync(await k.embedInPptxBytes(JSZip, out, payload));
    const types = await again.file('[Content_Types].xml').async('string');
    const rels = await again.file('_rels/.rels').async('string');
    assert.equal(types.match(/Extension="lattice"/g).length, 1);
    assert.equal(rels.split(k.PPTX_EMBED_REL).length - 1, 1);
    assert.match(rels, /Id="rIdLattice1"/);
  });

  test('picks a free relationship id', async () => {
    const out = await k.embedInPptxBytes(JSZip, await plainPptx('<Relationships><Relationship Id="rIdLattice1" Type="x" Target="y"/></Relationships>'), new Uint8Array([1]));
    const rels = await (await JSZip.loadAsync(out)).file('_rels/.rels').async('string');
    assert.match(rels, /Id="rIdLattice2" Type="https:\/\/github\.com\/Laticent\/lattice\/relationships\/deck-source"/);
  });

  test('refuses a package it cannot extend rather than shipping one PowerPoint must repair', async () => {
    await assert.rejects(k.embedInPptxBytes(JSZip, await plainPptx('<ns:Relationships/>'), new Uint8Array([1])), /package layout this version cannot extend/);
    const bare = await new JSZip().file('a.txt', 'x').generateAsync({ type: 'uint8array' });
    await assert.rejects(k.embedInPptxBytes(JSZip, bare, new Uint8Array([1])), /missing its package parts/);
  });
});
