// The per-rule migration diff on every PR (decision 2026-10-26-squadra-lint-library, design.md §15.3): each deck
// rule that moved from lint-core to the Squadra `deck` ruleset (lib/authoring/rules/) must report exactly what
// the lint-core detector it replaced reported (frozen in tools/squadra/legacy-detectors.js), record for record,
// on the mutated corpus and on the tracked decks; every fix it offers must apply through lint-core's `applyFix`
// and resolve its finding; and every rule must fire, so the diff proves something.
//
// Corpus 1 (every source the lint unit tests hand the linter) is left to `npm run squadra:migration-diff`,
// because recording it runs the whole lint test suite (about two minutes).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runDiff } = require('../../../tools/squadra-migration-diff');
const { RULES } = require('../../../lib/authoring/rules');
const { deckRuleFindings, deckRuleset } = require('../../../lib/authoring/squadra/deck-rules');
const core = require('../../../lib/authoring/lint-core');

test('every migrated rule matches the lint-core detector it replaced, and its fixes resolve', () => {
  const { failures, report } = runDiff({ hosts: 6 });
  assert.deepEqual(failures, [], report);
});

test('the deck ruleset compiles: every rule passes its own fixtures (design §8)', () => {
  const rs = deckRuleset();
  assert.deepEqual(rs.refused, []);
  assert.deepEqual(rs.rules.map((r) => r.id).sort(), RULES.map((r) => r.id).sort());
});

test('a running class set on an earlier slide is reported on each slide, with the fix only where the comment is', () => {
  const src = '<!-- class: cards banner-tag -->\n\n# One\n\n---\n\n# Two\n';
  const found = deckRuleFindings(src, 'tag-alias');
  assert.deepEqual(found.map((f) => [f.slide, !!f.autofixable]), [[1, true], [2, false]]);
  const fixed = core.applyFix(src, found[0]);
  assert.equal(fixed, '<!-- class: cards tag-band -->\n\n# One\n\n---\n\n# Two\n');
  assert.deepEqual(deckRuleFindings(fixed, 'tag-alias'), []);
});

test('lint-core reports the migrated rules through its own entry point, in its record shape', () => {
  const src = '# A\n\n<!-- _class: cards banner-tag -->\n\n- One\n  - body\n\n<!-- Say: private -->\n';
  const found = core.lintTextWith(src, require('../../../lib/authoring/lint').buildVocab()).filter((f) => f.rule === 'tag-alias' || f.rule === 'say-key-case');
  assert.deepEqual(found.map((f) => [f.rule, f.slide, f.line, !!f.autofixable]), [
    ['say-key-case', 1, '<!-- Say: private -->', false],
    ['tag-alias', 1, '<!-- _class: cards banner-tag -->', true],
  ]);
});

test('Fix all applies a migrated rule\'s fix through the driver', () => {
  const src = '# A\n\n<!-- _class: cards banner-tag -->\n\n- One\n  - body\n';
  const res = core.fixAllDetailed(src, require('../../../lib/authoring/lint').buildVocab());
  assert.equal(res.text, '# A\n\n<!-- _class: cards tag-band -->\n\n- One\n  - body\n');
  assert.ok(res.applied.some((a) => a.rule === 'tag-alias'));
});

test('a CRLF deck keeps the author\'s offsets: the fix lands on the word, not beside it', () => {
  const src = '# A\r\n\r\n<!-- _class: cards banner-tag -->\r\n\r\n- One\r\n';
  const res = core.fixAllDetailed(src, require('../../../lib/authoring/lint').buildVocab());
  assert.equal(res.text, '# A\r\n\r\n<!-- _class: cards tag-band -->\r\n\r\n- One\r\n');
});

