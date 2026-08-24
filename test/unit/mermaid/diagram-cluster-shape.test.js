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

  test('it survives the trip to the worker as JSON', () => {
    // It used to have to survive SERIALIZATION INTO A DIRECTIVE, where `prune()` dropped
    // empty values and `directiveSafe` filtered themeVariables — a number in a nested
    // block had to come through both untouched or the export silently fell back to
    // Mermaid's built-in 8. #1674 replaced that transport with a JSON job file handed to
    // the render worker, which has no filters at all. The round trip is still worth
    // pinning: the config crosses a process boundary, so anything unserializable (a
    // function, an undefined, a symbol) would vanish silently here exactly as it used to
    // vanish in the directive.
    const cfg = engineInitConfig({ primaryColor: '#fff' });
    const parsed = JSON.parse(JSON.stringify(cfg));
    assert.deepEqual(parsed, cfg, 'the engine config must survive a JSON round trip intact');
    assert.equal(parsed.flowchart.padding, DIAGRAM_NODE_PADDING);
  });

  test('the preview path gets the constant from the SHARED config, not a literal', () => {
    // Stronger than importing the constant, which is what this asserted before #1347:
    // the preview now composes its whole `mermaid.initialize` argument from
    // `engineInitConfig`, so the padding arrives with every other non-palette key
    // rather than being re-stated beside them. A re-typed number could not diverge
    // silently even if someone added one — `init-config-parity.test.js` diffs the two
    // configs — but the composition is the thing to pin here.
    const src = readCode(path.join('lib', 'runtime', 'index.js'));
    assert.match(src, /engineInitConfig\s*\}\s*=\s*require\(/, 'the runtime must import the shared config builder');
    assert.match(src, /const shared = engineInitConfig\(themeVars[^)]*\);/, 'and compose its config from it');
    assert.equal(/padding:\s*15\b/.test(src), false, 'the old divergent literal must be gone');
    assert.equal(/padding:\s*DIAGRAM_NODE_PADDING/.test(src), false,
      're-stating the padding beside the shared config is the second copy this exists to prevent');
  });

  test("an author's own flowchart block still wins, and keeps the padding it did not set", () => {
    // The #1311 guarantee, now applying to geometry as well as color. It used to be OUR
    // merge — the engine directive placed ahead of the author's, mermaid combining them
    // in source order. Since #1674 the engine config goes to `mermaid.initialize` and
    // the author's directive is the only one in the source, so the merge is mermaid's
    // `updateCurrentConfig` layering a directive over siteConfig. Deep either way, and
    // the OBSERVABLE contract is unchanged: naming `curve` overrides `curve` alone.
    //
    // Asserted on the shape both sides actually hand over, rather than on a directive
    // string that no longer exists: the engine's block supplies the padding, and an
    // author's block deep-merges over it.
    const engine = engineInitConfig({ primaryColor: '#fff' });
    const { config: authored } = readAuthorInit('%%{init: {"flowchart":{"curve":"linear"}}}%%\nflowchart LR\n A-->B');
    const merged = { ...engine, ...authored, flowchart: { ...engine.flowchart, ...authored.flowchart } };
    assert.equal(merged.flowchart.curve, 'linear', "the author's key wins");
    assert.equal(merged.flowchart.padding, DIAGRAM_NODE_PADDING, 'and everything they did not set is kept');
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

describe('handDrawnSeed is pinned on BOTH looks, not just handDrawn', () => {
  // WHY THIS IS NOT A HAND-DRAWN CONCERN. The seed used to ride with `look`, on the
  // reasoning that rough.js is the hand-drawn renderer and a classic deck cannot
  // reach it. Mermaid 11 does not honor that boundary: `classBox` builds its box
  // through rough.js on EVERY render and only flattens the wobble afterwards
  // (`if (node.look !== 'handDrawn') { options.roughness = 0 }`). `roughness` is a
  // multiplier applied AFTER the random draws are taken, and rough.js's `_line`
  // spends one draw on `divergePoint = 0.2 + random(o) * 0.2` that positions the two
  // bezier control points along the segment and is never scaled by roughness.
  //
  // So a classic `classDiagram` consulted `handDrawnSeed`, found Mermaid's default
  // `0`, and rough.js reads a falsy seed as "use Math.random()". Both control points
  // stay ON the straight line between the endpoints, so the cubic IS that segment
  // wherever they land: the renders are pixel-identical and the `<path d>` text
  // differs every time. That is the whole of the `classDiagram` byte churn — measured
  // as 12 differing `<path d="…">` lines of 161 on a two-line classic deck, 0 px.
  //
  // Pinning it on both looks is what makes a diagram deck's committed PDF stop
  // rewriting itself, which is what lets a byte oracle watch the diagram path at all.
  test('the classic config states the seed', () => {
    const cfg = engineInitConfig({ primaryColor: '#fff' }, { look: 'classic' });
    assert.equal(cfg.look, undefined, 'a classic render still emits no `look` key');
    assert.ok(Number.isInteger(cfg.handDrawnSeed), 'and it must still carry a seed');
    assert.notEqual(cfg.handDrawnSeed, 0, 'rough.js reads a falsy seed as Math.random()');
  });

  test('the hand-drawn config states the same seed', () => {
    const classic = engineInitConfig({ primaryColor: '#fff' }, { look: 'classic' });
    const hand = engineInitConfig({ primaryColor: '#fff' }, { look: 'handDrawn' });
    assert.equal(hand.look, 'handDrawn');
    assert.equal(hand.handDrawnSeed, classic.handDrawnSeed,
      'one seed for both looks — a per-look seed would re-draw sketch decks for nothing');
  });

  test('the default (no `look` passed) carries the seed too', () => {
    assert.notEqual(engineInitConfig({ primaryColor: '#fff' }).handDrawnSeed, 0);
  });

  test('the seed is not spread with `look`', () => {
    // The source-level pin. Both keys are correct in the object above, but the
    // failure this guards is a REVERT of the shape — folding the seed back into the
    // `look === 'handDrawn'` spread restores the bug with every value assertion
    // above still green on the hand-drawn arm.
    const src = readCode(path.join('lib', 'integrations', 'mermaid', 'init-directive.js'));
    assert.equal(/handDrawnSeed[^\n]*\}\s*:\s*\{\}\)/.test(src), false,
      'the seed must not be conditional on `look` — see this describe block');
  });
});
