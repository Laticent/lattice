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

const chart = (caption) => `---\ntheme: indaco\n---\n\n<!-- _class: state-chart lr -->\n\n## Machine\n\n1. Draft \`start\`\n   - \`{submit, to=2}\`\n2. Live \`done\`\n\n${caption}\n`;
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

// A chart's wrap lifted the FIRST paragraph between the heading and the figure as its subtitle
// and dropped every later one, with no warning, on a chart slide and in a chart pane alike
// (followups.d 2376-p2). Each later paragraph renders now, in order, as a `.chart-lead` above
// the figure.
describe('chart lead — every paragraph before the figure renders', () => {
  const bars = '- Licenses `42`\n- Services `47`\n- Support `18`\n';
  const docOf = (md) => new JSDOM(render(`---\ntheme: indaco\n---\n\n${md}`).html).window.document;

  test('on a chart slide: the first is the subtitle, the rest are leads, in order', () => {
    const doc = docOf(`<!-- _class: bar -->\n\n## Mix\n\nFirst line.\n\nSecond, with \`code\` in it.\n\nThird.\n\n${bars}`);
    assert.equal(doc.querySelector('.chart-subtitle').textContent, 'First line.');
    const leads = [...doc.querySelectorAll('.chart-lead')];
    assert.deepEqual(leads.map((p) => p.textContent), ['Second, with code in it.', 'Third.']);
    assert.equal(leads[0].hasAttribute('data-prose'), true, 'a lead keeps the prose mark');
    // Above the figure, not after it.
    const body = doc.querySelector('.chart-body');
    for (const p of leads) assert.ok(p.compareDocumentPosition(body) & 4, 'lead precedes the chart body');
  });

  test('in a chart pane: the same, with no heading of its own', () => {
    const doc = docOf(`## Mix\n\n<!-- pane: bar -->\n\nFirst line.\n\nSecond line.\n\n${bars}\n<!-- pane: list -->\n\n- x\n`);
    assert.equal(doc.querySelector('lat-pane .chart-subtitle').textContent, 'First line.');
    assert.deepEqual([...doc.querySelectorAll('lat-pane .chart-lead')].map((p) => p.textContent), ['Second line.']);
  });

  test('one paragraph is still a subtitle alone, and no leads', () => {
    const doc = docOf(`<!-- _class: bar -->\n\n## Mix\n\nOnly line.\n\n${bars}`);
    assert.equal(doc.querySelectorAll('.chart-lead').length, 0);
    assert.equal(doc.querySelector('.chart-subtitle').textContent, 'Only line.');
  });

  test('only TOP-LEVEL paragraphs lift: a code block and a blockquote are not torn open', () => {
    // A bare `<p[^>]*>` also matches `<pre>`; this lifted half a code block into a lead.
    const pre = docOf(`<!-- _class: bar -->\n\n## Mix\n\nFirst.\n\n\`\`\`js\nx = 1\n\`\`\`\n\nSecond.\n\n${bars}`);
    assert.deepEqual([...pre.querySelectorAll('.chart-lead')].map((p) => p.textContent), ['Second.']);
    assert.equal(pre.querySelector('.chart-lead code'), null);
    // A paragraph inside a blockquote belongs to it; it is not pulled out as a bare lead.
    const quote = docOf(`<!-- _class: bar -->\n\n## Mix\n\nFirst.\n\n> Quoted one.\n>\n> Quoted two.\n\nSecond.\n\n${bars}`);
    assert.deepEqual([...quote.querySelectorAll('.chart-lead')].map((p) => p.textContent), ['Second.']);
  });

  test('a split chart carries its leads on the cover, never on every body page', () => {
    const { carouselize } = require('../../../lib/core/carousel');
    const md = '---\ntheme: indaco\nsize: portrait\n---\n\n<!-- _class: kanban -->\n\n## Board\n\nFirst line.\n\nSecond LEADX line.\n\n'
      + '- Backlog\n  - Waiting cards `S`\n- In progress\n  - The active limit `M`\n- Review\n  - Almost done `S`\n';
    const m = render(md).html.match(/(<section[^>]*>)([\s\S]*?)<\/section>/);
    const pages = carouselize(m[1], m[2], { strategy: 'kanban-lanes' }, 2, 'kanban');
    assert.ok(pages && pages.length > 2, 'the board splits');
    const counts = pages.map((p) => String(p).split('LEADX').length - 1);
    assert.deepEqual(counts, [1, ...pages.slice(1).map(() => 0)], `per page: ${counts}`);
  });

  test('a lead is hidden at claim-hero with the subtitle, as the chart fills the slide', () => {
    assert.match(read('lib/components/chart/_chart-family/chart-family.css'),
      /:is\(\.claim-hero, \.claim-bleed\) \.chart-subtitle,\s*section\.chart-frame:is\(\.claim-hero, \.claim-bleed\) \.chart-lead,\s*section\.chart-frame:is\(\.claim-hero, \.claim-bleed\) \.chart-lead-block \{\s*display: none;/);
  });
});

// The wrap kept paragraphs only and dropped every OTHER block between the heading and the figure
// — a code block, a blockquote, a table, raw HTML — without a word (followups.d 2376-p2). Each
// renders now, whole and in order, in a `div.chart-lead-block` above the figure.
describe('chart lead blocks — every block before the figure renders', () => {
  const bars = '- Licenses `42`\n- Services `47`\n- Support `18`\n';
  const docOf = (md) => new JSDOM(render(`---\ntheme: indaco\n---\n\n${md}`).html).window.document;
  const kinds = (doc, scope = '') => [...doc.querySelectorAll(`${scope} .chart-lead, ${scope} .chart-lead-block`)]
    .map((el) => (el.classList.contains('chart-lead') ? `p:${el.textContent}` : el.firstElementChild.tagName.toLowerCase()));

  test('a code block, a blockquote, a table and raw HTML render in source order, above the figure', () => {
    const doc = docOf('<!-- _class: bar -->\n\n## Mix\n\nFirst.\n\n```js\nx = 1\n```\n\nSecond.\n\n> Quoted.\n\n'
      + '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n<div class="note">Raw.</div>\n\n' + bars);
    assert.equal(doc.querySelector('.chart-subtitle').textContent, 'First.');
    assert.deepEqual(kinds(doc), ['pre', 'p:Second.', 'blockquote', 'table', 'div']);
    assert.equal(doc.querySelector('.chart-lead-block pre code').textContent, 'x = 1\n', 'the block is kept whole');
    assert.equal(doc.querySelector('.chart-lead-block blockquote p').textContent, 'Quoted.');
    const body = doc.querySelector('.chart-body');
    for (const el of doc.querySelectorAll('.chart-lead-block')) assert.ok(el.compareDocumentPosition(body) & 4, 'block precedes the chart body');
  });

  test('a block with no paragraph before it renders, and there is no subtitle', () => {
    const doc = docOf(`<!-- _class: bar -->\n\n## Mix\n\n\`\`\`js\nx = 1\n\`\`\`\n\n${bars}`);
    assert.equal(doc.querySelector('.chart-subtitle'), null);
    assert.deepEqual(kinds(doc), ['pre']);
  });

  test('in a chart pane: the same', () => {
    const doc = docOf(`## Mix\n\n<!-- pane: bar -->\n\nFirst.\n\n\`\`\`js\nx = 1\n\`\`\`\n\n${bars}\n<!-- pane: list -->\n\n- x\n`);
    assert.deepEqual(kinds(doc, 'lat-pane'), ['pre']);
  });

  test('a self-closed non-void tag (`<div/>`, `<p/>`) is skipped, never a wrapper the chart falls into', () => {
    // HTML has no self-closing div: emitted inside the wrapper, it left the wrapper open and the
    // chart body inside it, which `claim-hero` would then hide with the lead block.
    const div = docOf(`<!-- _class: bar -->\n\n## Mix\n\nSub.\n\n<div/>\n\n${bars}`);
    assert.equal(div.querySelector('.chart-body').closest('.chart-lead-block'), null);
    assert.equal(div.querySelectorAll('.chart-lead-block').length, 0);
    // …and a `<p/>` does not steal the subtitle from the real first paragraph.
    const p = docOf(`<!-- _class: bar -->\n\n## Mix\n\n<p/>\n\nSub.\n\n${bars}`);
    assert.equal(p.querySelector('.chart-subtitle').textContent, 'Sub.');
  });

  test('a split chart keeps a lead block on its first body page only, never on every page', () => {
    const { carouselize } = require('../../../lib/core/carousel');
    const md = '---\ntheme: indaco\nsize: portrait\n---\n\n<!-- _class: kanban -->\n\n## Board\n\nFirst line.\n\n```js\nBLOCKX = 1\n```\n\n'
      + '- Backlog\n  - Waiting cards `S`\n- In progress\n  - The active limit `M`\n- Review\n  - Almost done `S`\n';
    const m = render(md).html.match(/(<section[^>]*>)([\s\S]*?)<\/section>/);
    const pages = carouselize(m[1], m[2], { strategy: 'kanban-lanes' }, 2, 'kanban');
    assert.ok(pages && pages.length > 2, 'the board splits');
    const counts = pages.map((p) => String(p).split('BLOCKX').length - 1);
    // The cover carries text leads only; the block rides the first body page.
    assert.deepEqual(counts, [0, 1, ...pages.slice(2).map(() => 0)], `per page: ${counts}`);
  });
});
