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
