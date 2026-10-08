/**
 * Integration: tabular figures survive the shared PDF writer, in place and in the text layer.
 *
 * `tnum` (the glossary table, tables, KPIs, charts) swaps each digit, and the comma and period,
 * for a tabular alternate that no cmap entry names. pdf-lib wrote /W widths and ToUnicode for
 * the cmap's glyphs only, so the alternates took the default 1000-unit width ("24 hours" drew as
 * "2 4hours") and had no Unicode, so pdftotext and copy-paste dropped them. `coverShapedGlyphs`
 * (lib/core/pdf-compose/write-pdf.mjs) now lists every glyph the text encodes.
 *
 * The check renders one fixture twice: through the writer (the CLI default) and through
 * Chrome's printer (`--chrome-pdf`), whose text sits where the screen drew it. Every word with
 * a digit must copy out the same and span the same box, to half a point.
 *
 * FALSIFIABLE: without `coverShapedGlyphs`, the writer's text layer holds none of the digit
 * words and the first assertion fails. Needs Chromium and poppler (pdftotext).
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'tabular-digits.md');
const DIGIT_WORDS = ['24', '30-day', '1,110', '2026.'];

/** Every word with a digit in it, as `text -> { xMin, xMax }`. */
function digitWords(pdf) {
  const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
  const out = {};
  for (const m of xml.matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">([^<]+)<\/word>/g)) {
    if (/\d/.test(m[3])) out[m[3]] = { xMin: +m[1], xMax: +m[2] };
  }
  return out;
}

describe('pdf-tabular-digits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-tnum-'));
  const writer = path.join(dir, 'writer.pdf');
  const chrome = path.join(dir, 'chrome.pdf');
  const run = (out, ...flags) => spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet', ...flags], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const rw = run(writer);
  const rc = run(chrome, '--chrome-pdf');
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('the CLI renders the fixture both ways', () => {
    assert.equal(rw.status, 0, `writer render failed: ${rw.stderr}`);
    assert.equal(rc.status, 0, `chrome render failed: ${rc.stderr}`);
    assert.doesNotMatch(rw.stderr, /falling back|chrome-pdf/i, 'the writer drew it, not the Chrome fallback');
  });

  test('tabular digits copy out of the writer PDF as the same digits', () => {
    const text = execFileSync('pdftotext', [writer, '-'], { encoding: 'utf8' });
    assert.match(text, /within 24 hours\./);
    assert.match(text, /past the 30-day onboarding period, 1,110 seats in 2026\./);
    assert.deepEqual(Object.keys(digitWords(writer)).sort(), [...DIGIT_WORDS].sort());
  });

  test('tabular digits draw where the screen draws them', () => {
    const w = digitWords(writer), c = digitWords(chrome);
    for (const word of DIGIT_WORDS) {
      assert.ok(c[word], `Chrome's PDF holds "${word}"`);
      assert.ok(w[word], `the writer's PDF holds "${word}"`);
      assert.ok(Math.abs(w[word].xMin - c[word].xMin) < 0.5, `"${word}" starts at ${w[word].xMin} pt, the screen at ${c[word].xMin}`);
      assert.ok(Math.abs(w[word].xMax - c[word].xMax) < 0.5, `"${word}" ends at ${w[word].xMax} pt, the screen at ${c[word].xMax}`);
    }
  });
});
