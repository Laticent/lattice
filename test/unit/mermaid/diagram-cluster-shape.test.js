/**
 * Unit: the Mermaid subgraph box's corner and padding — one definition, both paths.
 *
 * Two values decide how a cluster is SHAPED (as opposed to coloured, which is the
 * theme map's job), and each has a trap this file pins down:
 *
 *   1. The CORNER is a CSS `rx`/`ry` in `mermaid.css`. `border-radius` does
 *      nothing to an SVG <rect>, and Mermaid writes no `rx` attribute for a
 *      flowchart cluster, so CSS is the only lever — and because the mmdc SVG is
 *      embedded inline in the exported HTML, that one rule reaches BOTH paths.
 *      The value must stay in SVG user space: a `cqi` would be resolved against
 *      the slide and then re-scaled by the viewBox fit, landing at a different
 *      size on every diagram.
 *
 *   2. The node PADDING is Mermaid config, so it has to be set on each path — and
 *      it was set on only one. The export took Mermaid's built-in 8 while the
 *      preview set 15. One constant now, asserted at both call sites.
 *
 * And one anti-assertion: `subGraphTitleMargin` must appear on NEITHER path. It
 * is the only config that reaches the cluster's internal space and it breaks
 * NESTED subgraphs — Mermaid grows the outer box but does not push the child
 * cluster down with it, so the inner rect paints over the outer title.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DIAGRAM_NODE_PADDING,
  engineInitConfig,
  engineInitDirective,
  withEngineInit,
  readAuthorInit,
} = require('../../../lib/integrations/mermaid/init-directive');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
/**
 * Source with comments stripped.
 *
 * Required, not tidiness: the retired settings are DESCRIBED in the comments
 * that replaced them ("`subGraphTitleMargin: { top: 10, bottom: 100 }` was
 * here"), so a naive text search finds the explanation and reports the defect
 * still present. Removing the note to appease the grep would be exactly the
 * wrong fix.
 */
const readCode = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('cluster corner — the CSS rx rule', () => {
  const MERMAID_CSS = read(path.join('lib', 'integrations', 'mermaid', 'mermaid.css'));
  const TOKENS = read(path.join('lib', 'base', 'base.tokens.css'));

  test('the rule exists, uses the token, and sets BOTH rx and ry', () => {
    const rule = /g\.cluster:not\(\[class\*="section-"\]\)\s*>\s*rect\s*\{([^}]*)\}/.exec(MERMAID_CSS);
    assert.ok(rule, 'mermaid.css must round the containment-tier cluster rect');
    assert.match(rule[1], /\brx:\s*var\(--diagram-cluster-radius\)/);
    assert.match(rule[1], /\bry:\s*var\(--diagram-cluster-radius\)/, 'ry too — rx alone leaves an elliptical corner in some engines');
  });

  test('it is scoped OFF the categorical band — kanban / timeline / mindmap keep their own shape', () => {
    // `.section-N` clusters are painted from --cat-* by the band cycle, not from
    // --c-container, and Mermaid already rounds them at rx=5. Whether they should
    // adopt this radius is a question for a human, not a selector's side effect.
    const rule = /g\.cluster([^{]*)>\s*rect\s*\{[^}]*--diagram-cluster-radius/.exec(MERMAID_CSS);
    assert.ok(rule, 'the radius rule must be findable');
    assert.match(rule[1], /:not\(\[class\*="section-"\]\)/);
  });

  test('the radius token is declared in SVG USER SPACE — never a container unit', () => {
    const decl = /--diagram-cluster-radius:\s*([^;]+);/.exec(TOKENS);
    assert.ok(decl, '--diagram-cluster-radius must be declared in base.tokens.css');
    const value = decl[1].trim();
    assert.match(value, /^\d+(\.\d+)?px$/, `expected a plain px length, got ${value}`);
    // The trap: `rx` is an SVG GEOMETRY property, read in the diagram's own
    // viewBox coordinates. A container-relative unit resolves against the slide
    // and is then re-scaled by the viewBox fit, so the corner would come out a
    // different size on every diagram in the deck.
    for (const unit of ['cqi', 'cqw', 'cqh', 'cqb', 'cqmin', 'cqmax', 'em', 'rem', '%']) {
      assert.equal(value.includes(unit), false, `--diagram-cluster-radius must not use ${unit}`);
    }
  });

  test('the rule survives into the built bundle both paths load', () => {
    // dist/lattice.css is what the emulator inlines into the exported HTML and
    // what the preview registers as a theme. A rule that only exists in source
    // reaches nothing.
    assert.match(read(path.join('dist', 'lattice.css')), /--diagram-cluster-radius/);
  });
});

