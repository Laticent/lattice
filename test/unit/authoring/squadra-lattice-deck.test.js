// The foundation of the lint-core rewrite (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §3, §7 step
// 2): `lattice-deck`'s tree (lib/authoring/squadra/lattice-deck.js), the Lattice entry (`lintDeck`, `fixDeck`) and the
// build-time stamps (tools/build-squadra-stamps.js) that the browser runtime checks.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { compileRuleset, digestRuleset, editsFix } = require('@laticent/squadra');
const { latticeDeck } = require('../../../lib/authoring/squadra/lattice-deck');
const { deckRuleset, fixDeck, lintDeck } = require('../../../lib/authoring/squadra');
const { squadraVocab } = require('../../../lib/authoring/squadra/vocab');
const { setBoundaryPluginsOff } = require('../../../lib/core/boundary-parser.mjs');

const src = (text) => ({ path: 'a.md', text, language: 'lattice-deck' });
const parse = (text) => latticeDeck.parse(src(text)).tree;
const slice = (text, n) => text.slice(n.from, n.to);
const shape = (n) => (n.kids.length ? [n.kind, n.kids.map(shape)] : n.kind);

describe('lattice-deck: the tree', () => {
  test('a slide holds its blocks, nested in their containers, and its comments with directives and notes', () => {
    const text = '---\ntheme: indaco\n---\n<!-- _class: lead -->\n# Hi\n\n- a\n  > q\n\n<!-- a speaker note -->\n';
    const tree = parse(text);
    assert.deepEqual(tree.kids.map((k) => k.kind), ['front-matter', 'slide']);
    assert.deepEqual(tree.kids[1].kids.map(shape), [['comment', ['directive']], 'heading', ['list', [['item', ['paragraph', ['quote', ['paragraph']]]]]], ['comment', ['note']]]);
    const [dir] = tree.kids[1].kids[0].kids;
    assert.deepEqual(dir.attrs, { key: 'class', spot: true, value: 'lead', folded: false, record: false });
    assert.equal(slice(text, dir.parts.key), '_class');
    assert.equal(slice(text, dir.parts.value), 'lead');
    assert.equal(slice(text, tree.kids[1].kids[3].kids[0]), 'a speaker note');
  });

  test('every field of a record is a directive; the parts search never reuses an earlier field\'s text', () => {
    const text = '<!-- {layout=cards, footer="cards"} -->\n';
    const comment = parse(text).kids[0].kids[0];
    assert.equal(comment.attrs.record, true);
    assert.deepEqual(comment.kids.map((d) => [d.attrs.key, d.attrs.value]), [['class', 'cards'], ['footer', 'cards']]);
    // `layout=` sets `class`, so the first field has no key part, and its span is the comment.
    assert.equal(comment.kids[0].parts.key, undefined);
    assert.equal(slice(text, comment.kids[1].parts.key), 'footer');
    assert.equal(text.indexOf('cards', text.indexOf('footer')), comment.kids[1].parts.value.from);
  });

  test('a comment the engine folds into an HTML block sits under it, folded, and resolves nothing', () => {
    const text = '<div>\n<!-- _class: kpi -->\n</div>\n';
    const tree = parse(text);
    const html = tree.kids[0].kids[0];
    assert.equal(html.kind, 'html-block');
    assert.deepEqual(html.kids.map(shape), [['comment', ['directive']]]);
    assert.equal(html.kids[0].attrs.folded, true);
    assert.equal(html.kids[0].kids[0].attrs.folded, true);
    assert.deepEqual(latticeDeck.facts['slide.classes'](tree, null, tree.slideNodes[0]), []);
  });

  test('a comment its list item ends before `-->` is folded too', () => {
    const tree = parse('- a\n  <!-- _class: kpi\n\n-->\n');
    const comments = [];
    const walk = (n) => {
      for (const k of n.kids) k.kind === 'comment' ? comments.push(k) : walk(k);
    };
    walk(tree);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].attrs.folded, true);
    // Inside its item: the comment block's range takes in the blank line that ends it, and its span does not.
    assert.equal(tree.kids[0].kids[0].kids[0].kids.at(-1), comments[0]);
  });

  test('a comment in a fence is code, not a comment', () => {
    const tree = parse('```html\n<!-- _class: kpi -->\n```\n');
    assert.deepEqual(tree.kids[0].kids.map((k) => k.kind), ['fence']);
  });

  test('notes and code are inert; directives are not', () => {
    const text = '<!-- _class: lead -->\n<!-- say this -->\n\n```\ncode\n```\n';
    const tree = parse(text);
    assert.deepEqual(latticeDeck.inert(tree).map((s) => slice(text, s)), ['say this', '```\ncode\n```']);
    assert.deepEqual(latticeDeck.shape(tree, src(text)).inert, ['say this', '```\ncode\n```']);
  });

  test('maps spans onto a CRLF source with a BOM', () => {
    const text = '﻿<!-- _class: lead -->\r\n# A\r\n\r\n<!-- note -->\r\n';
    const tree = parse(text);
    const [c1, , c2] = tree.kids[0].kids;
    assert.equal(slice(text, c1.kids[0].parts.value), 'lead');
    assert.equal(slice(text, c2.kids[0]), 'note');
  });
});

