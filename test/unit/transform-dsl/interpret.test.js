// DOM-interpreter behavior (§5/§7): extract + wrap + capability reproduce the
// split-panel re-parenting on a jsdom scope, idempotently and section-scoped.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { applyRulesToDom } = require('../../../lib/core/transform-dsl/interpret');
const { validateTransform } = require('../../../lib/core/transform-dsl/schema');
const { SPLIT_PANEL_RULES, SAMPLE_HTML, COMPONENT } = require('./split-panel-rules');

function sectionFrom(html) {
  return new JSDOM(html).window.document.querySelector('section');
}
// The validated (null-proto) form of the fixture rules — what the interpreter consumes.
const RULES = validateTransform(SPLIT_PANEL_RULES).rules;

describe('transform-dsl — DOM interpreter', () => {
  test('the fixture rules pass the safety gate', () => {
    const r = validateTransform(SPLIT_PANEL_RULES);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  });

  test('extract + wrap + capability reproduce panel-left / panel-right', () => {
    const section = sectionFrom(SAMPLE_HTML);
    applyRulesToDom(section, RULES, { component: COMPONENT });

    const left = section.querySelector(':scope > .panel-left');
    const right = section.querySelector(':scope > .panel-right');
    assert.ok(left, 'panel-left created');
    assert.ok(right, 'panel-right created');

    // left = eyebrow span (from the capability), then h2, then the lede p.
    const leftKids = [...left.children].map(c => c.tagName + (c.className ? '.' + c.className : ''));
    assert.deepEqual(leftKids, ['SPAN.panel-eyebrow', 'H2', 'P']);
    assert.equal(left.querySelector('.panel-eyebrow').textContent, 'Q2 board review');
    // the code-only <p> is gone (converted), never duplicated.
    assert.equal(section.querySelectorAll('code').length, 0);

    // right = the supporting list, nothing else.
    const rightKids = [...right.children].map(c => c.tagName);
    assert.deepEqual(rightKids, ['UL']);

    // final section order: panel-left then panel-right.
    assert.deepEqual([...section.children].map(c => c.className), ['panel-left', 'panel-right']);
  });

  test('a <header> is preserved at the top, outside both panels', () => {
    const section = sectionFrom(SAMPLE_HTML.replace('<section class="split-panel">', '<section class="split-panel"><header>chrome</header>'));
    applyRulesToDom(section, RULES, { component: COMPONENT });
    assert.deepEqual([...section.children].map(c => c.tagName + (c.className ? '.' + c.className : '')), ['HEADER', 'DIV.panel-left', 'DIV.panel-right']);
  });

  test('idempotent — a second pass is a no-op (no nested or duplicated panels)', () => {
    const section = sectionFrom(SAMPLE_HTML);
    applyRulesToDom(section, RULES, { component: COMPONENT });
    const once = section.outerHTML;
    applyRulesToDom(section, RULES, { component: COMPONENT });
    assert.equal(section.outerHTML, once);
    assert.equal(section.querySelectorAll('.panel-left').length, 1);
    assert.equal(section.querySelectorAll('.panel-right').length, 1);
  });

  test('the pullquote variant is excluded by match.not', () => {
    const section = sectionFrom('<section class="split-panel pullquote"><blockquote>q</blockquote><p><code>cite</code></p></section>');
    applyRulesToDom(section, RULES, { component: COMPONENT });
    assert.equal(section.querySelector('.panel-left'), null, 'pullquote left untouched by the default rule');
  });

  test('section scoping — a rule never touches another component\'s sections', () => {
    // Scoping is the guard for a rule that does NOT name its section, so this test uses exactly that
    // rule: the fixture with `section` dropped from its match. The foreign section is the sample's own
    // shape under another class, so the rule would fire on it and only the scoping keeps it untouched.
    // The earlier form used the fixture's `match: { section: 'split-panel' }` and a differently shaped
    // section, and stayed green with scoping removed.
    const loose = JSON.parse(JSON.stringify(SPLIT_PANEL_RULES));
    for (const r of loose) if (r.match) delete r.match.section;
    const v = validateTransform(loose);
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    const foreign = SAMPLE_HTML.replace('<section class="split-panel">', '<section class="cards">');
    assert.notEqual(foreign, SAMPLE_HTML);
    const dom = new JSDOM('<body>' + SAMPLE_HTML + foreign + '</body>');
    const root = dom.window.document.body;
    applyRulesToDom(root, v.rules, { component: COMPONENT });
    assert.equal(root.querySelector('section.cards .panel-left'), null, 'cards section untouched');
    assert.ok(root.querySelector('section.split-panel .panel-left'), 'split-panel transformed');
    // the other section still has its raw code-only <p> (capability never ran there).
    assert.equal(root.querySelector('section.cards code').textContent, 'Q2 board review');
  });

  test('ctx.component is required (scoping is mandatory)', () => {
    assert.throws(() => applyRulesToDom(sectionFrom(SAMPLE_HTML), RULES, {}), /component is required/);
  });
});
