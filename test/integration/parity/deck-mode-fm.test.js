/**
 * Integration: deck-wide `finish:` register in front matter.
 *
 * `finish:` is a Lattice extension (Marpit has no native key): the three render
 * paths read it, map it to CSS class tokens (lib/core/resolve-finish.js), and
 * APPEND those to every section — the same compose-not-replace semantic as the
 * deck-wide `class:` directive. It composes with the separate `drawing:` axis
 * (lib/core/resolve-drawing.js): `drawing: sketch` + `finish: atrium` +
 * `_class: cards-grid` becomes `class="cards-grid sketch finish finish-atrium"`.
 *
 * This pins the emulator side (mirrors deck-class-fm.test.js); the marp-cli
 * plugin path applies the identical merge via deckClassPropagate in
 * lib/integrations/markdown-it/plugins.js (unit-covered in parsing/markdown-it-plugins).
 *
 * Renders the fixture through the cached emulator helper and inspects the HTML
 * sidecar (avoids parsing PDF). Slow tier because the emulator always runs the
 * Chromium PDF stage.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const { ROOT, runEmulator } = require('../../helpers/render');

describe('deck-mode-fm', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'deck-mode-fm.md');

  test('emulator: `drawing: sketch` + `finish: atrium` both propagate, compose with `_class:`, and honor a per-slide opt-out', { timeout: 60000 }, () => {
    const pdf = runEmulator(FIXTURE, { timeout: 60000 });
    const htmlPath = pdf.replace(/\.pdf$/, '.html');
    if (!fs.existsSync(htmlPath)) throw new Error(`HTML sidecar missing: ${htmlPath}`);
    const sidecar = fs.readFileSync(htmlPath, 'utf8');

    const sections = [...sidecar.matchAll(/<section[^>]*\bid="(\d+)"[^>]*\bclass="([^"]*)"/g)]
      .map(m => ({ id: m[1], cls: m[2].split(/\s+/).filter(Boolean) }));

    assert.equal(sections.length, 3, 'expected 3 sections');

    // Every slide carries the finish (backdrop) tokens — a separate axis from mode.
    for (const s of sections) {
      assert.ok(s.cls.includes('finish') && s.cls.includes('finish-atrium'),
        `slide ${s.id} missing finish backdrop; got class="${s.cls.join(' ')}"`);
    }

    // Slides 1 + 2 carry the deck-wide `sketch` mode; slide 2 also keeps its
    // per-slide `cards-grid` (compose, not replace).
    const slide1 = sections.find(s => s.id === '1');
    assert.ok(slide1.cls.includes('sketch'), `slide 1 missing mode 'sketch'; got "${slide1.cls.join(' ')}"`);
    const slide2 = sections.find(s => s.id === '2');
    assert.ok(slide2.cls.includes('cards-grid'), `slide 2 lost 'cards-grid'; got "${slide2.cls.join(' ')}"`);
    assert.ok(slide2.cls.includes('sketch'), `slide 2 missing mode 'sketch'; got "${slide2.cls.join(' ')}"`);

    // Slide 3's per-slide `no-sketch` opts OUT of the deck mode (no `sketch`),
    // but keeps the deck-wide finish backdrop.
    const slide3 = sections.find(s => s.id === '3');
    assert.ok(!slide3.cls.includes('sketch'), `slide 3 opted out; should NOT be sketch; got "${slide3.cls.join(' ')}"`);
    assert.ok(slide3.cls.includes('finish-atrium'), `slide 3 should keep the backdrop; got "${slide3.cls.join(' ')}"`);
  });
});
