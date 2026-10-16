/**
 * Integration: the --present flag marks the PDF to open in full-screen
 * presentation mode. Renders the same 3-slide fixture the export suite uses,
 * once with --present and once without, and asserts the document-catalog hints
 * that Adobe Acrobat/Reader (and most desktop viewers) read:
 *   - /PageMode  /FullScreen   — open directly in presentation view
 *   - /PageLayout /SinglePage  — one slide at a time
 *   - /ViewerPreferences       — clean page-only fallback + FitWindow
 *   - per-page /Trans /Fade    — subtle cross-fade, NO /Dur (presenter-driven)
 * and that WITHOUT the flag the catalog stays bare (opt-in, no surprise
 * full-screen hijack). Slow tier (spawns Chromium).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawnSync } = require('child_process');
const { PDFDocument, PDFName } = require('pdf-lib');

describe('present-mode', () => {
  const ROOT     = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice.js');
  const FIXTURE  = path.join(ROOT, 'test', 'fixtures', 'preview-deck.md');
  const TIMEOUT  = 60000;

  const FM_FIXTURE = path.join(ROOT, 'test', 'fixtures', 'present-frontmatter.md');

  function render(extraArgs = [], fixture = FIXTURE) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-present-')), 'deck.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, fixture, out, '--quiet', ...extraArgs], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    return out;
  }

  test('--present sets the full-screen catalog hints + per-page fade', { timeout: TIMEOUT }, async () => {
    const doc = await PDFDocument.load(fs.readFileSync(render(['--present'])));
    const cat = doc.catalog;

    assert.equal(cat.get(PDFName.of('PageMode'))?.toString(), '/FullScreen');
    assert.equal(cat.get(PDFName.of('PageLayout'))?.toString(), '/SinglePage');

    const vp = cat.get(PDFName.of('ViewerPreferences'));
    assert.ok(vp, 'ViewerPreferences dict should be present');
    assert.equal(vp.get(PDFName.of('NonFullScreenPageMode'))?.toString(), '/UseNone');
    assert.equal(vp.get(PDFName.of('FitWindow'))?.toString(), 'true');

    const pages = doc.getPages();
    assert.ok(pages.length >= 1, 'deck should have pages');
    for (const pg of pages) {
      const trans = pg.node.get(PDFName.of('Trans'));
      assert.ok(trans, 'every page should carry a transition');
      assert.equal(trans.get(PDFName.of('S'))?.toString(), '/Fade');
      assert.equal(trans.get(PDFName.of('D'))?.toString(), '0.4');
      // Presenter-driven: no auto-advance duration on the page.
      assert.equal(pg.node.get(PDFName.of('Dur')), undefined, 'no /Dur (no kiosk auto-advance)');
    }
  });

  test('without --present the catalog stays bare (opt-in)', { timeout: TIMEOUT }, async () => {
    const doc = await PDFDocument.load(fs.readFileSync(render()));
    assert.equal(doc.catalog.get(PDFName.of('PageMode')), undefined);
    assert.equal(doc.catalog.get(PDFName.of('PageLayout')), undefined);
    assert.equal(doc.getPages()[0].node.get(PDFName.of('Trans')), undefined);
  });

  test('present: true front-matter sets the hints with no CLI flag', { timeout: TIMEOUT }, async () => {
    // Rendered WITHOUT --present; the key alone must drive it (mirrors --fluid).
    const doc = await PDFDocument.load(fs.readFileSync(render([], FM_FIXTURE)));
    assert.equal(doc.catalog.get(PDFName.of('PageMode'))?.toString(), '/FullScreen');
    assert.equal(doc.catalog.get(PDFName.of('PageLayout'))?.toString(), '/SinglePage');
    const pages = doc.getPages();
    assert.ok(pages.length >= 2, 'fixture has ≥2 pages');
    for (const pg of pages) {
      assert.equal(pg.node.get(PDFName.of('Trans'))?.get(PDFName.of('S'))?.toString(), '/Fade');
    }
  });
});