describe('lattice-deck: facts and location', () => {
  const text = '---\ntheme: indaco\n---\n<!-- class: kpi wide -->\n# One\n\n---\n\n<!-- _class: lead -->\n# Two\n\n---\n\n<!-- _footer: f -->\n# Three\n';
  const tree = parse(text);
  const fact = (name, i) => latticeDeck.facts[name](tree, null, tree.slideNodes[i]);

  test('slide.classes and slide.directives resolve as the engine does: a global runs on, a spot lasts one slide', () => {
    assert.deepEqual([0, 1, 2].map((i) => fact('slide.classes', i)), [['kpi', 'wide'], ['lead'], ['kpi', 'wide']]);
    assert.deepEqual([...fact('slide.directives', 2).keys()].sort(), ['class', 'footer']);
    assert.deepEqual([...fact('slide.directives', 1).keys()], ['class']);
  });

  test('slide.number and locate count as lint findings do: front matter is slide 0, and a leading break drops the empty chunk', () => {
    assert.deepEqual([0, 1, 2].map((i) => fact('slide.number', i)), [1, 2, 3]);
    assert.deepEqual(latticeDeck.locate(tree, { from: 2, to: 3 }), { slide: 0 });
    assert.deepEqual(latticeDeck.locate(tree, { from: text.indexOf('# Three'), to: text.length }), { slide: 3 });
    const lead = parse('\n---\n\n# A\n\n---\n\n# B\n');
    assert.equal(lead.model.leadingEmpty, true);
    assert.deepEqual(lead.slideNodes.map((s) => latticeDeck.facts['slide.number'](lead, null, s)), [0, 1, 2]);
  });

  test('one parse per text and plugin-rule generation: a plugin switch re-reads the deck', () => {
    const math = '$$\n\n---\n\n$$\n';
    const a = parse(math);
    assert.equal(parse(math).model, a.model);
    try {
      setBoundaryPluginsOff(['math']);
      const off = parse(math);
      assert.notEqual(off.model, a.model);
      assert.notEqual(off.slideNodes.length, a.slideNodes.length);
    } finally {
      setBoundaryPluginsOff([]);
    }
  });
});

describe('the Lattice entry', () => {
  // A rule written for these tests only: it proves the entry, the stamps and the runtime check end to end without
  // landing a rule family (those come one commit each, with their reference diff).
  const shout = {
    id: 'deck/test-shout',
    language: 'lattice-deck',
    severity: 'warning',
    summary: 'A heading in capitals.',
    examples: 'shout.fixtures.md',
    fixable: true,
    budget: { ops: 10_000 },
    visit: {
      heading(node, ctx) {
        const t = ctx.text(node);
        if (!/^#+ [A-Z]{3,}$/.test(t)) return;
        const span = { from: node.from, to: node.to };
        ctx.report({ span, message: 'Shouting.', fixes: [editsFix('Lower it.', { op: 'replace', span, text: t.replace(/[A-Z]+/, (w) => w[0] + w.slice(1).toLowerCase()) })] });
      },
    },
  };
  const examples = { 'shout.fixtures.md': '````md bad\n⟦# LOUD⟧\n````\n````md fixed\n# Loud\n````\n````md good\n# Quiet\n\n<!-- # LOUD -->\n````\n' };
  const input = { name: 'deck', version: '1', languages: [latticeDeck], rules: [shout], examples, vocab: squadraVocab({}) };

  test('lintDeck and fixDeck run a verified rule; the finding carries span, slide and a fix', () => {
    compileRuleset(input);
    const ruleset = deckRuleset({}, { rules: [shout], verified: digestRuleset(input) });
    const text = '---\ntheme: indaco\n---\n# Fine\n\n---\n\n# LOUD\n';
    const [f] = lintDeck(text, { ruleset });
    assert.equal(f.rule, 'deck/test-shout');
    assert.equal(text.slice(f.span.from, f.span.to), '# LOUD');
    assert.equal(f.location.slide, 2);
    assert.equal(f.start.line, 8);
    assert.equal(fixDeck(text, { ruleset }).text, text.replace('# LOUD', '# Loud'));
  });

  test('a rule the build did not verify is refused, never run', () => {
    const ruleset = deckRuleset({}, { rules: [shout], verified: {} });
    const out = lintDeck('# LOUD\n', { ruleset });
    assert.deepEqual(out.map((f) => [f.rule, f.data.code]), [['squadra/rule-refused', 'not-verified']]);
  });

  test('the committed ruleset loads clean against the committed digests', () => {
    const rs = deckRuleset();
    assert.deepEqual(rs.refused, []);
    assert.deepEqual(lintDeck('# Hi\n'), []);
    assert.equal(fixDeck('# Hi\n').text, '# Hi\n');
  });

  test('the vocab bridge carries string lists, sorted, and drops structured fields', () => {
    assert.deepEqual(squadraVocab({ names: new Set(['b', 'a']), capacity: { x: 1 }, finishNames: ['z', 'y'], n: 3 }), { names: ['a', 'b'], finishNames: ['y', 'z'] });
  });
});

describe('the stamps', () => {
  test('the committed verified.generated.json is what the build writes (build:check runs the same comparison)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { render } = require('../../../tools/build-squadra-stamps');
    const committed = fs.readFileSync(path.join(__dirname, '../../../lib/authoring/rules/verified.generated.json'), 'utf8');
    assert.equal(render(), committed);
  });

  test('a rule that fails its own examples stops the build', () => {
    const { render } = require('../../../tools/build-squadra-stamps');
    const broken = { id: 'deck/test-never', language: 'lattice-deck', severity: 'info', summary: 'Never fires.', examples: 'n.md', budget: { ops: 10 }, visit: { heading() {} } };
    assert.throws(() => render({ name: 'deck', version: '1', languages: [latticeDeck], rules: [broken], examples: { 'n.md': '````md bad\n# A\n````\n````md good\n# B\n````\n' } }), /bad-did-not-fire/);
  });
});

