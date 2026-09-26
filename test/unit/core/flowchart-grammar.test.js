// The flowchart grammar kernel — one parse shared by the transform, lint and narration.
//
// The arms hold the rules of engineering/decisions/2026-09-25-flowchart-authoring.md §2,
// and every input the adversarial review used to break the first version of that design
// (§11 item 4) is pinned here: a hyphenated name is not a link, a comparison can be
// escaped, `&` in a name is text, `{id}` is not the id syntax, a shape cannot sit in two
// groups, and the same source always parses to the same model.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const g = require('../../../lib/core/flowchart-grammar');
const { CHART_STATUS } = require('../../../lib/core/chart-status');

const parse = (md, opts = {}) => {
  const o = g.outlineFromMarkdown(md);
  return { ...g.parseFlowchart(o.items, { key: o.key, ...opts }), caption: o.caption };
};
const edgeList = (m) => m.edges.map((e) => `${e.from}>${e.to}${e.label ? `[${e.label}]` : ''}${e.heavy ? '!' : ''}${e.dir === 'both' ? '<>' : e.dir === 'none' ? '--' : ''}`);
const rules = (m) => m.diagnostics.map((d) => d.rule);

describe('arrows', () => {
  const read = (s) => {
    const a = g.readArrow(s, 0);
    return a && { dir: a.dir, heavy: a.heavy, label: a.label, text: s.slice(0, a.end), mermaid: a.mermaid };
  };
  test('the eight house forms', () => {
    assert.deepEqual(read('-> X'), { dir: 'out', heavy: false, label: '', text: '->', mermaid: false });
    assert.deepEqual(read('=> X'), { dir: 'out', heavy: true, label: '', text: '=>', mermaid: false });
    assert.equal(read('<- X').dir, 'in');
    assert.equal(read('<= X').dir, 'in');
    assert.equal(read('<-> X').dir, 'both');
    assert.equal(read('<=> X').dir, 'both');
    assert.equal(read('-- X').dir, 'none');
    assert.equal(read('== X').dir, 'none');
  });
  test('a label sits inside, and may hold spaces', () => {
    assert.equal(read('-SEV1-> X').label, 'SEV1');
    assert.equal(read('=ack=> X').label, 'ack');
    assert.deepEqual([read('<-settled- X').label, read('<-settled- X').dir], ['settled', 'in']);
    assert.deepEqual([read('-advises- X').label, read('-advises- X').dir], ['advises', 'none']);
    assert.equal(read('-no ack 5m-> X').label, 'no ack 5m');
  });
  test('Mermaid habits read as the house form, and say so', () => {
    assert.deepEqual([read('--> X').dir, read('--> X').mermaid], ['out', true]);
    assert.deepEqual([read('==> X').heavy, read('==> X').mermaid], [true, true]);
    assert.equal(read('--- X').dir, 'none');
    assert.equal(read('--- X').mermaid, true);
  });
  test('a bare dash or equals sign is not an arrow', () => {
    assert.equal(read('- X'), null);
    assert.equal(read('= X'), null);
    assert.equal(read('-x X'), null);
    assert.equal(read('-> '.repeat(0) + '-unterminated label'), null);
  });
  test('a label past the cap is not an arrow (bounded scan)', () => {
    assert.equal(read(`-${'a'.repeat(g.LABEL_MAX + 5)}-> X`), null);
  });
});

