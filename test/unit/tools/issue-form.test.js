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

// ── Fenced code is not a field source ────────────────────────────────────────
// A `#`-prefixed line inside a fence is a shell comment or a pasted log, not a
// heading. Honoring it both invents a field AND captures a value that runs past
// the closing fence into unrelated prose. The canonical names are long enough
// that this stayed theoretical; the aliases are not — "# Done when" is an
// ordinary thing to find in a snippet, and a card must not reach status:ready
// on one.

const fence = '```';

describe('parseForm — headings inside a code fence are ignored', () => {
  test('an ALIAS heading inside a fence does not fill the field', () => {
    const body = ['# card', '', `${fence}sh`, '# Done when', 'echo hi', fence, '', 'prose'].join('\n');
    assert.equal(parseForm(body).acceptance, undefined);
  });
  test('a CANONICAL heading inside a fence does not become a field either', () => {
    const body = ['# card', '', `${fence}md`, '### Acceptance check', 'sample', fence].join('\n');
    assert.equal(parseForm(body).acceptance, undefined);
  });
  test('tilde fences count too', () => {
    const body = ['# card', '', '~~~sh', '# Acceptance', 'echo hi', '~~~'].join('\n');
    assert.equal(parseForm(body).acceptance, undefined);
  });
  test('a real heading AFTER a closed fence is still found', () => {
    const body = ['# card', '', `${fence}sh`, '# Done when', fence, '', '## Definition of done', '', '- [ ] real'].join('\n');
    assert.match(parseForm(body).acceptance, /real/);
  });
  test('an UNCLOSED fence masks the rest — failing closed, which the DoR wants', () => {
    // The gate then reports the field missing rather than inventing one from
    // inside the fence. Conservative is the correct direction here.
    const body = ['# card', '', `${fence}sh`, 'echo hi', '', '## Definition of done', '', '- [ ] never seen'].join('\n');
    assert.equal(parseForm(body).acceptance, undefined);
  });
});

describe('parseForm — a skipped required field is NOT rescued by prose', () => {
  test('"_No response_" on a ★ field stays empty even with a Definition of done below', () => {
    // `_No response_` is the author explicitly skipping the field. The alias
    // pass fills only fields whose canonical heading is ABSENT, so the gate goes
    // on rejecting a form card that left a ★ field blank — the property that
    // makes this change safe for form-filed cards.
    const f = parseForm(form({ acceptance: '_No response_', notes: '## Definition of done\n\n- [ ] rescued?' }));
    assert.ok(!f.acceptance, 'an explicitly skipped required field must stay empty');
  });
});

// ── Fence matching follows CommonMark, not a toggle ──────────────────────────
// A fence closes only on the SAME character, at least as long. A naive
// open/close toggle inverts on a card that pastes a markdown EXAMPLE — an inner
// ``` inside an outer ~~~ flips it, and the heading after is exposed as a field
// again. Showing a fence inside a fence is ordinary on a card documenting a
// template, and this is the masker's own defect class one level deeper.

const tick = '```';
const tilde = '~~~';

describe('parseForm — nested fences', () => {
  test('an UNBALANCED inner fence does not expose the heading after it', () => {
    const body = ['# card', '', `${tilde}markdown`, `${tick}sh`, '# Acceptance', 'inside', tilde, '', 'body'].join('\n');
    assert.equal(parseForm(body).acceptance, undefined);
  });
  test('an inner fence of the other kind does not close the outer one', () => {
    const body = ['# card', '', `${tilde}md`, '# Done when', `${tick}sh`, 'echo hi', tick, tilde, '',
      '## Definition of done', '', '- [ ] the real one'].join('\n');
    assert.match(parseForm(body).acceptance, /the real one/);
  });
  test('a longer wrapper fence holds across the shorter ones it contains', () => {
    const body = ['# card', '', '````', '# Acceptance', tick, 'x', tick, '````', '',
      '## Definition of done', '', '- [ ] real'].join('\n');
    assert.match(parseForm(body).acceptance, /real/);
  });
  test('a shorter run does not close a longer opening fence', () => {
    // The heading must sit AFTER the non-closing run to discriminate: before it,
    // the heading is masked either way and the assertion proves nothing
    // (mutation-checked — the first draft of this test was exactly that).
    const body = ['# card', '', '````', 'x', tick, '# Acceptance', 'still inside', '````'].join('\n');
    assert.equal(parseForm(body).acceptance, undefined);
  });
});
