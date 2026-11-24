/**
 * lib/core/meta-record.mjs: the one reader and writer of slide metadata in a comment
 * (design note 2026-10-17-meta-record.md §5.2). The corpus gate is meta-record-corpus.test.js;
 * these pin the mechanisms.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const m = { ...require('../../../lib/core/meta-record.mjs'), ...require('../../../lib/core/meta-edit.mjs') };
const { scanWork } = require('../../helpers/work-count');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

const SRC = '---\ntheme: indaco\n---\n\n<!-- class: dark -->\n<!-- _footer: One -->\n\n# A\n\n---\n\n<!-- _class: cards -->\n\n# B\n\n---\n\n# C\n';

describe('scanMetaSource', () => {
  const slides = m.scanMetaSource(SRC).slides.slice(2);
  test('a spot replaces the running global for its slide only; a global carries on', () => {
    assert.equal(slides[0].resolved.get('class').value, 'dark');
    assert.equal(slides[1].resolved.get('class').value, 'cards');
    assert.equal(slides[2].resolved.get('class').value, 'dark');
  });
  test('a spot lasts one slide', () => {
    assert.equal(slides[0].resolved.get('footer').value, 'One');
    assert.equal(slides[1].resolved.has('footer'), false);
  });
  // Since step 2 of the record note a top-level record is live: the scan resolves it exactly as the engine applies it.
  test('a comment in a fence is not read; a top-level record resolves like the directive it replaces', () => {
    const s = m.scanMetaSource('```\n<!-- _class: x -->\n```\n\n<!-- {layout=content} -->\n\n<!-- a note -->\n').slides.at(-1);
    assert.deepEqual([...s.resolved.keys()], ['class']);
    assert.equal(s.resolved.get('class').value, 'content');
    assert.deepEqual(s.comments.map((c) => c.kind), ['directive', 'comment']);
  });
  test('a record in a list item or a blockquote is classified, never resolved (D1: the engine does not apply it)', () => {
    const s = m.scanMetaSource('- item\n  <!-- {layout=cards} -->\n\n> <!-- {layout=cards} -->\n').slides.at(-1);
    assert.equal(s.resolved.size, 0);
    assert.deepEqual(s.comments.map((c) => c.kind), ['record', 'record']);
  });
});

describe('classifyComment and directiveKey', () => {
  test('directive, marker, record, note, comment', () => {
    assert.deepEqual(m.classifyComment(' _class: x '), { kind: 'directive', key: 'class', spot: true });
    assert.equal(m.classifyComment(' stress-slide ').kind, 'marker');
    assert.equal(m.classifyComment(' {layout=content} ').kind, 'record');
    assert.equal(m.classifyComment(' @meta{a=b} ').kind, 'record');
    // A note is named (engineering/decisions/2026-11-20-four-notes.md); anything else is the author's plain comment.
    for (const name of ['note', 'say', 'alt', 'handout']) assert.equal(m.classifyComment(` @${name}{remember to smile} `).kind, 'note', name);
    assert.equal(m.classifyComment(' remember to smile ').kind, 'comment');
    assert.equal(m.classifyComment(' say: the old say key ').kind, 'comment');
    assert.equal(m.classifyComment(' @Say{a near miss} ').kind, 'comment');
  });
  test('a bare key is a directive only when the key may be bare', () => {
    assert.equal(m.directiveKey('_build'), 'build');
    assert.equal(m.directiveKey('color'), '');
    assert.equal(m.directiveKey('color: red'), 'color');
  });
});

describe('readMetaField and writeMeta', () => {
  test('set, replace, remove, and a comment holding two lines is left as the engine reads it', () => {
    // Every write is a record, the one spelling Lattice writes (the owner, 2026-11-22: "we only support @meta"). A value
    // in an old directive comment moves into the record; the comment goes when it held nothing else.
    assert.equal(m.writeMeta('# A', { footer: 'Q3' }), '<!-- @meta{footer=Q3} -->\n\n# A');
    assert.equal(m.writeMeta('<!-- _footer: Q3 -->\n\n# A', { footer: 'Q4' }), '<!-- @meta{footer=Q4} -->\n\n# A');
    // A second directive line is part of the class to the engine (class `a _footer: Q3`, no footer), so the footer is absent:
    // setting it adds a record, and the comment, and what it renders, stay as written.
    assert.equal(m.writeMeta('<!-- _class: a\n_footer: Q3 -->\n\n# A', { footer: 'Q4' }), '<!-- @meta{footer=Q4} -->\n\n<!-- _class: a\n_footer: Q3 -->\n\n# A');
    assert.equal(m.writeMeta('<!-- _footer: Q3 -->\n\n# A', { footer: null }), '# A');
    assert.equal(m.writeMeta('<!-- _class: a\n_footer: Q3 -->\n\n# A', { footer: '' }), '<!-- _class: a\n_footer: Q3 -->\n\n# A');
  });
  test('a value can never close the comment', () => {
    assert.equal(m.writeMeta('# A', { footer: 'a --> b' }), '<!-- @meta{footer="a -> b"} -->\n\n# A');
    assert.equal(m.writeMeta('<!-- _footer: x -->\n\n# A', { footer: 'a ---> b --!> c' }), '<!-- @meta{footer="a -> b -!> c"} -->\n\n# A');
  });
  test('a duplicate or a YAML array is left alone', () => {
    const dup = '<!-- _class: a -->\n<!-- _class: b -->';
    assert.equal(m.readMetaField(dup, 'class').reason, 'duplicate');
    assert.equal(m.writeMeta(dup, { class: 'c' }), dup);
    assert.equal(m.readMetaField('<!-- _class: [a, b] -->', 'class').reason, 'array-form');
  });
  test('an unknown key throws', () => {
    assert.throws(() => m.writeMeta('# A', { nope: 'x' }), /not a slide-metadata key/);
  });
});

describe('commentBlocks: the directive editors read what the engine reads', () => {
  test('a comment inside a `<div>` block is not one: the class editor, the lint and the render agree on no class', () => {
    const src = '<div>\n<!-- _class: kpi -->\n</div>\n';
    assert.deepEqual(m.commentBlocks(src), []);
    assert.equal(m.readMetaField(src, 'class').present, false);
    assert.equal(m.scanMetaSource(src).slides[0].resolved.has('class'), false);
    // The failing arm: the notes reader still lists it (a note in an HTML block is live to the engine's notes reader).
    assert.equal(m.comments(src).length, 1);
  });
  test('a fenced, an indented and a mid-line comment are not blocks; a quoted and a listed one are', () => {
    const src = '```\n<!-- _class: a -->\n```\n\n    <!-- _class: b -->\n\ntext <!-- _class: c -->\n\n> <!-- _class: d -->\n\n- <!-- _class: e -->\n';
    assert.deepEqual(m.commentBlocks(src).map((c) => c.body.trim()), ['_class: d', '_class: e']);
  });
  test('offsets index the chunk as given: a BOM, CRLF line ends and front matter', () => {
    const src = '\uFEFF---\r\ntheme: x\r\n---\r\n\r\n<!-- _class: a -->\r\n<!--\r\none -->\r\n';
    const found = m.commentBlocks(src);
    assert.deepEqual(found.map((c) => src.slice(c.start, c.end)), ['<!-- _class: a -->', '<!--\r\none -->']);
    assert.deepEqual(found.map((c) => src.slice(c.bodyStart, c.bodyStart + c.body.length)), found.map((c) => c.body));
    assert.equal(m.readMetaField(src, 'class').value, 'a');
  });
  test('a block that is more than one comment is none: the engine reads its whole content', () => {
    for (const src of ['<!-- _class: kpi --> tail\n', '<!-- _class: kpi --> <!-- note\nmore -->\n', '<!-- _class: kpi --> <!-- _footer: x -->\n']) {
      assert.equal(m.readMetaField(src, 'class').present, false, JSON.stringify(src));
    }
  });
  test('a comment in a list item that spans a blank line is one block (markdown-it 14.3)', () => {
    assert.deepEqual(m.commentBlocks('- <!-- _class: kpi\n\n  -->\n').map((b) => b.body), [' _class: kpi\n\n  ']);
  });
  test('250 KB of unclosed openers is read in linear work', () => {
    // Counted, not timed (HARD RULE #32): the read covers about 5 times the text. A scan that searched for `-->` from
    // every opener to the end would cover about 2,500 times it at a tenth of this size.
    const t = '<!-- '.repeat(50000);
    const { result, scanned } = scanWork(() => m.commentBlocks(t));
    assert.deepEqual(result, []);
    assert.ok(scanned <= 15 * t.length, `${scanned} chars scanned for ${t.length}`);
  });
});

describe('the comment finder is linear on hostile text', () => {
  test('1 MB of unclosed openers is linear work and never hangs', () => {
    const t = '<!-- '.repeat(200000);
    // A search from every opener to the end, written as a loop, shows in the count: about 4 times the text today,
    // 25,000 times it at a quarter of this size.
    const { scanned } = scanWork(() => {
      assert.deepEqual(m.comments(t), []);
      assert.equal(m.hasMarker(t, 'stress-slide'), false);
    });
    assert.ok(scanned <= 10 * t.length, `${scanned} chars scanned for ${t.length}`);
    // The lazy regex this replaced (`/<!--([\s\S]*?)-->/g`, 5.4 s at 250 KB) did the same search inside one match,
    // where no count sees it. So every regex the two calls run must be one recheck calls linear
    // (test/helpers/regex-trace.js over tools/regex-census.json): no clock (HARD RULE #32).
    assertLinearRegexes(() => {
      m.comments(t);
      m.hasMarker(t, 'stress-slide');
    });
  });
  test('hasMarker ignores a fenced marker', () => {
    assert.equal(m.hasMarker('<!-- stress-slide -->', 'stress-slide'), true);
    assert.equal(m.hasMarker('```\n<!-- stress-slide -->\n```', 'stress-slide'), false);
    assert.equal(m.hasMarker('<!-- stress-slide -->', 'other'), false);
  });
});

describe('hostile-input cost, round 1 findings', () => {
  test('many comments against many fences stay linear (the line pointer only advances)', () => {
    // Counted, not timed (HARD RULE #32): one step per opener and one per line the pointer passes. Linear is
    // 8,000 openers + 24,000 lines; looking each opener's block up from the top, the path this guards, is about
    // 8,000 x 24,000 / 2.
    const t = '```\n```\n<!-- x -->\n'.repeat(8000);
    const work = { steps: 0 };
    assert.equal(m.comments(t, work).length, 8000);
    assert.ok(work.steps <= 8000 + 3 * 8000 + 2, `comments x fences took ${work.steps} steps, the quadratic path`);
  });
  test('openers in many paragraphs before one far closer are one search for it, not one each', () => {
    // Counted, not timed (HARD RULE #32). Each paragraph's `<!--` has no closer in its own leaf; the first cut searched for
    // `-->` from every one of them to the one at the end, about n x n / 2 characters (15 s at 320 KB). The closer is
    // remembered now, so the search covers the text about once.
    const t = `${'p <!--\n\n'.repeat(20000)}-->\n`;
    const { result, scanned } = scanWork(() => m.comments(t, { steps: 0 }));
    assert.deepEqual(result, []);
    assert.ok(scanned <= 20 * t.length, `${scanned} chars scanned for ${t.length}`);
  });
  test('many unterminated openers on separate lines are one failed scan, not one each', () => {
    // Counted, not timed (HARD RULE #32): about 8 times the text today. A walk that searched for `-->` from every
    // opener's line, the scan this replaced, covers about 1,000 times it at a tenth of this size.
    const t = '<!-- open\n'.repeat(20000);
    const { scanned } = scanWork(() => m.scanMetaSource(t));
    assert.ok(scanned <= 25 * t.length, `the comment scan rescanned to EOF per opener: ${scanned} chars for ${t.length}`);
  });
});

// The Studio asks for every slide's blocks several times per keystroke; one slide changes. Before the memo, each ask
// parsed its slide from nothing (594 of 595 full parses per 10 keystrokes in the real Studio, 2026-11-06).
describe('commentBlocks remembers each text', () => {
  test('asking again for the same text parses nothing; new text parses once', async () => {
    const { deckModelStats } = await import('@laticent/segno-languages/markdown');
    const slide = '<!-- _class: kpi -->\n\n## Remembered\n';
    const first = m.commentBlocks(slide);
    const before = deckModelStats.full;
    for (let i = 0; i < 20; i++) assert.deepEqual(m.commentBlocks(slide), first);
    assert.equal(deckModelStats.full - before, 0, 'a repeated ask must not parse');
    m.commentBlocks(`${slide}x`);
    assert.equal(deckModelStats.full - before, 1, 'a changed slide parses once');
  });

  test('a caller cannot change what the next caller gets', () => {
    const slide = '<!-- _class: lead -->\n\n## Shared\n';
    const a = m.commentBlocks(slide);
    a.pop();
    assert.ok(m.commentBlocks(slide).every((r) => Object.isFrozen(r)), 'every cached record is frozen');
    assert.equal(m.commentBlocks(slide).length, 1);
    assert.equal(m.commentBlocks(slide)[0].body, ' _class: lead ');
  });
});

// The inversion on step 3: what the structured edit must never do to a record slide.
describe('writeMeta on records: the inversion’s cases', () => {
  const edit = require('../../../lib/core/meta-edit.mjs');
  test('a one-slide key never joins a carry record or a pane marker', () => {
    assert.equal(edit.writeMeta('<!-- {class=cards, carry} -->\n\n# A', { backgroundColor: 'red' }), '<!-- @meta{background-color=red} -->\n\n<!-- {class=cards, carry} -->\n\n# A');
    assert.equal(edit.writeMeta('<!-- {pane=bar} -->\n\n- a', { footer: 'x' }), '<!-- @meta{footer=x} -->\n\n<!-- {pane=bar} -->\n\n- a');
  });
  test('red team: a note line reading `class:` is never a directive; a cleared field keeps the paragraphs apart; a line break folds', () => {
    const noted = '<!-- {footer=Q3}\nnote: |\n  Open with the chart.\n  class: the cohort we sold to\n-->\n\n# One';
    assert.equal(edit.readMetaField(noted, 'class').present, false);
    assert.match(edit.writeMeta(noted, { class: 'cards' }), /class: the cohort we sold to/);
    assert.equal(edit.writeMeta('# T\n\nPara one\n<!-- {footer=Q} -->\n\nPara two', { footer: '' }), '# T\n\nPara one\n\nPara two');
    assert.equal(edit.writeMeta('<!-- {layout=cards, footer=Q3} -->\n\n# Hi', { footer: 'a\r\nb' }), '<!-- {layout=cards, footer=a b} -->\n\n# Hi');
    // `with-icon` is not a word of the icon register (it has no on/off axis), so it stays in `class`.
    assert.equal(edit.writeMeta('<!-- {layout=cards} -->\n# Hi', { class: 'cards with-icon' }), '<!-- {layout=cards, class=with-icon} -->\n# Hi');
    // A note reading `class:` is a note, never a directive, whichever way it is written.
    assert.equal(edit.readMetaField('<!-- @note{class: the cohort we sold to} -->\n\n# One', 'class').present, false);
    assert.equal(Object.hasOwn(edit, 'readRecordChannel') || Object.hasOwn(edit, 'writeRecordChannel'), false, 'a record holds no note channel to edit');
  });
  test('a finish word or a variant swap stays typed', () => {
    assert.equal(edit.writeMeta('<!-- {layout=cards, finish=ledger} -->\n# A', { class: 'cards finish-halo' }), '<!-- {layout=cards, finish=halo} -->\n# A');
    assert.equal(edit.writeMeta('<!-- {layout=cards, variant=compact} -->\n# A', { class: 'cards wide' }), '<!-- {layout=cards, variant=wide} -->\n# A');
  });
  test('the layout word stays first: register words come after `class`', () => {
    const { readRecord } = require('../../../lib/core/meta-door.mjs');
    assert.equal(readRecord(' {headline=left, class=stats} ').d.class, 'stats head-left');
    assert.equal(readRecord(' {finish=ledger, layout=cards, class=compact} ').d.class, 'cards compact finish finish-ledger');
  });
});

describe('the red team on #3133 (#3136): dead records and repeats', () => {
  const edit = require('../../../lib/core/meta-edit.mjs');
  test('the live record is edited, never its twin in a blockquote', () => {
    assert.equal(edit.writeMeta('<!-- {class=dark} -->\n\n# T\n\n> <!-- {class=dark} -->\n', { class: 'lead' }).split('\n')[0], '<!-- {class=lead} -->');
  });
  test('a key set in two records is read-only, so clearing never revives the other', () => {
    const two = '<!-- {footer=A} -->\n<!-- {footer=B} -->\n\n# T';
    assert.equal(edit.readMetaField(two, 'footer').reason, 'duplicate');
    assert.equal(edit.writeMeta(two, { footer: '' }), two);
  });
  test('a pane marker is always written as a record, an old `_pane:` marker included', () => {
    assert.equal(edit.setCommentField('', 'pane', 'bar no-title'), '<!-- @meta{pane=bar no-title} -->');
    assert.equal(edit.setCommentField('<!-- _pane: list -->', 'pane', 'bar'), '<!-- @meta{pane=bar} -->');
    assert.equal(edit.setCommentField('', 'pane', ''), '<!-- @meta{pane=""} -->');
    assert.equal(edit.setCommentField('', 'panes', '60/40 stack'), '<!-- @meta{panes=60/40 stack} -->');
    assert.equal(edit.setCommentField('<!-- panes: 2 -->', 'footer', 'Q3'), '<!-- @meta{footer=Q3} -->');
    assert.equal(edit.setCommentField('<!-- {pane=list} -->', 'pane', 'bar'), '<!-- {pane=bar} -->');
  });
  test('a slide of many records nested in list items has no live record and no field (the shape the quadratic count hit)', () => {
    const many = (n) => Array.from({ length: n }, (_, i) => `- item\n  <!-- {footer=x${i}} -->`).join('\n');
    assert.equal(edit.readMetaField(many(300), 'class').present, false);
  });
});

describe('commentBlocks never remembers a slide too long to keep', () => {
  // A pasted phone photo makes a slide of about 4.5 MB. Remembered, every ask hashed the whole text (the Studio hands a new
  // string each time) and the memo, bounded only by count, could hold 512 of them (engineering/gotchas/studio-playground.md).
  const photoSlide = (k) => `<!-- _class: image -->\n\n![bg](data:image/jpeg;base64,${String.fromCharCode(65 + k).repeat(1_200_000)})\n`;

  test('three photo slides leave the memo holding none of their text, and the answer is unchanged', () => {
    const before = m.blocksStats.heldChars;
    for (let k = 0; k < 3; k++) {
      const found = m.commentBlocks(photoSlide(k));
      assert.deepEqual(found.map((b) => b.body.trim()), ['_class: image']);
      assert.equal(found[0].start, 0);
      assert.ok(Object.isFrozen(found[0]), 'a record read past the memo is frozen like a remembered one');
    }
    assert.equal(m.blocksStats.heldChars - before, 0);
  });

  test('a slide of ordinary length is still remembered', () => {
    const slide = "<!-- _class: kpi -->\n\n# Held only by this test\n";
    const before = m.blocksStats.heldChars;
    m.commentBlocks(slide);
    assert.equal(m.blocksStats.heldChars - before, slide.length);
  });
});

describe('commentBlocks memory is bounded by size as well as count', () => {
  test('slides just under the per-text cap never hold more than four million characters in all', () => {
    const slide = (k) => `<!-- _class: image -->\n\n![bg](data:image/jpeg;base64,${String.fromCharCode(65 + (k % 26)).repeat(900_000)}${k})\n`;
    for (let k = 0; k < 12; k++) {
      assert.deepEqual(m.commentBlocks(slide(k)).map((b) => b.body.trim()), ['_class: image']);
      assert.ok(m.blocksStats.heldChars <= 4_000_000, `after ${k + 1} slides the memo holds ${m.blocksStats.heldChars}`);
    }
    // The newest is still remembered: a size bound evicts the oldest, never the one just read.
    const before = m.blocksStats.heldChars;
    m.commentBlocks(slide(11));
    assert.equal(m.blocksStats.heldChars, before);
  });
});

// Slice C of the clean break (record note §15): the Studio writes `@meta` only, and an edit on a slide written in old
// directive comments moves that setting into the record WITHOUT changing what renders.
describe('writeMeta writes @meta only, and a moved setting renders the same', () => {
  const edit = require('../../../lib/core/meta-edit.mjs');
  const { createEngine } = require('../../../lib/engine');
  const engine = createEngine();
  const deck = (slide) => `---\nmarp: true\n---\n\n${slide}\n\n---\n\n# Next\n`;
  const cases = [
    // [slide, patch that re-sets the value it already has]
    ['<!-- _class: stats -->\n\n# A', { class: 'stats' }],
    ['<!-- _class: cards-grid dark -->\n\n# A', { class: 'cards-grid dark' }],
    ['<!-- _class: dark cards-grid -->\n\n# A', { class: 'dark cards-grid' }],
    ['<!-- _class: stats -->\n<!-- _footer: Q3 -->\n\n# A', { footer: 'Q3' }],
    ['<!-- _footer: Q3 -->\n<!-- _class: lead -->\n\n# A', { class: 'lead' }],
    // A running global (no `_`) keeps running onto the next slide: it becomes a `carry` record.
    ['<!-- backgroundColor: #123456 -->\n\n# A', { backgroundColor: '#123456' }],
    ['<!-- _backgroundColor: #123456 -->\n\n# A', { backgroundColor: '#123456' }],
    ['<!-- _paginate: false -->\n\n# A', { paginate: 'false' }],
    // An old comment beside a record (what the gallery generator writes for every sample slide): the attributes keep
    // their order, so the HTML stays byte for byte (the checker on this change).
    ['<!-- _footer: Q3 -->\n<!-- @meta{layout=stats} -->\n\n# A', { footer: 'Q3' }],
    ['<!-- _class: lead -->\n<!-- @meta{footer=x} -->\n\n# A', { class: 'lead' }],
    ['<!-- @meta{layout=stats} -->\n<!-- _footer: Q3 -->\n\n# A', { footer: 'Q3' }],
  ];
  for (const [slide, patch] of cases) {
    test(`${JSON.stringify(slide)} → a record, same HTML and CSS`, () => {
      const out = edit.writeMeta(slide, patch);
      assert.match(out, /<!-- @meta\{/, 'the setting is written as a record');
      const key = Object.keys(patch)[0];
      assert.doesNotMatch(out, new RegExp(`<!--\\s*_?${key}\\s*:`), 'the old comment no longer carries it');
      const a = engine.render(deck(slide));
      const b = engine.render(deck(out));
      assert.equal(b.html, a.html);
      assert.equal(b.css, a.css);
    });
  }
  test('the failing arm: writing the record WITHOUT the carry flag changes the next slide', () => {
    const slide = '<!-- backgroundColor: #123456 -->\n\n# A';
    const spot = '<!-- @meta{background-color=#123456} -->\n\n# A';
    assert.notEqual(engine.render(deck(spot)).html, engine.render(deck(slide)).html);
  });
  test('a comment inside a quote or a list, and a deck-wide key, are left to the markdown', () => {
    // A record there applies nothing, and a slide record cannot hold `lang`: moving either would drop it from the render.
    for (const [slide, patch, reason] of [
      ['> <!-- _footer: Q3 -->\n\n# A', { footer: 'Q4' }, 'nested'],
      ['- <!-- _class: lead -->\n\n# A', { class: 'lead invert' }, 'nested'],
      ['<!-- _lang: fr -->\n\n# A', { lang: 'de' }, 'deck'],
      ['# A', { lang: 'de' }, 'deck'],
    ]) {
      const key = Object.keys(patch)[0];
      assert.equal(edit.readMetaField(slide, key).reason, reason, slide);
      assert.equal(edit.readMetaField(slide, key).editable, false, slide);
      assert.equal(edit.writeMeta(slide, patch), slide, slide);
      const out = engine.render(deck(slide)).html;
      assert.equal(engine.render(deck(edit.writeMeta(slide, patch))).html, out);
    }
  });
  test('the failing arm: a nested record applies nothing', () => {
    assert.match(engine.render(deck('> <!-- _footer: Q3 -->\n\n# A')).html, /data-footer="Q3"/);
    assert.doesNotMatch(engine.render(deck('> <!-- @meta{footer=Q3} -->\n\n# A')).html.split('</section>')[0], /data-footer=/);
  });
  test('no write anywhere in the edit produces the old form or the bare form', () => {
    const outs = [
      edit.writeMeta('# A', { class: 'stats', footer: 'Q3', header: 'H', backgroundColor: 'red', paginate: 'true' }),
      edit.writeMeta('<!-- _class: stats -->\n# A', { footer: 'Q3' }),
      edit.setCommentField('', 'footer', 'Q3'),
      edit.setCommentField('<!-- _pane: bar -->', 'pane', 'line'),
    ].join('\n');
    assert.doesNotMatch(outs.replace(/<!-- _class: stats -->/g, ''), /<!--\s*_|<!--\s*\{/);
  });
});

test('a comment with a second directive line reads as the engine reads it: one class, no footer', async () => {
  // The engine reads `<!-- _class: stats\n_footer: Q3 -->` as ONE directive: class `stats _footer: Q3`, and no footer.
  // The failing arm: the old reader answered class `stats` and footer `Q3`, two settings the slide never got.
  const { readMetaField, writeMeta } = await import('../../../lib/core/meta-edit.mjs');
  const { createEngine } = require('../../../lib/engine');
  const c = '<!-- _class: stats\n_footer: Q3 -->\n\n# A\n';
  const html = createEngine().render(`---\ntheme: indaco\n---\n\n${c}`).html;
  assert.doesNotMatch(html, /data-footer=/);
  const cls = readMetaField(c, 'class');
  assert.equal(cls.value.replace(/\s+/g, ' '), 'stats _footer: Q3');
  assert.equal(cls.editable, false);
  assert.equal(cls.reason, 'compound');
  const footer = readMetaField(c, 'footer');
  assert.equal(footer.present, false);
  // Setting the footer the slide lacks writes a record that applies, and leaves the comment as written.
  const out = writeMeta(c, { footer: 'Q4' });
  const text = typeof out === 'string' ? out : out.text;
  assert.ok(text.includes('<!-- _class: stats\n_footer: Q3 -->'));
  assert.match(createEngine().render(`---\ntheme: indaco\n---\n\n${text}`).html, /data-footer="Q4"/);
});
