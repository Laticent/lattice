/**
 * Integration: rendering the same deck twice produces the same BYTES.
 *
 * Committed PDFs are 67.5% of the tracked tree, and a re-render with zero
 * visual change used to write a whole new ~1.5 MB blob into git because the
 * clock had moved: two renders of `examples/sketch.md` at one commit differed
 * in exactly four bytes, all of them digits inside `/CreationDate` and
 * `/ModDate`. `lib/core/pdf-timestamps.js` pins them.
 * (engineering/decisions/2026-08-16-render-format-cost-assessment.md §5, L0.)
 *
 * Deliberately spawns the CLI rather than going through `test/helpers/render.js`:
 * that helper caches by input hash and would hand back the SAME FILE twice,
 * which passes a byte-equality test without rendering anything.
 *
 * The `--present` case is not redundant with the vector one. It routes through
 * pdf-lib, whose `save()` packs the Info dictionary into a Flate-compressed
 * object stream — the timestamp is still in there, just invisible to a
 * byte-level scan, which is exactly how the first version of this fix passed on
 * the vector path while leaving 1,247 bytes churning here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

describe('pdf-reproducible', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  // The 3-slide no-Mermaid fixture the other export tests use: enough of a real
  // deck to carry embedded fonts, cheap enough to render twice per case.
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'preview-deck.md');
  // Speaker notes drag the render through the pdf-lib annotation pass.
  const NOTES_FIXTURE = path.join(ROOT, 'test', 'fixtures', 'speaker-notes.md');
  const TIMEOUT = 120000;

  const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-repro-'));

  function render(fixture, out, extraArgs = [], env = {}) {
    const r = spawnSync(process.execPath, [EMULATOR, fixture, out, '--quiet', ...extraArgs], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    return fs.readFileSync(out);
  }

  /** Render `fixture` twice into separate files and assert the bytes match. */
  function assertReproducible(fixture, extraArgs, label) {
    const dir = tmpDir();
    const a = render(fixture, path.join(dir, 'a.pdf'), extraArgs);
    const b = render(fixture, path.join(dir, 'b.pdf'), extraArgs);
    assert.equal(a.length, b.length, `${label}: file length moved between renders`);
    assert.ok(a.equals(b), `${label}: identical input rendered to different bytes`);
    return a;
  }

  /**
   * A pinned PDF that no longer parses is worse than a churning one: the xref
   * table stores absolute byte offsets, so a length-changing edit corrupts the
   * file in a way many viewers still open. Prove poppler can still read it.
   */
  function assertStillSound(bytes, expectedPages, label) {
    const dir = tmpDir();
    const f = path.join(dir, 'check.pdf');
    fs.writeFileSync(f, bytes);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', `${label}: not a PDF`);
    const info = execFileSync('pdfinfo', [f], { encoding: 'utf8' });
    assert.match(info, new RegExp(`Pages:\\s*${expectedPages}\\b`), `${label}: page count changed\n${info}`);
    return info;
  }

  test('the vector path renders identical bytes twice', { timeout: TIMEOUT }, () => {
    const bytes = assertReproducible(FIXTURE, [], 'vector');
    assertStillSound(bytes, 3, 'vector');
  });

  test('the pdf-lib post-passes render identical bytes twice', { timeout: TIMEOUT }, () => {
    // --present rewrites the catalog and re-saves through pdf-lib, which is
    // where the compressed-Info-dict churn lived.
    const bytes = assertReproducible(NOTES_FIXTURE, ['--present'], 'present');
    const info = assertStillSound(bytes, 4, 'present');
    assert.match(info, /CreationDate:\s+Thu Jan\s+1 00:00:00 1970/, `dates not pinned:\n${info}`);
  });

  test('SOURCE_DATE_EPOCH sets the pinned instant', { timeout: TIMEOUT }, () => {
    // The reproducible-builds convention, so a release can stamp a real date
    // and still get stable bytes.
    const out = path.join(tmpDir(), 'sde.pdf');
    render(FIXTURE, out, [], { SOURCE_DATE_EPOCH: '1750000000' });
    const info = execFileSync('pdfinfo', [out], { encoding: 'utf8' });
    assert.match(info, /CreationDate:\s+Sun Jun 15 15:06:40 2025/, `SOURCE_DATE_EPOCH ignored:\n${info}`);
    assert.match(info, /ModDate:\s+Sun Jun 15 15:06:40 2025/, `SOURCE_DATE_EPOCH ignored:\n${info}`);
  });
});
