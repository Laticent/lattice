/**
 * Unit: lib/core/resolve-chart-finish.js — the `chart-finish:` and `color-intensity:` keys
 * (engineering/chart-styling.md §3). Pins the vocabulary, the one thing that makes this a look
 * rather than a layer (a finish is ALWAYS on: no `off`, an absent or unknown value wears the
 * default), both render paths' wiring, the per-slide override through the real engine, and the
 * lint rule for a typo. The runtime path itself runs in
 * test/integration/parity/runtime-chart-finish.test.js, against the real bundle.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CHART_FINISH_NAMES, CHART_FINISHES, CHART_FINISH_DEFAULT, CHART_FINISH_TOKENS,
  chartFinishClass, chartFinishClassFromSource, isKnownChartFinish, isChartFinishToken, readFrontMatterChartFinish,
} = require('../../../lib/core/resolve-chart-finish');
const engine = require('../../../lib/engine');
const { lintText } = require('../../../lib/authoring/lint');
const lint = (md) => ({ findings: lintText(md) });

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');
// A linear scan of each <section> opening tag, since a regex spanning the whole tag is
// polynomial. `class=` anchored on whitespace, so `data-class=` never matches it.
const classesOf = (md) => String(engine.render(md).html).split('<section ').slice(1)
  .map((t) => t.slice(0, t.indexOf('>'))).map((t) => (/(?:^|\s)class="([^"]*)"/.exec(t)?.[1] ?? '').split(/\s+/));
const finishesOn = (classes) => classes.filter(isChartFinishToken);

describe('chart-finish: the vocabulary', () => {
  test('three finishes, no off, and the default is one of them', () => {
    assert.deepEqual([...CHART_FINISH_NAMES], ['pigment', 'etch', 'tone']);
    assert.deepEqual([...CHART_FINISHES], ['pigment', 'etch', 'tone']);
    assert.equal(CHART_FINISH_DEFAULT, 'pigment');
    assert.ok(CHART_FINISH_NAMES.includes(CHART_FINISH_DEFAULT));
  });

  test('a finish is always on: empty, absent, unknown and the retired `off` all wear the default', () => {
    for (const v of [undefined, null, '', '  ', 'off', 'tonal', 'etching']) {
      assert.equal(chartFinishClass(v), 'chart-finish-pigment', JSON.stringify(v));
    }
    assert.equal(chartFinishClass('Tone '), 'chart-finish-tone');
    assert.equal(chartFinishClass('ETCH'), 'chart-finish-etch');
  });

  test('every token carries the chart-finish- prefix, so none collides with the backdrop `finish-*`', () => {
    assert.deepEqual([...CHART_FINISH_TOKENS], ['chart-finish-pigment', 'chart-finish-etch', 'chart-finish-tone']);
    for (const t of CHART_FINISH_TOKENS) assert.ok(isChartFinishToken(t));
    assert.ok(!isChartFinishToken('finish-atrium'));
    assert.ok(!isChartFinishToken('chart-finish-off') && !isChartFinishToken('marks-tone'), 'neither the retired `off` nor the old `marks-*` spelling is a finish token');
  });

  test('the front-matter read strips a trailing comment and quotes', () => {
    assert.equal(readFrontMatterChartFinish('---\nchart-finish: tone  # restrained\n---\n'), 'tone');
    assert.equal(readFrontMatterChartFinish('---\nchart-finish: "etch"\n---\n'), 'etch');
    assert.equal(readFrontMatterChartFinish('---\ntheme: indaco\n---\n'), null);
    assert.equal(chartFinishClassFromSource('---\nchart-finish: etch\n---\n'), 'chart-finish-etch');
    assert.equal(chartFinishClassFromSource('---\ntheme: indaco\n---\n'), 'chart-finish-pigment');
    assert.equal(chartFinishClassFromSource('no front matter at all'), 'chart-finish-pigment');
    assert.ok(isKnownChartFinish('TONE') && !isKnownChartFinish('off') && !isKnownChartFinish('matte'));
  });
});

describe('chart-finish: the intensity axis', () => {
  const { COLOR_INTENSITIES, COLOR_INTENSITY_DEFAULT, chartFinishClasses, withChartFinishClasses, isColorIntensityToken } = require('../../../lib/core/resolve-chart-finish');
  test('two intensities, muted the default, one word per axis in either order', () => {
    assert.deepEqual([...COLOR_INTENSITIES], ['muted', 'vivid']);
    assert.equal(COLOR_INTENSITY_DEFAULT, 'muted');
    assert.deepEqual(chartFinishClasses(''), ['chart-finish-pigment', 'color-intensity-muted']);
    assert.deepEqual(chartFinishClasses('vivid'), ['chart-finish-pigment', 'color-intensity-vivid']);
    assert.deepEqual(chartFinishClasses('vivid etch'), ['chart-finish-etch', 'color-intensity-vivid']);
    assert.deepEqual(chartFinishClasses('pigment vivd'), ['chart-finish-pigment', 'color-intensity-muted'], 'a typo wears that axis\'s default');
    assert.ok(isKnownChartFinish('pigment vivid') && !isKnownChartFinish('muted vivid') && !isKnownChartFinish('tonal'));
  });
  test('a slide token on one axis keeps the deck\'s word on the other', () => {
    assert.deepEqual(withChartFinishClasses(['bar', 'color-intensity-vivid'], 'etch'), ['bar', 'color-intensity-vivid', 'chart-finish-etch']);
    assert.ok(isColorIntensityToken('color-intensity-muted') && !isChartFinishToken('color-intensity-muted'));
  });
  test('both render paths stamp it: a vivid deck, and a slide that asks for muted', () => {
    const md = '---\nmarp: true\ncolor-intensity: vivid\n---\n\n<!-- @meta{layout=bar} -->\n\n## A\n\n- A `3`\n\n---\n\n<!-- @meta{layout=bar, class=color-intensity-muted} -->\n\n## B\n\n- A `3`\n';
    const [a, b] = classesOf(md);
    assert.deepEqual(a.filter(isColorIntensityToken), ['color-intensity-vivid']);
    assert.deepEqual(b.filter(isColorIntensityToken), ['color-intensity-muted']);
    assert.deepEqual(b.filter(isChartFinishToken), ['chart-finish-pigment']);
  });
});

describe('chart-finish: tone\'s source axis', () => {
  const { CHART_FINISH_SOURCES, CHART_FINISH_SOURCE_TOKENS, chartFinishClasses, withChartFinishClasses, isChartFinishSourceToken, parseChartFinish } = require('../../../lib/core/resolve-chart-finish');
  test('two sources, no stamped default: a deck that names none renders exactly as before', () => {
    assert.deepEqual([...CHART_FINISH_SOURCES], ['ink', 'accent']);
    assert.deepEqual([...CHART_FINISH_SOURCE_TOKENS], ['chart-finish-ink', 'chart-finish-accent']);
    assert.deepEqual(chartFinishClasses('tone'), ['chart-finish-tone', 'color-intensity-muted']);
    assert.deepEqual(chartFinishClasses('tone ink'), ['chart-finish-tone', 'color-intensity-muted', 'chart-finish-ink']);
    assert.deepEqual(chartFinishClasses('accent vivid tone'), ['chart-finish-tone', 'color-intensity-vivid', 'chart-finish-accent']);
    assert.deepEqual(parseChartFinish('tone ink accent').duplicate, ['accent'], 'one word per axis');
    assert.ok(isKnownChartFinish('tone ink') && isKnownChartFinish('tone accent vivid') && !isKnownChartFinish('tone ink accent'));
  });
  test('a slide\'s own source keeps it; a slide with none takes the deck\'s', () => {
    assert.deepEqual(withChartFinishClasses(['bar', 'chart-finish-accent'], 'tone ink'), ['bar', 'chart-finish-accent', 'chart-finish-tone', 'color-intensity-muted']);
    assert.deepEqual(withChartFinishClasses(['bar'], 'tone'), ['bar', 'chart-finish-tone', 'color-intensity-muted'], 'no source token when the deck names none');
    assert.ok(isChartFinishSourceToken('chart-finish-ink') && !isChartFinishToken('chart-finish-ink') && !isChartFinishSourceToken('chart-finish-tone'));
  });
  test('the engine stamps it on every slide, and a slide may name the other', () => {
    const md = '---\nmarp: true\nchart-finish: tone ink\n---\n\n<!-- @meta{layout=bar} -->\n\n## A\n\n- A `3`\n\n---\n\n<!-- @meta{layout=bar, class=chart-finish-accent} -->\n\n## B\n\n- A `3`\n';
    const [a, b] = classesOf(md);
    assert.deepEqual(a.filter(isChartFinishSourceToken), ['chart-finish-ink']);
    assert.deepEqual(b.filter(isChartFinishSourceToken), ['chart-finish-accent']);
    assert.deepEqual(finishesOn(a), ['chart-finish-tone']);
    const [plain] = classesOf('---\nmarp: true\nchart-finish: tone\n---\n\n<!-- @meta{layout=bar} -->\n\n## A\n\n- A `3`\n');
    assert.deepEqual(plain.filter(isChartFinishSourceToken), []);
  });
  test('the runtime stamps the source too, per axis', () => {
    assert.match(read('lib/runtime/index.js'), /tokens\[2\] && !cur\.some\(isChartFinishSourceToken\)/);
  });
  test('deck-lint names a source under a finish it means nothing to, and accepts it under tone', () => {
    const rules = (v) => lint(`---\nchart-finish: ${v}\n---\n\n## A\n\ntext\n`).findings.filter((f) => /^(unknown-chart-finish|chart-finish-source-needs-tone)$/.test(f.rule));
    assert.equal(rules('tone ink').length, 0);
    assert.equal(rules('accent tone').length, 0);
    const [etch] = rules('etch ink');
    assert.equal(etch.rule, 'chart-finish-source-needs-tone');
    assert.match(etch.message, /'ink' picks the one hue `tone` draws in.*'etch'/);
    assert.match(rules('accent')[0].message, /the default, pigment/);
    // A slide that asks for tone takes the deck's source, so the word is not dead and the warning stays quiet.
    const withToneSlide = lint('---\nchart-finish: ink\n---\n\n<!-- @meta{layout=bar, class=chart-finish-tone} -->\n\n## A\n\n- A `3`\n').findings;
    assert.equal(withToneSlide.filter((f) => f.rule === 'chart-finish-source-needs-tone').length, 0);
  });
});

describe('chart-finish: both render paths', () => {
  test('the markdown-it plugin and the runtime stamp through the kernel, in a pass of their own', () => {
    // HARD RULE #1: each path stamps its own sections, so a register wired into one renders
    // two decks from one source. Both resolve through the kernel and both leave a slide's own
    // token alone.
    const plugins = read('lib/integrations/markdown-it/plugins.js');
    assert.match(plugins, /withChartFinishClasses\(/, 'plugins.js resolves the register through the kernel');
    assert.match(plugins, /ruler\.push\('chart_finish_stamp'/, 'plugins.js stamps in a pass that runs for every deck');
    assert.match(read('lib/core/resolve-chart-finish.js'), /out\.some\(isChartFinishToken\)[\s\S]*out\.some\(isColorIntensityToken\)/, 'the kernel keeps a slide that names its own, per axis');
    const runtime = read('lib/runtime/index.js');
    assert.match(runtime, /chartFinishClasses\(/, 'the runtime resolves the register through the kernel');
    assert.match(runtime, /function stampChartFinish\(/, 'the runtime stamps every section');
    assert.match(runtime, /isChartFinishToken[\s\S]*isColorIntensityToken/, 'the runtime keeps a slide that names its own, per axis');
    for (const [rel, src] of [['plugins.js', plugins], ['runtime/index.js', runtime]]) {
      assert.doesNotMatch(src, /marksTokens/, `${rel} no longer rides the deck-token pass, which returns early for a deck with no tokens`);
    }
  });

  const deck = (fm) => `---\nmarp: true\n${fm}---\n\n<!-- @meta{layout=bar} -->\n\n## A\n\n- A \`3\`\n\n---\n\n` +
    '<!-- @meta{layout=bar, class=chart-finish-etch} -->\n\n## B\n\n- A `3`\n\n---\n\n<!-- @meta{layout=bar, class=chart-finish-pigment} -->\n\n## C\n\n- A `3`\n';

  test('the deck stamps every slide; a slide token overrides, and may ask for the default', () => {
    const [a, b, c] = classesOf(deck('chart-finish: tone\n'));
    assert.deepEqual(finishesOn(a), ['chart-finish-tone']);
    assert.deepEqual(finishesOn(b), ['chart-finish-etch']);
    assert.deepEqual(finishesOn(c), ['chart-finish-pigment']);
  });

  test('a deck that names none wears the default on every slide, front matter or not', () => {
    for (const fm of ['', 'theme: indaco\n']) {
      for (const s of classesOf(deck(fm))) assert.ok(finishesOn(s).length === 1, `${JSON.stringify(fm)}: ${s.join(' ')}`);
      assert.deepEqual(finishesOn(classesOf(deck(fm))[0]), ['chart-finish-pigment']);
    }
    const noFrontMatter = '<!-- @meta{layout=bar} -->\n\n## A\n\n- A `3`\n\n---\n\n<!-- @meta{layout=bar} -->\n\n## B\n\n- A `3`\n';
    for (const s of classesOf(noFrontMatter)) assert.deepEqual(finishesOn(s), ['chart-finish-pigment']);
  });

  test('the retired `off` and an unknown value wear the default, and never stamp two finishes', () => {
    for (const v of ['off', 'tonal', 'etching']) {
      const [a] = classesOf(deck(`chart-finish: ${v}\n`));
      assert.deepEqual(finishesOn(a), ['chart-finish-pigment'], v);
    }
  });

  test('a chart in a pane of a layout slide is finished like a full-slide one: the SECTION carries the finish', () => {
    // The section of a `columns` slide never names the chart inside its pane, so a stamp that waited
    // for a chart class on the section would miss it.
    const md = '---\nmarp: true\nchart-finish: etch\n---\n\n<!-- @meta{layout=columns} -->\n\n## Split\n\n- Left `1`\n\n<!-- @meta{pane=bar} -->\n\n- A `3`\n- B `4`\n';
    const [s] = classesOf(md);
    assert.deepEqual(finishesOn(s), ['chart-finish-etch'], s.join(' '));
  });

  test('`chart-finish-off` is just an unknown class now: it lints, and the deck finish still lands', () => {
    const md = `---\nmarp: true\nchart-finish: tone\n---\n\n<!-- @meta{layout=bar, class=chart-finish-off} -->\n\n## A\n\n- A \`3\`\n`;
    const [s] = classesOf(md);
    assert.deepEqual(finishesOn(s), ['chart-finish-tone'], 'exactly one real finish: the deck\'s');
    assert.ok(s.includes('chart-finish-off'), 'the author\'s own class is left in place');
    const stale = lint(md).findings.find((f) => f.rule === 'unknown-class');
    // Its named "retired" hint was itself retired on 2026-11-23 (changelog.d/retire-old-rename-hints.removed.md).
    assert.ok(stale, 'the stale token is still reported');
  });

  test('a per-slide token lints clean', () => {
    const r = lint(deck('chart-finish: tone\n'));
    assert.deepEqual(r.findings.filter((f) => f.rule === 'unknown-class'), []);
  });
});

// `marks:` split in two (renames decision Q4): the engine reads only `chart-finish:` and `color-intensity:`, so an old
// deck renders the defaults until `lint:deck --fix` writes the new keys. Rendered through the same engine path as above.
describe('chart-finish: the retired `marks:` key', () => {
  const { applyFix } = require('../../../lib/authoring/lint-core');
  const fixAll = (md) => {
    let out = md;
    for (let n = 0; n < 5; n++) {
      const f = lint(out).findings.find((x) => x.rule === 'marks-split' && x.autofixable);
      if (!f) break;
      const next = applyFix(out, f);
      if (next == null || next === out) break;
      out = next;
    }
    return out;
  };
  test('the old key renders nothing: the deck wears the defaults', () => {
    const [s] = classesOf('---\nmarp: true\nmarks: tone vivid\n---\n\n<!-- @meta{layout=bar} -->\n\n## A\n\n- A `3`\n');
    assert.deepEqual(finishesOn(s), ['chart-finish-pigment'], s.join(' '));
    assert.ok(s.includes('color-intensity-muted'), s.join(' '));
  });

  test('an intensity word under `chart-finish:` sets nothing; it lives on `color-intensity:`', () => {
    const [s] = classesOf('---\nmarp: true\nchart-finish: tone vivid\n---\n\n<!-- @meta{layout=bar} -->\n\n## A\n\n- A `3`\n');
    assert.deepEqual(finishesOn(s), ['chart-finish-tone'], s.join(' '));
    assert.ok(s.includes('color-intensity-muted'), s.join(' '));
    const f = lint('---\nmarp: true\nchart-finish: tone vivid\n---\n\n## A\n').findings.find((x) => x.rule === 'marks-split');
    assert.ok(f && f.severity === 'error' && /color-intensity: vivid/.test(f.fix), JSON.stringify(f));
  });

  test('a finish word under `color-intensity:` sets nothing and is named', () => {
    const [s] = classesOf('---\nmarp: true\ncolor-intensity: tone\n---\n\n<!-- @meta{layout=bar} -->\n\n## A\n\n- A `3`\n');
    assert.deepEqual(finishesOn(s), ['chart-finish-pigment'], s.join(' '));
    assert.ok(lint('---\nmarp: true\ncolor-intensity: tone\n---\n\n## A\n').findings.some((x) => x.rule === 'unknown-color-intensity'));
  });

  test('lint names both keys at error, and the fix splits the line', () => {
    const md = '---\nmarp: true\nmarks: tone ink vivid  # house\n---\n\n## A\n';
    const [f] = lint(md).findings.filter((x) => x.rule === 'marks-split');
    assert.equal(f.severity, 'error');
    assert.match(f.fix, /`chart-finish: tone ink` and `color-intensity: vivid`/);
    assert.equal(fixAll(md), '---\nmarp: true\nchart-finish: tone ink\ncolor-intensity: vivid\n---\n\n## A\n');
    assert.equal(fixAll('---\nmarp: true\nmarks: etch\n---\n\n## A\n'), '---\nmarp: true\nchart-finish: etch\n---\n\n## A\n');
    assert.equal(fixAll('---\nmarp: true\nmarks: vivid\n---\n\n## A\n'), '---\nmarp: true\ncolor-intensity: vivid\n---\n\n## A\n');
  });

  test('a `color-intensity:` the deck already sets decides its axis, so the fix leaves that word out', () => {
    assert.equal(fixAll('---\nmarks: tone vivid\ncolor-intensity: muted\n---\n\n## A\n'), '---\nchart-finish: tone\ncolor-intensity: muted\n---\n\n## A\n');
    // `chart-finish:` beside `marks:` is the OLD spelling, which `marks:` beat: the old line goes, `marks:` splits.
    assert.equal(fixAll('---\nmarks: tone vivid\nchart-finish: etch\ncolor-intensity: muted\n---\n\n## A\n'), '---\nchart-finish: tone\ncolor-intensity: muted\n---\n\n## A\n');
  });

  test('with both `marks:` and the old `chart-finish:`, the fix keeps what rendered before: `marks:`', () => {
    // Before the split `marks:` decided whole; the red team showed the fix losing `tone` or changing the look.
    assert.equal(fixAll('---\nchart-finish: vivid\nmarks: tone\n---\n\n## A\n'), '---\nchart-finish: tone\n---\n\n## A\n');
    assert.equal(fixAll('---\nmarks: tone vivid\nchart-finish: etch\n---\n\n## A\n'), '---\nchart-finish: tone\ncolor-intensity: vivid\n---\n\n## A\n');
    assert.equal(fixAll('---\nchart-finish: tonal\nmarks: etch\n---\n\n## A\n'), '---\nchart-finish: etch\n---\n\n## A\n');
  });

  test('text inside a block scalar is not a key', () => {
    const md = '---\ndescription: |\n  chart-finish: etch\n  color-intensity: vivid\nmarks: tone muted\n---\n\n## A\n';
    assert.equal(fixAll(md), '---\ndescription: |\n  chart-finish: etch\n  color-intensity: vivid\nchart-finish: tone\ncolor-intensity: muted\n---\n\n## A\n');
  });

  test('a `marks:` block list has no fix, so the fix never orphans its items', () => {
    const md = '---\ntheme: indaco\nmarks:\n  - etch\n  - vivid\n---\n\n# A\n';
    const f = lint(md).findings.find((x) => x.rule === 'marks-split');
    assert.ok(f && f.severity === 'error' && !f.autofixable, JSON.stringify(f));
    assert.equal(fixAll(md), md);
  });

  test('an intensity under `chart-finish:` moves to `color-intensity:`, unless that key already decides', () => {
    assert.equal(fixAll('---\nchart-finish: tone vivid\n---\n\n## A\n'), '---\nchart-finish: tone\ncolor-intensity: vivid\n---\n\n## A\n');
    assert.equal(fixAll('---\nchart-finish: vivid\n---\n\n## A\n'), '---\ncolor-intensity: vivid\n---\n\n## A\n');
    assert.equal(fixAll('---\nchart-finish: etch vivid\ncolor-intensity: muted\n---\n\n## A\n'), '---\nchart-finish: etch\ncolor-intensity: muted\n---\n\n## A\n');
  });

  test('after the fix the deck renders what the old key meant', () => {
    const md = fixAll('---\nmarp: true\nmarks: tone accent vivid\n---\n\n<!-- @meta{layout=bar} -->\n\n## A\n\n- A `3`\n');
    const [s] = classesOf(md);
    assert.deepEqual(finishesOn(s), ['chart-finish-tone'], s.join(' '));
    assert.ok(s.includes('color-intensity-vivid') && s.includes('chart-finish-accent'), s.join(' '));
  });

  test('an old slide class is an error with a fix, and no longer renders', () => {
    for (const [from, to] of [['marks-tone', 'chart-finish-tone'], ['marks-vivid', 'color-intensity-vivid'], ['chart-finish-vivid', 'color-intensity-vivid'], ['marks-ink', 'chart-finish-ink']]) {
      const md = `---\nmarp: true\n---\n\n<!-- @meta{class=bar ${from}} -->\n\n## A\n\n- A \`3\`\n`;
      const hit = lint(md).findings.find((f) => f.classToken === from);
      assert.ok(hit && hit.severity === 'error' && hit.autofixable && hit.replace?.to === to, `${from}: ${JSON.stringify(hit)}`);
      const [s] = classesOf(md);
      assert.ok(!s.includes(to), `${from} renders nothing: ${s.join(' ')}`);
    }
  });
});

describe('chart-finish: lint', () => {
  test('an unknown value warns and names the choices', () => {
    const r = lint('---\nmarp: true\nchart-finish: tonal\n---\n\n## A\n');
    const f = r.findings.find((x) => x.rule === 'unknown-chart-finish');
    assert.ok(f, 'unknown-chart-finish fired');
    assert.equal(f.severity, 'warning');
    assert.match(f.fix, /pigment, etch, tone/);
    assert.doesNotMatch(f.fix, /\boff\b/);
  });

  test('the retired `off` and `etching` are reported like any other unknown value', () => {
    for (const v of ['off', 'etching']) {
      const r = lint(`---\nmarp: true\nchart-finish: ${v}\n---\n\n## A\n`);
      assert.ok(r.findings.some((x) => x.rule === 'unknown-chart-finish'), v);
    }
  });

  test('a known value, a commented value and no value are silent', () => {
    for (const fm of ['chart-finish: tone\n', 'chart-finish: etch # line\n', 'chart-finish: pigment\n', '']) {
      const r = lint(`---\nmarp: true\n${fm}---\n\n## A\n`);
      assert.equal(r.findings.filter((x) => x.rule === 'unknown-chart-finish').length, 0, fm);
    }
  });
});
