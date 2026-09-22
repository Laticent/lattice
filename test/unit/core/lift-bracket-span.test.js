// The position rule — which SLOT a bracketed span came from.
//
// The arms below hold the one property the module exists for: an author's
// bracketed span means AXIS above the chart body and LABELS below it, and
// nothing about the span's own shape is consulted to decide which. Everything
// else — what the parts mean, how many a member may have — belongs to the
// caller that reads the slot.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { liftBracketSpans, bodyIndex } = require('../../../lib/core/lift-bracket-span');

const p = (code) => `<p><code>${code}</code></p>\n`;
const HEAD = '<h2>A headline</h2>\n';
const LIST = '<ul>\n<li>Atlas <code>4.2</code></li>\n</ul>\n';
const TABLE = '<table>\n<tr><td>[x]</td></tr>\n</table>\n';

describe('position decides which construct a span is', () => {
  test('above the body is the AXIS', () => {
    const r = liftBracketSpans(p('[Effort, Reach]') + HEAD + LIST);
    assert.equal(r.above, '[Effort, Reach]');
    assert.equal(r.below, null);
  });

  test('below the body is the LABEL SET', () => {
    const r = liftBracketSpans(HEAD + LIST + p('[{[x], Enacted}]'));
    assert.equal(r.above, null);
    assert.equal(r.below, '[{[x], Enacted}]');
  });

  test('both slots are independent — a chart may carry either, both or neither', () => {
    const r = liftBracketSpans(p('[Effort, Reach]') + LIST + p('[{[x], Enacted}]'));
    assert.equal(r.above, '[Effort, Reach]');
    assert.equal(r.below, '[{[x], Enacted}]');
    assert.equal(liftBracketSpans(HEAD + LIST).above, null);
    assert.equal(liftBracketSpans(HEAD + LIST).below, null);
  });

  // The point of the whole design: these two spans are the SAME SHAPE, and only
  // where the author put them says which one is which. No grammar could do it.
  test('one identical span reads as an axis above and a label set below', () => {
    const span = '[{Effort, 0..10}]';
    assert.equal(liftBracketSpans(p(span) + LIST).above, span);
    assert.equal(liftBracketSpans(LIST + p(span)).below, span);
  });

  test('a table is a body too — the grid family', () => {
    const r = liftBracketSpans(p('[Wider reach, Deeper cognition]') + TABLE);
    assert.equal(r.above, '[Wider reach, Deeper cognition]');
  });
});

describe('an ordinary eyebrow survives untouched', () => {
  // Load-bearing. A slide routinely carries an eyebrow in exactly this shape,
  // and the old lift had to scan every paragraph precisely because of it.
  test('a non-bracketed code paragraph is neither lifted nor removed', () => {
    const html = p('Retention · 2026 cohorts') + HEAD + LIST;
    const r = liftBracketSpans(html);
    assert.equal(r.above, null);
    assert.equal(r.html, html);
  });

  test('an eyebrow ABOVE a real axis leaves the axis findable', () => {
    const r = liftBracketSpans(p('Retention · 2026 cohorts') + p('[Effort, Reach]') + LIST);
    assert.equal(r.above, '[Effort, Reach]');
    assert.ok(r.html.includes('Retention'), 'the eyebrow must survive');
    assert.ok(!r.html.includes('[Effort'), 'the axis paragraph must be removed');
  });

  test("quadrant's CURRENT eyebrow is not a bracketed list, so it passes through", () => {
    const html = p('Effort 0–10 → Reach 0–100') + LIST;
    assert.deepEqual(liftBracketSpans(html), { html, above: null, below: null });
  });
});

describe('what is lifted is removed', () => {
  test('the paragraph goes, so a set never also prints as a stray eyebrow', () => {
    const r = liftBracketSpans(p('[Effort, Reach]') + HEAD + LIST + p('[{[x], Done}]'));
    assert.ok(!r.html.includes('[Effort'));
    assert.ok(!r.html.includes('[{[x]'));
    assert.ok(r.html.includes('<h2>A headline</h2>'));
    assert.ok(r.html.includes('<ul>'));
  });

  test('removing two spans does not corrupt the html between them', () => {
    const r = liftBracketSpans(p('[A, B]') + HEAD + LIST + p('[{[x], Done}]'));
    assert.equal(r.html, HEAD + LIST);
  });

  test('a SECOND list in a slot is left in place rather than silently merged', () => {
    const r = liftBracketSpans(p('[A, B]') + p('[C, D]') + LIST);
    assert.equal(r.above, '[A, B]');
    assert.ok(r.html.includes('[C, D]'), 'the duplicate stays visible to the author');
  });
});