describe('the review cases', () => {
  test('a hyphenated name is a name, never a labeled link', () => {
    const m = parse('- Know-your-customer checks -> Approve');
    assert.deepEqual(m.shapes.map((s) => s.name), ['Know-your-customer checks', 'Approve']);
    assert.deepEqual(edgeList(m), ['know-your-customer-checks>approve']);
  });
  test('a comparison inside a name is escaped with a backslash', () => {
    const m = parse('- Balance \\<= 0? `:diamond` -> Suspend');
    assert.equal(m.shapes[0].name, 'Balance <= 0?');
    assert.equal(m.shapes[0].shape, 'diamond');
  });
  test('an unescaped comparison is flagged', () => {
    assert.ok(rules(parse('- Balance <= 0?')).includes('flowchart-comparison-arrow'));
  });
  test('& in a shape name is text; after an arrow it fans out', () => {
    const m = parse('- R&D -> Terms \\& Conditions\n- Legal -> Sales & Finance');
    assert.deepEqual(m.shapes.map((s) => s.name), ['R&D', 'Legal', 'Terms & Conditions', 'Sales', 'Finance']);
    assert.deepEqual(edgeList(m), ['r-d>terms-conditions', 'legal>sales', 'legal>finance']);
  });
  test('the explicit name is #id — braces are the pill grammar', () => {
    const m = parse('- Know-your-customer checks `#kyc:diamond`\n- Start -> #kyc');
    assert.equal(m.shapes[0].explicitId, 'kyc');
    assert.deepEqual(edgeList(m), ['start>know-your-customer-checks']);
    const braces = parse('- KYC `{kyc}:diamond`');
    assert.ok(rules(braces).includes('flowchart-unknown-modifier'));
    assert.equal(braces.shapes[0].explicitId, null);
  });
  test('a shape cannot sit in two groups', () => {
    const m = parse('- A\n  - X\n- B\n  - X');
    assert.ok(rules(m).includes('flowchart-two-groups'));
    assert.equal(m.shapes.find((s) => s.name === 'X').parent, 'a');
  });
  test('a group cannot connect to its own member', () => {
    const m = parse('- Platform\n  - Payments\n  - -> Payments');
    assert.ok(rules(m).includes('flowchart-group-self-edge'));
    assert.equal(m.edges.length, 0);
  });
  test('a name that is a list marker, or empty, is an error', () => {
    assert.ok(rules(parse('- `:diamond`')).includes('flowchart-empty-name'));
    assert.ok(rules(parse('- `#only-an-id`')).includes('flowchart-empty-name'));
    assert.ok(rules(parse('- +')).includes('flowchart-empty-name'));
  });
  test('near-duplicate names warn, but short names never trip it', () => {
    assert.ok(rules(parse('- Mitigate\n- Page -> Mitgate')).includes('flowchart-near-duplicate'));
    assert.deepEqual(rules(parse('- UI -> DB\n- API -> DC')), []);
  });
  test('ids stay unique when two names slug alike', () => {
    const m = parse('- C++ -> C#\n- C');
    assert.deepEqual(m.shapes.map((s) => s.id), ['c', 'c-2', 'c-3']);
  });
});

describe('structure', () => {
  test('the flat row and the arrow sub-item are the same connection', () => {
    const a = parse('- Platform `:c2`\n  - Storefront\n    - => Payments\n  - Payments');
    const b = parse('- Platform `:c2`\n  - Storefront => Payments\n  - Payments');
    assert.deepEqual(a, b);
  });
  test('a sub-list of shapes makes a group; arrow sub-items do not', () => {
    const m = parse('- Warehouse\n  - -> BI\n- Platform\n  - Storefront');
    assert.deepEqual(m.groups.map((x) => x.name), ['Platform']);
    assert.ok(m.shapes.some((s) => s.name === 'Warehouse'));
  });
  test('a target-only name sits beside its first source', () => {
    const m = parse('- Platform `:c2`\n  - Payments -screens-> Fraud checks\n  - -ships via-> Carriers');
    const at = (n) => m.shapes.find((s) => s.name === n).parent;
    assert.equal(at('Fraud checks'), 'platform', 'a shape source keeps the target in its group');
    assert.equal(at('Carriers'), null, 'a group source puts the target next to the group');
  });
  test('an item row decides placement, whatever order the mentions come in', () => {
    const m = parse('- Storefront -> Card networks\n- Partners\n  - Card networks');
    assert.equal(m.shapes.find((s) => s.name === 'Card networks').parent, 'partners');
  });
  test('chains, fan-out and reverse arrows', () => {
    const m = parse('- A -> B -> C & D\n- E <-fed- F');
    assert.deepEqual(edgeList(m), ['a>b', 'b>c', 'b>d', 'f>e[fed]']);
  });
  test('a nested blockquote is a note on its shape; a second line is its detail', () => {
    const m = parse('- Page on-call\n  Secondary rota\n  > Pages the secondary after 5 minutes.');
    assert.equal(m.shapes[0].detail, 'Secondary rota');
    assert.deepEqual(m.notes, [{ on: 'page-on-call', text: 'Pages the secondary after 5 minutes.' }]);
  });
  test('back edges come from an authored-order walk', () => {
    const m = parse('- Draft -> Review -> Approved\n- Review -revise-> Draft');
    assert.deepEqual(m.edges.filter((e) => e.back).map((e) => `${e.from}>${e.to}`), ['review>draft']);
  });
});

