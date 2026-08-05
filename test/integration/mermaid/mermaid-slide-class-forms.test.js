/**
 * Integration: every way a slide can NAME its class reaches the Mermaid bake.
 *
 * The static bake infers a diagram's color scheme from SOURCE — mmdc renders the
 * SVG long before a `<section>` exists — by reconstructing the slide split and each
 * slide's class (`lib/core/slide-class-spans.js`). That reconstruction is a second
 * answer to a question the renderer already answers, and it disagreed with the
 * renderer in three ways. All three produce the same silent symptom: the diagram
 * renders, it just renders in the wrong scheme, against a chip that is in the right
 * one.
 *
 * Five diagrams on one deck (`test/fixtures/mermaid-slide-class-forms.md`), each a
 * shape the source side used to get wrong:
 *
 *   1. `_class: diagram`               → LIGHT  the deck default, and the control
 *   2. GLOBAL `<!-- class: diagram dark -->`
 *                                      → DARK   the bare `class` form was never read
 *   3. (no directive at all)           → DARK   a global carries forward; only the
 *                                               spot `_class` form is per-slide
 *   4. `_class: diagram dark`, plus a `` `<!-- _class: kpi -->` `` quoted in a bullet
 *                                      → DARK   a raw text scan read the quoted one,
 *                                               and the last on a slide wins
 *   5. `_class: diagram dark`, plus a `$$…$$` equation before the fence
 *                                      → DARK   the equation's lone `=` line parsed
 *                                               as a setext H1 — a slide boundary
 *                                               under `split: headings` — so the
 *                                               fence was attributed to a slide that
 *                                               does not render
 *
 * On `origin/main` at aa2ca691 this deck logs `light, light, light, light, light`:
 * four dark sections carrying light-baked ink. Diagram 1 is what keeps the fix from
 * over-reaching into "everything is dark now".
 *
 * The assertions read the bytes Mermaid actually emitted — the `<style>` block mmdc
 * writes into each SVG, where `.cluster rect` carries the resolved fill and
 * `.cluster-label text` the resolved ink — because the regression is invisible to
 * anything that only checks the diagram rendered.
 *
 * Slow tier: five mmdc renders through Puppeteer.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawnSync } = require('child_process');

describe('mermaid-slide-class-forms', () => {
  const ROOT     = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE  = path.join(ROOT, 'test', 'fixtures', 'mermaid-slide-class-forms.md');

  const TIMEOUT = 180000;

  // indaco, resolved. A subgraph box is a CONTAINMENT surface, so it takes the
  // per-theme `--c-container` rung rather than `--bg-alt`. Same constants as
  // mermaid-deck-color-mode.test.js — same theme, same rung.
  const DARK  = { bkg: '#292F35', border: '#3580BE', ink: '#FFFFFF' };
  const LIGHT = { bkg: '#E8F0F7', border: '#1F4A6E', ink: '#0A1628' };

  let html;

  before(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-mmd-forms-'));
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, path.join(dir, 'deck.pdf'), '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    html = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
  }, { timeout: TIMEOUT });

  // Each embedded SVG's rules are namespaced `#lattice-mmd-<n>`; that prefix is
  // how we address one diagram's baked palette without catching its neighbors'.
  function ruleFor(diagram, selector) {
    const re = new RegExp(`#lattice-mmd-${diagram}\\s+${selector}\\s*\\{([^}]*)\\}`);
    const m = re.exec(html);
    assert.ok(m, `no \`${selector}\` rule for diagram ${diagram}`);
    return m[1];
  }

  function assertScheme(diagram, { bkg, border, ink }, why) {
    const rect = ruleFor(diagram, '\\.cluster rect');
    assert.match(rect, new RegExp(`fill:\\s*${bkg}`, 'i'), why);
    assert.match(rect, new RegExp(`stroke:\\s*${border}`, 'i'), why);
    const label = ruleFor(diagram, '\\.cluster-label text');
    assert.match(label, new RegExp(`fill:\\s*${ink}`, 'i'), why);
  }

  test('the control: a slide naming no color token takes the deck default', { timeout: TIMEOUT }, () => {
    assertScheme(1, LIGHT,
      'diagram 1 precedes every directive in the deck — if it goes dark, the fix over-reached');
  });

  test('a GLOBAL `<!-- class: … -->` reaches the bake on its own slide', { timeout: TIMEOUT }, () => {
    assertScheme(2, DARK,
      'Marp has two class forms and only the spot `_class` one was read, so a deck that '
      + 'switches canvas mid-way baked every later diagram for the canvas it left');
  });

  test('a global carries forward to a slide that declares nothing', { timeout: TIMEOUT }, () => {
    assertScheme(3, DARK,
      'a bare `class:` directive is a RUNNING global — it is the spot `_class` form, not '
      + 'this one, that stops at its own slide');
  });

  test('a directive quoted as prose does not override the slide', { timeout: TIMEOUT }, () => {
    assertScheme(4, DARK,
      '`<!-- _class: kpi -->` inside inline code is a `code_inline` token, not a directive — '
      + 'a deck documenting its own syntax must not be re-classed by its own examples');
  });

  test('a `$$…$$` equation does not invent a slide boundary', { timeout: TIMEOUT }, () => {
    assertScheme(5, DARK,
      "the equation's lone `=` line is a setext H1 to a parser without the math_block rule, "
      + 'and under `split: headings` a heading starts a slide — so the fence after it was '
      + 'attributed to a slide the engine never rendered');
  });

  test('no diagram on a dark section baked a light cluster plate', { timeout: TIMEOUT }, () => {
    // The symptom as a reader would notice it: a pale plate under the dark canvas's
    // own cream ink. Diagram 1 is deliberately light, so this sweeps 2–5.
    for (const n of [2, 3, 4, 5]) {
      const rect = ruleFor(n, '\\.cluster rect');
      assert.doesNotMatch(rect, new RegExp(LIGHT.bkg, 'i'),
        `diagram ${n} baked the LIGHT cluster plate onto a dark section`);
    }
  });
});
