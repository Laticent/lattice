/**
 * A deck that QUOTES a section tag still exports every slide.
 *
 * The emulator used to split the engine's document with its own regex walk,
 * `/<section\b[^>]*>|<\/section>/gi`, a private copy of what
 * `lib/core/split-sections.js` does. That regex cannot tell markup from text, so
 * a `<section` inside an HTML comment or inside `<style>` text moved its depth
 * counter, the walk found ZERO slides, and the export shipped a one-page PDF
 * with exit code 0 and no warning. Measured on this fixture before the fix:
 * 1 page, and 0 sections in the `.html` export.
 *
 * A second copy of the same walk sat under the per-slide kernels
 * (`mapSections`, lib/core/section-walk.js, plus qr-card's `walkSections` and
 * svg-a11y-names' `sectionSpans`). With the page count fixed, the same deck still
 * lost the masthead band on every slide from the quoting one on: the engine built
 * 0 bands where the deck without the quote builds 2. All of them now walk the
 * shared kernel (HARD RULE #1).
 *
 * Slide four is the shape an independent checker found in the first cut of the
 * fix: an UNTERMINATED comment inside a raw HTML block. The tokenizer read it as a
 * comment to end of file, so the new walk dropped every later slide where the old
 * regex had not. It is now read as text, as an unclosed `<style>` already was. ASSERTED ON THE REAL
 * CLI (HARD RULE #23): the unit tier cannot see this defect by construction,
 * because the engine's own output was already correct — the loss happened in
 * the emulator's split, after the engine returned.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pageCount } = require('../../helpers/pdf');

describe('raw-section-quoted', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'raw-section-quoted.md');
  const TIMEOUT = 120000;

  function exportTo(ext) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-raw-section-')), `deck.${ext}`);
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    return out;
  }

  test('the PDF carries one page per slide', { timeout: TIMEOUT }, () => {
    assert.equal(pageCount(exportTo('pdf')), 4,
      'a <section quoted in a comment or <style> collapsed the deck');
  });

  test('the HTML export carries every slide, in order, with its content', { timeout: TIMEOUT }, () => {
    const html = fs.readFileSync(exportTo('html'), 'utf8');
    const slides = [...html.matchAll(/data-lattice-slide="(\d+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(slides)], ['1', '2', '3', '4']);
    for (const text of ['Slide one', 'The note above quotes', 'The style block above quotes', 'opens a comment that never closes']) {
      assert.ok(html.includes(text), `lost slide content: ${text}`);
    }
 
    // The count alone is not the claim. The per-slide kernels walk the sections
    // too (`mapSections`, lib/core/section-walk.js), and when that walk stopped at
    // the quoted tag every later slide lost its Form chrome while the page count
    // stayed right. Slides two to four each carry an h2, so each owes a band.
    const bands = html.match(/class="cell-masthead"/g) || [];
    assert.equal(bands.length, 3, 'a slide after the first trap lost its masthead band');
  });
});
