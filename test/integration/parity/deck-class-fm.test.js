/**
 * Integration: deck-wide `class:` directive in front matter.
 *
 * Marpit's native spec is "spot replaces global" — a slide with
 * `<!-- _class: foo -->` discards the deck-wide `class:` value entirely.
 * Lattice intentionally diverges from that semantic via:
 *   - The `deckClassPropagate` plugin (runtime path,
 *     loaded by the vscode Marp preview)
 *   - The front-matter reader in lattice-emulator.js (emulator path)
 *
 * Both paths APPEND the deck-wide class tokens to every section's class
 * list, so `class: dark` + `_class: title` becomes `class="title dark"`.
 * Without this, deck-wide modifiers like `class: dark` are useless on
 * layout-heavy decks where every slide carries a `_class:` directive.
 *
 * This test pins the emulator side.
 *
 * Renders the fixture through the cached emulator helper and inspects
 * the HTML sidecar (avoids parsing PDF). Slow tier because the
 * emulator always runs the Chromium PDF stage as part of its pipeline.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const { ROOT, runEmulator } = require('../../helpers/render');

describe('deck-class-fm', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'deck-class-fm.md');

  test('emulator: front-matter `class:` is applied to every slide and composes with `_class:`', { timeout: 60000 }, () => {
    const pdf = runEmulator(FIXTURE, { timeout: 60000 });
    const htmlPath = pdf.replace(/\.pdf$/, '.html');
    if (!fs.existsSync(htmlPath)) throw new Error(`HTML sidecar missing: ${htmlPath}`);
    const sidecar = fs.readFileSync(htmlPath, 'utf8');

    const sections = [...sidecar.matchAll(/<section[^>]*\bid="(\d+)"[^>]*\bclass="([^"]*)"/g)]
      .map(m => ({ id: m[1], cls: m[2].split(/\s+/).filter(Boolean) }));

    assert.equal(sections.length, 3, 'expected 3 sections');

    // Every slide must carry the deck-wide `dark` token (Lattice append semantic).
    for (const s of sections) {
      assert.ok(s.cls.includes('dark'),
        `slide ${s.id} missing deck-wide 'dark'; got class="${s.cls.join(' ')}"`);
    }

    // Slide 2's per-slide `_class: title` must compose with the deck-wide class,
    // not replace it. Order: per-slide first, deck-wide appended after.
    const slide2 = sections.find(s => s.id === '2');
    assert.ok(slide2.cls.includes('title'),
      `slide 2 lost per-slide 'title'; got class="${slide2.cls.join(' ')}"`);
  });
});