describe('no body means no slots', () => {
  test('a section with no list or table lifts nothing', () => {
    const html = p('[Effort, Reach]') + HEAD;
    assert.deepEqual(liftBracketSpans(html), { html, above: null, below: null });
  });

  test('bodyIndex finds the EARLIEST body tag, whichever it is', () => {
    assert.equal(bodyIndex('<p>x</p><table>'), '<p>x</p>'.length);
    assert.equal(bodyIndex('<ol><li>a</li></ol><table>'), 0);
    assert.equal(bodyIndex('<p>nothing here</p>'), -1);
  });
});

describe('a span the caller cannot use is never lost', () => {
  const { parseInlineSet } = require('../../../lib/core/label-set');

  // The lift used to gate on `parseBracketList` while matrix-grid READ the slot
  // with `parseInlineSet`, a stricter grammar. Anything the first accepted and
  // the second rejected was cut out of the html and then dropped on the floor —
  // a trailing caption rendered before this construct and vanished after it.
  test('a bracketed caption the acceptor rejects stays on the slide', () => {
    const html = TABLE + p('[Source: finance, FY26]');
    const r = liftBracketSpans(html, { acceptBelow: parseInlineSet });
    assert.equal(r.below, null, 'parseInlineSet rejects it, so it is not a key');
    assert.ok(r.html.includes('Source: finance'), 'and it must still render');
    assert.equal(r.html, html, 'nothing was cut at all');
  });

  test('a real label set with the same acceptor is still lifted', () => {
    const r = liftBracketSpans(TABLE + p('[{[x], Done}]'), { acceptBelow: parseInlineSet });
    assert.equal(r.below, '[{[x], Done}]');
  });
});

describe('the caller declares its body tag', () => {
  // A GRID's body is its table. Taking the earliest of ul/ol/table for everyone
  // let a framing bullet list above the axis line move the boundary in front of
  // it — the axis then read as a key and was lost.
  test('a framing list above a grid does not steal the boundary', () => {
    const html = '<ul><li>framing</li></ul>\n' + p('[Wider reach, Deeper cognition]') + TABLE;
    assert.equal(liftBracketSpans(html, { bodyTags: ['<table'] }).above, '[Wider reach, Deeper cognition]');
    // …and with the default tags it is misread, which is why the option exists.
    assert.equal(liftBracketSpans(html).above, null);
  });
});

describe('a fenced code block cannot swallow the axis', () => {
  // `<p[^>]*>` matches `<pre>`; the lazy run then skips past the fence's own
  // `</code>` to the axis span's, consuming both as one non-list candidate.
  // That is a silent loss AND a polynomial shape (200 fences 1.34ms, 800
  // 21.22ms) — the CodeQL js/polynomial-redos class this repo has been flagged
  // for twice.
  test('an html fence above the axis leaves both intact', () => {
    const fence = '<pre><code class="language-html">FENCE</code></pre>\n';
    const r = liftBracketSpans(fence + p('[Wider reach, Deeper cognition]') + TABLE, { bodyTags: ['<table'] });
    assert.equal(r.above, '[Wider reach, Deeper cognition]');
    assert.ok(r.html.includes('FENCE'), 'the fence survives untouched');
  });

  test('many fences stay linear rather than quadratic', () => {
    const many = (n) => '<pre><code>x</code></pre>\n'.repeat(n) + p('[A, B]') + TABLE;
    const run = (n) => { const t = process.hrtime.bigint(); liftBracketSpans(many(n), { bodyTags: ['<table'] }); return Number(process.hrtime.bigint() - t) / 1e6; };
    run(200);
    assert.ok(run(800) < run(200) * 12, 'growth must not square');
  });
});