describe('lattice-deck: what the checker found', () => {
  test('a key is found at a key boundary only: `class` is never the start of `classic-cards`', () => {
    const text = '<!-- {layout=classic-cards, footer="Q3"} -->\n';
    const [cls, footer] = parse(text).kids[0].kids[0].kids;
    assert.equal(cls.parts.key, undefined);
    assert.equal(slice(text, footer.parts.key), 'footer');
  });

  test('a comment its item ends before `-->` keeps its block\'s span: nothing reaches past it, and no live text goes inert', () => {
    for (const text of ['- <!--\n\n_class: kpi\n-->\n\n# h\n', '> <!-- note\n\nmore\n-->\n']) {
      const tree = parse(text);
      const within = (p) => {
        for (const k of p.kids) {
          assert.ok(p.kind === 'deck' || (p.from <= k.from && k.to <= p.to), `${k.kind} ${slice(text, k)} sits outside ${p.kind}`);
          within(k);
        }
      };
      within(tree);
      for (const s of latticeDeck.inert(tree)) assert.ok(!slice(text, s).includes('more') && !slice(text, s).includes('_class'), slice(text, s));
      const found = [];
      const walk = (n) => {
        for (const k of n.kids) k.kind === 'comment' ? found.push(k) : walk(k);
      };
      walk(tree);
      assert.equal(found.length, 1);
      const [comment] = found;
      assert.equal(comment.attrs.folded, true);
      assert.ok(comment.attrs.authoredTo > comment.to);
    }
  });
});

describe('the reference diff: matching and explanations', () => {
  const { match, changedRules, explain } = require('../../../tools/squadra-reference-diff');
  const r = (o) => ({ rule: 'x', severity: 'warning', slide: 1, message: 'm', line: 3, text: 'a', ...o });

  test('two findings on two identical lines match by line text, whichever line each side names', () => {
    const m = match([r({ line: 3 }), r({ line: 3 })], [r({ line: 3 }), r({ line: 7 })]);
    assert.equal(m.same.length, 2);
    assert.deepEqual([m.oldOnly, m.newOnly], [[], []]);
  });

  test('an unlocated lint-core finding matches on the other fields and is counted apart', () => {
    const m = match([r({ text: null, line: 0 })], [r({ text: 'b' })]);
    assert.equal(m.matchedUnlocated.length, 1);
    assert.deepEqual([m.oldOnly, m.newOnly], [[], []]);
  });

  test('a different line, message or slide is a difference', () => {
    for (const other of [{ text: 'b' }, { message: 'n' }, { slide: 2 }]) {
      const m = match([r()], [r(other)]);
      assert.equal(m.oldOnly.length, 1);
      assert.equal(m.newOnly.length, 1);
    }
  });

  test('changedRules sees a partly fixed rule, not only a rule that disappears', () => {
    assert.deepEqual([...changedRules([r(), r()], [r()])], ['x']);
    assert.deepEqual([...changedRules([r()], [r()])], []);
  });

  test('an explanation covers the differences its pattern matches, and counts its hits', () => {
    const entries = [{ rule: 'x', kind: 'lint', re: /^known/, why: 'intended', hits: 0 }];
    assert.ok(explain(entries, 'x', 'lint', 'known gap'));
    assert.equal(explain(entries, 'x', 'lint', 'other'), null);
    assert.equal(explain(entries, 'x', 'fix', 'known gap'), null);
    assert.equal(entries[0].hits, 1);
  });
});

describe('the frozen reference', () => {
  test('is lib/authoring/lint-core.js as this branch carries it (re-freeze: node tools/squadra/freeze-reference.js)', () => {
    const { isCurrent } = require('../../../tools/squadra/freeze-reference');
    assert.ok(isCurrent(), 'lint-core moved (a rebase or merge of main brought it): run `node tools/squadra/freeze-reference.js`');
  });
});
