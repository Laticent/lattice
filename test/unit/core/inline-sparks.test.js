/**
 * The `~{…}` inline-spark grammar (engineering/decisions/2026-09-28-inline-sparks.md).
 *
 * Like the pill tests, the arms that matter most are the NEGATIVE ones: the grammar sees
 * every single-backtick span in every deck, and a span that doesn't parse must stay
 * literal code rather than become a plausible wrong chart. The geometry arms pin the one
 * honesty decision in the spec — what the value axis starts from.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const sparks = require('../../../lib/core/inline-sparks.js');
const directives = require('../../../lib/core/inline-code-directives.js');

const marks = (text, role) => sparks.resolve(text).marks.filter((m) => m.role === role);

describe('inline-sparks — what it renders', () => {
  test('a series defaults to a line and a ratio to a ring, both size md', () => {
    const line = sparks.resolve('~{12 14 13 17 21}');
    assert.equal(line.type, 'line');
    assert.equal(line.size, 'md');
    assert.equal(sparks.resolve('~{72%}').type, 'ring');
    assert.equal(sparks.resolve('~{18/24}').type, 'ring');
  });

  test('every type, size and color slot is reachable with data of the right shape', () => {
    for (const type of sparks.SERIES_TYPES) assert.equal(sparks.resolve(`~{1 -2 3}:${type}`)?.type, type, type);
    for (const type of sparks.RATIO_TYPES) assert.equal(sparks.resolve(`~{3/4}:${type}`)?.type, type, type);
    for (const size of sparks.SIZES) assert.equal(sparks.resolve(`~{1 2}:${size}`)?.size, size, size);
    for (const c of sparks.COLORS) assert.equal(sparks.resolve(`~{1 2}:${c}`)?.c, c, c);
    assert.equal(sparks.TYPES.length, 7);
    assert.equal(sparks.COLORS.length, 12);
  });

  test('frame, look and corners are per-spark axes that mark the host and leave the drawing alone', () => {
    for (const text of ['~{1 2 3}', '~{1 -1}:winloss', '~{72%}', '~{3/4}:bullet']) {
      const bare = sparks.resolve(text);
      for (const mod of ['framed', 'bare', 'pigment', 'etching', 'tone', 'square', 'rounded']) {
        assert.deepEqual(sparks.resolve(`${text}:${mod}`).marks, bare.marks, `${text}:${mod}: the frame is CSS`);
      }
    }
    // Only what the author wrote reaches the host; the slide and deck fill in the rest in CSS.
    assert.doesNotMatch(sparks.sparkHtml('~{1 2}'), /data-frame|data-look|data-corners/);
    assert.match(sparks.sparkHtml('~{1 2}:bare:etching:rounded:c3'),
      /data-c="c3" data-frame="bare" data-look="etching" data-corners="rounded"/);
    // One word per axis.
    for (const text of ['~{1 2}:framed:bare', '~{1 2}:pigment:tone', '~{1 2}:square:rounded']) {
      assert.equal(sparks.resolve(text), null, text);
      assert.match(sparks.diagnose(text), /repeats the/, text);
    }
    // The retired surface words are gone, not aliased: a stale `:outline` stays literal.
    for (const text of ['~{1 2}:outline', '~{1 2}:solid']) assert.equal(sparks.resolve(text), null, text);
  });

  test('modifier order is free — the axes are sorted, not positional', () => {
    // Same drawing and attributes; only `data-src` (the author's own text) differs.
    const noSrc = (h) => h.replace(/ data-src="[^"]*"/, '');
    assert.equal(noSrc(sparks.sparkHtml('~{1 3 2}:area:c4:lg:end')), noSrc(sparks.sparkHtml('~{1 3 2}:end:lg:c4:area')));
  });

  test('numbers take a sign, decimals and the typographic minus', () => {
    const s = sparks.resolve('~{+1.5 −2 .5 -3}:bar');
    assert.ok(s);
    assert.match(s.label, /low -3, high 1\.5/);
  });

  test('the html path emits one host span, an svg, and dots as round html spans', () => {
    const html = sparks.sparkHtml('~{1 3 2}:end');
    assert.match(html, /^<span class="lat-spark" data-type="line" data-size="md" role="img" aria-label="[^"]+" data-src="~\{1 3 2\}:end">/);
    assert.match(html, /<svg viewBox="0 0 100 30" aria-hidden="true" preserveAspectRatio="none">/);
    assert.match(html, /<span class="lat-spark-dot s-end" style="--x:97;--y:50"><\/span><\/span>$/);
    assert.doesNotMatch(html, /<circle/, 'a series spark draws no svg circles — dots are html');
  });

  test('a ring keeps its aspect ratio and sets its arc from the real circumference', () => {
    const html = sparks.sparkHtml('~{50%}');
    assert.doesNotMatch(html, /preserveAspectRatio/);
    assert.doesNotMatch(html, /pathLength/, 'print ignores pathLength — the dash is absolute');
    const circ = 2 * Math.PI * 9;
    const half = Math.round((circ / 2) * 100) / 100;
    assert.match(html, new RegExp(`stroke-dasharray="${half} ${Math.round(circ * 100) / 100}"`));
  });

  test('data-src carries the author\'s text, escaped, so a measuring editor can find the span', () => {
    assert.match(sparks.sparkHtml('~{1 2}:lg:c3'), / data-src="~\{1 2\}:lg:c3"/);
    assert.match(sparks.sparkHtml('~{1 2}:lg'), /data-src="~\{1 2\}:lg"/);
  });

  test('the aria label carries the numbers a screen reader needs', () => {
    assert.equal(sparks.resolve('~{0.8 1.9 1.1}').label, 'Trend, 3 points, from 0.8 to 1.1, low 0.8, high 1.9');
    assert.equal(sparks.resolve('~{1 1 -1 0}:winloss').label, '2 up, 1 down, of 4');
    assert.equal(sparks.resolve('~{72%}').label, '72%');
    assert.equal(sparks.resolve('~{3/4}').label, '3 of 4');
    assert.equal(sparks.resolve('~{1.9/1.6}:bullet').label, '1.9 against a target of 1.6');
  });

  test('a small value keeps its significant digits in the label, rather than reading as 0', () => {
    assert.equal(sparks.resolve('~{0.001 0.004}').label, 'Trend, 2 points, from 0.001 to 0.004, low 0.001, high 0.004');
    // Never exponent notation, which a screen reader reads as "1 e minus 7".
    assert.match(sparks.resolve('~{0.0000001 1}').label, /from 0\.0000001 to 1/);
  });
});

describe('inline-sparks — what it refuses', () => {
  const literal = [
    ['~{5}', 'one number is not a trend'],
    ['~{1,200 1,450}', 'thousands commas'],
    ['~{$4 $5}', 'currency signs'],
    ['~{4% 5%}', 'units inside a series'],
    ['~{1 2', 'no closing brace'],
    ['~{1 2}bar', 'a modifier without its colon'],
    ['~{1 2}:c13', 'a thirteenth color slot'],
    ['~{1 2}:huge', 'an unknown modifier'],
    ['~{1 2}:bar:line', 'two types'],
    ['~{1 2}:sm:lg', 'two sizes'],
    ['~{1 2}:end:end', 'a repeated marker'],
    ['~{72%}:bar', 'a series type given one value'],
    ['~{1 2 3}:ring', 'a ratio type given a series'],
    ['~{1 2 3}:bar:end', 'a marker on a type without a line'],
    ['~{1 2 3}:winloss:zero', ':zero on a type without a line'],
    ['~{3/4}:fill', ':fill on a ring'],
    ['~{3/0}', 'a total of zero'],
    ['~{-5%}', 'a negative percentage'],
    ['~{1 2}:', 'a trailing colon (an empty modifier)'],
    ['~{1 2}::bar', 'a doubled colon (an empty modifier)'],
    [`~{${'9'.repeat(400)} 1}`, 'a number too large to draw (it would be NaN in the svg)'],
    [`~{${'9'.repeat(400)}/1}:bullet`, 'a ratio too large to draw'],
    [`~{${'9'.repeat(308)} -${'9'.repeat(308)}}`, 'a range that overflows though each value is finite'],
    ['~{-0%}', 'a minus sign on a percentage, even on zero'],
    ['~{abc}:c3', 'no digit, but a spark modifier makes it an attempt'],
    ['~{}:bar', 'empty data with a spark modifier'],
    ['~{-3/4}', 'a negative value in a ratio'],
    [`~{${Array.from({ length: sparks.MAX_POINTS + 1 }, () => 1).join(' ')}}`, 'more than the point cap'],
  ];
  for (const [text, why] of literal) {
    test(`stays literal: ${why}`, () => {
      assert.equal(sparks.resolve(text), null);
      assert.equal(sparks.sparkHtml(text), null);
      assert.ok(sparks.diagnose(text), 'a broken spark attempt has a reason lint can show');
    });
  }

  test('text that never opened like a spark is not an attempt, so it has no diagnosis', () => {
    // LaTeX's `\~{}` (a tilde) and `\~{n}` (an ñ) open with `~{` but have no digit, so they
    // are someone else's syntax, not a broken spark.
    for (const text of ['~15', '~~text~~', '{LIVE}', '~', 'x~{1 2}', '', '~{}', '~{n}', '~{ }']) {
      assert.equal(sparks.resolve(text), null, text);
      assert.equal(sparks.diagnose(text), null, text);
    }
  });

  test('a spark that renders has no diagnosis', () => {
    assert.equal(sparks.diagnose('~{1 2 3}:bar'), null);
  });

  test('the point cap is inclusive', () => {
    assert.ok(sparks.resolve(`~{${Array.from({ length: sparks.MAX_POINTS }, (_, i) => i).join(' ')}}`));
  });
});

describe('inline-sparks — scaling (spec §6)', () => {
  const ys = (text, role = 'line') => marks(text, role)[0].d.match(/-?\d+(\.\d+)?(?= |L|H|V|$)/g);

  test('a line runs from its own low to its own high by default', () => {
    // 4 → 5: the low sits on the floor (y 26) and the high on the ceiling (y 4).
    const d = marks('~{4 5}', 'line')[0].d;
    assert.equal(d, 'M3 26L97 4');
  });

  test(':zero starts the axis at 0, so a 4 → 5 series barely moves', () => {
    const d = marks('~{4 5}:zero', 'line')[0].d;
    assert.equal(d, 'M3 8.4L97 4');
  });

  test('bars always start at zero — a bar\'s length is its value', () => {
    const [a, b] = marks('~{4 5}:bar', 'up');
    assert.equal(a.y + a.h, b.y + b.h, 'both bars stand on the same zero baseline');
    assert.ok(Math.abs(a.h / b.h - 4 / 5) < 0.01, 'bar heights are in proportion to the values');
  });

  test('a zero line appears only when the data crosses zero', () => {
    assert.equal(marks('~{1 2 3}:bar', 'zero').length, 0);
    assert.equal(marks('~{1 -2 3}:bar', 'zero').length, 1);
    assert.equal(marks('~{1 -2 3}', 'zero').length, 1);
  });

  test('a flat series draws on the middle line instead of dividing by zero', () => {
    assert.equal(marks('~{7 7 7}', 'line')[0].d, 'M3 15L50 15L97 15');
    assert.ok(ys('~{7 7 7}').every((n) => Number.isFinite(Number(n))));
  });

  test('win-loss reads the sign only', () => {
    const s = sparks.resolve('~{5 -1 0 100}:winloss');
    assert.deepEqual(s.marks.map((m) => m.role), ['up', 'down', 'tie', 'up']);
    assert.equal(s.marks[0].h, s.marks[3].h, 'magnitude is discarded');
  });

  test('a ring clamps past the whole, and a bullet keeps its target tick off the edge', () => {
    assert.deepEqual(marks('~{150%}', 'arc')[0].dash, marks('~{100%}', 'arc')[0].dash);
    const tick = Number(marks('~{80/80}:bullet', 'target')[0].d.slice(1).split(' ')[0]);
    assert.ok(tick < 97, `target tick at ${tick} sits inside the track's right edge`);
  });
});

describe('inline-sparks — the dispatcher and the escape', () => {
  test('the dispatcher renders a spark and leaves pills and marks where they were', () => {
    assert.equal(directives.renderHtml('~{1 2 3}'), sparks.sparkHtml('~{1 2 3}'));
    assert.match(directives.renderHtml('{LIVE}'), /lat-pill/);
    assert.match(directives.renderHtml('[x]'), /lat-state/);
    assert.equal(directives.renderHtml('~{1,2}'), null);
  });

  test('a backslash escapes any spark attempt, working or broken, and nothing else', () => {
    assert.equal(directives.escapedText('\\~{1 2 3}'), '~{1 2 3}');
    // Broken, so it would render literal anyway — but the escape is how an author silences
    // `spark-literal`, and that must not cost a visible backslash.
    assert.equal(directives.escapedText('\\~{1,2}'), '~{1,2}');
    assert.equal(directives.escapedText('\\~15'), null, 'not a spark attempt, so the backslash stays');
    // LaTeX: a typeset tilde and an ñ are not spark attempts, so they keep their backslash.
    assert.equal(directives.escapedText('\\~{}'), null);
    assert.equal(directives.escapedText('\\~{n}'), null);
    assert.equal(directives.escapedText('\\d+'), null);
  });
});

describe('inline-sparks — the two render paths agree', () => {
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const cases = ['~{1 3 2 5}:end:minmax', '~{1 -2 3}:bar:c3:lg', '~{1 -1 0}:winloss:sm', '~{72%}', '~{3/4}:bullet:fill', '~{2 2 3}:step:c2'];
  for (const text of cases) {
    test(`sparkElement serializes to sparkHtml: ${text}`, () => {
      const el = sparks.sparkElement(doc, text);
      const box = doc.createElement('div');
      box.appendChild(el);
      // Re-parse the string path through the same serializer, so attribute quoting and
      // self-closing svg tags compare like for like.
      const ref = doc.createElement('div');
      ref.innerHTML = sparks.sparkHtml(text);
      assert.equal(box.innerHTML, ref.innerHTML);
    });
  }

  test('the svg nodes are in the svg namespace, not html', () => {
    const el = sparks.sparkElement(doc, '~{1 2}');
    assert.equal(el.querySelector('svg').namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(el.querySelector('path').namespaceURI, 'http://www.w3.org/2000/svg');
  });

  test('a span that does not parse builds nothing on either path', () => {
    assert.equal(sparks.sparkElement(doc, '~{1,2}'), null);
    assert.equal(sparks.sparkHtml('~{1,2}'), null);
  });
});

describe('inline-sparks — measured too big (lint-core sparkFitFindings)', () => {
  const lintCore = require('../../../lib/authoring/lint-core.js');
  const deckSrc = '---\nmarp: true\n---\n\n## A\n\n| a | b |\n| - | - |\n| x | `~{1 2 3}:lg:end` |\n| y | `~{1 2 3}:c3` |\n';

  test('a report becomes a warning on that exact span, with a one-click resize', () => {
    const [f, ...rest] = lintCore.sparkFitFindings(deckSrc, [{ src: '~{1 2 3}:lg:end', why: 'wide', to: 'sm', over: 40.2, stillOver: false }]);
    assert.equal(rest.length, 0, 'only the measured span is flagged');
    assert.equal(f.rule, 'spark-too-big');
    assert.equal(f.span, '`~{1 2 3}:lg:end`');
    assert.match(f.message, /about 41px wider than the space it sits in — :sm fits/);
    assert.equal(f.didYouMean, ':sm');
    assert.match(lintCore.applyFix(deckSrc, f), /\| x \| `~\{1 2 3\}:end:sm` \|/);
  });

  test('sizing to md drops the size word, and "still too wide" says so', () => {
    const [md] = lintCore.sparkFitFindings(deckSrc, [{ src: '~{1 2 3}:lg:end', why: 'tall', to: 'md', over: 1.9, stillOver: false }]);
    assert.equal(md.replace.to, '`~{1 2 3}:end`');
    assert.equal(md.didYouMean, 'default size', 'the button says what pressing it does');
    assert.match(md.message, /stands 1\.9 lines tall, which pushes its row apart — :md \(the default\) fits/);
    const [still] = lintCore.sparkFitFindings(deckSrc, [{ src: '~{1 2 3}:lg:end', why: 'wide', to: 'sm', over: 90, stillOver: true }]);
    assert.match(still.message, /even at :sm/);
  });

  test('a running header spark is never flagged — the measure skips chrome, so must the finding', () => {
    const withHeader = `---\nmarp: true\nheader: "\`~{1 2 3}:lg:end\`"\n---\n\n## A\n\nBody \`~{1 2 3}:lg:end\`\n`;
    const found = lintCore.sparkFitFindings(withHeader, [{ src: '~{1 2 3}:lg:end', why: 'tall', to: 'md', over: 2, stillOver: false }]);
    assert.equal(found.length, 1);
    assert.equal(found[0].slide, 1);
  });

  test('the autocomplete asks the kernels what comes next, one axis at a time', () => {
    assert.deepEqual(sparks.nextWords('~{1 2 3}').next, 'type');
    assert.deepEqual(sparks.nextWords('~{1 2 3}:bar').next, 'size');
    const onBar = sparks.nextWords('~{1 2 3}:bar').words.map((w) => w.label);
    assert.ok(!onBar.includes('end') && !onBar.includes('zero'), 'a bar takes no markers or :zero');
    assert.deepEqual(sparks.nextWords('~{72%}').words.filter((w) => w.axis === 'type').map((w) => w.label), ['ring', 'bullet']);
    assert.equal(sparks.nextWords('~{1,2}'), null, 'a broken spark offers nothing');
    const pills = require('../../../lib/core/inline-pills.js');
    assert.equal(pills.nextWords('{LIVE}').next, 'shape');
    assert.equal(pills.nextWords('{LIVE}:tag').next, 'color');
    assert.equal(pills.nextWords('{LIVE}:tag:c3:lg'), null, 'a complete pill offers nothing');
    const hit = lintCore.inlineCodeCompletions('{LIVE}:tag:c3');
    assert.equal(hit.next, 'size');
    assert.ok(hit.words.every((w) => typeof w.info === 'string' && w.info));
  });
});
