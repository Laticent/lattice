// tools/segno-codemod.mjs rewrites old inline-code spellings into Segno's notation, and only
// what the old kernels read: the arms that matter are the ones it must leave alone.
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

let rewriteSpan;
let rewriteText;
let rewriteMdx;
let rewriteManifest;
let corpus;
before(async () => {
  ({ rewriteSpan, rewriteText, rewriteMdx, rewriteManifest, corpus } = await import('../../../tools/segno-codemod.mjs'));
});

describe('segno-codemod: pills and sparks', () => {
  test('rewrites the old spellings', () => {
    assert.equal(rewriteSpan('{BETA}:tag:c4'), '{BETA, tag, c4}');
    assert.equal(rewriteSpan('{1}:circle:c5:lg'), '{1, circle, c5, lg}');
    assert.equal(rewriteSpan('~{12 14 17}:bar:lg'), '~{12 14 17, bar, lg}');
    assert.equal(rewriteSpan('~{72/80}:bullet'), '~{72/80, bullet}');
  });
  test('keeps an escape, and a broken example keeps teaching its error', () => {
    assert.equal(rewriteSpan('\\{LIVE}:tag'), '\\{LIVE, tag}');
    assert.equal(rewriteSpan('{X}:c13'), '{X, c13}');
    assert.equal(rewriteSpan('~{3 5 4}:bar:end'), '~{3 5 4, bar, end}');
  });
  test('leaves alone what was never a pill or a spark', () => {
    for (const code of ['{LIVE}', '~{1 2 3}', '{ ok, scene }', '{a}:hover', '~{x}:foo', ':root', 'a:b:c', '[x]']) {
      assert.equal(rewriteSpan(code), null, code);
    }
  });
  test('reports instead of guessing: a comma in spark data would change meaning', () => {
    assert.deepEqual(Object.keys(rewriteSpan('~{1,200 1,450}:bar')), ['unsafe']);
  });
  test('rewrites quoted spans inside a double-backtick span', () => {
    assert.equal(rewriteSpan('`{DRAFT}:c2`'), '`{DRAFT, c2}`');
    assert.equal(rewriteSpan('1. cards-grid `{STABLE}:c2`'), '1. cards-grid `{STABLE, c2}`');
  });
  test('--only limits the rewriters', () => {
    assert.equal(rewriteSpan('{BETA}:tag', ['spark']), null);
    assert.equal(rewriteSpan('~{1 2}:bar', ['pill']), null);
  });
});

describe('segno-codemod: files', () => {
  test('rewrites prose and markdown fences, never other fences', () => {
    const src = [
      'A `{BETA}:tag` pill.',
      '```markdown',
      '- Row `~{1 2}:bar`',
      '```',
      '```js',
      'const s = `{BETA}:tag`;',
      '```',
    ].join('\n');
    const r = rewriteText(src);
    assert.equal(r.text, [
      'A `{BETA, tag}` pill.',
      '```markdown',
      '- Row `~{1 2, bar}`',
      '```',
      '```js',
      'const s = `{BETA}:tag`;',
      '```',
    ].join('\n'));
    assert.equal(r.changes.length, 2);
  });
});

describe('segno-codemod: chart points', () => {
  const quad = (body) => `<!-- _class: quadrant -->\n\n## H\n\n${body}`;
  test('a quadrant item\'s coordinate pill becomes a point; a size is named', () => {
    const r = rewriteText(quad('- Bets\n  - Atlas `3, 70`\n  - Borealis `0.4, 0.55, 12`'));
    assert.match(r.text, /- Atlas `\{3, 70\}`/);
    assert.match(r.text, /- Borealis `\{0\.4, 0\.55, size=12\}`/);
  });
  test('a detail line under an item keeps its figures — it is prose, not a point', () => {
    const r = rewriteText(quad('- Bets\n  - Atlas `3, 70`\n    - Confidence range `40, 95`'));
    assert.match(r.text, /Confidence range `40, 95`/);
  });
  test('a thousands number on another chart is never a point', () => {
    const r = rewriteText('<!-- _class: funnel -->\n\n- Visitors `12,000`');
    assert.equal(r.changes.length, 0);
  });
  test('a scatter row\'s trailing value pills become one point; a prose pill ahead of them stays', () => {
    const r = rewriteText('<!-- _class: scatter -->\n\n## H\n\n- Atlas `EMEA` `$4.2M` `62%`\n- Borealis `$2.1M` `38%` `140`');
    assert.match(r.text, /- Atlas `EMEA` `\{\$4\.2M, 62%\}`/);
    assert.match(r.text, /- Borealis `\{\$2\.1M, 38%, size=140\}`/);
  });
  test('a scatter legend line is not a row', () => {
    const r = rewriteText('<!-- _class: scatter -->\n\n`Annual cost` `Teams adopting`\n\n- A `1` `2`');
    assert.match(r.text, /`Annual cost` `Teams adopting`/);
  });
});

describe('segno-codemod: gantt dependencies', () => {
  const gantt = (body) => `<!-- _class: gantt -->\n\n## H\n\n${body}`;
  test('`after: X` becomes `after=X`, quoted when the name needs it', () => {
    const r = rewriteText(gantt('- L\n  - B `Q2` `after: Design`\n  - C `Q3` `after: A=B`'));
    assert.match(r.text, /`after=Design`/);
    assert.match(r.text, /`after="A=B"`/);
  });
  test('a comma is reported, not guessed: the chart read one name and lint two', () => {
    const r = rewriteText(gantt('- L\n  - B `Q2` `after: A, B`'));
    assert.equal(r.changes.length, 0);
    assert.equal(r.unsafe.length, 1);
  });
  test('off a gantt slide, `after:` is prose', () => {
    assert.equal(rewriteText('Write `after: Design` to add one.').changes.length, 0);
  });
});

