/**
 * Unit: docs/src/playground/authoring-core.generated.js — the browser bundle of
 * the Drawing Board's authoring engines (built by tools/build-authoring-core.js,
 * consumed by the Architect + Coach). Guards that the bundle (1) loads as valid
 * ESM, (2) exposes the API the panels import, and (3) stays in PARITY with the
 * source lib/authoring/* — i.e. it isn't stale. The byte-level freshness gate is
 * `npm run build:check` (build-authoring-core --check); this is the behavioral
 * one. See engineering/gotchas.md "Drawing Board Architect/Coach panels dead in
 * astro dev".
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BUNDLE = path.join(__dirname, '..', '..', '..', 'docs', 'src', 'playground', 'authoring-core.generated.js');

const srcLint = require('../../../lib/authoring/lint-core.js');
const srcReview = require('../../../lib/authoring/review-core.js');
const srcScorecard = require('../../../lib/authoring/scorecard.js');

describe('authoring-core-bundle', () => {
  test('loads as ESM and exposes the panels API', async () => {
    const m = await import(pathToFileURL(BUNDLE).href);
    for (const name of ['lintCore', 'reviewCore', 'scorecard']) {
      assert.ok(name in m, `bundle missing export: ${name}`);
    }
    assert.equal(typeof m.lintCore.lintTextWith, 'function');
    assert.equal(typeof m.lintCore.applyFix, 'function');
    assert.equal(typeof m.reviewCore.reviewText, 'function');
    assert.equal(typeof m.reviewCore.pacingVerdict, 'function');
    assert.ok(m.reviewCore.ASK_RE instanceof RegExp);
    assert.equal(typeof m.scorecard.scoreDeck, 'function');
  });

  test('parity: bundled functions match the source modules (not stale)', async () => {
    const m = await import(pathToFileURL(BUNDLE).href);
    const deck = '---\nmarp: true\ntheme: cuoio\n---\n\n# Title\n\n- a\n- b\n';
    // lint
    const lintBundle = m.lintCore.lintTextWith(deck, {});
    const lintSrc = srcLint.lintTextWith(deck, {});
    assert.deepEqual(lintBundle, lintSrc, 'bundle lintTextWith drifted — run `npm run authoring-core:build`');
    // review
    const revBundle = m.reviewCore.reviewText(deck, {});
    const revSrc = srcReview.reviewText(deck, {});
    assert.deepEqual(revBundle, revSrc, 'bundle reviewText drifted — run `npm run authoring-core:build`');
    // scorecard
    const scBundle = m.scorecard.scoreDeck({ source: deck, lintFindings: lintBundle, reviewFindings: revBundle });
    const scSrc = srcScorecard.scoreDeck({ source: deck, lintFindings: lintSrc, reviewFindings: revSrc });
    assert.deepEqual(scBundle, scSrc, 'bundle scoreDeck drifted — run `npm run authoring-core:build`');
  });
});
