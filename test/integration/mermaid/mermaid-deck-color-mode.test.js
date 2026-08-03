/**
 * Integration: a deck-wide `color-mode:` reaches the Mermaid bake on classed slides.
 *
 * The static bake has to INFER a diagram's color scheme from source, because mmdc
 * renders it long before any canvas exists. That inference read the mere PRESENCE of
 * a `_class:` directive as an opt-out of the deck's color mode:
 *
 *     classDirectives.length ? /\bdark\b/.test(lastClass) : globalDark
 *
 * `<!-- _class: diagram -->` carries no color token, so on a `color-mode: dark` deck
 * the diagram baked LIGHT and then rendered against the dark canvas — a pale cluster
 * plate carrying the dark canvas's cream ink, i.e. a subgraph label invisible against
 * its own background. Because essentially every real deck names component classes,
 * deck-wide dark reached essentially no diagram.
 *
 * The predicate now mirrors `deckClassPropagate`'s own `slideHasOwnColorMode` guard,
 * off the shared COLOR_MODE_TOKENS list: a slide leaves the deck's scheme only by
 * naming its OWN `dark` / `light`. A component class is not on the color axis.
 *
 * The regression is SILENT — the diagram renders either way, it just renders in the
 * wrong scheme — so these assertions read the bytes Mermaid actually emitted: the
 * `<style>` block mmdc writes into each SVG, where `.cluster rect` carries the
 * resolved fill and `.cluster-label text` the resolved ink.
 *
 * Three diagrams on one `color-mode: dark` deck (test/fixtures/mermaid-deck-color-mode.md):
 *
 *   1. `_class: diagram`        → DARK  (the regression: a component class is not an opt-out)
 *   2. `_class: diagram light`  → LIGHT (a slide's own color token does opt out)
 *   3. `_class: diagram dark`   → DARK  (a slide's own token agreeing with the deck)
 *
 * Diagram 2 is what keeps the fix from over-reaching into "deck mode always wins".
 *
 * Slow tier: three mmdc renders through Puppeteer.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawnSync } = require('child_process');

describe('mermaid-deck-color-mode', () => {
  const ROOT     = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE  = path.join(ROOT, 'test', 'fixtures', 'mermaid-deck-color-mode.md');

  const TIMEOUT = 120000;

  // indaco, resolved. A subgraph box is a CONTAINMENT surface, so it takes the
  // per-theme `--c-container` rung rather than `--bg-alt`.
  const DARK_CLUSTER_BKG     = '#292F35';
  const DARK_CLUSTER_BORDER  = '#3580BE';
  const DARK_LABEL_INK       = '#FFFFFF';
  const LIGHT_CLUSTER_BKG    = '#E8F0F7';
  const LIGHT_CLUSTER_BORDER = '#1F4A6E';
  const LIGHT_LABEL_INK      = '#0A1628';

  let html;

  before(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-mmd-cm-'));
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, path.join(dir, 'deck.pdf'), '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    html = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
  }, { timeout: TIMEOUT });

  // Each embedded SVG's rules are namespaced `#lattice-mmd-<n>`; that prefix is
  // how we address one diagram's baked palette without catching its neighbours'.
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

  const DARK  = { bkg: DARK_CLUSTER_BKG,  border: DARK_CLUSTER_BORDER,  ink: DARK_LABEL_INK };
  const LIGHT = { bkg: LIGHT_CLUSTER_BKG, border: LIGHT_CLUSTER_BORDER, ink: LIGHT_LABEL_INK };

  test('a component class does NOT opt a slide out of the deck-wide dark', { timeout: TIMEOUT }, () => {
    assertScheme(1, DARK,
      '`_class: diagram` carries no color token, so the deck\'s `color-mode: dark` must reach it');
  });

  test("a slide's own `light` token DOES opt out of the deck-wide dark", { timeout: TIMEOUT }, () => {
    assertScheme(2, LIGHT,
      '`_class: diagram light` names its own color token, which wins over the deck');
  });

  test("a slide's own `dark` token agrees with the deck", { timeout: TIMEOUT }, () => {
    assertScheme(3, DARK, '`_class: diagram dark` and the deck both say dark');
  });

  test('no diagram on a dark deck bakes a light cluster plate', { timeout: TIMEOUT }, () => {
    // The symptom, stated as the thing a reader would actually notice: a pale plate
    // under the dark canvas's own cream ink. Diagram 2 opts out deliberately, so this
    // sweeps only the slides that follow the deck.
    for (const n of [1, 3]) {
      const rect = ruleFor(n, '\\.cluster rect');
      assert.doesNotMatch(rect, new RegExp(LIGHT_CLUSTER_BKG, 'i'),
        `diagram ${n} baked the LIGHT cluster plate onto a dark canvas`);
    }
  });
});
