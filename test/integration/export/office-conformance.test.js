/**
 * Integration: the office export conforms. Decks exported through the CLI (`--editable`) must pass
 * the ISO 29500 schema, the unique-shape-id rule and Microsoft's Open XML SDK validator (`.pptx`), and the
 * package-structure checks (`.odp`). Each check also has an ARM THAT FAILS: a file broken in the one way
 * that check owns, which it must flag, so a validator that silently stopped looking is caught
 * (test/conformance/office/office-conformance.js says what each check proves and what none of them does).
 *
 * The Open XML SDK needs a .NET SDK. Locally it skips, with the reason, when `dotnet` is absent;
 * on CI (`CI` set) its absence fails the run.
 *
 * ROUND TRIP (engineering/decisions/2026-11-13-native-pptx-writer.md §How it is proven, 2): LibreOffice headless opens
 * every exported .pptx and converts it to PDF. The PDF has one page per slide, and each page carries the text of its
 * slide's text boxes (letters and digits, compared without case or spacing, since LibreOffice draws small caps and
 * letter-spaced runs its own way). It needs `soffice` and `pdftotext`; no CI job installs LibreOffice yet.
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const JSZip = require('jszip');
const { checkPptxSchema, checkOpenXml, checkOdp, openXmlAvailable, has } = require('../../conformance/office/office-conformance');
const { readPptx } = require('../../helpers/pptx-readback');

const ROOT = path.join(__dirname, '..', '..', '..');
// focus + focus-highlight-axes: the focus treatments, whose column pictures, free text and inset-outline cards
// are the editable export's hardest z-order and stroke cases (#2933).
const DECKS = ['accent-finishes', 'card-tags', 'sample-images', 'marks', 'calco-edge-cases', 'focus', 'focus-highlight-axes'];

describe('office export conformance', () => {
  const out = {};
  let tmp;
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-office-conf-'));
    for (const deck of DECKS) {
      for (const ext of ['pptx', 'odp']) {
        const file = path.join(tmp, `${deck}.${ext}`);
        execFileSync('node', [path.join(ROOT, 'lattice.js'), path.join(ROOT, 'examples', `${deck}.md`), file, '--editable', '-q'], { cwd: ROOT, stdio: 'ignore', timeout: 240_000 });
        out[`${deck}.${ext}`] = file;
      }
    }
  });

  const openXml = (t) => {
    if (openXmlAvailable()) return true;
    assert.ok(!process.env.CI, 'CI must have a .NET SDK so the Open XML validator runs');
    t.skip('no .NET SDK here (apt-get install dotnet-sdk-8.0); the Open XML validator did not run');
    return false;
  };
  const rewrite = async (file, name, fn) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    zip.file(name, fn(await zip.file(name).async('string')));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  };

  for (const deck of DECKS) {
    test(`${deck}.pptx: schema and unique shape ids`, async () => {
      assert.deepEqual(await checkPptxSchema(fs.readFileSync(out[`${deck}.pptx`])), []);
    });
    test(`${deck}.odp: package structure and references`, async () => {
      assert.deepEqual(await checkOdp(fs.readFileSync(out[`${deck}.odp`])), []);
    });
  }

  test('Open XML SDK validator: every exported .pptx is clean', (t) => {
    if (!openXml(t)) return;
    const files = DECKS.map((d) => out[`${d}.pptx`]);
    const bad = checkOpenXml(files).filter((r) => r.errors.length);
    assert.deepEqual(bad.map((r) => `${path.basename(r.file)}: ${r.errors[0].id} ${r.errors[0].description}`), []);
  });

  describe('arms that fail', () => {
    test('schema: a misordered child and an undeclared attribute are flagged', async () => {
      const bytes = await rewrite(out['card-tags.pptx'], 'ppt/slides/slide1.xml', (x) =>
        x.replace(/(<a:rPr[^>]*>)(<a:solidFill>.*?<\/a:solidFill>)(<a:latin[^>]*\/>)/, '$1$3$2').replace('<p:cNvPr id="', '<p:cNvPr bogus="1" id="'),
      );
      const found = await checkPptxSchema(bytes);
      assert.ok(found.some((f) => f.kind === 'schema' && /bogus/.test(f.message)), JSON.stringify(found));
      assert.ok(found.some((f) => f.kind === 'schema' && /solidFill/.test(f.message)), JSON.stringify(found));
    });

    test('ids: a repeated shape id is flagged', async () => {
      const bytes = await rewrite(out['card-tags.pptx'], 'ppt/slides/slide1.xml', (x) => {
        const ids = [...x.matchAll(/<p:cNvPr\b[^>]*?\bid="(\d+)"/g)].map((m) => m[1]);
        assert.ok(ids.length > 1, 'the fixture needs two shapes');
        return x.replace(`id="${ids[1]}"`, `id="${ids[0]}"`);
      });
      assert.ok((await checkPptxSchema(bytes)).some((f) => f.kind === 'id'));
    });

    test('openxml: the same broken file is flagged by the SDK validator', async (t) => {
      if (!openXml(t)) return;
      const bytes = await rewrite(out['card-tags.pptx'], 'ppt/slides/slide1.xml', (x) => x.replace('<p:cNvPr id="', '<p:cNvPr bogus="1" id="'));
      const file = path.join(tmp, 'broken.pptx');
      fs.writeFileSync(file, bytes);
      const [res] = checkOpenXml([file]);
      assert.ok(res.errors.some((e) => e.id === 'Sch_UndeclaredAttribute'), JSON.stringify(res.errors));
    });

    test('odp: a missing master page and a compressed mimetype are flagged', async () => {
      const noMaster = await rewrite(out['card-tags.odp'], 'content.xml', (x) => x.replace(/draw:master-page-name="[^"]+"/, 'draw:master-page-name="Nope"'));
      assert.ok((await checkOdp(noMaster)).some((f) => /Nope/.test(f.message)));
      const zip = await JSZip.loadAsync(fs.readFileSync(out['card-tags.odp']));
      const compressed = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      assert.ok((await checkOdp(compressed)).some((f) => f.part === 'mimetype'));
    });
  });

  // ci-skip: no CI job installs LibreOffice (apt-get install libreoffice-impress-nogui poppler-utils); run it where soffice
  // is installed. Whether CI should install it is an open question on the PR that added this check.
  describe('LibreOffice round trip', { skip: !(has('soffice') && has('pdftotext', ['-v'])) && 'soffice or pdftotext is not installed' }, () => {
    /** Letters and digits only, lower-cased: what survives any reader's spacing, small caps and line breaking. */
    const squash = (t) => t.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    /** The text one slide must show: every run in its own text boxes, as squashed strings of two characters or more. */
    const expected = (slide) => slide.objects.flatMap((o) => o.text?.paras.flatMap((p) => p.runs.map((r) => squash(r.t))) || []).filter((t) => t.length >= 2);
    let pdfDir;
    const convert = (files) => {
      pdfDir = pdfDir || fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-office-rt-'));
      // A private profile: a user's own LibreOffice settings (or a running instance) must not change the result.
      execFileSync('soffice', [`-env:UserInstallation=file://${path.join(pdfDir, 'profile')}`, '--headless', '--convert-to', 'pdf', '--outdir', pdfDir, ...files], { stdio: 'ignore', timeout: 600_000 });
    };
    const pages = (pdf) => {
      const out = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }).split('\f');
      if (out.length && !out[out.length - 1].trim()) out.pop();
      return out;
    };
    /** Every way a converted file falls short of its deck: a page count that differs, or a run of text a page lacks. */
    const findings = async (pptxBytes, pdf) => {
      const deck = await readPptx(pptxBytes);
      const got = pages(pdf);
      const found = [];
      if (got.length !== deck.slides.length) found.push(`${got.length} pages for ${deck.slides.length} slides`);
      deck.slides.forEach((slide, i) => {
        const page = squash(got[i] || '');
        for (const t of expected(slide)) if (!page.includes(t)) found.push(`slide ${i + 1} lacks "${t}"`);
      });
      return found;
    };

    test('every exported .pptx opens, one page per slide, each page with its slide\'s text', async () => {
      const files = DECKS.map((d) => out[`${d}.pptx`]);
      convert(files);
      for (const f of files) {
        const pdf = path.join(pdfDir, `${path.basename(f, '.pptx')}.pdf`);
        assert.ok(fs.existsSync(pdf), `LibreOffice could not open ${path.basename(f)}`);
        assert.deepEqual(await findings(fs.readFileSync(f), pdf), [], path.basename(f));
      }
    });

    test('ARM THAT FAILS: a slide whose text LibreOffice does not draw, and a slide that is not there, are flagged', async () => {
      const src = out['card-tags.pptx'];
      const pdf = path.join(pdfDir || '', 'card-tags.pdf');
      if (!fs.existsSync(pdf)) convert([src]);
      const bytes = fs.readFileSync(src);
      const deck = await readPptx(bytes);
      const word = expected(deck.slides[0])[0];
      assert.ok(word, 'the fixture needs text on slide 1');
      // Ask a page for text its slide never had: the comparison must notice.
      const zip = await JSZip.loadAsync(bytes);
      const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
      zip.file('ppt/slides/slide1.xml', slide1.replace(/<a:t>([^<]{2,})<\/a:t>/, '<a:t>$1 Zqxjvw</a:t>'));
      assert.ok((await findings(await zip.generateAsync({ type: 'nodebuffer' }), pdf)).some((f) => /slide 1 lacks .*zqxjvw/.test(f)));
      // A PDF one page short.
      const short = path.join(pdfDir, 'short.pdf');
      execFileSync('pdfseparate', ['-f', '1', '-l', '1', pdf, short]);
      assert.ok((await findings(bytes, short)).some((f) => /pages for/.test(f)));
    });
  });
});
