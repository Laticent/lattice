/**
 * Integration: the cluster corner and the edge-label ink, measured on a REAL render.
 *
 * WHY THIS EXISTS ALONGSIDE THE UNIT TEST. `test/unit/mermaid/diagram-cluster-shape
 * .test.js` can only assert that the CSS rule and the shared constant are present
 * in the source — it cannot fail for a semantic error, which is the exact
 * anti-pattern `lib/core/resolve-color-mode.js` and `lib/core/diagram-band.js`
 * were written to call out. Three things this branch claims are only true of
 * RENDERED output, and only this tier can check them:
 *
 *   1. The CSS `rx` reaches the mmdc-produced SVG at all. `border-radius` does
 *      nothing to an SVG <rect>, Mermaid writes no `rx` attribute for a flowchart
 *      cluster, and the whole design rests on the exported HTML's own stylesheet
 *      cascading onto the inline SVG. If that cascade ever stops reaching it, the
 *      unit test stays green and every subgraph goes back to square corners.
 *   2. The exclusion is real: a `.section-N` cluster (kanban) keeps Mermaid's
 *      own rx=5 rather than picking up the containment radius.
 *   3. Edge-label ink is re-paired with the CANVAS. Mermaid paints node and edge
 *      labels from ONE ID-scoped rule, so this can only be verified after the
 *      cascade has resolved — and it is the pair that rendered black-on-black on
 *      the a11y palettes in dark.
 *
 * Measured in a real browser against the exported HTML, i.e. the artifact a
 * reader actually opens, not a jsdom stand-in.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const TIMEOUT = 180000;

const DECK = `---
marp: true
theme: indaco
color-mode: dark
---

<!-- _class: diagram -->

## Nested subgraphs

\`\`\`mermaid
flowchart LR
  subgraph outer["Outer group"]
    subgraph inner["Inner group"]
      A["Alpha"] -->|ships to| B["Beta"]
    end
    B --> C["Gamma"]
  end
\`\`\`

---

<!-- _class: diagram -->

## Kanban keeps its own shape

\`\`\`mermaid
kanban
  Backlog
    t1[One]
  Done
    t2[Two]
\`\`\`
`;

describe('diagram cluster shape — rendered', () => {
  let html;
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-cluster-'));
    const md = path.join(dir, 'deck.md');
    fs.writeFileSync(md, DECK);
    // a11y-deuteranopia on purpose: it is the palette that PINS its categorical
    // tier mode-invariant while the canvas flips, so it is the one where ink meant
    // for a chip and ink meant for the canvas cannot be the same colour. On the
    // other 27 palettes the two tokens resolve equal and the bug is invisible.
    const r = spawnSync(process.execPath, [EMULATOR, md, path.join(dir, 'deck.pdf'), 'a11y-deuteranopia', '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    html = path.join(dir, 'deck.html');
    assert.ok(fs.existsSync(html), 'expected an HTML sidecar to measure');
  });

  after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

  /** Resolve computed styles in a real browser against the exported HTML. */
  async function measure() {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      return await page.evaluate(() => {
        const out = { plain: [], banded: [], edgeInk: null, nodeInk: null };
        for (const g of document.querySelectorAll('g.cluster')) {
          const rect = g.querySelector(':scope > rect');
          if (!rect) continue;
          const row = { cls: g.getAttribute('class'), rx: getComputedStyle(rect).rx, attrRx: rect.getAttribute('rx') };
          (/section-/.test(row.cls) ? out.banded : out.plain).push(row);
        }
        const readable = (el) => {
          // Walk up for the first non-transparent background — the edge label's
          // chip is drawn by an ancestor, not by the span carrying the text.
          let n = el;
          while (n && n !== document.documentElement) {
            const bg = getComputedStyle(n).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
            n = n.parentElement;
          }
          return getComputedStyle(document.querySelector('section')).backgroundColor;
        };
        const edge = document.querySelector('.edgeLabel span, .edgeLabel p');
        if (edge) out.edgeInk = { color: getComputedStyle(edge).color, on: readable(edge) };
        const node = document.querySelector('g.node .nodeLabel, g.node foreignObject div span');
        if (node) out.nodeInk = { color: getComputedStyle(node).color };
        return out;
      });
    } finally {
      await browser.close();
    }
  }

  test('the containment cluster resolves the radius token — CSS rx reaches the inline SVG', { timeout: TIMEOUT }, async () => {
    const m = await measure();
    assert.ok(m.plain.length >= 2, `expected the nested subgraphs, got ${m.plain.length}`);
    for (const c of m.plain) {
      assert.equal(c.attrRx, null, 'Mermaid should still write no rx attribute — the corner is ours');
      assert.match(c.rx, /^\d+(\.\d+)?px$/, `expected a resolved radius, got ${c.rx}`);
      assert.ok(Number.parseFloat(c.rx) > 0, `cluster corner is square (${c.rx}) — the cascade is not reaching the SVG`);
    }
  });

  test('a banded (.section-N) cluster keeps the shape Mermaid gives it', { timeout: TIMEOUT }, async () => {
    const m = await measure();
    assert.ok(m.banded.length >= 1, 'expected the kanban columns');
    for (const c of m.banded) {
      assert.equal(c.attrRx, '5', "kanban's own rx attribute should survive untouched");
      assert.equal(c.rx, '5px', `a banded cluster must not pick up the containment radius (got ${c.rx})`);
    }
  });

  test('the edge label is legible on the surface it is drawn on', { timeout: TIMEOUT }, async () => {
    // The regression in miniature. Mermaid paints node and edge labels from ONE
    // rule, and on this palette the chips are pinned pale while the canvas is
    // black — so ink that suits the node chip is invisible on the canvas. Before
    // the pairing in mermaid.css this measured 1.00:1 and the labels vanished.
    const m = await measure();
    assert.ok(m.edgeInk, 'expected an edge label to measure');
    const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (rgb) => {
      const lin = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const [a, b] = [lum(parse(m.edgeInk.color)), lum(parse(m.edgeInk.on))];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(ratio >= 4.5,
      `edge label ${m.edgeInk.color} on ${m.edgeInk.on} = ${ratio.toFixed(2)}:1 — below AA`);
  });
});
