/**
 * Unit: lib/core/resolve-marks.js — the `marks:` register
 * (engineering/chart-styling.md §3). Pins the vocabulary, the one thing that makes this a look
 * rather than a layer (a finish is ALWAYS on: no `off`, an absent or unknown value wears the
 * default), both render paths' wiring, the per-slide override through the real engine, and the
 * lint rule for a typo. The runtime path itself runs in
 * test/integration/parity/runtime-marks.test.js, against the real bundle.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MARKS_NAMES, MARKS_FINISHES, MARKS_DEFAULT, MARKS_TOKENS,
  marksClass, marksClassFromSource, isKnownMarks, isMarksToken, readFrontMatterMarks,
  currentMarksToken,
} = require('../../../lib/core/resolve-marks');
const engine = require('../../../lib/engine');
const { lintText } = require('../../../lib/authoring/lint');
const lint = (md) => ({ findings: lintText(md) });

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');
// A linear scan of each <section> opening tag, since a regex spanning the whole tag is
// polynomial. `class=` anchored on whitespace, so `data-class=` never matches it.
const classesOf = (md) => String(engine.render(md).html).split('<section ').slice(1)
  .map((t) => t.slice(0, t.indexOf('>'))).map((t) => (/(?:^|\s)class="([^"]*)"/.exec(t)?.[1] ?? '').split(/\s+/));
const finishesOn = (classes) => classes.filter(isMarksToken);

describe('marks: the vocabulary', () => {
  test('three finishes, no off, and the default is one of them', () => {
    assert.deepEqual([...MARKS_NAMES], ['pigment', 'etch', 'tone']);
    assert.deepEqual([...MARKS_FINISHES], ['pigment', 'etch', 'tone']);
    assert.equal(MARKS_DEFAULT, 'pigment');
    assert.ok(MARKS_NAMES.includes(MARKS_DEFAULT));
  });

  test('a finish is always on: empty, absent, unknown and the retired `off` all wear the default', () => {
    for (const v of [undefined, null, '', '  ', 'off', 'tonal', 'etching']) {
      assert.equal(marksClass(v), 'marks-pigment', JSON.stringify(v));
    }
    assert.equal(marksClass('Tone '), 'marks-tone');
    assert.equal(marksClass('ETCH'), 'marks-etch');
  });

  test('every token carries the chart-finish- prefix, so none collides with the backdrop `finish-*`', () => {
    assert.deepEqual([...MARKS_TOKENS], ['marks-pigment', 'marks-etch', 'marks-tone']);
    for (const t of MARKS_TOKENS) assert.ok(isMarksToken(t));
    assert.ok(!isMarksToken('finish-atrium'));
    assert.ok(!isMarksToken(currentMarksToken('chart-finish-off')), '`chart-finish-off` is not a finish token any more, in either spelling');
  });

  test('the front-matter read strips a trailing comment and quotes', () => {
    assert.equal(readFrontMatterMarks('---\nmarks: tone  # restrained\n---\n'), 'tone');
    assert.equal(readFrontMatterMarks('---\nmarks: "etch"\n---\n'), 'etch');
    assert.equal(readFrontMatterMarks('---\ntheme: indaco\n---\n'), null);
    assert.equal(marksClassFromSource('---\nmarks: etch\n---\n'), 'marks-etch');
    assert.equal(marksClassFromSource('---\ntheme: indaco\n---\n'), 'marks-pigment');
    assert.equal(marksClassFromSource('no front matter at all'), 'marks-pigment');
    assert.ok(isKnownMarks('TONE') && !isKnownMarks('off') && !isKnownMarks('matte'));
  });
});

describe('marks: the intensity axis', () => {
  const { MARKS_INTENSITIES, MARKS_INTENSITY_DEFAULT, marksClasses, withMarksClasses, isMarksIntensityToken } = require('../../../lib/core/resolve-marks');
  test('two intensities, muted the default, one word per axis in either order', () => {
    assert.deepEqual([...MARKS_INTENSITIES], ['muted', 'vivid']);
    assert.equal(MARKS_INTENSITY_DEFAULT, 'muted');
    assert.deepEqual(marksClasses(''), ['marks-pigment', 'marks-muted']);
    assert.deepEqual(marksClasses('vivid'), ['marks-pigment', 'marks-vivid']);
    assert.deepEqual(marksClasses('vivid etch'), ['marks-etch', 'marks-vivid']);
    assert.deepEqual(marksClasses('pigment vivd'), ['marks-pigment', 'marks-muted'], 'a typo wears that axis\'s default');
    assert.ok(isKnownMarks('pigment vivid') && !isKnownMarks('muted vivid') && !isKnownMarks('tonal'));
  });
  test('a slide token on one axis keeps the deck\'s word on the other', () => {
    assert.deepEqual(withMarksClasses(['bar', 'marks-vivid'], 'etch'), ['bar', 'marks-vivid', 'marks-etch']);
    assert.ok(isMarksIntensityToken('marks-muted') && !isMarksToken('marks-muted'));
  });
  test('both render paths stamp it: a vivid deck, and a slide that asks for muted', () => {
    const md = '---\nmarp: true\nmarks: vivid\n---\n\n<!-- _class: bar -->\n\n## A\n\n- A `3`\n\n---\n\n<!-- _class: bar marks-muted -->\n\n## B\n\n- A `3`\n';
    const [a, b] = classesOf(md);
    assert.deepEqual(a.filter(isMarksIntensityToken), ['marks-vivid']);
    assert.deepEqual(b.filter(isMarksIntensityToken), ['marks-muted']);
    assert.deepEqual(b.filter(isMarksToken), ['marks-pigment']);
  });
});

describe('marks: both render paths', () => {
  test('the markdown-it plugin and the runtime stamp through the kernel, in a pass of their own', () => {
    // HARD RULE #1: each path stamps its own sections, so a register wired into one renders
    // two decks from one source. Both resolve through the kernel and both leave a slide's own
    // token alone.
    const plugins = read('lib/integrations/markdown-it/plugins.js');
    assert.match(plugins, /withMarksClasses\(/, 'plugins.js resolves the register through the kernel');
    assert.match(plugins, /ruler\.push\('marks_stamp'/, 'plugins.js stamps in a pass that runs for every deck');
    assert.match(read('lib/core/resolve-marks.js'), /out\.some\(isMarksToken\)[\s\S]*out\.some\(isMarksIntensityToken\)/, 'the kernel keeps a slide that names its own, per axis');
    const runtime = read('lib/runtime/index.js');
    assert.match(runtime, /marksClasses\(/, 'the runtime resolves the register through the kernel');
    assert.match(runtime, /function stampMarks\(/, 'the runtime stamps every section');
    assert.match(runtime, /isMarksToken[\s\S]*isMarksIntensityToken/, 'the runtime keeps a slide that names its own, per axis');
    for (const [rel, src] of [['plugins.js', plugins], ['runtime/index.js', runtime]]) {
      assert.doesNotMatch(src, /marksTokens/, `${rel} no longer rides the deck-token pass, which returns early for a deck with no tokens`);
    }
  });

  const deck = (fm) => `---\nmarp: true\n${fm}---\n\n<!-- _class: bar -->\n\n## A\n\n- A \`3\`\n\n---\n\n` +
    '<!-- _class: bar marks-etch -->\n\n## B\n\n- A `3`\n\n---\n\n<!-- _class: bar marks-pigment -->\n\n## C\n\n- A `3`\n';

  test('the deck stamps every slide; a slide token overrides, and may ask for the default', () => {
    const [a, b, c] = classesOf(deck('marks: tone\n'));
    assert.deepEqual(finishesOn(a), ['marks-tone']);
    assert.deepEqual(finishesOn(b), ['marks-etch']);
    assert.deepEqual(finishesOn(c), ['marks-pigment']);
  });

  test('a deck that names none wears the default on every slide, front matter or not', () => {
    for (const fm of ['', 'theme: indaco\n']) {
      for (const s of classesOf(deck(fm))) assert.ok(finishesOn(s).length === 1, `${JSON.stringify(fm)}: ${s.join(' ')}`);
      assert.deepEqual(finishesOn(classesOf(deck(fm))[0]), ['marks-pigment']);
    }
    const noFrontMatter = '<!-- _class: bar -->\n\n## A\n\n- A `3`\n\n---\n\n<!-- _class: bar -->\n\n## B\n\n- A `3`\n';
    for (const s of classesOf(noFrontMatter)) assert.deepEqual(finishesOn(s), ['marks-pigment']);
  });

  test('the retired `off` and an unknown value wear the default, and never stamp two finishes', () => {
    for (const v of ['off', 'tonal', 'etching']) {
      const [a] = classesOf(deck(`marks: ${v}\n`));
      assert.deepEqual(finishesOn(a), ['marks-pigment'], v);
    }
  });

  test('a chart in a pane of a layout slide is finished like a full-slide one: the SECTION carries the finish', () => {
    // The section of a `columns` slide never names the chart inside its pane, so a stamp that waited
    // for a chart class on the section would miss it.
    const md = '---\nmarp: true\nmarks: etch\n---\n\n<!-- _class: columns -->\n\n## Split\n\n- Left `1`\n\n<!-- _pane: bar -->\n\n- A `3`\n- B `4`\n';
    const [s] = classesOf(md);
    assert.deepEqual(finishesOn(s), ['marks-etch'], s.join(' '));
  });

  test('`chart-finish-off` is just an unknown class now: it lints, and the deck finish still lands', () => {
    const md = `---\nmarp: true\nmarks: tone\n---\n\n<!-- _class: bar chart-finish-off -->\n\n## A\n\n- A \`3\`\n`;
    const [s] = classesOf(md);
    assert.deepEqual(finishesOn(s), ['marks-tone'], 'exactly one real finish: the deck\'s');
    assert.ok(s.includes('chart-finish-off'), 'the author\'s own class is left in place');
    const stale = lint(md).findings.find((f) => f.rule === 'unknown-class');
    assert.ok(stale, 'the stale token is reported');
    assert.match(stale.message, /retired/, 'and said to be retired, not renamed or merely unknown');
    assert.match(stale.fix, /marks-pigment/);
  });

  test('a per-slide token lints clean', () => {
    const r = lint(deck('marks: tone\n'));
    assert.deepEqual(r.findings.filter((f) => f.rule === 'unknown-class'), []);
  });
});

// `chart-finish:` was renamed `marks:` (#2887) and still works: a deck on the old spelling renders the same, and
// lint names the new one at info. Rendered through the same engine path as above.
describe('marks: the old `chart-finish` spelling still works', () => {
  test('the old key renders its value', () => {
    const [s] = classesOf('---\nmarp: true\nchart-finish: tone vivid\n---\n\n<!-- _class: bar -->\n\n## A\n\n- A `3`\n');
    assert.deepEqual(finishesOn(s), ['marks-tone'], s.join(' '));
    assert.ok(s.includes('marks-vivid'), s.join(' '));
  });

  test('an old slide class is renamed in place and keeps its axis', () => {
    const [s] = classesOf('---\nmarp: true\nmarks: etch\n---\n\n<!-- _class: bar chart-finish-tone chart-finish-vivid -->\n\n## A\n\n- A `3`\n');
    assert.deepEqual(finishesOn(s), ['marks-tone'], s.join(' '));
    assert.ok(s.includes('marks-vivid') && !s.some((c) => c.startsWith('chart-finish-')), s.join(' '));
  });

  test('a blank `marks:` is no value, so the old key still decides', () => {
    const [s] = classesOf('---\nmarp: true\nchart-finish: tone\nmarks:\n---\n\n<!-- _class: bar -->\n\n## A\n\n- A `3`\n');
    assert.deepEqual(finishesOn(s), ['marks-tone'], s.join(' '));
  });

  test('with both keys, `marks:` wins', () => {
    const [s] = classesOf('---\nmarp: true\nchart-finish: tone\nmarks: etch\n---\n\n<!-- _class: bar -->\n\n## A\n\n- A `3`\n');
    assert.deepEqual(finishesOn(s), ['marks-etch'], s.join(' '));
  });

  test('lint names the new spelling at info, for the key and for a slide class', () => {
    const key = lint('---\nmarp: true\nchart-finish: tone\n---\n\n## A\n').findings.filter((f) => f.rule === 'marks-renamed');
    assert.equal(key.length, 1);
    assert.equal(key[0].severity, 'info');
    assert.match(key[0].fix, /marks: tone/);
    const both = lint('---\nmarp: true\nchart-finish: tone\nmarks: etch\n---\n\n## A\n').findings.find((f) => f.rule === 'marks-renamed');
    assert.match(both.message, /`marks:` wins/);
    const cls = lint('---\nmarp: true\n---\n\n<!-- _class: bar chart-finish-vivid -->\n\n## A\n\n- A `3`\n').findings;
    const hit = cls.find((f) => f.rule === 'marks-renamed');
    assert.ok(hit && hit.severity === 'info' && /marks-vivid/.test(hit.fix), JSON.stringify(cls));
    assert.equal(cls.filter((f) => f.rule === 'unknown-class').length, 0, 'not reported as broken');
    // An unknown word under the old key is still checked.
    assert.ok(lint('---\nmarp: true\nchart-finish: tonal\n---\n\n## A\n').findings.some((f) => f.rule === 'unknown-marks'));
  });
});

describe('marks: lint', () => {
  test('an unknown value warns and names the choices', () => {
    const r = lint('---\nmarp: true\nmarks: tonal\n---\n\n## A\n');
    const f = r.findings.find((x) => x.rule === 'unknown-marks');
    assert.ok(f, 'unknown-marks fired');
    assert.equal(f.severity, 'warning');
    assert.match(f.fix, /pigment, etch, tone/);
    assert.doesNotMatch(f.fix, /\boff\b/);
  });

  test('the retired `off` and `etching` are reported like any other unknown value', () => {
    for (const v of ['off', 'etching']) {
      const r = lint(`---\nmarp: true\nmarks: ${v}\n---\n\n## A\n`);
      assert.ok(r.findings.some((x) => x.rule === 'unknown-marks'), v);
    }
  });

  test('a known value, a commented value and no value are silent', () => {
    for (const fm of ['marks: tone\n', 'marks: etch # line\n', 'marks: pigment\n', '']) {
      const r = lint(`---\nmarp: true\n${fm}---\n\n## A\n`);
      assert.equal(r.findings.filter((x) => x.rule === 'unknown-marks').length, 0, fm);
    }
  });
});
