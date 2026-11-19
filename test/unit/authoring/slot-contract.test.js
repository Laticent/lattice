// The `slot-contract` lint rule (lib/authoring/slot-contract.js, wired into lint-core) and the
// manifests it is compiled from. Three promises:
//   1. every sample a manifest ships satisfies its own slot contract (D3, manifest → code);
//   2. the mutations the 2026-11-19 audit found lint silent on now each produce a finding:
//      the required heading deleted, written one level off, a heading-only slide, and a list
//      written with the marker the layout does not read (D4, the no-silent-change invariant);
//   3. the reader itself reads Markdown the way markdown-it does (fences under a bullet, an
//      inline-code line, raw HTML).
// engineering/decisions/2026-11-19-deterministic-authoring-audit.md, W1.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadAll } = require('../../../lib/components');
const { lintText, buildVocab } = require('../../../lib/authoring/lint');
const { slideShape, matches, slotProblems } = require('../../../lib/authoring/slot-contract');
const SLOT_CONTRACT = require('../../../lib/authoring/slot-contract.generated.js');
const { boundaryParser } = require('../../../lib/core/boundary-parser');

const vocab = buildVocab();
const manifests = loadAll().filter((m) => m.slots);
const FM = '---\ntheme: indaco\n---\n\n';
const contractFindings = (md) => lintText(FM + md, { vocab }).filter((f) => f.rule === 'slot-contract');
const inertFindings = (md) => lintText(FM + md, { vocab }).filter((f) => f.rule === 'variant-inert');

function samplesOf(m) {
  return [
    ['skeleton', m.skeleton],
    ['sample', m.sample],
    ['stress', m.stressDoc?.sample],
    ...Object.entries(m.variantDocs || {}).map(([k, v]) => [`variant ${k}`, v.sample]),
  ].filter(([, md]) => md);
}

describe('every manifest sample satisfies its own slot contract', () => {
  test('the table covers every manifest with slots', () => {
    assert.deepEqual(Object.keys(SLOT_CONTRACT).sort(), manifests.map((m) => m.name).sort());
  });
  for (const m of manifests) {
    test(m.name, () => {
      for (const [label, md] of samplesOf(m)) {
        const found = contractFindings(md);
        assert.deepEqual(found.map((f) => f.message), [], `${m.name} ${label} breaks its own contract`);
        assert.deepEqual(inertFindings(md).map((f) => f.message), [], `${m.name} ${label} writes a variant that does nothing`);
      }
    });
  }
  test('variantSlots and variantKinds name only declared variants', () => {
    for (const m of manifests) {
      const declared = new Set(m.variants || []);
      for (const field of ['variantSlots', 'variantKinds']) {
        for (const v of Object.keys(m[field] || {})) assert.ok(declared.has(v), `${m.name}.${field}.${v} is not a declared variant`);
      }
      for (const [v, k] of Object.entries(m.variantKinds || {})) {
        for (const r of k.requires || []) assert.ok(declared.has(r), `${m.name}.variantKinds.${v} requires '${r}', which ${m.name} does not declare`);
      }
    }
  });
  test('a source variant and a lone requires variant each warn, and the right form does not', () => {
    assert.equal(inertFindings('<!-- _class: cards-grid numbered -->\n\n## A\n\n1. x\n   - y\n').length, 1);
    assert.equal(inertFindings('<!-- _class: cards-stack numbered -->\n\n## A\n\n1. x\n   - y\n').length, 1);
    assert.equal(inertFindings('<!-- _class: cards-grid -->\n\n## A\n\n1. x\n   - y\n').length, 0);
    // `list numbered` alone is the older `list-modifier-inert` rule's, so this one stays quiet on it.
    assert.equal(inertFindings('<!-- _class: list numbered -->\n\n## A\n\n- x\n- y\n').length, 0);
  });
});

