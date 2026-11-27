/**
 * Unit: where a quoted passage breaks across pages (lib/core/passage-sentences.js). The measured
 * split and the `passage` strategy must find the same breaks, so the rule and the HTML cut are
 * pinned here on the shapes the legal galleries carry.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sentenceStarts, clauseStarts, textOf, splitHtmlAtText, passageCuts, editMarks, CLAUSE_STARTS_SRC } = require('../../../lib/core/passage-sentences');

const starts = (t) => sentenceStarts(t).map((i) => t.slice(i, i + 8));

test('a sentence ends at a stop followed by a capital', () => {
  assert.deepEqual(starts('One rule. Two rules! Three? Four.'), ['Two rule', 'Three? F', 'Four.']);
  assert.deepEqual(starts('"Quoted." Then this.'), ['Then thi']);
  assert.deepEqual(starts('Ends here.\n\nNext paragraph.'), ['Next par']);
});

test('an abbreviation, an initial or a dotted citation ends nothing', () => {
  assert.deepEqual(starts('See Cal. Civ. Code §1798.140 here. Next.'), ['Next.']);
  assert.deepEqual(starts('Under 15 U.S.C. Section 6501 it applies. Done.'), ['Done.']);
  assert.deepEqual(starts('As J. Smith wrote, e.g. This stays. Done.'), ['Done.']);
  assert.deepEqual(starts('Acme Inc. Holds it. Then.'), ['Then.']);
});

test('a closing quote written as an entity still ends the sentence', () => {
  const html = '<p>&quot;He said it.&quot; Then she left.</p>';
  const [a, b] = splitHtmlAtText(html, sentenceStarts(textOf(html)));
  assert.equal(a, '<p>&quot;He said it.&quot; </p>');
  assert.equal(b, '<p>Then she left.</p>');
});

test('a lower-case word after a stop does not start a sentence', () => {
  assert.deepEqual(starts('version 2. and more. Then.'), ['Then.']);
});

test('the text offsets count an entity as one character, as the browser does', () => {
  const html = '<p>&quot;PI&quot; means data. It also covers devices.</p>';
  const text = textOf(html);
  assert.equal(text.length, '"PI" means data. It also covers devices.'.length);
  assert.equal(text, '"PI" means data. It also covers devices.');
  const [cutAt] = sentenceStarts(text);
  const [a, b] = splitHtmlAtText(html, [cutAt]);
  assert.equal(a, '<p>&quot;PI&quot; means data. </p>');
  assert.equal(b, '<p>It also covers devices.</p>');
});

test('a cut inside an inline element closes it and opens it again on the next piece', () => {
  const html = '<p>A business that <ins class="x">sells data. It must</ins> tell users.</p>';
  const [cutAt] = sentenceStarts(textOf(html));
  const [a, b] = splitHtmlAtText(html, [cutAt]);
  assert.equal(a, '<p>A business that <ins class="x">sells data. </ins></p>');
  assert.equal(b, '<p><ins class="x">It must</ins> tell users.</p>');
});

test('a cut at a paragraph boundary leaves no empty paragraph behind', () => {
  const html = '\n<p>First one.</p>\n<p>Second one.</p>\n';
  const cuts = sentenceStarts(textOf(html));
  assert.equal(cuts.length, 1);
  const [a, b] = splitHtmlAtText(html, cuts);
  assert.equal(a.trim(), '<p>First one.</p>');
  assert.equal(b.trim(), '<p>Second one.</p>');
});

test('no cut returns the fragment whole, and every character lands on exactly one piece', () => {
  const html = '<p>One. Two. Three.</p>';
  assert.deepEqual(splitHtmlAtText(html, []), [html]);
  const pieces = splitHtmlAtText(html, sentenceStarts(textOf(html)));
  assert.equal(pieces.length, 3);
  assert.equal(pieces.map(textOf).join(''), textOf(html));
});

test('the rule is self-contained, so it can travel into the page as source', () => {
  // biome-ignore lint/security/noGlobalEval: the point is to evaluate the shipped source alone.
  const fn = (0, eval)(`(${require('../../../lib/core/passage-sentences').SENTENCE_STARTS_SRC})`);
  assert.deepEqual(fn('A one. B two.'), [7]);
});

test('a redline never breaks between a deletion and its replacement', () => {
  const html = '<p>Fees are due. <del>Late fees apply after ten days.</del> <ins>Late fees apply after thirty days.</ins> Notices follow.</p>';
  assert.equal(editMarks(html).length, textOf(html).length);
  const cuts = passageCuts(html);
  const pieces = splitHtmlAtText(html, cuts);
  assert.ok(pieces.some((p) => /<del>[\s\S]*<\/del>\s*<ins>/.test(p)), 'the del and its ins share a page');
  assert.equal(cuts.length, 2, 'before the deletion and after its replacement, never between them');
  assert.equal(passageCuts('<p>One rule. Two rules.</p>').length, 1, 'with no edit, the break stays');
});

test('entity names are read case-sensitively, as the browser does', () => {
  assert.equal(textOf('&rdquo;x&ldquo;'), '\u201dx\u201c');
  assert.equal(textOf('&NBSP;'), '&NBSP;');
});

test('a whole inserted sentence may begin or end a page; a cut inside one edit may not', () => {
  const html = '<p>A business shall act. <ins>The link shall read "Choices."</ins> Consumers use it.</p>';
  assert.equal(passageCuts(html).length, 2, 'before and after the inserted sentence');
  assert.equal(passageCuts('<p><ins>One added. Two added.</ins></p>').length, 0, 'never inside one insertion');
  assert.equal(passageCuts('<p><del>Old rule.</del> <ins>New rule.</ins></p>').length, 0, 'never between a deletion and its replacement');
  assert.equal(editMarks('<p>a<del>b</del><ins>c</ins></p>'), '0di');
});

// A REDLINE MAY BREAK BETWEEN CLAUSES (owner, 2026-11-13; fit-everywhere-model.md §23): after a
// semicolon, or after a comma before `and`, `or` or `but`, never elsewhere inside a clause.
test('a clause starts after a semicolon, or after a comma before and / or / but', () => {
  const text = 'The lessee shall pay rent; the lessor shall keep the roof, and neither may assign, or sublet, but notice cures.';
  const starts = clauseStarts(text);
  assert.deepEqual(starts.map((at) => text.slice(at, at + 4)), ['the ', 'and ', 'or s', 'but ']);
});

test('a comma before any other word, or with no space after it, starts no clause', () => {
  assert.deepEqual(clauseStarts('Rent, taxes, andirons, ordinary wear, butter.'), []);
  assert.deepEqual(clauseStarts('1,000 or 2;3'), []);
});

test('only a redline breaks between clauses, and never inside or across an edit', () => {
  const html = '<p>The lessee shall pay rent; the lessor shall keep the roof.</p>';
  assert.equal(passageCuts(html).length, 0, 'a quote or citation keeps the sentence whole');
  assert.equal(passageCuts(html, { clauses: true }).length, 1, 'a redline may break after the semicolon');
  const edited = '<p>The lessee <del>shall pay rent; the lessor</del> <ins>must pay rent; the owner</ins> keeps the roof.</p>';
  assert.equal(passageCuts(edited, { clauses: true }).length, 0, 'a clause break inside a deletion or an insertion is refused');
});

test('the clause rule is self-contained, so it can travel into the page as source', () => {
  const fromSource = new Function(`return (${CLAUSE_STARTS_SRC})`)();
  const text = 'One clause; two clauses, and three.';
  assert.deepEqual(fromSource(text), clauseStarts(text));
});
