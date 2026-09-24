/**
 * The chart caption is ONE paragraph (followups.d 2355-p2, now fixed).
 *
 * `.chart-caption` used to be a flex column, there only to center its `::before`
 * hairline. A flex container makes every text run and every `<code>` its own flex
 * item, so "on `lr` and on `tb`" set as five stacked lines and took the chart's stage
 * with it (the branching deck's long-labels stage fell to 98px; it is 262px now). It is a
 * block now, and the hairline is a background positioned at `--headline-align`.
 *
 * The lift also has to carry the `data-prose` mark (#2308): after it unwraps the
 * caption's `<em>`, a caption that holds one code span and prose matched the eyebrow
 * rule's `p:has(> code:only-child):has(+ ol)` — the state legend is that `ol` — and
 * its chip set as an uppercase kicker.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { render } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const chart = (caption) => `---\ntheme: indaco\n---\n\n<!-- _class: state-chart lr -->\n\n## Machine\n\n1. Draft \`start\`\n   - \`submit => 2\`\n2. Live \`done\`\n\n${caption}\n`;
const captionOf = (md) => new JSDOM(render(md).html).window.document.querySelector('.chart-caption');

describe('chart caption — the lift keeps the prose mark', () => {
  test('an italic caption with a code span and prose is marked, with its <em> unwrapped', () => {
    const cap = captionOf(chart('*`typo` names no real token.*'));
    assert.ok(cap, 'the caption is lifted');
    assert.equal(cap.querySelector('em'), null);
    assert.equal(cap.hasAttribute('data-prose'), true);
  });

  test('two code spans in one sentence stay one paragraph, and marked', () => {
    const cap = captionOf(chart('*Labels sit below on `lr` and beside on `tb`.*'));
    assert.equal(cap.querySelectorAll('code').length, 2);
    assert.equal(cap.hasAttribute('data-prose'), true);
  });

  test('a plain caption and a code-only caption are not marked', () => {
    assert.equal(captionOf(chart('*Just words.*')).hasAttribute('data-prose'), false);
    assert.equal(captionOf(chart('*`only-code`*')).hasAttribute('data-prose'), false);
  });

  test('a comment holding `>` reads as nothing, as markdown-it reads it', () => {
    const md = chart('`x` <!-- a > b -->').replace('---\ntheme', '---\nhtml: true\ntheme');
    assert.equal(captionOf(md).hasAttribute('data-prose'), false);
  });

  test('two italic runs are not unwrapped as if they were one', () => {
    const cap = captionOf(chart('*a* and *b*'));
    assert.equal(cap.querySelectorAll('em').length, 2);
    assert.equal(cap.innerHTML, '<em>a</em> and <em>b</em>');
  });

  test('a caption with another element is left alone', () => {
    assert.equal(captionOf(chart('*A **bold** word and `code`.*')).hasAttribute('data-prose'), false);
  });
});

describe('chart caption — the CSS keeps it one inline formatting context', () => {
  const family = read('lib/components/chart/_chart-family/chart-family.css');
  const rule = (css, sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at >= 0, `${sel} exists`);
    return css.slice(at, css.indexOf('}', at));
  };

  test('the caption is a block, not a flex or grid container', () => {
    const body = rule(family, 'section.chart-frame .chart-caption');
    assert.match(body, /display:\s*block/);
    assert.doesNotMatch(body, /display:\s*(inline-)?(flex|grid)/);
  });

  test('the hairline is placed by --headline-align, not by a flex parent or margin (#20)', () => {
    const body = rule(family, 'section.chart-frame .chart-caption::before');
    assert.match(body, /var\(--headline-align, center\) top/);
    assert.doesNotMatch(body, /margin:(?!\s*0;)/);
  });

  test('the headline register does not flex the caption back', () => {
    const accent = read('lib/base/base.accent-finish.css');
    assert.doesNotMatch(accent, /\.chart-caption\s*[,{][^}]*display:\s*flex/);
  });
});