// The mutations, on each manifest's default sample. Each must either be inert (the slot it
// removes is optional) or produce a `slot-contract` finding — never a silent change.
const HEADING_RE = /^(#{1,6}) (.*)$/m;
function requiredHeading(m) {
  return Object.values(m.slots).find((s) => s.required && !Array.isArray(s.match) && s.match.kind === 'heading');
}
function levelsOf(slot) {
  return [].concat(slot.match.level);
}

describe('the audit mutations are no longer lint silent', () => {
  const counts = { deleted: [0, 0], demoted: [0, 0], headingOnly: [0, 0], marker: [0, 0], nested: [0, 0] };
  for (const m of manifests) {
    const slot = requiredHeading(m);
    const md = m.sample;
    const h = md.match(HEADING_RE);
    if (!slot || !h || !levelsOf(slot).includes(h[1].length)) continue;
    test(`${m.name}: required heading deleted`, () => {
      counts.deleted[1]++;
      const found = contractFindings(md.replace(HEADING_RE, ''));
      // split-panel and split-compare report the same gap through their own anchor rule.
      const anchored = lintText(FM + md.replace(HEADING_RE, ''), { vocab }).some((f) => f.rule === 'split-missing-headline');
      assert.ok(found.length || anchored, `${m.name} with its heading deleted lints clean`);
      counts.deleted[0]++;
    });
    const wrong = levelsOf(slot).includes(1) ? null : '#';
    if (wrong) {
      test(`${m.name}: heading written one level off`, () => {
        counts.demoted[1]++;
        const found = contractFindings(md.replace(HEADING_RE, `${wrong} $2`));
        const anchored = lintText(FM + md.replace(HEADING_RE, `${wrong} $2`), { vocab }).some((f) => f.rule === 'split-missing-headline');
        assert.ok(found.some((f) => /heading/.test(f.message)) || anchored, `${m.name} with \`#\` for \`##\` lints clean`);
        counts.demoted[0]++;
      });
    }
    const body = Object.entries(m.slots).filter(([, s]) => s.required && s !== slot);
    if (body.length) {
      test(`${m.name}: heading-only slide`, () => {
        counts.headingOnly[1]++;
        const cls = md.match(/<!--\s*_class:[^>]*-->/)[0];
        const found = contractFindings(`${cls}\n\n${h[0]}\n`);
        assert.ok(found.length, `${m.name} with every body slot empty lints clean`);
        counts.headingOnly[0]++;
      });
    }
  }
  for (const m of manifests) {
    const strict = Object.values(m.slots).find((s) => !Array.isArray(s.match) && s.match.kind === 'list' && s.match.depth === 1 && s.match.marker !== 'any');
    if (!strict || !/^(- |1\. )/m.test(m.sample)) continue;
    test(`${m.name}: top-level list written with the other marker`, () => {
      counts.marker[1]++;
      let n = 0;
      const swapped = strict.match.marker === 'bullet'
        ? m.sample.replace(/^- /gm, () => `${++n}. `).replace(/^ {2}(?=\S|- )/gm, '   ')
        : m.sample.replace(/^\d+\. /gm, '- ').replace(/^ {3}(?=\S|- )/gm, '  ');
      const found = contractFindings(swapped);
      assert.ok(found.some((f) => /this slide writes/.test(f.message)), `${m.name} with the wrong marker lints clean`);
      counts.marker[0]++;
    });
  }
  // Nested lists: flip every second-level marker where the manifest names one at depth 2.
  for (const m of manifests) {
    const strict = Object.values(m.slots).find((s) => !Array.isArray(s.match) && s.match.kind === 'list' && s.match.depth === 2 && s.match.marker === 'bullet');
    if (!strict || !/^ {2,3}- /m.test(m.sample)) continue;
    test(`${m.name}: nested list written with \`1.\``, () => {
      counts.nested[1]++;
      // `1. ` is one column wider than `- `, so whatever nests under a swapped item moves right by one.
      const swapped = m.sample.replace(/^( {4,})(?=\S)/gm, '$1 ').replace(/^( {2,3})- /gm, '$11. ');
      const found = contractFindings(swapped);
      assert.ok(found.some((f) => /this slide writes/.test(f.message)), `${m.name} with nested \`1.\` lints clean`);
      counts.nested[0]++;
    });
  }
  test('the sweep reached the layouts the audit measured', () => {
    // The audit: 68 layouts with a required heading, 66 silent on each heading mutation.
    assert.ok(counts.deleted[1] >= 60, `deleted-heading probes: ${counts.deleted[1]}`);
    assert.ok(counts.headingOnly[1] >= 55, `heading-only probes: ${counts.headingOnly[1]}`);
    assert.ok(counts.marker[1] >= 10, `marker probes: ${counts.marker[1]}`);
    assert.ok(counts.nested[1] >= 12, `nested-marker probes: ${counts.nested[1]}`);
  });
});

// The strict markers are not the manifests grading themselves: this is the measured table from
// engineering/decisions/2026-11-19-deterministic-authoring-audit/b-list-and-bold.md (the layouts a
// marker swap changed), written down independently. A manifest that loses one fails here. W2 moves
// the R3 layouts to `any` and edits this table in the same change.
const MEASURED = {
  top: {
    bullet: ['big-number', 'cycle', 'glossary', 'inventory', 'journey', 'logo-wall', 'policy-recommendation', 'pricing', 'verdict-grid', 'split-panel'],
    ordered: ['agenda', 'kpi', 'stats', 'list-tabular', 'list-steps', 'premise'],
  },
  nested: ['bullet', 'ep-curve', 'funnel', 'gantt', 'hub-spoke', 'map', 'piechart', 'quadrant', 'radar', 'scatter', 'timeline-list', 'tower', 'waterfall', 'journey', 'verdict-grid'],
};
describe('the strict markers match the audit measurement', () => {
  const byName = new Map(manifests.map((m) => [m.name, m]));
  const strictAt = (m, depth) => Object.values(m.slots).flatMap((s) => [].concat(s.match)).find((x) => x.kind === 'list' && x.depth === depth && x.marker !== 'any');
  for (const [marker, names] of Object.entries(MEASURED.top)) {
    for (const n of names) test(`${n} reads only a ${marker} top-level list`, () => assert.equal(strictAt(byName.get(n), 1)?.marker, marker));
  }
  for (const n of MEASURED.nested) test(`${n} reads only a bullet nested list`, () => assert.equal(strictAt(byName.get(n), 2)?.marker, 'bullet'));
  test('compare-prose axis reads only a `1.` list', () => {
    assert.equal(byName.get('compare-prose').variantSlots.axis.options.match.marker, 'ordered');
  });
  test('no other layout names a strict top-level marker', () => {
    const measured = new Set([...MEASURED.top.bullet, ...MEASURED.top.ordered]);
    for (const m of manifests) if (strictAt(m, 1)) assert.ok(measured.has(m.name), `${m.name} names a strict marker the audit did not measure`);
  });
});

describe('raw HTML fills the slot its element names', () => {
  const lint = (md) => contractFindings(md).map((f) => f.message);
  test('a raw <h2> is the heading', () => assert.deepEqual(lint('<!-- _class: agenda -->\n\n<h2>Agenda</h2>\n\n1. One\n2. Two\n'), []));
  test('a raw <blockquote> is the quotation', () => assert.deepEqual(lint('<!-- _class: quote -->\n\n<blockquote>Raw words.</blockquote>\n'), []));
  test('a pane head `###` is not called the wrong heading level', () => {
    const msgs = lint('<!-- _class: columns -->\n\n### Left\n\nText.\n\n### Right\n\nText.\n');
    assert.ok(!msgs.some((x) => /writes `### `/.test(x)), msgs.join('\n'));
  });
});

describe('the reader reads Markdown as markdown-it does', () => {
  const shape = (md) => slideShape(md, boundaryParser);
  test('a fence indented under a bullet still counts as the fence', () => {
    const s = shape('## H\n\n- Flow:\n\n  ```mermaid\n  flowchart LR\n  ```\n');
    assert.ok(matches({ kind: 'fence', lang: 'mermaid' }, s));
  });
  test('an inline-code line is a code-line, and its prefix is read', () => {
    const s = shape('`@image{media/a.jpg}`\n\n## H\n');
    assert.ok(matches({ kind: 'code-line', prefix: '@image' }, s));
    assert.ok(!matches({ kind: 'code-line', prefix: '@video' }, s));
    assert.ok(!matches({ kind: 'paragraph' }, s), 'an eyebrow is not a body paragraph');
  });
  test('a raw HTML table is an html table', () => {
    assert.ok(matches({ kind: 'html', tag: 'table' }, shape('## H\n\n<table>\n<tr><td>a</td></tr>\n</table>\n')));
  });
  test('a list inside a blockquote is not the slide list', () => {
    assert.ok(!matches({ kind: 'list', depth: 1, marker: 'any' }, shape('## H\n\n> - quoted\n')));
  });
  test('a variant override replaces the base slot, and null drops it', () => {
    const contract = {
      slots: { heading: { match: { kind: 'heading', level: 2 }, required: true }, rows: { match: { kind: 'list', depth: 1, marker: 'bullet' }, required: true } },
      variantSlots: { lane: { rows: { match: { kind: 'table' } } }, bare: { heading: null } },
    };
    const table = shape('## H\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    assert.deepEqual(slotProblems('x', contract, ['x', 'lane'], table).map((p) => p.slot), []);
    assert.deepEqual(slotProblems('x', contract, ['x'], table).map((p) => p.slot), ['rows']);
    assert.deepEqual(slotProblems('x', contract, ['x', 'lane', 'bare'], shape('| a | b |\n|---|---|\n| 1 | 2 |\n')).map((p) => p.slot), []);
  });
});
