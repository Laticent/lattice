// A fenced line is a quoted example, not a slide's content: the engine draws nothing from it, so no
// lint rule may report it (followups.d/2966-p1). Each case below is a rule that used to read past
// fences. The LIVE arm proves the rule still fires on the line; the FENCED arm moves that same line
// into a code fence and proves the rule no longer reports it. The audit that found these moved
// every reported line of the lint tests' own inputs into a fence, one at a time.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');
const { buildVocab } = require('../../../lib/authoring/lint');

const vocab = buildVocab();
const FM = '---\ntheme: indaco\n---\n\n';
const GANTT = '<!-- _class: gantt -->\n\n## Plan\n\n- Lane\n';

/** `src` with the line `line` moved inside a code fence, and nothing else changed. */
function fence(src, line) {
  assert.ok(src.split('\n').includes(line), `the case holds the line ${JSON.stringify(line)}`);
  return src.split('\n').map((l) => (l === line ? `\`\`\`md\n${l}\n\`\`\`` : l)).join('\n');
}
const on = (src, rule, line) => core.lintTextWith(src, vocab).filter((f) => f.rule === rule && String(f.line).trim() === line.trim());

const CASES = [
  ['gantt-retired-delimiter', `${FM}${GANTT}  - A \`Q1->Q2\`\n`, '  - A `Q1->Q2`'],
  ['gantt-bad-span', `${FM}${GANTT}  - A \`Q9..Zz\`\n`, '  - A `Q9..Zz`'],
  ['gantt-unknown-token', `${FM}${GANTT}  - A \`Q1..Q2\` \`dnoe\`\n`, '  - A `Q1..Q2` `dnoe`'],
  ['gantt-dangling-after', `${FM}${GANTT}  - A \`Q1..Q2\` \`after=Ghost\`\n`, '  - A `Q1..Q2` `after=Ghost`'],
  ['gantt-inverted-dependency', `${FM}${GANTT}  - A \`Q3..Q4\`\n  - B \`Q1..Q2\` \`after=A\`\n`, '  - B `Q1..Q2` `after=A`'],
  ['unknown-map-region', `${FM}<!-- _class: map -->\n\n## Offices\n\n- Atlantis \`3\`\n`, '- Atlantis `3`'],
  ['statement-ol-bold', `${FM}<!-- _class: principles -->\n\n## Rules\n\n1. a **bold** span\n`, '1. a **bold** span'],
  ['check-label-code', `${FM}<!-- _class: verdict-grid -->\n\n## Grid\n\n- Acme\n  - [x] Residency \`@check{fail}\` text\n  - Body.\n`, '  - [x] Residency `@check{fail}` text'],
  ['video-bullet', `${FM}<!-- _class: video -->\n\n## Clip\n\n- https://www.youtube.com/watch?v=dQw4w9WgXcQ\n`, '- https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
];

describe('no lint rule reports a line inside a code fence', () => {
  for (const [rule, src, line] of CASES) {
    test(rule, () => {
      assert.equal(on(src, rule, line).length, 1, 'live: the rule reports the line');
      assert.deepEqual(on(fence(src, line), rule, line), [], 'fenced: the rule leaves the quoted example alone');
    });
  }

  test('a fenced gantt task is not a task: a live `after=` cannot name it', () => {
    // The chart draws no bar from a fenced line, so a dependency on one dangles on the slide.
    const src = `${FM}${GANTT}  - A \`Q1..Q2\`\n  - B \`Q3..Q4\` \`after=A\`\n`;
    assert.deepEqual(on(src, 'gantt-dangling-after', '  - B `Q3..Q4` `after=A`'), []);
    assert.equal(on(fence(src, '  - A `Q1..Q2`'), 'gantt-dangling-after', '  - B `Q3..Q4` `after=A`').length, 1);
  });

  test('a fenced `@video` record does not count as the slide\'s clip', () => {
    // Only a live record draws a clip; a fenced one is the docs showing the syntax.
    const rec = '`@video{"https://youtu.be/dQw4w9WgXcQ"}`';
    const src = `${FM}<!-- _class: video -->\n\n## Clip\n\n${rec}\n`;
    assert.deepEqual(core.lintTextWith(src, vocab).filter((f) => f.rule === 'video-bullet'), []);
    assert.equal(core.lintTextWith(fence(src, rec), vocab).filter((f) => f.rule === 'video-bullet').length, 1);
  });
});

// The other direction, and the one no gate catches: a line wrongly read as FENCED silences every rule on
// it. Each deck below has a fence-like line that markdown-it does NOT render as a fence, and the live
// finding after it must still be reported (maker-checker review of this change, 2026-10-29).
describe('a fence-like line the engine renders as text does not silence the slide', () => {
  const LIVE = [
    ['a speaker note that quotes a fence', `${FM}<!-- _class: gantt -->\n<!--\nNote: open with \`\`\` then the language.\n\`\`\`js\n-->\n\n## Plan\n\n- Lane\n  - Ship \`Q2..Q3\`\n  - Test \`Q3..Q4\` \`after=Nope\`\n`, 'gantt-dangling-after', '- Test `Q3..Q4` `after=Nope`'],
    ['a fence left open inside a list item', `${FM}<!-- _class: gantt -->\n\n## Plan\n\n- Lane\n  - Build \`Q1..Q2\`\n\n    \`\`\`\n    note\n- Lane 2\n  - Test \`Q3..Q4\` \`after=Nope\`\n`, 'gantt-dangling-after', '- Test `Q3..Q4` `after=Nope`'],
    ['an indented fence line under a paragraph', `${FM}<!-- _class: map -->\n\n## Where\n\nIntro\n    \`\`\`\n\n- Frnace \`12\`\n`, 'unknown-map-region', '- Frnace `12`'],
    ['a fence line inside an HTML block', `${FM}<!-- _class: gantt -->\n\n## Plan\n\n<div>\n\`\`\`\n</div>\n\n- Lane\n  - Ship \`Q1 -> Q2\`\n`, 'gantt-retired-delimiter', '- Ship `Q1 -> Q2`'],
  ];
  for (const [name, src, rule, line] of LIVE) {
    test(name, () => assert.equal(on(src, rule, line).length, 1));
  }
});