describe('node padding — one constant, both render paths', () => {
  test('the constant is a plain number of SVG user units', () => {
    assert.equal(typeof DIAGRAM_NODE_PADDING, 'number');
    assert.ok(DIAGRAM_NODE_PADDING > 0 && Number.isFinite(DIAGRAM_NODE_PADDING));
  });

  test('the PDF path carries it in the engine init config', () => {
    const cfg = engineInitConfig({ primaryColor: '#fff' });
    assert.equal(cfg.flowchart.padding, DIAGRAM_NODE_PADDING);
  });

  test('it survives serialization into the emitted %%{init}%% directive', () => {
    // `prune()` drops empty values, and `directiveSafe` filters themeVariables —
    // a number in a nested block has to come through both untouched, or the PDF
    // path silently falls back to Mermaid's built-in 8.
    const directive = engineInitDirective(engineInitConfig({ primaryColor: '#fff' }));
    const parsed = JSON.parse(directive.replace(/^%%\{init:\s*/, '').replace(/\}%%$/, ''));
    assert.equal(parsed.flowchart.padding, DIAGRAM_NODE_PADDING);
  });

  test('the preview path reads the same constant, not a literal', () => {
    const src = readCode(path.join('lib', 'runtime', 'index.js'));
    assert.match(src, /DIAGRAM_NODE_PADDING\s*\}\s*=\s*require\(/, 'the runtime must import the shared constant');
    assert.match(src, /padding:\s*DIAGRAM_NODE_PADDING/, 'the runtime must use it, not a re-typed number');
    assert.equal(/padding:\s*15\b/.test(src), false, 'the old divergent literal must be gone');
  });

  test("an author's own flowchart block still wins, and keeps the padding it did not set", () => {
    // The #1311 guarantee, now applying to geometry as well as colour: mermaid
    // merges init directives in source order with the later winning, and the merge
    // is deep — so naming `curve` overrides `curve` alone.
    const authored = withEngineInit(
      '%%{init: {"flowchart":{"curve":"linear"}}}%%\nflowchart LR\n A-->B',
      engineInitConfig({ primaryColor: '#fff' }),
    );
    const { config } = readAuthorInit(authored);
    assert.equal(config.flowchart.curve, 'linear', "the author's key wins");
    assert.equal(config.flowchart.padding, DIAGRAM_NODE_PADDING, 'and everything they did not set is kept');
  });
});

describe('subGraphTitleMargin is set on NEITHER path', () => {
  // It is the only Mermaid config that reaches the cluster's internal space, and
  // it is a trap for NESTED subgraphs: Mermaid grows the outer box but does not
  // push the child cluster down with it, so the inner rect paints over the outer
  // title. Measured at 10/100 — outer rect y=-47, outer label at y=-37, inner
  // rect at y=-27, i.e. through the middle of the label. `bottom` also adds that
  // many user units of dead space inside the box.
  test('not in the engine init config', () => {
    const cfg = engineInitConfig({ primaryColor: '#fff' });
    assert.equal(cfg.flowchart.subGraphTitleMargin, undefined);
  });

  test('not in the runtime config either — it carried 10/100 and clipped every subgraph title', () => {
    assert.equal(/subGraphTitleMargin:\s*\{/.test(readCode(path.join('lib', 'runtime', 'index.js'))), false);
  });
});
