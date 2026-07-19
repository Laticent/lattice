/**
 * Unit: lib/authoring/deck-canon.js + the review-core RUBRIC it renders from.
 *
 * DECK_CANON is the authoring guidance injected into the DECK generator's system turn
 * (docs/src/components/studio/architect.ts). Its falsifiable content — the review-rubric
 * traps and the word budgets — is pulled from source (review-core.RUBRIC, prose-budgets)
 * so it can't drift from what the reviewer actually flags. These tests are that gate:
 * a new review rule with no RUBRIC entry, or a canon that stops teaching a trap/budget,
 * fails here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { RUBRIC } = require('../../../lib/authoring/review-core.js');
const { DECK_CANON, buildDeckCanon } = require('../../../lib/authoring/deck-canon.js');
const { SLIDE_PROSE_BUDGET, UNIVERSAL_PROSE_BUDGETS } = require('../../../lib/authoring/prose-budgets.js');

const REVIEW_SRC = fs.readFileSync(path.join(__dirname, '../../../lib/authoring/review-core.js'), 'utf8');

describe('deck-canon', () => {
  // Match `rule: '<id>'` OR `rule: "<id>"`, ids = word chars + hyphen. Widened from the
  // original /'([a-z-]+)'/ after a red-team finding that it missed double-quoted ids and
  // ids containing digits/uppercase — either would have shipped a rule untaught + unflagged.
  const RULE_LITERAL = /rule:\s*['"]([\w-]+)['"]/g;

  test('RUBRIC covers every rule reviewText can emit (drift gate)', () => {
    // Every quoted `rule:` literal in review-core's source must have a RUBRIC entry, so the
    // taught rubric can't silently fall behind the checked one. (The `verbose-*` budget
    // family uses a computed id — covered by the collective 'verbose-*' entry + the
    // variable-binding guard below.)
    const emitted = new Set([...REVIEW_SRC.matchAll(RULE_LITERAL)].map((m) => m[1]));
    const taught = new Set(RUBRIC.map((r) => r.id));
    const missing = [...emitted].filter((id) => !taught.has(id));
    assert.deepEqual(missing, [], `RUBRIC is missing entries for review rules: ${missing.join(', ')}`);
  });

  test('RUBRIC has no stale entry (every id is a real rule or the verbose family)', () => {
    const emitted = new Set([...REVIEW_SRC.matchAll(RULE_LITERAL)].map((m) => m[1]));
    const ALLOW_NON_LITERAL = new Set(['verbose-*']); // computed-id family, not a literal
    const stale = RUBRIC.map((r) => r.id).filter((id) => !emitted.has(id) && !ALLOW_NON_LITERAL.has(id));
    assert.deepEqual(stale, [], `RUBRIC has entries for no-longer-emitted rules: ${stale.join(', ')}`);
  });

  test('the only VARIABLE-emitted rule family is the allowlisted verbose-* (else one could ship untaught)', () => {
    // A rule id built from a variable (review-core binds `const rule = … verbose-${kind}`
    // and pushes it via object shorthand) is invisible to the literal scan above, so a new
    // one could ship with no RUBRIC entry and no flag. Pin that there is exactly ONE such
    // binding — the verbose family — with a RUBRIC entry; a second `const rule =` trips this,
    // forcing a deliberate RUBRIC entry + allowlist update.
    const varBindings = [...REVIEW_SRC.matchAll(/\bconst\s+rule\s*=/g)].length;
    assert.equal(varBindings, 1, `expected exactly 1 variable rule-binding (verbose-*); found ${varBindings} — a new one needs a RUBRIC entry + allowlist`);
    assert.ok(RUBRIC.some((r) => r.id === 'verbose-*'), 'the verbose-* family must have a RUBRIC entry');
  });

  test('every RUBRIC entry has a non-empty trap and fix', () => {
    for (const r of RUBRIC) {
      assert.ok(r.id && r.trap && r.fix, `RUBRIC entry ${JSON.stringify(r)} must have id/trap/fix`);
    }
  });

  test('DECK_CANON renders every rubric trap + its fix', () => {
    for (const r of RUBRIC) {
      assert.ok(DECK_CANON.includes(r.trap), `DECK_CANON must teach the trap "${r.trap}"`);
      assert.ok(DECK_CANON.includes(r.fix), `DECK_CANON must teach the fix "${r.fix}"`);
    }
  });

  test('DECK_CANON inlines the source-derived budgets (not hardcoded)', () => {
    assert.ok(DECK_CANON.includes(String(SLIDE_PROSE_BUDGET.words)), 'DECK_CANON must cite the slide word budget');
    assert.ok(DECK_CANON.includes(String(SLIDE_PROSE_BUDGET.bullets)), 'DECK_CANON must cite the bullet budget');
    assert.ok(DECK_CANON.includes(String(UNIVERSAL_PROSE_BUDGETS.title.soft)), 'DECK_CANON must cite the title budget');
    // The gate bites: a changed budget must change the canon.
    const canon = buildDeckCanon();
    assert.ok(canon.includes(`~${SLIDE_PROSE_BUDGET.words} words`), 'the slide budget must be rendered from source');
  });

  test('DECK_CANON teaches the load-bearing rules', () => {
    assert.match(DECK_CANON, /COMPLETE DECLARATIVE SENTENCE/); // heading-as-claim
    assert.match(DECK_CANON, /- \*\*Title\.\*\* body/);        // the card-nesting anti-pattern
    assert.match(DECK_CANON, /INTENT then CAPACITY/);          // the component-selection loop
    assert.ok(DECK_CANON.length > 800, 'the canon should be substantive');
  });
});
