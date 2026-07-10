/**
 * Narrative-build resolver (lib/transformers/build.js) — "focus sequenced over
 * time". Covers the grammar parser, the step assignment, the HTML kernel per axis,
 * the DOM mirror's parity with it, idempotence, the 0-pixel opt-out, and the
 * `_build` directive → `data-build` plumbing. Spec:
 * engineering/decisions/2026-06-16-narrative-step-spec.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const build = require('../../../lib/transformers/build');
const { parseCommentDirectives, KNOWN_DIRECTIVES, APPLIED_DIRECTIVES } = require('../../../lib/engine/directives');

const dom = (html) => new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
const steps = (sec) => sec.getAttribute('data-build-steps');
const stepOf = (el) => el.getAttribute('data-build-step');

describe('build — grammar (parseBuildSpec)', () => {
  test('bare / item → default axis, no grouping', () => {
    assert.deepEqual(build.parseBuildSpec(''), { axis: 'item', groups: [] });
    assert.deepEqual(build.parseBuildSpec('items'), { axis: 'item', groups: [] });
  });
  test('axis only', () => {
    assert.equal(build.parseBuildSpec('rows').axis, 'row');
    assert.equal(build.parseBuildSpec('cols').axis, 'col');
    assert.equal(build.parseBuildSpec('lines').axis, 'line');
  });
  test('grouping (default axis)', () => {
    const p = build.parseBuildSpec('1, 2-3, 4');
    assert.equal(p.axis, 'item');
    assert.deepEqual(p.groups.map((g) => [...g].sort((a, b) => a - b)), [[1], [2, 3], [4]]);
  });
  test('axis + grouping', () => {
    const p = build.parseBuildSpec('rows 1-2, 3');
    assert.equal(p.axis, 'row');
    assert.deepEqual(p.groups.map((g) => [...g]), [[1, 2], [3]]);
  });
  test('none → opt out (null)', () => {
    assert.equal(build.parseBuildSpec('none'), null);
    assert.equal(build.parseBuildSpec(null), null);
  });
});

describe('build — step assignment', () => {
  test('no groups → one step per unit', () => {
    assert.equal(build.stepFor(3, []), 3);
    assert.equal(build.totalSteps(5, []), 5);
  });
  test('grouped → first group; ungrouped shows from step 1', () => {
    const g = [new Set([1]), new Set([2, 3])];
    assert.equal(build.stepFor(1, g), 1);
    assert.equal(build.stepFor(3, g), 2);
    assert.equal(build.stepFor(9, g), 1); // ungrouped ⇒ context
    assert.equal(build.totalSteps(9, g), 2); // total = declared groups
  });
});

describe('build — HTML kernel', () => {
  test('item: each <li> stamped; section gets steps + axis + resolved', () => {
    const inner = '<ul><li>a</li><li>b</li><li>c</li></ul>';
    const { openTag, inner: out } = build.resolveSectionHtml('<section class="content" data-build="">', inner);
    assert.match(openTag, /data-build-resolved/);
    assert.match(openTag, /data-build-axis="item"/);
    assert.match(openTag, /data-build-steps="3"/);
    assert.match(out, /<li data-build-step="1">a<\/li><li data-build-step="2">b<\/li><li data-build-step="3">c<\/li>/);
  });
  test('item grouping 1, 2-3 → two steps', () => {
    const inner = '<ul><li>a</li><li>b</li><li>c</li></ul>';
    const { openTag, inner: out } = build.resolveSectionHtml('<section data-build="1, 2-3">', inner);
    assert.match(openTag, /data-build-steps="2"/);
    assert.match(out, /<li data-build-step="1">a<\/li><li data-build-step="2">b<\/li><li data-build-step="2">c<\/li>/);
  });
  test('row axis stamps tbody rows', () => {
    const inner = '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>';
    const { openTag, inner: out } = build.resolveSectionHtml('<section data-build="rows">', inner);
    assert.match(openTag, /data-build-steps="2".*data-build-axis="row"|data-build-axis="row".*data-build-steps="2"/);
    assert.match(out, /<tr data-build-step="1"><td>1<\/td><\/tr><tr data-build-step="2"><td>2<\/td><\/tr>/);
  });
  test('line axis wraps code lines', () => {
    const inner = '<pre><code>one\ntwo</code></pre>';
    const { openTag, inner: out } = build.resolveSectionHtml('<section data-build="lines">', inner);
    assert.match(openTag, /data-build-steps="2"/);
    assert.match(out, /<span class="ln" data-build-step="1">one<\/span>\n<span class="ln" data-build-step="2">two<\/span>/);
  });
  test('none → no tagging (resolved marker only)', () => {
    const inner = '<ul><li>a</li></ul>';
    const { openTag, inner: out } = build.resolveSectionHtml('<section data-build="none">', inner);
    assert.match(openTag, /data-build-resolved/);
    assert.doesNotMatch(openTag, /data-build-steps/);
    assert.equal(out, inner);
  });
  test('idempotent — second pass is a no-op', () => {
    const inner = '<ul><li>a</li><li>b</li></ul>';
    const first = build.resolveSectionHtml('<section data-build="">', inner);
    const second = build.resolveSectionHtml(first.openTag, first.inner);
    assert.equal(second.inner, first.inner);
    assert.equal(second.openTag, first.openTag);
  });
  test('applyToHtml only touches data-build sections', () => {
    const html =
      '<section class="content"><ul><li>x</li></ul></section>' +
      '<section class="content" data-build=""><ul><li>y</li></ul></section>';
    const out = build.applyToHtml(html);
    assert.match(out, /<section class="content"><ul><li>x<\/li><\/ul><\/section>/);
    assert.match(out, /data-build-step="1">y/);
  });
});

describe('build — DOM mirror agrees with the kernel', () => {
  test('item: same data-build-step + section steps', () => {
    const doc = dom('<section class="content" data-build=""><ul><li>a</li><li>b</li></ul></section>');
    build.applyToDom(doc);
    const sec = doc.querySelector('section');
    assert.equal(steps(sec), '2');
    assert.equal(sec.getAttribute('data-build-axis'), 'item');
    const lis = [...doc.querySelectorAll('li')];
    assert.deepEqual(lis.map(stepOf), ['1', '2']);
  });
  test('grouping parity', () => {
    const doc = dom('<section data-build="1, 2-3"><ul><li>a</li><li>b</li><li>c</li></ul></section>');
    build.applyToDom(doc);
    assert.equal(steps(doc.querySelector('section')), '2');
    assert.deepEqual([...doc.querySelectorAll('li')].map(stepOf), ['1', '2', '2']);
  });
  test('DOM idempotent', () => {
    const doc = dom('<section data-build=""><ul><li>a</li></ul></section>');
    build.applyToDom(doc);
    build.applyToDom(doc);
    assert.equal([...doc.querySelectorAll('li')].length, 1);
    assert.equal(stepOf(doc.querySelector('li')), '1');
  });

  // Form-migration audit (2026-07-09): masthead-lift wraps a Form slide's body
  // into `.cell-stage` for STAGE_MIGRATED layouts (the common case, since Form
  // has been default since 2026-06-26); the strict `:scope > ul` selector
  // silently found nothing once the list moved one level deeper, so `_build:
  // item` no-op'd on the runtime/DOM path while working fine on the export.
  test('item: stamps steps when the list is wrapped in .cell-stage (masthead-lift, Form default)', () => {
    const doc = dom('<section class="content form" data-build=""><div class="cell-stage"><ul><li>a</li><li>b</li></ul></div></section>');
    build.applyToDom(doc);
    const sec = doc.querySelector('section');
    assert.equal(steps(sec), '2');
    assert.equal(sec.getAttribute('data-build-axis'), 'item');
    assert.deepEqual([...doc.querySelectorAll('.cell-stage li')].map(stepOf), ['1', '2']);
  });
});

describe('build — directive plumbing', () => {
  test('build is a known + applied directive', () => {
    assert.ok(KNOWN_DIRECTIVES.has('build'));
    assert.ok(APPLIED_DIRECTIVES.has('build'));
  });
  test('bare <!-- _build --> parses to an empty-value spot directive', () => {
    const { local } = parseCommentDirectives('<!-- _build -->\n## Title');
    assert.equal(local.build, '');
  });
  test('<!-- _build: rows --> carries the value', () => {
    const { local } = parseCommentDirectives('<!-- _build: rows -->');
    assert.equal(local.build, 'rows');
  });
  test('a prose comment is not a directive', () => {
    const { local, global } = parseCommentDirectives('<!-- just a note -->');
    assert.equal(local.build, undefined);
    assert.equal(global.build, undefined);
  });
  test('bare value is scoped to FLAG directives — a bare non-flag word stays prose', () => {
    // `build` is the only flag directive; a bare known-directive word like
    // `color`/`header` must NOT be swallowed as a directive (regression guard for
    // the optional-value regex widening).
    const r = parseCommentDirectives('<!-- color -->\n<!-- header -->');
    assert.equal(r.global.color, undefined);
    assert.equal(r.global.header, undefined);
    assert.match(r.body, /<!-- color -->/); // left intact as a comment
    // …but a colon form still works.
    assert.equal(parseCommentDirectives('<!-- color: red -->').global.color, 'red');
  });
});
