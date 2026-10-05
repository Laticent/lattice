// Every deck we ship is written in Segno's notation (decision 2026-09-28-segno-unified-inline-notation.md).
// Lattice is not GA, so nothing reads or rewrites the old spellings any more. The one risk left
// is a branch written before phase 2 landing an old spelling here, where an old CHART spelling
// draws a wrong chart rather than an error. This scans our own decks for the old shapes that
// cannot be mistaken for anything else. Prose docs are out of scope: they quote `# h1` and
// `:root`, which look like old spellings and are not.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');

// A deck: an example, an exemplar, a gallery, a test deck, or a manifest (its samples are decks).
const DECKS = ['examples/*.md', 'exemplars/**/*.md', 'lib/components/**/*.gallery.md',
  'lib/components/**/*.manifest.json', 'test/fixtures/**/*.md', 'test/integration/baseline-decks/*.md'];

const OLD = [
  ['a pill modifier after the braces (`{BETA}:tag`)', /`~?\{[^`{}]*\}:[\w-]/],
  ['a gantt dependency with a colon (`after: Design`)', /`after:\s/],
  ['a gantt today pill (`today Q3`)', /`today\s+[^`=]+`/],
  ['a state-chart arrow (`approve => 2`)', /`[A-Za-z][^`]*=>\s*(\d+|self)\s*`/],
  ['a flowchart id with colon styles (`#api:diamond`)', /`#[\w-]+:[\w-]/],
  ['a flowchart style word after a colon (`:dashed`)', /(`|\{):(c[1-8]|dashed|dotted|cross|open|dot|diamond|pill|box|square|circle|cylinder|io|doc|loose|(fill|border|text)-c[1-8])\b/],
  ['a flowchart channel color (`fill-c3`)', /`[^`]*\bfill-c\d/],
  ['a journey mood (`:4`)', /`:[1-5]`/],
];

test('every deck we ship uses the Segno spellings, none of the retired ones', () => {
  const files = execFileSync('git', ['ls-files', ...DECKS], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(files.length > 200, `the deck walk found only ${files.length} files`);
  const left = [];
  for (const rel of files) {
    // Fenced code is quoted material, not a slide.
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
    src.split('\n').forEach((line, i) => {
      for (const [name, re] of OLD) if (re.test(line)) left.push(`${rel}:${i + 1}  ${name}`);
    });
  }
  assert.deepEqual(left, [], `old spellings are back; write them in Segno's notation:\n${left.join('\n')}`);
});

test('the scan catches each retired shape', () => {
  const keySample = '`[{:dashed, Sent back}]`';
  const samples = ['`{BETA}:tag`', '`after: Design`', '`today Q3`', '`approve => 2`', '`#api:diamond`', '`:dashed`', '`fill-c3`', '`:4`'];
  samples.forEach((s, i) => { assert.match(s, OLD[i][1], OLD[i][0]); });
  assert.ok(OLD.some(([, re]) => re.test(keySample)), 'a colon word inside a key record');
  for (const s of ['`{BETA, tag}`', '`after=Design`', '`{approve, to=2}`', '`{#api, diamond}`', '`fill=c3`', '`{who=A, mood=4}`', '`:root`', '`:last-child`', '`2 => 3`']) {
    assert.ok(!OLD.some(([, re]) => re.test(s)), `${s} is current and must not match`);
  }
});
