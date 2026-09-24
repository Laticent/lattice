/**
 * Unit: `tagMermaidMotion` — the roles that let `motion:` animate a Mermaid diagram.
 *
 * The chart motion layer animates any SVG whose parts declare `data-anima-role`. Mermaid emits
 * none, so `lib/integrations/mermaid/motion-roles.js` writes them from the classes Mermaid already
 * uses. The fixtures below are TRIMMED Mermaid 11 output: the same element and class structure
 * the real renderer writes, with the geometry and labels cut down. Each arm pins one family.
 *
 * Three invariants beyond "the right parts get tagged":
 *   - build ORDER puts boxes before the arrows between them, although Mermaid paints the arrows
 *     first (they sit under the boxes);
 *   - a family we do not animate gets NO roles, so it stays a still picture;
 *   - the function is closure-free, because the CLI serializes it into a puppeteer page.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { tagMermaidMotion } = require('../../../lib/integrations/mermaid/motion-roles');

function svgOf(markup) {
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document.querySelector('svg');
}

/** `role/order` for every tagged part, in document order. */
function roles(svg) {
  return Array.from(svg.querySelectorAll('[data-anima-role]'), (el) => `${el.getAttribute('data-anima-role')}/${el.getAttribute('data-anima-order') || 0}`);
}

const FLOWCHART = `<svg aria-roledescription="flowchart-v2"><style>#m{}</style><g><g class="root">
  <g class="clusters"><g class="cluster" id="m-S"><rect/><g class="cluster-label"/></g></g>
  <g class="edgePaths"><path class="flowchart-link" id="m-L_A_B_0"/><path class="flowchart-link" id="m-L_B_C_0"/></g>
  <g class="edgeLabels"><g class="edgeLabel"><g class="label"><foreignObject/></g></g></g>
  <g class="nodes"><g class="node default"><rect/><g class="label"/></g><g class="node default"><rect/></g><g class="node default"><circle/></g></g>
</g></g></svg>`;

describe('tagMermaidMotion — the shared graph renderer (flowchart, state, class, ER, mindmap)', () => {
  it('tags the subgraph box, every node, every edge and every edge label', () => {
    const svg = svgOf(FLOWCHART);
    assert.equal(tagMermaidMotion(svg), 7);
    assert.deepEqual(roles(svg), ['region/0', 'bar/2', 'bar/2', 'label/0', 'bar/1', 'bar/1', 'bar/1']);
  });

  it('orders nodes (wave 1) before the edges between them (wave 2), whatever the paint order', () => {
    const svg = svgOf(FLOWCHART);
    tagMermaidMotion(svg);
    for (const edge of svg.querySelectorAll('g.edgePaths > path')) assert.equal(edge.getAttribute('data-anima-order'), '2');
    for (const node of svg.querySelectorAll('g.node')) assert.equal(node.getAttribute('data-anima-order'), '1');
  });

  it('finds the family by STRUCTURE, so a family on the same renderer needs no name here', () => {
    const svg = svgOf(FLOWCHART.replace('flowchart-v2', 'some-future-family'));
    assert.equal(tagMermaidMotion(svg), 7);
  });

  it('never tags a part inside a tagged part — it would fade twice', () => {
    const svg = svgOf(`<svg><g class="nodes"><g class="node"><g class="node"><rect/></g></g></g></svg>`);
    assert.equal(tagMermaidMotion(svg), 1);
    assert.equal(svg.querySelector('g.node g.node').hasAttribute('data-anima-role'), false);
  });

  it('is idempotent — a second pass tags nothing and changes nothing', () => {
    const svg = svgOf(FLOWCHART);
    tagMermaidMotion(svg);
    const before = svg.outerHTML;
    assert.equal(tagMermaidMotion(svg), 0);
    assert.equal(svg.outerHTML, before);
  });
});