describe('the span', () => {
  test('it styles what it follows, in any order', () => {
    const m = parse('- A `:c3` -> B `:dotted:c4`\n- C -> D `:c4:dotted`');
    assert.equal(m.shapes[0].slot, 3);
    assert.deepEqual(m.edges[0].style, m.edges[1].style);
    assert.deepEqual(m.edges[0].style, { slot: 4, pattern: 'dotted' });
  });
  test('a shape word after a target is an error', () => {
    assert.ok(rules(parse('- A -> B `:diamond`')).includes('flowchart-shape-word-on-line'));
  });
  test('a line word after a shape name is an error', () => {
    assert.ok(rules(parse('- A `:dashed`')).includes('flowchart-line-word-on-shape'));
  });
  test('slots stop at the chart family\'s eight', () => {
    assert.ok(rules(parse('- A `:c9`')).includes('flowchart-unknown-modifier'));
  });
  test('two different styles for one shape conflict', () => {
    assert.ok(rules(parse('- A `:diamond`\n- A `:circle`')).includes('flowchart-conflicting-style'));
  });
  test('the status words are exactly CHART_STATUS', () => {
    assert.deepEqual([...g.STATUS_WORDS], [...CHART_STATUS]);
  });
  test('the host can allow its own lead words (the state chart\'s start / end)', () => {
    assert.ok(rules(parse('- Draft `start`')).includes('flowchart-unknown-modifier'));
    assert.deepEqual(parse('- Draft `start`', { leadWords: ['start', 'end'] }).shapes[0].lead, ['start']);
  });
});

describe('key and caption', () => {
  test('the key is derived, and an authored key renames it', () => {
    const src = '- A `fail` => B\n- Platform `:c2`\n  - C\n\n`[{=>, Happy path}]`\n\n*The caption.*';
    const m = parse(src);
    assert.deepEqual(m.key, [{ key: 'fail', label: 'Failing' }, { key: '=>', label: 'Happy path' }, { key: ':c2', label: 'Platform' }]);
    assert.equal(m.caption, 'The caption.');
  });
  test('a key entry for a word the chart does not use is reported', () => {
    assert.ok(rules(parse('- A -> B\n\n`[{:dotted, Informal}]`')).includes('flowchart-key-unbound'));
  });
  test('the key arrives HTML-escaped from a rendered page and still binds', () => {
    const o = g.outlineFromMarkdown('- A => B');
    const m = g.parseFlowchart(o.items, { key: '[{=&gt;, Happy path}]' });
    assert.equal(m.key.find((e) => e.key === '=>').label, 'Happy path');
  });
});

describe('determinism', () => {
  test('the same source parses to the same model', () => {
    const src = '- Alert `:pill` => Triage => Severity?\n- Severity? `:diamond`\n  - =SEV1=> Page\n  - -SEV2-> Ticket\n- Platform `:c2`\n  - Store => Pay\n  - -ships-> Carriers';
    assert.deepEqual(parse(src), parse(src));
  });
  test('fenced code in a slide is never read as the chart', () => {
    const m = parse('```\n- Not -> A chart\n```\n- A -> B');
    assert.deepEqual(m.shapes.map((s) => s.name), ['A', 'B']);
  });
});

// ── The maker-checker's findings on slice 1, each pinned so it cannot come back. ──