test('say-key-case reads a run of unclosed openers in linear time (the regex it replaced was quadratic on it)', () => {
  // recheck's attack string for the old regex, at a size the quadratic reading takes minutes on and the linear one
  // reads at once: a regression shows as this test timing out, with no clock in the assertion.
  const attack = `# x\n\n${'<!--sAy:'.repeat(50_000)}${'--'.repeat(50_000)}`;
  assert.deepEqual(deckRuleFindings(attack, 'say-key-case'), []);
  assert.equal(deckRuleFindings(`${attack}>`, 'say-key-case').length, 1);
});

// ── Cases the maker-checker review found outside the corpora ────────────────
const { LEGACY } = require('../../../tools/squadra/legacy-detectors');
const pick = (fs) => fs.map((f) => [f.rule, f.slide, f.line]);

test('the same records as the old detector on front matter closed oddly, two comments on a line, and a BOM', () => {
  for (const src of [
    '---\ntheme: x\n----\n\n<!-- _class: cards banner-tag -->\n',
    '---\ntheme: x\n---x\n\n<!-- _class: cards banner-tag -->\n\n<!-- Say: a -->\n',
    '---  \ntheme: x\n---  \n\n# A\n\n<!-- Say: a -->\n',
    '<!-- _class: cards --> <!-- _class: banner-tag -->\n',
    '﻿---\ntheme: x\n---\n\n<!-- _class: cards banner-tag -->\n\n<!-- Say: b -->\n',
    '---\r\ntheme: x\r\n---\r\n\r\n<!-- _class: cards banner-tag -->\r\n\r\n<!-- SAY: c -->\r\n',
  ]) {
    for (const id of ['tag-alias', 'say-key-case']) {
      assert.deepEqual(pick(deckRuleFindings(src, id)), pick(LEGACY[id](src)), `${id} on ${JSON.stringify(src)}`);
    }
  }
});

test('INTENDED differences: say-key-case no longer reports a comment the engine renders as code', () => {
  // The old detector masked code with its own fence regex, which missed indented code, an unclosed fence (markdown-it
  // runs it to the end of the slide) and a longer fence holding a shorter one. The deck model reads code as markdown-it
  // does, so a commented `Say:` inside any of these is sample text on the slide, not a speaker note.
  for (const src of ['# A\n\n    <!-- Say: a -->\n', '# A\n\n```\n<!-- Say: a -->\n', '# A\n\n````\n```\n<!-- Say: a -->\n```\n````\n']) {
    assert.equal(LEGACY['say-key-case'](src).length, 1, JSON.stringify(src));
    assert.deepEqual(deckRuleFindings(src, 'say-key-case'), [], JSON.stringify(src));
  }
});

test('the fix keeps a BOM, with or without front matter', () => {
  const vocab = require('../../../lib/authoring/lint').buildVocab();
  for (const src of ['﻿<!-- _class: cards banner-tag -->\n\n# A\n', '﻿---\ntheme: x\n---\n\n<!-- _class: cards banner-tag -->\n\n# A\n']) {
    const found = core.lintTextWith(src, vocab).find((f) => f.rule === 'tag-alias');
    assert.ok(found?.autofixable, JSON.stringify(src));
    assert.equal(core.applyFix(src, found), src.replace('banner-tag', 'tag-band'));
    assert.equal(core.fixAllDetailed(src, vocab).text, src.replace('banner-tag', 'tag-band'));
  }
});

test('a plugin-rules switch re-reads the same text: no stale slide numbers from either memo', () => {
  const { setBoundaryPluginsOff } = require('../../../lib/core/boundary-parser.mjs');
  const src = '# A\n\n$$\nx\n\n---\n\ny\n$$\n\n<!-- Say: hi -->\n';
  const before = deckRuleFindings(src, 'say-key-case').map((f) => f.slide);
  try {
    setBoundaryPluginsOff(['math']);
    const after = deckRuleFindings(src, 'say-key-case').map((f) => f.slide);
    assert.deepEqual(after, LEGACY['say-key-case'](src).map((f) => f.slide));
    assert.notDeepEqual(after, before);
  } finally {
    setBoundaryPluginsOff([]);
  }
});