describe('tagMermaidMotion — the families with their own renderer', () => {
  const cases = [
    ['pie', '<svg aria-roledescription="pie"><g><circle class="pieOuterCircle"/><path class="pieCircle"/><path class="pieCircle"/><text class="slice">40%</text><g class="legend"><rect/><text>Dogs</text></g></g></svg>', ['sector/0', 'sector/0', 'label/0']],
    ['gantt', '<svg aria-roledescription="gantt"><g class="grid"><g class="tick"><line/></g></g><g><rect class="task task0"/><rect class="task task0"/></g></svg>', ['bar/0', 'bar/0']],
    ['xychart', '<svg aria-roledescription="xychart"><g class="main"><g class="plot"><g class="bar-plot-0"><rect/><rect/></g><g class="line-plot-1"><path/></g></g></g></svg>', ['bar/0', 'bar/0', 'bar/1']],
    ['quadrantChart', '<svg aria-roledescription="quadrantChart"><g class="data-points"><g class="data-point"><circle/><text>A</text></g></g></svg>', ['point/0']],
    ['gitGraph', '<svg aria-roledescription="gitGraph"><g class="commit-arrows"><path class="arrow"/></g><g class="commit-bullets"><circle class="commit"/><circle class="commit"/></g></svg>', ['bar/1', 'point/0', 'point/0']],
    ['timeline', '<svg aria-roledescription="timeline"><g class="taskWrapper"><g class="timeline-node"><g><path/></g></g></g></svg>', ['bar/0']],
  ];
  for (const [name, markup, want] of cases) {
    it(name, () => {
      const svg = svgOf(markup);
      tagMermaidMotion(svg);
      assert.deepEqual(roles(svg), want);
    });
  }

  it('sequence — participants left to right (top box, lifeline, bottom box), then the messages', () => {
    // Mermaid's own order: bottom boxes first, then each column RIGHT TO LEFT.
    const svg = svgOf(
      '<svg aria-roledescription="sequence">' +
        '<g><rect class="actor actor-bottom" x="200" width="150" id="bob-bottom"/></g>' +
        '<g><rect class="actor actor-bottom" x="0" width="150" id="alice-bottom"/></g>' +
        '<g><line class="actor-line" x1="275" id="bob-line"/><g><rect class="actor actor-top" x="200" width="150" id="bob-top"/></g></g>' +
        '<g><line class="actor-line" x1="75" id="alice-line"/><g><rect class="actor actor-top" x="0" width="150" id="alice-top"/></g></g>' +
        '<g><rect class="note" id="note"/></g><line class="messageLine0" id="m1"/><line class="messageLine1" id="m2"/>' +
        '</svg>',
    );
    assert.equal(tagMermaidMotion(svg), 9);
    // The build order chartToScene will use: sort by key, stable on document order.
    const parts = Array.from(svg.querySelectorAll('[data-anima-role]'), (el, i) => ({ id: el.id, key: Number(el.getAttribute('data-anima-order') || 0), i }));
    parts.sort((a, b) => a.key - b.key || a.i - b.i);
    assert.deepEqual(parts.map((p) => p.id), ['alice-top', 'alice-line', 'alice-bottom', 'bob-top', 'bob-line', 'bob-bottom', 'note', 'm1', 'm2']);
  });

  it('sequence — a stick-figure participant builds in its column like a box', () => {
    const svg = svgOf(
      '<svg aria-roledescription="sequence">' +
        '<g class="actor-man actor-bottom" id="bob-bottom"><circle cx="275"/></g>' +
        '<g><line class="actor-line" x1="275" id="bob-line"/><g class="actor-man actor-top" id="bob-top"><circle cx="275"/></g></g>' +
        '<g><line class="actor-line" x1="75" id="api-line"/><g><rect class="actor actor-top" x="0" width="150" id="api-top"/></g></g>' +
        '<line class="messageLine0" id="m1"/></svg>',
    );
    tagMermaidMotion(svg);
    const parts = Array.from(svg.querySelectorAll('[data-anima-role]'), (el, i) => ({ id: el.id, key: Number(el.getAttribute('data-anima-order') || 0), i }));
    parts.sort((a, b) => a.key - b.key || a.i - b.i);
    assert.deepEqual(parts.map((p) => p.id), ['api-top', 'api-line', 'bob-top', 'bob-line', 'bob-bottom', 'm1']);
  });

  it('leaves a diagram with clickable nodes still — the animated copy would drop its tooltips', () => {
    const svg = svgOf(FLOWCHART.replace('<g class="node default"><rect/><g class="label"/></g>', '<g class="node default clickable"><rect/></g>'));
    assert.equal(tagMermaidMotion(svg), 0);
    assert.equal(svg.querySelector('[data-anima-role]'), null);
  });

  it('leaves an unrecognized family untagged, so it stays a still picture', () => {
    const svg = svgOf('<svg aria-roledescription="journey"><g class="task"><rect/></g></svg>');
    assert.equal(tagMermaidMotion(svg), 0);
    assert.equal(svg.querySelector('[data-anima-role]'), null);
  });

  it('returns 0 on a missing or non-element input', () => {
    assert.equal(tagMermaidMotion(null), 0);
    assert.equal(tagMermaidMotion({}), 0);
  });
});

describe('tagMermaidMotion — the CLI serializes it with toString()', () => {
  it('still works when rebuilt from its own source text, with no module scope', () => {
    const rebuilt = new Function(`return (${tagMermaidMotion.toString()})`)();
    const svg = svgOf(FLOWCHART);
    assert.equal(rebuilt(svg), 7);
  });
});

describe('tagMermaidMotion — wired into every path that produces a diagram', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../../..');
  it('the live runtime tags a diagram at both of its write sites', () => {
    const src = fs.readFileSync(path.join(root, 'lib/runtime/index.js'), 'utf8');
    assert.match(src, /require\('\.\.\/\.\.\/lib\/integrations\/mermaid\/motion-roles'\)/);
    // One call after the cache write, one after the fresh render.
    assert.equal((src.match(/target\.innerHTML = (?:cachedSvg|svg);\n\s*tagDiagramMotion\(target\);/g) || []).length, 2);
  });
  it('the CLI player capture tags the baked copy', () => {
    const src = fs.readFileSync(path.join(root, 'lattice-emulator.js'), 'utf8');
    assert.match(src, /window\.__tagMermaidMotion\(flat\);/);
  });
});
