/**
 * Integration: an author `%%{init}%%` directive does not cost the palette (#1311).
 *
 * The regression this pins is silent — the diagram renders either way, it just
 * renders in Mermaid's stock colors. So the assertions read the actual bytes
 * Mermaid emitted: the `<style>` block mmdc writes into each SVG, where
 * `.cluster rect` carries the resolved fill.
 *
 * Three diagrams, one graph, in test/fixtures/mermaid-init-merge.md:
 *
 *   1. control (no directive)        → indaco tokens
 *   2. `{'flowchart':{'curve':…}}`   → indaco tokens, AND the curve applies
 *   3. `{'theme':'forest'}`          → forest, untouched (explicit opt-out)
 *
 * `#ffffde` — Mermaid's stock clusterBkg, the yellow that made the bug visible
 * in the first place — is asserted absent from the whole document.
 *
 * Slow tier: three mmdc renders through Puppeteer.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawnSync } = require('child_process');

describe('mermaid-init-merge', () => {
  const ROOT     = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE  = path.join(ROOT, 'test', 'fixtures', 'mermaid-init-merge.md');

  const TIMEOUT = 120000;

  // indaco, resolved: --bg-alt / --diagram-stroke / --text-heading.
  const INDACO_CLUSTER_BKG    = '#F2F5FA';
  const INDACO_CLUSTER_BORDER = '#1F4A6E';
  const INDACO_LABEL_INK      = '#0A1628';
  // Mermaid stock (theme 'base' with nothing injected).
  const STOCK_CLUSTER_BKG     = '#ffffde';

  let html;

  before(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-mmd-init-'));
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, path.join(dir, 'deck.pdf'), '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    html = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
  }, { timeout: TIMEOUT });

  // Each embedded SVG's rules are namespaced `#lattice-mmd-<n>` so diagrams
  // can't step on each other; that prefix is also how we address them here.
  function ruleFor(diagram, selector) {
    const re = new RegExp(`#lattice-mmd-${diagram}\\s+${selector}\\s*\\{([^}]*)\\}`);
    const m = re.exec(html);
    assert.ok(m, `no \`${selector}\` rule for diagram ${diagram}`);
    return m[1];
  }

  test('control: no directive → the engine palette resolves (baseline)', { timeout: TIMEOUT }, () => {
    const rect = ruleFor(1, '\\.cluster rect');
    assert.match(rect, new RegExp(`fill:\\s*${INDACO_CLUSTER_BKG}`, 'i'));
    assert.match(rect, new RegExp(`stroke:\\s*${INDACO_CLUSTER_BORDER}`, 'i'));
  });

  test('a color-neutral `%%{init}%%` keeps the engine palette', { timeout: TIMEOUT }, () => {
    // THE regression. Before the fix this read `fill:#ffffde;stroke:#aaaa33`.
    const rect = ruleFor(2, '\\.cluster rect');
    assert.match(rect, new RegExp(`fill:\\s*${INDACO_CLUSTER_BKG}`, 'i'),
      'cluster fill is the theme token, not Mermaid stock');
    assert.match(rect, new RegExp(`stroke:\\s*${INDACO_CLUSTER_BORDER}`, 'i'));
    // Label ink went stock (#333) in the same failure.
    assert.match(ruleFor(2, '\\.cluster-label text'), new RegExp(`fill:\\s*${INDACO_LABEL_INK}`, 'i'));
  });

  test('the author directive still takes effect (curve: linear → no beziers)', { timeout: TIMEOUT }, () => {
    // Merging must not mean ignoring: the whole point is that the author gets
    // their layout option AND the palette. `curve: linear` emits pure `L`
    // segments where the default (basis) emits cubic `C` segments.
    const edgePaths = (n) => {
      // Each SVG root carries `id="lattice-mmd-<n>"`; slice from there to the
      // next root (or EOF) so the paths read belong to that diagram only.
      const start = html.indexOf(`id="lattice-mmd-${n}"`);
      assert.ok(start > 0, `diagram ${n} not found in the HTML`);
      const next = html.indexOf(`id="lattice-mmd-${n + 1}"`);
      const chunk = html.slice(start, next > start ? next : undefined);
      return [...chunk.matchAll(/ d="(M[^"]{30,})"/g)].map((m) => m[1]);
    };
    const control = edgePaths(1);
    const linear  = edgePaths(2);
    assert.ok(control.length > 0 && linear.length > 0, 'both diagrams emitted edge paths');
    assert.ok(control.some((d) => d.includes('C')), 'the default curve emits bezier segments');
    assert.ok(linear.every((d) => !d.includes('C')), 'curve:linear emits no bezier segments');
  });

  test('an author-pinned Mermaid theme still wins outright', { timeout: TIMEOUT }, () => {
    // `theme: forest` is an explicit opt-out of the palette; the engine stands
    // down rather than painting over it.
    const rect = ruleFor(3, '\\.cluster rect');
    assert.match(rect, /fill:\s*#cdffb2/i, 'forest cluster fill survived');
    assert.doesNotMatch(rect, new RegExp(INDACO_CLUSTER_BKG, 'i'));
  });

  test("Mermaid's stock cluster yellow appears nowhere in the deck", { timeout: TIMEOUT }, () => {
    assert.doesNotMatch(html, new RegExp(STOCK_CLUSTER_BKG, 'i'));
  });
});
