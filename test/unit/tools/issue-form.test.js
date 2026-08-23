/**
 * Unit: issue-form parser (.github/scripts/issue-form.js).
 *
 * Pins the two extraction bugs a naive "slice to the next ###" helper hits and
 * the gate/labeler workflows share: a value that CONTAINS a heading must not be
 * truncated (H2), and a stray heading in prose must not be mistaken for a field
 * (M1). Both gate workflows depend on this, so the bugs are tested at the seam.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { parseForm } = require(path.join(__dirname, '..', '..', '..', '.github', 'scripts', 'issue-form.js'));

// A representative rendered work-item form body.
const form = ({ swimlane = 'decisions/x.md', acceptance = 'tests pass', area = 'area:chart', notes = '_No response_' } = {}) =>
  [
    '### Summary', '', 'Do the thing', '',
    '### ★ Swimlane / governing decision doc', '', swimlane, '',
    '### ★ Acceptance check', '', acceptance, '',
    '### Area', '', area, '',
    '### Type', '', 'type:feat', '',
    '### Priority', '', 'priority:high', '',
    '### Notes / context', '', notes,
  ].join('\n');

describe('parseForm — happy path', () => {
  test('extracts every field and strips the ★ marker', () => {
    const f = parseForm(form());
    assert.equal(f.summary, 'Do the thing');
    assert.equal(f.swimlane, 'decisions/x.md');
    assert.equal(f.acceptance, 'tests pass');
    assert.equal(f.area, 'area:chart');
    assert.equal(f.type, 'type:feat');
    assert.equal(f.priority, 'priority:high');
  });
  test('maps _No response_ to empty', () => {
    assert.equal(parseForm(form()).notes, '');
  });
});

describe('parseForm — H2: a value that contains a heading is NOT truncated', () => {
  test('acceptance check written with its own ### sub-heading survives intact', () => {
    const f = parseForm(form({ acceptance: '#### Steps\n\nrun `npm test`; it is green' }));
    assert.ok(f.acceptance.includes('run `npm test`'), 'value kept past the inner heading');
    assert.ok(f.acceptance.length > 0, 'a ready card is NOT seen as missing acceptance');
  });
});

describe('parseForm — M1: a stray heading in prose is not mistaken for a field', () => {
  test('a "### Area of concern" line inside Notes does not hijack the Area field', () => {
    const f = parseForm(form({ area: 'area:legal', notes: '### Area of concern\n\nlatency' }));
    assert.equal(f.area, 'area:legal', 'real Area field wins; the prose heading is ignored');
  });
  test('a heading-shaped swimlane value does not poison a later field', () => {
    const f = parseForm(form({ swimlane: '## Swimlane rework plan, see decisions/y.md' }));
    assert.match(f.swimlane, /decisions\/y\.md/);
    assert.equal(f.acceptance, 'tests pass', 'next field still extracted correctly');
  });
});

describe('parseForm — robustness', () => {
  test('normalises CRLF', () => {
    const f = parseForm(form().replace(/\n/g, '\r\n'));
    assert.equal(f.acceptance, 'tests pass');
  });
  test('empty / missing body yields an empty object', () => {
    assert.deepEqual(parseForm(''), {});
    assert.deepEqual(parseForm(null), {});
  });
});

// ── Hand-written cards (the alias pass) ───────────────────────────────────────
// The form is the easy path, not the only one. A card typed by hand or filed by
// an agent carries "## Definition of done", not "### ★ Acceptance check", and
// the DoR gate reads the parsed field — so a card that meets the bar in
// substance used to fail it on form. The pass is SECOND and fills only what the
// canonical headings left empty; these tests pin that ordering, because it is
// the whole reason H2/M1 still hold.

const handwritten = [
  '# regress: the goldens are stale on main', '',
  'Running the gate against a clean worktree fails for 11 of 68 galleries.', '',
  '## Swimlane', '', 'engineering/visual-review.md', '',
  '## Definition of done', '',
  '### Steps', '',
  '- [ ] eyeball each montage', '- [ ] re-bless the 10 galleries', '',
].join('\n');

describe('parseForm — alias headings on a hand-written card', () => {
  test('"## Definition of done" fills the acceptance field', () => {
    assert.match(parseForm(handwritten).acceptance, /re-bless the 10 galleries/);
  });
  test('"## Swimlane" fills the swimlane field', () => {
    assert.equal(parseForm(handwritten).swimlane, 'engineering/visual-review.md');
  });
  test('an alias section keeps its own sub-headings', () => {
    assert.match(parseForm(handwritten).acceptance, /### Steps/);
  });
  test('an alias section stops at the next same-level heading', () => {
    assert.doesNotMatch(parseForm(handwritten).swimlane, /Definition of done/);
  });
  test('every alias spelling is recognised', () => {
    for (const h of ['Acceptance criteria', 'Acceptance', 'Done when']) {
      const f = parseForm(`## ${h}\n\nthe gate is green\n`);
      assert.match(f.acceptance, /the gate is green/, `${h} should fill acceptance`);
    }
  });
  test('an EMPTY alias section is skipped, so a later filled one still wins', () => {
    // Asserting only "empty stays falsy" would be vacuous: an unguarded pass
    // sets '' there, which is ALSO falsy. Pinning that the scan CONTINUES past
    // the empty heading is what discriminates (mutation-checked).
    const body = '## Acceptance\n\n## Definition of done\n\nthe gate is green\n';
    assert.match(parseForm(body).acceptance, /the gate is green/);
  });
});

describe('parseForm — the canonical form still wins over an alias', () => {
  test('a real Acceptance check beats a "## Definition of done" in Notes', () => {
    const f = parseForm(form({ acceptance: 'the canonical one', notes: '## Definition of done\n\nthe alias one' }));
    assert.equal(f.acceptance, 'the canonical one');
  });
  test('an alias heading inside a canonical value does NOT truncate it (H2 holds)', () => {
    const f = parseForm(form({ acceptance: 'first line\n\n## Definition of done\n\nsecond line' }));
    assert.match(f.acceptance, /second line/, 'alias headings are not boundaries in pass 1');
  });
});