describe('the Markdown adapter agrees with markdown-it', () => {
  const md = require('markdown-it')();
  // The shape of what markdown-it rendered: the FIRST list's items and their nested items.
  const rendered = (src) => {
    const toks = md.parse(src, {});
    const out = [];
    let depth = 0;
    let inFirst = false;
    let firstDone = false;
    for (const t of toks) {
      if (t.type.endsWith('_list_open')) { if (!inFirst && !firstDone && depth === 0) inFirst = true; depth++; }
      if (t.type.endsWith('_list_close')) { depth--; if (depth === 0 && inFirst) { inFirst = false; firstDone = true; } }
      if (inFirst && t.type === 'inline' && toks[toks.indexOf(t) - 1].type === 'paragraph_open') out.push(`${depth}:${t.content.split('\n')[0]}`);
    }
    return out;
  };
  const adapted = (src) => {
    const out = [];
    const walk = (items, d) => { for (const it of items) { out.push(`${d}:${it.segs.map((x) => x.value).join('').trim()}`); walk(it.children, d + 1); } };
    walk(g.outlineFromMarkdown(src).items, 1);
    return out;
  };
  for (const [name, src] of [
    ['one space is a sibling, not a child', '- A\n - B'],
    ['a child nests at the content column', '- A\n  - B'],
    ['an ordered parent needs its wider content column', '1. A\n   - B'],
    ['a marker change starts a new list', '1. A\n2. B\n- C'],
    ['tabs are 4-column stops', '- Platform\n\t- Storefront\n\t- Admin'],
    ['a two-digit ordered marker', '10) C\n    - D'],
  ]) test(name, () => assert.deepEqual(adapted(src), rendered(src)));

  test('a lazy continuation line is the row\'s second line, and later rows survive', () => {
    const o = g.outlineFromMarkdown('- A\nlazy text\n- B');
    assert.deepEqual(o.items.map((i) => i.segs[0].value), ['A', 'B']);
    assert.equal(o.items[0].detail, 'lazy text');
  });
  test('a thematic break ends the chart; it is never a shape', () => {
    const o = g.outlineFromMarkdown('- A\n\n* * *\n\n- B');
    assert.deepEqual(o.items.map((i) => i.segs[0].value), ['A']);
  });
  test('a trailing CR is tolerated', () => {
    assert.equal(g.outlineFromMarkdown('- A\r\n  - B -> C\r').items[0].children.length, 1);
  });
  test('consecutive quote lines are one note', () => {
    assert.deepEqual(parse('- A\n  > line one\n  > line two').notes, [{ on: 'a', text: 'line one line two' }]);
  });
  test('a caption is one emphasis around the whole line', () => {
    assert.equal(parse('- A\n\n*Figure* and *more*').caption, null);
    assert.equal(parse('- A\n\n_The whole line._').caption, 'The whole line.');
  });
});

describe('grammar findings from the review', () => {
  test('a code span inside a name stays in the name', () => {
    const m = parse('- Run `npm test` -> Deploy');
    assert.equal(m.shapes[0].name, 'Run npm test');
    assert.deepEqual(rules(m), ['flowchart-unknown-modifier']);
    assert.equal(parse('- Build `make` and ship -> Done').shapes[0].name, 'Build make and ship');
  });
  test('two groups is caught even when the row has a second line', () => {
    assert.ok(rules(parse('- G1\n  - X\n- G2\n  - X\n    second line')).includes('flowchart-two-groups'));
  });
  test('a top-level repeat of a placed shape is a reference row, not a move', () => {
    const m = parse('- G1\n  - X\n- X -> Y');
    assert.equal(m.shapes.find((sh) => sh.name === 'X').parent, 'g1');
    assert.deepEqual(rules(m), []);
  });
  test('rows nested under a connection are errors, never silently re-pointed', () => {
    assert.ok(rules(parse('- A\n  - -> B\n    - M')).includes('flowchart-nested-under-connection'));
    const m = parse('- A\n  - -> B\n    - -> C');
    assert.ok(rules(m).includes('flowchart-nested-under-connection'));
    assert.deepEqual(edgeList(m), ['a>b']);
  });
  test('a digit after a plain arrow is a name, not a comparison', () => {
    assert.deepEqual(rules(parse('- Login -> 2FA check')), []);
  });
});

describe('budgets on untrusted input', () => {
  test('a 6,000-step chain parses without overflowing the stack', () => {
    const chain = `- ${Array.from({ length: 6000 }, (_, i) => `s${i}`).join(' -> ')}`;
    const m = parse(chain);
    assert.equal(m.edges.length, 5999);
  });
  test('a 2,500-target fan-out stays fast', () => {
    const fan = `- A -> ${Array.from({ length: 2500 }, (_, i) => `Zq${i * 104729}`).join(' & ')}`;
    const t = process.hrtime.bigint();
    parse(fan);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
  });
});

describe('lint integration', () => {
  const { findFlowchartIssues } = require('../../../lib/authoring/lint-core');
  test('slide numbers skip the front matter, and comments are not read', () => {
    const deck = '---\ntheme: indaco\n---\n\n# Title\n\n---\n\n<!-- _class: flowchart -->\n\n## H\n\n- A -> B `:diamond`\n<!-- - C -> D `:circle` -->\n';
    const f = findFlowchartIssues(deck);
    assert.equal(f.length, 1);
    assert.equal(f[0].slide, 2);
    assert.equal(f[0].rule, 'flowchart-shape-word-on-line');
  });
  test('a deck without a flowchart, or no deck at all, reads clean', () => {
    assert.deepEqual(findFlowchartIssues('# Just a title\n\n- a list -> of text'), []);
    assert.deepEqual(findFlowchartIssues(''), []);
  });
});
