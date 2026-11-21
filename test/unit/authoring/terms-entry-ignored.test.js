// `terms-entry-ignored`: a `terms:` line the reader skips is reported, with the reason the READER gives
// (lib/core/resolve-narration.mjs `termsIssues`), so lint and the voice cannot disagree. Before, every
// one of these read as no term at all and `lint:deck` called the deck clean.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');

const vocab = { names: new Set(), modifiers: new Set(), capacity: {} };
const findings = (fm) => core.lintTextWith(`---\n${fm}\n---\n\n# Deck\n`, vocab).filter((f) => f.rule === 'terms-entry-ignored');
let termsSpokenMap, termEntries;
test.before(async () => {
  ({ termsSpokenMap, termEntries } = await import('../../../lib/core/resolve-narration.mjs'));
});
const spoken = (fm) => [...termsSpokenMap(`---\n${fm}\n---\n`)];

describe('terms: reads what YAML reads', () => {
  test('a plain key may hold spaces and a period', () => {
    assert.deepEqual(spoken('terms:\n  Oct. Tenth: October Tenth'), [['Oct. Tenth', 'October Tenth']]);
    assert.deepEqual(findings('terms:\n  Oct. Tenth: October Tenth'), []);
  });
  test('a comment after a value is not spoken; a # inside quotes or a word is', () => {
    assert.deepEqual(spoken('terms:\n  Yearn: yurn # the protocol'), [['Yearn', 'yurn']]);
    assert.deepEqual(spoken('terms:\n  C# team: see sharp team'), [['C# team', 'see sharp team']]);
    const e = termEntries('---\nterms:\n  EBITDA:\n    pronounce: ee bit dah # said\n    definition: "Profit # before costs"\n---\n');
    assert.deepEqual(e.get('EBITDA'), { pronounce: 'ee bit dah', definition: 'Profit # before costs', from: 'terms' });
  });
  test('the older lexicon: key drops its comment too', () => {
    assert.deepEqual([...termsSpokenMap('---\nlexicon:\n  "→": leads to   # not "to"\n---\n')], [['→', 'leads to']]);
  });
  test('the whole block may be one flow map, with a term object inside', () => {
    assert.deepEqual(spoken('terms: { Yearn: yurn, "Oct. Tenth": { pronounce: October Tenth } }'), [['Yearn', 'yurn'], ['Oct. Tenth', 'October Tenth']]);
  });
});

describe('terms: comments, escapes and say prose', () => {
  test('a comment line anywhere in the block is skipped, and never ends it or moves its indent', () => {
    const fm = 'terms:\n  # glossary\n    Yearn:\n      # how the team says it\n      pronounce: yurn\n# a root comment\n    Derby: Darby';
    assert.deepEqual(spoken(fm), [['Yearn', 'yurn'], ['Derby', 'Darby']]);
    assert.deepEqual(findings(fm), []);
    assert.deepEqual(spoken('terms: # names\n  Derby: Darby'), [['Derby', 'Darby']]);
  });
  test('an escaped quote inside a double-quoted value does not end it', () => {
    assert.deepEqual(spoken('terms:\n  Hi: "say \\"hi\\" #1 now" # note'), [['Hi', 'say "hi" #1 now']]);
  });
  test('a say line keeps a # in its prose', async () => {
    // The front-matter `say:` map is gone (engineering/decisions/2026-11-20-four-notes.md N6); a say line is the
    // slide's `@say{…}`, whose body is prose read whole, never YAML with a comment.
    const { readNote } = await import('../../../lib/core/note-grammar.mjs');
    assert.equal(readNote('@say{We are Team #1 in the market}').text, 'We are Team #1 in the market');
  });
});

describe('terms-entry-ignored', () => {
  test('an unknown field names the field that was meant', () => {
    const f = findings('terms:\n  Yearn: { pronunciation: yurn }');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'warning');
    assert.match(f[0].fix, /`pronounce:`/);
    assert.match(findings('terms:\n  Yearn:\n    say: yurn')[0].fix, /`pronounce:`/);
    assert.match(findings('terms:\n  CRO: { meaning: chief revenue officer }')[0].fix, /`expansion:`/);
  });
  test('an unknown field with no likely meaning lists the three', () => {
    assert.match(findings('terms:\n  Yearn: { colour: blue }')[0].fix, /`pronounce`.*`expansion`.*`definition`/);
  });
  test('a list item, an empty entry and a stray line are each reported', () => {
    assert.match(findings('terms:\n  - Yearn: yurn')[0].message, /map, not a list/);
    assert.match(findings('terms:\n  Yearn:')[0].message, /no value/);
    assert.equal(findings('terms:\n  Yearn: yurn\n      pronounce: x').length, 1);
  });
  test('a clean block, a comment line and a silenced term are silent', () => {
    assert.deepEqual(findings('terms:\n  # names\n  Derby: Darby\n  "🎯": ""\n  CRO: { expansion: chief revenue officer }'), []);
  });
});