describe('segno-codemod: per-chart records (slice 5)', () => {
  test('radar: a scale eyebrow becomes the axis line; one that says more keeps its words', () => {
    const r = (eb) => rewriteText(`<!-- _class: radar -->\n\n\`${eb}\`\n\n## H\n\n- A\n  - x \`3\``).text;
    assert.match(r('Scale · 0–100'), /\n`\[\{Scale, 0\.\.100\}\]`\n\n## H/);
    const kept = r('Scale · 0–10, on the criteria we wrote');
    assert.match(kept, /`\[\{Scale, 0\.\.10\}\]`\n\n`Scale · 0–10, on the criteria we wrote`/);
    assert.match(r('Capability · team vs target'), /`Capability · team vs target`/);
  });
  test('heatmap: `# why` becomes `note=why`, quoted when it holds a comma', () => {
    const t = rewriteText('<!-- _class: heatmap -->\n\n| | A |\n| --- | --: |\n| X | 1 `# dipped, then rose` |').text;
    assert.match(t, /`note="dipped, then rose"`/);
  });
  test('journey: a task\'s pills become one step record; a second actor stays an @ pill', () => {
    const t = rewriteText('<!-- _class: journey -->\n\n## H\n\n- S\n  - Work `@me` `@cat` `:1` `+40`\n  - Look `@me`').text;
    assert.match(t, /- Work `\{who=me, mood=1, volume=40\}` `@cat`/);
    assert.match(t, /- Look `@me`/);
  });
  test('state chart: `event => N` becomes `{event, to=N}`', () => {
    const t = rewriteText('<!-- _class: state-chart -->\n\n## H\n\n1. A `start`\n   - `submit => 2`\n   - `=> self`\n2. B').text;
    assert.match(t, /`\{submit, to=2\}`/);
    assert.match(t, /`\{to=self\}`/);
  });
  test('flowchart: a colon chain becomes one record; one word stands alone; the key drops its colons', () => {
    const t = rewriteText('<!-- _class: flowchart -->\n\n## H\n\n- A `#api:diamond:c2` -> B `:dotted:open`\n- C `:doc`\n- D `fail`\n\n`[{"=>", Main}, {:dotted, Waits}]`').text;
    assert.match(t, /`\{#api, diamond, c2\}`/);
    assert.match(t, /`\{dotted, open\}`/);
    assert.match(t, /- C `doc`/);
    assert.match(t, /- D `fail`/);
    assert.match(t, /\{dotted, Waits\}/);
  });
});

describe('segno-codemod: .mdx docs pages', () => {
  test('a template literal deck is rewritten with its backticks still escaped, and the prose too', () => {
    const src = 'export const LAB = `<!-- _class: list -->\n\n- A \\`{BETA}:tag\\`\n`;\n\nThe engine is `{STABLE}:c2`.\n';
    const r = rewriteMdx(src);
    assert.equal(r.text, 'export const LAB = `<!-- _class: list -->\n\n- A \\`{BETA, tag}\\`\n`;\n\nThe engine is `{STABLE, c2}`.\n');
    assert.equal(r.changes.length, 2);
  });
  test('a backslash already in the template is kept as written, never doubled', () => {
    // Source `\\` and `\{` are escapes of the template, not of the deck: the rewrite must leave
    // them byte-for-byte while it re-escapes the code-span backticks it cooked.
    const src = 'export const D = `- \\\\ path \\`\\\\{LIVE}\\` and \\`{BETA}:tag\\`\n`;\n';
    assert.equal(rewriteMdx(src).text, 'export const D = `- \\\\ path \\`\\\\{LIVE}\\` and \\`{BETA, tag}\\`\n`;\n');
  });
  test('an interpolating template is not a deck and is left alone', () => {
    // The `$` + `{` is the mdx file's interpolation, built from two halves so it reads as data here.
    const src = `export const X = \`- A \\\`{BETA}:tag\\\` ${'$'}{n}\`;`;
    assert.equal(rewriteMdx(src).text, src);
  });
});

describe('segno-codemod: the corpus stays migrated', () => {
  // The clean break (decision 9) is only clean while no old spelling comes back: a parallel PR
  // written before phase 2, or a conflict resolved by hand, lands one silently, and an old chart
  // spelling draws a wrong chart rather than an error. This pins `segno:migrate --check` at zero.
  test('the codemod would change nothing in any shipped deck, doc or manifest', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const ROOT = path.join(__dirname, '..', '..', '..');
    const files = corpus();
    assert.ok(files.length > 300, `the corpus walk found only ${files.length} files`);
    const left = [];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const r = rel.endsWith('.manifest.json') ? rewriteManifest(src) : rel.endsWith('.mdx') ? rewriteMdx(src) : rewriteText(src);
      for (const c of r.changes) left.push(`${rel}:${c.line}  \`${c.from}\` → \`${c.to}\``);
    }
    assert.deepEqual(left, [], `old spellings are back — run \`npm run segno:migrate\`:\n${left.join('\n')}`);
  });
});
