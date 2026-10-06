/**
 * Unit: the owned image-per-slide ODP writer (lib/export/odp-export.js) — the
 * LibreOffice Impress sibling of pptx-export.js.
 *
 * Builds the OpenDocument package directly from tiny PNG buffers — no Chromium, no
 * `soffice`. Asserts the package shape a reader relies on (a STORED `mimetype` as the
 * first entry, a manifest listing every part), one page + one picture per slide, alt
 * text, speaker notes, XML escaping and the page geometry. The CLI path is covered by
 * test/integration/export/export-formats.test.js.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const JSZip = require('jszip');

const { writeOdp, buildOdp, odpPageSize, ODP_MIMETYPE } = require('../../../lib/export/odp-export');

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-odp-')), 'out.odp');
}

async function writeAndOpen(...args) {
  const out = tmpFile();
  const count = await writeOdp(out, ...args);
  const bytes = fs.readFileSync(out);
  return { count, bytes, zip: await JSZip.loadAsync(bytes) };
}

describe('odp-export', () => {
  test('writes an ODF package whose first entry is a STORED mimetype', async () => {
    const { count, bytes, zip } = await writeAndOpen([ONE_PX_PNG, ONE_PX_PNG], { title: 'Deck' });
    assert.equal(count, 2);
    // A reader sniffs the type from the raw bytes: local header "PK\3\4", compression
    // method 0 (STORE) at offset 8, the name "mimetype" at 30, its value right after.
    assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304');
    assert.equal(bytes.readUInt16LE(8), 0, 'mimetype must be stored, not deflated');
    assert.equal(bytes.subarray(30, 38).toString(), 'mimetype');
    assert.equal(bytes.subarray(38, 38 + ODP_MIMETYPE.length).toString(), ODP_MIMETYPE);
    assert.equal(await zip.file('mimetype').async('string'), ODP_MIMETYPE);

    const names = Object.keys(zip.files);
    assert.ok(!names.some((n) => n.endsWith('/')), `no directory entries: ${names}`);
    const manifest = await zip.file('META-INF/manifest.xml').async('string');
    for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'Pictures/slide001.png', 'Pictures/slide002.png']) {
      assert.ok(names.includes(part), `${part} is in the package`);
      assert.ok(manifest.includes(`manifest:full-path="${part}"`), `${part} is in the manifest`);
    }
  });

  test('one page with one full-bleed picture per slide', async () => {
    const { zip } = await writeAndOpen([ONE_PX_PNG, ONE_PX_PNG, ONE_PX_PNG], { width: 1280, height: 720 });
    const content = await zip.file('content.xml').async('string');
    assert.equal(content.match(/<draw:page /g).length, 3);
    assert.equal(content.match(/<draw:image /g).length, 3);
    assert.match(content, /svg:x="0cm" svg:y="0cm" svg:width="33.867cm" svg:height="19.05cm"/);
    const styles = await zip.file('styles.xml').async('string');
    assert.match(styles, /fo:page-width="33.867cm" fo:page-height="19.05cm"/);
  });

  test('alt text is the description, else a neutral "Slide N"', async () => {
    const { zip } = await writeAndOpen([ONE_PX_PNG, ONE_PX_PNG], {}, [], ['A chart of "Q3" <revenue>', '  ']);
    const descs = [...(await zip.file('content.xml').async('string')).matchAll(/<svg:desc>([^<]*)<\/svg:desc>/g)].map((m) => m[1]);
    assert.deepEqual(descs, ['A chart of &quot;Q3&quot; &lt;revenue&gt;', 'Slide 2']);
  });

  test('speaker notes land on the notes page, one paragraph per line; empty notes add none', async () => {
    const { zip } = await writeAndOpen([ONE_PX_PNG, ONE_PX_PNG], {}, ['Open warm\nthen R&D', null]);
    const content = await zip.file('content.xml').async('string');
    assert.equal(content.match(/<presentation:notes>/g).length, 1);
    assert.match(content, /<text:p>Open warm<\/text:p><text:p>then R&amp;D<\/text:p>/);
  });

  test('meta carries the title and provenance, escaped', async () => {
    const { zip } = await writeAndOpen([ONE_PX_PNG], { title: ' Q3 & <plan> ', company: 'Lattice · indaco' });
    const meta = await zip.file('meta.xml').async('string');
    assert.match(meta, /<dc:title>Q3 &amp; &lt;plan&gt;<\/dc:title>/);
    assert.match(meta, /meta:name="Company">Lattice · indaco</);
  });

  test('characters XML 1.0 forbids are dropped rather than written', async () => {
    const { zip } = await writeAndOpen([ONE_PX_PNG], {}, ['bell\u0007here']);
    assert.match(await zip.file('content.xml').async('string'), /<text:p>bellhere<\/text:p>/);
  });

  test('rejects an empty slide set', () => {
    assert.throws(() => buildOdp(JSZip, []), /no slide images/);
    assert.throws(() => buildOdp(JSZip, null), /no slide images/);
  });

  describe('odpPageSize', () => {
    test('16:9 and missing geometry give 33.867 × 19.05 cm', () => {
      assert.deepEqual(odpPageSize(1280, 720), { w: 33.867, h: 19.05 });
      assert.deepEqual(odpPageSize(), { w: 33.867, h: 19.05 });
      assert.deepEqual(odpPageSize(0, 720), { w: 33.867, h: 19.05 });
    });
    test('portrait and square keep the deck aspect, longest edge 33.867 cm', () => {
      assert.deepEqual(odpPageSize(1080, 1920), { w: 19.05, h: 33.867 });
      assert.deepEqual(odpPageSize(1000, 1000), { w: 33.867, h: 33.867 });
    });
  });
});
