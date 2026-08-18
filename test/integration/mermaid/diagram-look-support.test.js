/**
 * Integration: WHICH Mermaid families actually honor `look: 'handDrawn'`.
 *
 * A four-family claim — flowchart, state, class, ER — was repeated through
 * `engineering/mermaid.md` §5.3e, two decision records and issue #1674 without anyone
 * measuring it. It is wrong: `mindmap` and `requirementDiagram` go through rough.js too,
 * so a sketch deck draws SIX families by hand. The mindmap error mattered most, because
 * the docs listed it explicitly among the families that "ignore `look` entirely" — an
 * author reading that would not have known their mind map already matched the finish.
 *
 * A table in prose cannot survive a Mermaid upgrade. This derives the answer from the
 * installed Mermaid instead: render every family TWICE, once with `look: 'handDrawn'` and
 * once without, and count rough nodes in each. The list is then a measurement with a date
 * on it rather than a claim.
 *
 * COUNT ROUGH NODES, DO NOT DIFF BYTES. Two families emit different output under
 * `handDrawn` while producing no rough geometry at all — `gitGraph` (a random commit hash)
 * and `architecture-beta` (a random Iconify element id). A byte comparison reports both as
 * hand-drawn, which is how a re-derivation of this table would go wrong in the obvious way.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const WORKER = path.join(REPO, 'lib', 'integrations', 'mermaid', 'render-worker.js');
const { engineInitConfig } = require('../../../lib/integrations/mermaid/init-directive');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');
const CHROME = resolveChrome();

/** One minimal, VALID definition per family the engine's `MERMAID_KINDS` recognizes. */
const FAMILIES = {
  flowchart: 'flowchart LR\n  A["Alpha"] --> B["Beta"]',
  state: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: start',
  class: 'classDiagram\n  class Order { +String id }\n  Order <|-- Rush',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places',
  mindmap: 'mindmap\n  root((Core))\n    Alpha\n    Beta',
  requirement: 'requirementDiagram\n  requirement r1 {\n    id: 1\n    text: "Text here"\n'
    + '    risk: high\n    verifymethod: test\n  }\n  element e1 {\n    type: service\n  }\n'
    + '  e1 - satisfies -> r1',
  sequence: 'sequenceDiagram\n  A->>B: hello\n  B-->>A: hi',
  gantt: 'gantt\n  dateFormat YYYY-MM-DD\n  title T\n  section S\n  Task :a1, 2026-01-01, 20d',
  pie: 'pie showData\n  title T\n  "A" : 40\n  "B" : 60',
  journey: 'journey\n  title T\n  section S\n    Step: 4: User',
  timeline: 'timeline\n  title T\n  2024 : One\n  2025 : Two',
  quadrant: 'quadrantChart\n  title T\n  x-axis "L" --> "R"\n  y-axis "D" --> "U"\n  "P": [0.4, 0.6]',
  gitGraph: 'gitGraph\n  commit\n  branch dev\n  commit',
  sankey: 'sankey-beta\nA,B,10\nB,C,10',
  xychart: 'xychart-beta\n  title "T"\n  x-axis [a, b]\n  y-axis "y" 0 --> 10\n  line [3, 7]',
  c4: 'C4Context\n  title T\n  Person(a, "A", "d")\n  System(b, "B", "d")\n  Rel(a, b, "uses")',
  block: 'block-beta\n  columns 2\n  a["A"] b["B"]',
  packet: 'packet-beta\n  0-7: "Head"\n  8-15: "Body"',
  architecture: 'architecture-beta\n  group g(cloud)[Net]\n  service s1(server)[Api] in g\n'
    + '  service s2(database)[Db] in g\n  s1:R --> L:s2',
};

/** Measured 2026-08-18 against Mermaid 11.14. Update WITH a re-measurement, never by hand. */
const HONORS_LOOK = ['flowchart', 'state', 'class', 'er', 'mindmap', 'requirement'];

function render(withLook) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-'));
  try {
    const jobFile = path.join(dir, 'job.json');
    const outFile = path.join(dir, 'out.json');
    fs.writeFileSync(jobFile, JSON.stringify({
      pkgRoot: REPO, chromePath: CHROME, backgroundColor: 'transparent', outFile,
      diagrams: Object.values(FAMILIES).map((definition) => ({
        definition,
        config: engineInitConfig({ fontSize: '14px' }, withLook ? { look: 'handDrawn' } : {}),
      })),
    }));
    try {
      execFileSync(process.execPath, [WORKER, jobFile], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (_e) { /* per-diagram failures are data in the result file */ }
    return JSON.parse(fs.readFileSync(outFile, 'utf8')).results;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Rough nodes in the RENDERED body — past the `<style>`, whose rules mention the class too. */
function roughNodes(svg) {
  return ((svg || '').split('</style>').pop().match(/class="[^"]*rough-node/g) || []).length;
}

describe('which families honor look: handDrawn', { skip: skipWithoutChrome(CHROME) }, () => {
  test('every family still renders — a broken fixture would read as "ignores look"', () => {
    // The failure mode this guards: a definition that stops parsing on a Mermaid upgrade
    // produces no SVG, hence no rough nodes, hence a silent demotion out of the list.
    const classic = render(false);
    const failed = Object.keys(FAMILIES).filter((_n, i) => !classic[i].ok);
    assert.deepEqual(failed, [], 'these fixtures no longer parse, so their look answer is meaningless');
  });

  test('the honoring set is exactly what was measured', () => {
    const classic = render(false);
    const hand = render(true);
    const honors = Object.keys(FAMILIES).filter((_n, i) =>
      hand[i].ok && classic[i].ok && roughNodes(hand[i].svg) > roughNodes(classic[i].svg));

    assert.deepEqual(honors.sort(), [...HONORS_LOOK].sort(),
      'the set of families Mermaid draws through rough.js changed. That is not a bug — it is '
      + 'an upstream capability moving — but engineering/mermaid.md §5.3e publishes this list '
      + 'to authors, so re-measure, update HONORS_LOOK, and update the table there.');
  });

  test('mindmap and requirementDiagram are in it — the two the docs got wrong', () => {
    // Pinned by name, so a regression names itself instead of surfacing as a set diff.
    const hand = render(true);
    for (const family of ['mindmap', 'requirement']) {
      const i = Object.keys(FAMILIES).indexOf(family);
      assert.ok(roughNodes(hand[i].svg) > 0,
        `${family} used to be documented as ignoring \`look\`, and does not — it must keep `
        + 'producing rough nodes, or a sketch deck loses hand shapes it currently has');
    }
  });
});
